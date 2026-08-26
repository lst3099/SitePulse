import dayjs from 'dayjs';

export const TOOL_USAGE_STATUS = {
  ACTIVE: '在用',
  LOST: '遗失',
  SCRAPPED: '报废',
};

export const TOOL_INSPECTION_STATUS = {
  NORMAL: '正常',
  PENDING: '待检查',
  OVERDUE: '已逾期',
  FAILED: '不合格',
};

export const DEFAULT_TOOL_INSPECTION_POLICY = {
  id: 'tool-policy-default',
  enabled: true,
  frequency: 'monthly',
  day: 1,
  expectedDays: 3,
};

function dateValue(value) {
  return dayjs(value || undefined);
}

function formatDate(value) {
  return dateValue(value).format('YYYY-MM-DD');
}

function getMonthlyStart(current, day) {
  const requestedDay = Math.min(Math.max(Number(day) || 1, 1), 28);
  const currentStart = current.date(requestedDay);
  return current.date() >= requestedDay ? currentStart : current.subtract(1, 'month').date(requestedDay);
}

function getWeeklyStart(current, weekday) {
  const requestedDay = Math.min(Math.max(Number(weekday) || 1, 0), 6);
  const distance = (current.day() - requestedDay + 7) % 7;
  return current.subtract(distance, 'day');
}

export function getInspectionCycle(asOfDate, policy = DEFAULT_TOOL_INSPECTION_POLICY) {
  const current = dateValue(asOfDate);
  const start = policy.frequency === 'weekly'
    ? getWeeklyStart(current, policy.weekday ?? policy.day)
    : getMonthlyStart(current, policy.day);
  const expectedDays = Math.max(Number(policy.expectedDays) || 1, 1);
  const deadline = start.add(expectedDays - 1, 'day');
  return {
    key: policy.frequency === 'weekly' ? formatDate(start) : start.format('YYYY-MM'),
    startDate: formatDate(start),
    deadline: formatDate(deadline),
    frequency: policy.frequency,
  };
}

