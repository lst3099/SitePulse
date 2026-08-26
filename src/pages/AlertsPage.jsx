import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Select, Space, Table, Typography, message } from 'antd';
import DetailDrawer from '../components/DetailDrawer';
import FilterBar from '../components/FilterBar';
import PageHeader from '../components/PageHeader';
import StatusTag from '../components/StatusTag';
import { filterByDataScope } from '../domain/permissions';
import mockData from '../data/mockData';
import { DEMO_AS_OF_DATE, getAgeAccessState, makeDeviceRows, normalizeUser, projectName, scopedProjects } from './pageUtils';

const TYPE_LABELS = {
  'device-offline': '设备离线',
  'sync-failed': '同步失败',
  'expired-permission-allowed': '过期权限仍允许通行',
  'age-warning': '年龄预警',
};

export function getVisibleAlerts(user, alerts = []) {
  const normalized = normalizeUser(user);
  return filterByDataScope(normalized, alerts).filter((alert) => {
    const receivers = Array.isArray(alert.receivers) ? alert.receivers : [];
    if (normalized.role === 'worker' && ['device-offline', 'sync-failed', 'expired-permission-allowed'].includes(alert.type)) return false;
    return receivers.includes(normalized.role);
  });
}

export function buildAgeWarningAlerts({ asOfDate = DEMO_AS_OF_DATE, projects = mockData.projects, people = mockData.people, projectPeople = mockData.projectPeople, authorizations = [] } = {}) {
  return projectPeople.flatMap((relation) => {
    const person = people.find((item) => item.id === relation.personId);
    const project = projects.find((item) => item.id === relation.projectId);
    const authorization = authorizations.find((item) => item.projectId === relation.projectId && item.personId === relation.personId);
    const access = getAgeAccessState({ birthDate: person?.birthDate, asOfDate, specialAuthorization: authorization });
    return access.status === 'warning' ? [{
      id: `age-warning-${relation.projectId}-${relation.personId}`,
      projectId: relation.projectId,
      personId: relation.personId,
      type: 'age-warning',
      status: 'open',
      read: false,
      occurredAt: `${asOfDate} 00:00`,
      reason: access.reason,
      receivers: ['systemAdmin', 'projectOwner'],
      projectName: project?.name,
    }] : [];
  });
}

export function markAlertRead(alerts, alertId) {
  return alerts.map((alert) => alert.id === alertId ? { ...alert, read: true } : { ...alert });
}

export function syncDeviceAlertState(alerts, devices) {
  const onlineByDevice = Object.fromEntries((devices || []).map((device) => [device.id, device.online === true]));
  return (alerts || []).map((alert) => {
    if (alert.type !== 'device-offline' || !alert.deviceId || onlineByDevice[alert.deviceId] !== true) return { ...alert };
    return { ...alert, status: 'closed', closedAt: alert.closedAt || '2026-08-25 12:00' };
  });
}

export function closeRecoveredDeviceAlert(alerts, deviceId, online, closedAt = '2026-08-25 12:00') {
  if (!online) return (alerts || []).map((alert) => ({ ...alert }));
  return (alerts || []).map((alert) => alert.type === 'device-offline' && alert.deviceId === deviceId
    ? { ...alert, status: 'closed', closedAt: alert.closedAt || closedAt }
    : { ...alert });
}

function alertTypeLabel(type) {
  return TYPE_LABELS[type] || type || '未知告警';
}

export function getAlertReceiverLabel(alert) {
  const labels = { systemAdmin: '系统管理员', projectOwner: '项目负责人', worker: '施工人员' };
  return (alert?.receivers || []).map((receiver) => labels[receiver] || receiver).join('、') || '未配置';
}

