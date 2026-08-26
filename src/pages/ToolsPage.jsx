import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Form, Input, Modal, Select, Space, Table, Tag, message } from 'antd';
import { PlusOutlined, SettingOutlined } from '@ant-design/icons';
import PageHeader from '../components/PageHeader';
import StatusTag from '../components/StatusTag';
import ToolEditorDrawer from '../components/ToolEditorDrawer';
import ToolInspectionDrawer from '../components/ToolInspectionDrawer';
import ToolQrDrawer from '../components/ToolQrDrawer';
import { canOperate, filterByDataScope } from '../domain/permissions';
import {
  buildToolInspectionRecord,
  DEFAULT_TOOL_INSPECTION_POLICY,
  generateToolCode,
  getLatestToolInspection,
  getToolInspectionStatus,
  summarizeToolInspections,
  TOOL_USAGE_STATUS,
} from '../domain/tools';
import mockData from '../data/mockData';
import { DEMO_AS_OF_DATE, normalizeUser, projectName, scopedProjects } from './pageUtils';

const USAGE_TAGS = { 在用: 'success', 遗失: 'warning', 报废: 'normal' };
const INSPECTION_TAGS = { 正常: 'success', 待检查: 'warning', 已逾期: 'error', 不合格: 'error' };

function updateRecords(next, onChange, setLocal) {
  if (onChange) onChange(next);
  else setLocal(next);
}