export function generateToolCode(tools = []) {
  const max = tools.reduce((highest, tool) => {
    const match = String(tool.toolCode || tool.code || '').match(/^TL-(\d+)$/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `TL-${String(max + 1).padStart(6, '0')}`;
}

export function getToolQrUrl(tool, origin = '') {
  return `${origin || ''}/mobile/tools/${tool.qrToken}`;
}

export function buildToolInspectionRecord(tool, values, policy = DEFAULT_TOOL_INSPECTION_POLICY) {
  const inspectedAt = values.inspectedAt || formatDate(dayjs());
  return {
    toolId: tool.id,
    projectId: tool.projectId,
    cycleKey: getInspectionCycle(inspectedAt, policy).key,
    inspectedAt,
    inspectorId: values.inspectorId,
    inspectorName: values.inspectorName,
    result: values.result,
    remark: values.remark || '',
  };
}

function getCurrentCycleInspections(tool, inspections, cycle) {
  return (inspections || [])
    .filter((item) => item.toolId === tool.id && item.cycleKey === cycle.key)
    .sort((left, right) => String(left.inspectedAt).localeCompare(String(right.inspectedAt)));
}

export function getToolInspectionStatus(tool, inspections = [], policy = DEFAULT_TOOL_INSPECTION_POLICY, asOfDate) {
  if (tool.usageStatus !== TOOL_USAGE_STATUS.ACTIVE) return '—';
  const cycle = getInspectionCycle(asOfDate, policy);
  const currentInspections = getCurrentCycleInspections(tool, inspections, cycle);
  const latest = currentInspections.at(-1);
  if (latest?.result === '不合格') return TOOL_INSPECTION_STATUS.FAILED;
  if (latest?.result === '合格') return TOOL_INSPECTION_STATUS.NORMAL;
  return dateValue(asOfDate).isAfter(dateValue(cycle.deadline), 'day')
    ? TOOL_INSPECTION_STATUS.OVERDUE
    : TOOL_INSPECTION_STATUS.PENDING;
}

export function getLatestToolInspection(tool, inspections = []) {
  return (inspections || [])
    .filter((item) => item.toolId === tool.id)
    .sort((left, right) => String(right.inspectedAt).localeCompare(String(left.inspectedAt)))[0];
}

export function summarizeToolInspections(tools = [], inspections = [], policy = DEFAULT_TOOL_INSPECTION_POLICY, asOfDate) {
  const activeTools = tools.filter((tool) => tool.usageStatus === TOOL_USAGE_STATUS.ACTIVE);
  const counts = activeTools.reduce((result, tool) => {
    const status = getToolInspectionStatus(tool, inspections, policy, asOfDate);
    if (status === TOOL_INSPECTION_STATUS.NORMAL) result.completed += 1;
    if (status === TOOL_INSPECTION_STATUS.PENDING) result.pending += 1;
    if (status === TOOL_INSPECTION_STATUS.OVERDUE) result.overdue += 1;
    if (status === TOOL_INSPECTION_STATUS.FAILED) result.failed += 1;
    return result;
  }, { total: activeTools.length, completed: 0, pending: 0, overdue: 0, failed: 0 });
  return counts;
}

function buildSummaryAlert({ type, cycle, projectId, count, total, occurredAt, receivers }) {
  const scopeKey = projectId || 'all';
  return {
    id: `${type}-${cycle.key}-${scopeKey}`,
    type,
    projectId,
    cycleKey: cycle.key,
    count,
    total,
    status: 'open',
    read: false,
    occurredAt: `${occurredAt} 09:00`,
    receivers,
    reason: type === 'tool-inspection-overdue'
      ? `本周期仍有 ${count} 个工具未完成检查，已超过预期完成时间。`
      : `本周期共有 ${total} 个工具需要检查，当前还有 ${count} 个工具待检查。`,
  };
}

function shouldCreateAlert(existingAlerts, id) {
  return !(existingAlerts || []).some((alert) => alert.id === id);
}

export function buildToolInspectionAlerts({ tools = [], inspections = [], policy = DEFAULT_TOOL_INSPECTION_POLICY, asOfDate, existingAlerts = [] } = {}) {
  if (policy.enabled === false) return [];
  const cycle = getInspectionCycle(asOfDate, policy);
  const currentDate = dateValue(asOfDate);
  const activeTools = tools.filter((tool) => tool.usageStatus === TOOL_USAGE_STATUS.ACTIVE);
  if (!activeTools.length) return [];
  const alerts = [];
  const globalSummary = summarizeToolInspections(activeTools, inspections, policy, asOfDate);
  const globalStart = buildSummaryAlert({
    type: 'tool-inspection-start',
    cycle,
    count: globalSummary.pending + globalSummary.overdue,
    total: globalSummary.total,
    occurredAt: cycle.startDate,
    receivers: ['systemAdmin'],
  });
  if (!currentDate.isBefore(dateValue(cycle.startDate), 'day') && shouldCreateAlert(existingAlerts, globalStart.id)) alerts.push(globalStart);
  if (currentDate.isAfter(dateValue(cycle.deadline), 'day') && globalSummary.overdue > 0) {
    const globalOverdue = buildSummaryAlert({
      type: 'tool-inspection-overdue',
      cycle,
      count: globalSummary.overdue,
      total: globalSummary.total,
      occurredAt: formatDate(currentDate),
      receivers: ['systemAdmin'],
    });
    if (shouldCreateAlert(existingAlerts, globalOverdue.id)) alerts.push(globalOverdue);
  }
  const projectIds = [...new Set(activeTools.map((tool) => tool.projectId).filter(Boolean))];
  projectIds.forEach((projectId) => {
    const projectTools = activeTools.filter((tool) => tool.projectId === projectId);
    const summary = summarizeToolInspections(projectTools, inspections, policy, asOfDate);
    const start = buildSummaryAlert({
      type: 'tool-inspection-start', cycle, projectId,
      count: summary.pending + summary.overdue, total: summary.total,
      occurredAt: cycle.startDate, receivers: ['projectOwner'],
    });
    if (!currentDate.isBefore(dateValue(cycle.startDate), 'day') && shouldCreateAlert(existingAlerts, start.id)) alerts.push(start);
    if (currentDate.isAfter(dateValue(cycle.deadline), 'day') && summary.overdue > 0) {
      const overdue = buildSummaryAlert({
        type: 'tool-inspection-overdue', cycle, projectId,
        count: summary.overdue, total: summary.total,
        occurredAt: formatDate(currentDate), receivers: ['projectOwner'],
      });
      if (shouldCreateAlert(existingAlerts, overdue.id)) alerts.push(overdue);
    }
  });
  return alerts;
}