export default function AlertsPage({ role, lifecycleState, projectsRecords = mockData.projects, alerts: sharedAlerts, onAlertsChange, onOperationLog }) {
  const projects = scopedProjects(role, lifecycleState, projectsRecords);
  const devices = useMemo(() => makeDeviceRows(role, lifecycleState), [lifecycleState, role]);
  const [filters, setFilters] = useState({ projectId: 'all', type: 'all', read: 'all', status: 'all' });
  const [localAlerts, setLocalAlerts] = useState(() => syncDeviceAlertState(getVisibleAlerts(role, mockData.alerts), devices));
  const alerts = sharedAlerts || localAlerts;
  const visibleAlerts = getVisibleAlerts(role, alerts);
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    const next = syncDeviceAlertState(alerts, devices);
    if (JSON.stringify(next) === JSON.stringify(alerts)) return;
    if (onAlertsChange) onAlertsChange(next);
    else setLocalAlerts(next);
  }, [alerts, devices, onAlertsChange]);
  const filtered = useMemo(() => visibleAlerts.filter((alert) => (
    (filters.projectId === 'all' || alert.projectId === filters.projectId) &&
    (filters.type === 'all' || alert.type === filters.type) &&
    (filters.read === 'all' || (filters.read === 'unread' ? !alert.read : alert.read)) &&
    (filters.status === 'all' || (alert.status || 'open') === filters.status)
  )), [filters, visibleAlerts]);
  const unreadCount = visibleAlerts.filter((alert) => !alert.read && (alert.status || 'open') === 'open').length;
  const updateAlerts = (updater) => {
    const nextVisible = updater(visibleAlerts);
    const nextById = new Map(nextVisible.map((alert) => [alert.id, alert]));
    const next = alerts.map((alert) => nextById.get(alert.id) || { ...alert });
    if (onAlertsChange) onAlertsChange(next);
    else setLocalAlerts(next);
  };
  const markRead = (alert) => {
    updateAlerts((current) => markAlertRead(current, alert.id));
    onOperationLog?.({ projectId: alert.projectId, operatorId: normalizeUser(role).accountId || 'account-admin', operation: 'alertRead', module: 'alerts', targetId: alert.id, occurredAt: '2026-08-25 12:00', reason: '标记告警已读' });
    message.success('已标记为已读（本地状态）');
  };
  const projectOptions = [{ value: 'all', label: '全部项目' }, ...projects.map((project) => ({ value: project.id, label: project.name }))];
  const typeOptions = [{ value: 'all', label: '全部类型' }, ...Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))];
  const columns = [
    { title: '消息编号', dataIndex: 'id', key: 'id' },
    { title: '状态', key: 'read', render: (_, alert) => <StatusTag status={alert.read ? 'normal' : 'warning'} label={alert.read ? '已读' : '未读'} /> },
    { title: '告警类型', dataIndex: 'type', key: 'type', render: alertTypeLabel },
    { title: '项目', dataIndex: 'projectId', key: 'projectId', render: (value) => projectName(value, projectsRecords) },
    { title: '发生时间', dataIndex: 'occurredAt', key: 'occurredAt' },
    { title: '处理状态', key: 'status', render: (_, alert) => alert.status === 'closed' ? <StatusTag status="success" label="已自动关闭" /> : <StatusTag status="warning" label="当前告警" /> },
    { title: '接收人', key: 'receivers', render: (_, alert) => getAlertReceiverLabel(alert) },
    { title: '操作', key: 'action', render: (_, alert) => <Space><Button type="link" onClick={() => setDetail({ type: 'alert', data: { ...alert, type: alertTypeLabel(alert.type) } })}>详情</Button>{!alert.read && <Button type="link" onClick={() => markRead(alert)}>标记已读</Button>}</Space> },
  ];

  return <div className="business-page">
    <PageHeader title="告警中心" description={`站内消息型告警；当前未读 ${unreadCount} 条。接收人仅系统管理员和项目负责人。`} breadcrumb={['首页', '告警中心']} />
    <div className="workday-note"><StatusTag status="normal" label="规则边界" /> 无告警等级、无审批、无人工确认关闭；设备恢复在线后离线告警可自动关闭，历史仍可查。年龄预警按阈值和提前 30 天生成站内消息。</div>
    <FilterBar onReset={() => setFilters({ projectId: 'all', type: 'all', read: 'all', status: 'all' })} onSearch={() => message.info(`已查询 ${filtered.length} 条告警`)}>
      <Select aria-label="告警项目筛选" value={filters.projectId} onChange={(projectId) => setFilters({ ...filters, projectId })} options={projectOptions} />
      <Select aria-label="告警类型筛选" value={filters.type} onChange={(type) => setFilters({ ...filters, type })} options={typeOptions} />
      <Select aria-label="告警阅读状态筛选" value={filters.read} onChange={(read) => setFilters({ ...filters, read })} options={[{ value: 'all', label: '全部阅读状态' }, { value: 'unread', label: '未读' }, { value: 'read', label: '已读' }]} />
      <Select aria-label="告警当前历史筛选" value={filters.status} onChange={(status) => setFilters({ ...filters, status })} options={[{ value: 'all', label: '当前及历史' }, { value: 'open', label: '当前告警' }, { value: 'closed', label: '历史告警' }]} />
    </FilterBar>
    <Card title="站内消息与历史" className="table-card" extra={<Typography.Text type="secondary">不提供人工关闭操作</Typography.Text>}><Table rowKey="id" columns={columns} dataSource={filtered} scroll={{ x: 1200 }} pagination={false} /></Card>
    <DetailDrawer open={Boolean(detail)} onClose={() => setDetail(null)} type={detail?.type} data={detail?.data} role={role} />
  </div>;
}