export default function ToolsPage({
  role = 'systemAdmin',
  lifecycleState,
  projectsRecords = mockData.projects,
  toolsRecords,
  inspectionsRecords,
  policy: providedPolicy,
  asOfDate = DEMO_AS_OF_DATE,
  initialInspectionStatus,
  fixedProjectId,
  embedded = false,
  onToolsChange,
  onInspectionsChange,
  onPolicyChange,
  onOperationLog,
  onOpenMobileTool,
}) {
  const user = normalizeUser(role);
  const projects = scopedProjects(role, lifecycleState, projectsRecords);
  const [localTools, setLocalTools] = useState(mockData.tools);
  const [localInspections, setLocalInspections] = useState(mockData.toolInspections);
  const [localPolicy, setLocalPolicy] = useState(mockData.toolInspectionPolicy || DEFAULT_TOOL_INSPECTION_POLICY);
  const tools = toolsRecords ?? localTools;
  const inspections = inspectionsRecords ?? localInspections;
  const policy = providedPolicy ?? localPolicy;
  const [filters, setFilters] = useState({ keyword: '', projectId: fixedProjectId || 'all', usageStatus: 'all', inspectionStatus: 'all' });
  const [editorTool, setEditorTool] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [inspectionTool, setInspectionTool] = useState(null);
  const [qrTool, setQrTool] = useState(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyForm] = Form.useForm();

  useEffect(() => {
    if (initialInspectionStatus) setFilters((current) => ({ ...current, inspectionStatus: initialInspectionStatus }));
  }, [initialInspectionStatus]);

  const visibleTools = useMemo(() => filterByDataScope(user, tools).filter((tool) => (
    (!fixedProjectId || tool.projectId === fixedProjectId) &&
    (filters.projectId === 'all' || tool.projectId === filters.projectId) &&
    (filters.usageStatus === 'all' || tool.usageStatus === filters.usageStatus) &&
    (!filters.keyword || `${tool.toolCode}${tool.name}${tool.model}`.toLowerCase().includes(filters.keyword.toLowerCase())) &&
    (filters.inspectionStatus === 'all' || getToolInspectionStatus(tool, inspections, policy, asOfDate) === filters.inspectionStatus)
  )), [asOfDate, filters, fixedProjectId, inspections, policy, tools, user]);
  const summary = summarizeToolInspections(visibleTools, inspections, policy, asOfDate);
  const canManagePolicy = canOperate(user, 'manageToolPolicy');

  const log = (operation, tool, reason) => onOperationLog?.({
    projectId: tool?.projectId,
    operatorId: user.accountId || 'account-admin',
    operation,
    module: 'tools',
    targetId: tool?.id || 'tool-policy-default',
    occurredAt: `${asOfDate} 09:00`,
    reason,
  });

  const closeEditor = () => {
    setEditorOpen(false);
    setEditorTool(null);
  };

  const saveTool = (values) => {
    const projectId = values.projectId || fixedProjectId;
    if (!canOperate(user, 'editTool', { projectId })) {
      message.error('没有权限维护该项目的工具');
      return;
    }
    if (values.id) {
      const previous = tools.find((tool) => tool.id === values.id);
      const next = tools.map((tool) => tool.id === values.id ? { ...tool, ...values, id: tool.id, toolCode: tool.toolCode, qrToken: tool.qrToken } : { ...tool });
      updateRecords(next, onToolsChange, setLocalTools);
      log('editTool', { ...previous, ...values }, previous?.usageStatus !== values.usageStatus ? `使用状态由${previous?.usageStatus}改为${values.usageStatus}` : '编辑工具档案');
      message.success('工具信息已更新（本地演示）');
    } else {
      const id = `tool-local-${Date.now()}`;
      const nextTool = { ...values, id, toolCode: generateToolCode(tools), qrToken: `${id}-token`, createdAt: asOfDate };
      updateRecords([...tools, nextTool], onToolsChange, setLocalTools);
      log('createTool', nextTool, '新增工具档案');
      message.success('工具已新增（本地演示）');
    }
    closeEditor();
  };

  const saveInspection = (values) => {
    if (!inspectionTool || !canOperate(user, 'inspectTool', { projectId: inspectionTool.projectId })) {
      message.error('没有权限检查该工具');
      return;
    }
    const record = {
      ...buildToolInspectionRecord(inspectionTool, { ...values, inspectorId: user.accountId, inspectorName: user.name || user.accountId }, policy),
      id: `tool-inspection-local-${Date.now()}`,
    };
    updateRecords([...inspections, record], onInspectionsChange, setLocalInspections);
    log('inspectTool', inspectionTool, `工具检查结果：${record.result}`);
    setInspectionTool(null);
    message.success('工具检查记录已保存（本地演示）');
  };

  const savePolicy = (values) => {
    const next = { ...policy, ...values, day: Number(values.day), weekday: Number(values.weekday), expectedDays: Number(values.expectedDays) };
    if (onPolicyChange) onPolicyChange(next);
    else setLocalPolicy(next);
    log('manageToolPolicy', null, '修改统一工具检查规则');
    setPolicyOpen(false);
    message.success('统一检查规则已更新（本地演示）');
  };

  const columns = [
    { title: '工具编号', dataIndex: 'toolCode', key: 'toolCode', render: (value) => <Tag color="blue">{value}</Tag> },
    { title: '工具名称', dataIndex: 'name', key: 'name' },
    { title: '型号', dataIndex: 'model', key: 'model' },
    { title: '所属项目', dataIndex: 'projectId', key: 'projectId', render: (value) => projectName(value, projectsRecords) },
    { title: '使用状态', dataIndex: 'usageStatus', key: 'usageStatus', render: (value) => <StatusTag status={USAGE_TAGS[value]} label={value} /> },
    { title: '检查状态', key: 'inspectionStatus', render: (_, tool) => { const status = getToolInspectionStatus(tool, inspections, policy, asOfDate); return status === '—' ? <Tag>—</Tag> : <StatusTag status={INSPECTION_TAGS[status]} label={status} />; } },
    { title: '最近检查', key: 'lastInspection', render: (_, tool) => { const latest = getLatestToolInspection(tool, inspections); return latest ? `${latest.inspectedAt} · ${latest.result}` : '暂无'; } },
    { title: '操作', key: 'action', render: (_, tool) => <div className="table-actions">
      {canOperate(user, 'editTool', { projectId: tool.projectId }) && <Button type="link" onClick={() => { setEditorTool(tool); setEditorOpen(true); }}>编辑</Button>}
      {canOperate(user, 'inspectTool', { projectId: tool.projectId }) && tool.usageStatus === TOOL_USAGE_STATUS.ACTIVE && <Button type="link" onClick={() => setInspectionTool(tool)}>完成检查</Button>}
      <Button type="link" onClick={() => setQrTool(tool)}>二维码</Button>
      <Button type="link" onClick={() => onOpenMobileTool?.(tool)}>手机查看</Button>
    </div> },
  ];

  const projectOptions = projects.map((project) => ({ value: project.id, label: project.name }));
  const content = <>
    {!embedded && <PageHeader title="工具管理" description="维护工具档案、二维码和统一周期检查状态。" breadcrumb={['首页', '工具管理']} extra={<Space>{canManagePolicy && <Button icon={<SettingOutlined />} onClick={() => { policyForm.setFieldsValue({ ...policy, day: policy.day || 1, weekday: policy.weekday || 1 }); setPolicyOpen(true); }}>检查规则</Button>} {canOperate(user, 'editTool', { projectId: fixedProjectId || projects[0]?.id }) && <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditorTool(null); setEditorOpen(true); }}>新增工具</Button>}</Space>} />}
    <Card className="tool-toolbar" extra={embedded && canOperate(user, 'editTool', { projectId: fixedProjectId }) && <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditorTool(null); setEditorOpen(true); }}>新增工具</Button>}>
      <Space className="tool-filter-row" wrap>
        <Input aria-label="工具编号或名称查询" placeholder="工具编号、名称或型号" value={filters.keyword} onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} allowClear />
        {!fixedProjectId && <Select aria-label="工具项目筛选" value={filters.projectId} onChange={(projectId) => setFilters({ ...filters, projectId })} options={[{ value: 'all', label: '全部项目' }, ...projectOptions]} />}
        <Select aria-label="工具使用状态筛选" value={filters.usageStatus} onChange={(usageStatus) => setFilters({ ...filters, usageStatus })} options={[{ value: 'all', label: '全部使用状态' }, { value: '在用', label: '在用' }, { value: '遗失', label: '遗失' }, { value: '报废', label: '报废' }]} />
        <Select aria-label="工具检查状态筛选" value={filters.inspectionStatus} onChange={(inspectionStatus) => setFilters({ ...filters, inspectionStatus })} options={[{ value: 'all', label: '全部检查状态' }, { value: '正常', label: '正常' }, { value: '待检查', label: '待检查' }, { value: '已逾期', label: '已逾期' }, { value: '不合格', label: '不合格' }]} />
        <Button onClick={() => setFilters({ keyword: '', projectId: fixedProjectId || 'all', usageStatus: 'all', inspectionStatus: 'all' })}>重置</Button>
      </Space>
    </Card>
    <div className="workday-note tool-rule-note"><StatusTag status="normal" label="统一检查规则" /> {policy.frequency === 'weekly' ? `每周${['日', '一', '二', '三', '四', '五', '六'][policy.weekday ?? policy.day]}检查` : `每月${policy.day}日检查`}，预期 {policy.expectedDays} 天内完成；当前 {summary.total} 个在用工具，已完成 {summary.completed} 个，待检查 {summary.pending} 个，已逾期 {summary.overdue} 个。</div>
    <Card className="table-card"><Table rowKey="id" columns={columns} dataSource={visibleTools} pagination={false} scroll={{ x: 1250 }} /></Card>
    <ToolEditorDrawer open={editorOpen} tool={editorTool} projects={projects} fixedProjectId={fixedProjectId} onClose={closeEditor} onSubmit={saveTool} />
    <ToolInspectionDrawer open={Boolean(inspectionTool)} tool={inspectionTool} inspectorName={user.name || user.accountId} defaultDate={asOfDate} onClose={() => setInspectionTool(null)} onSubmit={saveInspection} />
    <ToolQrDrawer open={Boolean(qrTool)} tool={qrTool} onClose={() => setQrTool(null)} onOpenMobile={(tool) => onOpenMobileTool?.(tool)} />
    <Modal title="统一工具检查规则" open={policyOpen} onCancel={() => setPolicyOpen(false)} footer={null} destroyOnHidden>
      <Form form={policyForm} layout="vertical" onFinish={savePolicy} initialValues={policy}>
        <Form.Item label="检查周期" name="frequency"><Select options={[{ value: 'weekly', label: '每周' }, { value: 'monthly', label: '每月' }]} /></Form.Item>
        <Form.Item noStyle shouldUpdate={(prev, next) => prev.frequency !== next.frequency}>
          {({ getFieldValue }) => getFieldValue('frequency') === 'weekly'
            ? <Form.Item label="检查日" name="weekday"><Select options={['周日', '周一', '周二', '周三', '周四', '周五', '周六'].map((label, value) => ({ value, label }))} /></Form.Item>
            : <Form.Item label="检查日" name="day" rules={[{ required: true, message: '请输入每月检查日' }]}><Input type="number" min={1} max={28} addonAfter="日" /></Form.Item>}
        </Form.Item>
        <Form.Item label="预期完成时间" name="expectedDays" rules={[{ required: true, message: '请输入预期完成天数' }]}><Input type="number" min={1} max={30} addonAfter="天" /></Form.Item>
        <Space><Button onClick={() => setPolicyOpen(false)}>取消</Button><Button type="primary" htmlType="submit">保存规则</Button></Space>
      </Form>
    </Modal>
  </>;
  return embedded ? content : <div className="business-page">{content}</div>;
}
