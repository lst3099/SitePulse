import React, { useMemo, useState } from 'react';
import { Button, Card, Form, Input, InputNumber, Modal, Select, Table, message } from 'antd';
import { EditOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons';
import FilterBar from '../components/FilterBar';
import PageHeader from '../components/PageHeader';
import StatusTag from '../components/StatusTag';
import { canOperate } from '../domain/permissions';
import mockData from '../data/mockData';
import { buildProjectCreateLog, buildProjectEditLog, buildProjectLifecycleLog, getProjectAgeConfig, normalizeUser, scopedProjects, statusLabel } from './pageUtils';

export function hasProjectLifecycleHandler(onProjectLifecycle) {
  return typeof onProjectLifecycle === 'function';
}

export function canManageProjectAction(user, projectId, action = 'edit') {
  if (normalizeUser(user).role === 'systemAdmin') return true;
  if (action === 'create') return false;
  return canOperate(user, 'editPerson', { projectId });
}

export function saveProjectChanges({ editing, values, onProjectLifecycle }) {
  const next = { ...(editing || {}), ...values, ...getProjectAgeConfig({ ...(editing || {}), ...values }), id: editing?.id || `project-local-${Date.now()}` };
  if (editing && editing.status !== next.status) onProjectLifecycle?.(editing.id, next.status);
  return next;
}

export function upsertProjectRecords(projects, nextProject) {
  return projects.some((project) => project.id === nextProject.id)
    ? projects.map((project) => project.id === nextProject.id ? { ...project, ...nextProject } : { ...project })
    : [...projects.map((project) => ({ ...project })), { ...nextProject }];
}

export default function ProjectListPage({ role, lifecycleState, projectsRecords: sharedProjectsRecords, onProjectsRecordsChange, onProjectLifecycle, onOperationLog, onOpenProject }) {
  const user = normalizeUser(role);
  const [localProjectsRecords, setLocalProjectsRecords] = useState(() => mockData.projects);
  const projectsRecords = sharedProjectsRecords ?? localProjectsRecords;
  const [filters, setFilters] = useState({ name: '', owner: '', status: 'all' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const canCreate = canManageProjectAction(user, undefined, 'create');
  const projects = useMemo(() => scopedProjects(role, lifecycleState, projectsRecords), [lifecycleState, projectsRecords, role]);
  const writeProjects = (next) => {
    if (onProjectsRecordsChange) onProjectsRecordsChange(next);
    else setLocalProjectsRecords(next);
  };
  const filtered = useMemo(() => projects.filter((project) => (
    (!filters.name || project.name.includes(filters.name)) &&
    (!filters.owner || (project.owner || '项目负责人甲').includes(filters.owner)) &&
    (filters.status === 'all' || project.status === filters.status)
  )), [filters, projects]);

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const openModal = (project) => {
    setEditing(project || null);
    form.resetFields();
    form.setFieldsValue({ ...getProjectAgeConfig(project), ...(project || { status: 'active', owner: '项目负责人甲' }) });
    setModalOpen(true);
  };
  const saveProject = (values) => {
    if (!canManageProjectAction(user, editing?.id, editing ? 'edit' : 'create')) {
      message.error('当前角色无权操作该项目');
      return;
    }
    if (editing && editing.status !== values.status && !hasProjectLifecycleHandler(onProjectLifecycle)) {
      message.error('项目生命周期未接入，状态未更新');
      return;
    }
    const next = saveProjectChanges({ editing, values, onProjectLifecycle });
    writeProjects(upsertProjectRecords(projectsRecords, next));
      if (editing && editing.status !== values.status) onOperationLog?.(buildProjectLifecycleLog(editing.id, values.status, user.accountId || 'account-admin'));
      onOperationLog?.(editing ? buildProjectEditLog(next.id, user.accountId || 'account-admin') : buildProjectCreateLog(next.id, user.accountId || 'account-admin'));
    closeModal();
    message.success(editing ? '项目已更新（本地演示）' : '项目已新增（本地演示）');
  };
  const updateStatus = (project, status) => {
    if (!canManageProjectAction(user, project.id, 'status')) {
      message.error('当前角色无权操作该项目');
      return;
    }
    if (!hasProjectLifecycleHandler(onProjectLifecycle)) {
      message.error('项目生命周期未接入，操作未更新');
      return;
    }
    onProjectLifecycle(project.id, status);
    writeProjects(upsertProjectRecords(projectsRecords, { ...project, status }));
    onOperationLog?.(buildProjectLifecycleLog(project.id, status, user.accountId || 'account-admin'));
    message.info(`${project.name} 已${status === 'inactive' ? '停用' : status === 'archived' ? '归档' : '恢复'}；设备与人员门禁状态已联动，历史数据保留。`);
  };
  const columns = [
    { title: '项目名称', dataIndex: 'name', key: 'name', render: (name, record) => <Button type="link" onClick={() => onOpenProject?.(record.id)}>{name}</Button> },
    { title: '负责人', dataIndex: 'owner', key: 'owner', render: (value) => value || '项目负责人甲' },
    { title: '考勤规则', key: 'rule', render: (_, project) => `${project.workStart || '09:00'} - ${project.workEnd || '18:00'}（宽限 ${project.graceMinutes || 15} 分钟）` },
    { title: '年龄规则', key: 'ageRule', render: (_, project) => { const ageConfig = getProjectAgeConfig(project); return `${ageConfig.ageThreshold} 岁 / 提前 ${ageConfig.ageWarningDays} 天`; } },
    { title: '状态', dataIndex: 'status', key: 'status', render: (status) => <StatusTag status={status} label={statusLabel(status)} /> },
    { title: '操作', key: 'action', render: (_, project) => <div className="table-actions"><Button type="link" icon={<EyeOutlined />} onClick={() => onOpenProject?.(project.id)}>详情</Button>{canManageProjectAction(user, project.id) && <Button type="link" icon={<EditOutlined />} onClick={() => openModal(project)}>编辑</Button>}{canManageProjectAction(user, project.id, 'status') && project.status === 'active' && <Button type="link" danger onClick={() => updateStatus(project, 'inactive')}>停用</Button>}{canManageProjectAction(user, project.id, 'status') && project.status !== 'archived' && <Button type="link" onClick={() => updateStatus(project, 'archived')}>归档</Button>}{canManageProjectAction(user, project.id, 'status') && project.status !== 'active' && <Button type="link" onClick={() => updateStatus(project, 'active')}>恢复</Button>}</div> },
  ];

  return <div className="business-page"><PageHeader title="项目管理" description="管理项目范围、考勤规则与现场配置。停用或归档仅改变业务状态，历史原始事件与考勤结果保留并只读。" breadcrumb={['首页', '项目管理']} extra={canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>新增项目</Button>} />
    <FilterBar onReset={() => setFilters({ name: '', owner: '', status: 'all' })} onSearch={() => message.success(`已查询 ${filtered.length} 个项目`)}><Input allowClear placeholder="项目名称" value={filters.name} onChange={(event) => setFilters({ ...filters, name: event.target.value })} /><Input allowClear placeholder="负责人" value={filters.owner} onChange={(event) => setFilters({ ...filters, owner: event.target.value })} /><Select value={filters.status} onChange={(status) => setFilters({ ...filters, status })} options={[{ value: 'all', label: '全部状态' }, { value: 'active', label: '进行中' }, { value: 'inactive', label: '已停用' }, { value: 'archived', label: '已归档' }]} /></FilterBar>
    <Card className="table-card"><Table rowKey="id" columns={columns} dataSource={filtered} pagination={false} locale={{ emptyText: '暂无项目' }} /></Card>
     <Modal title={editing ? '编辑项目' : '新增项目'} open={modalOpen} onCancel={closeModal} footer={null} destroyOnHidden><Form form={form} layout="vertical" onFinish={saveProject}><Form.Item label="项目名称" name="name" rules={[{ required: true, message: '请输入项目名称' }]}><Input /></Form.Item><Form.Item label="负责人" name="owner"><Input /></Form.Item><Form.Item label="状态" name="status"><Select options={[{ value: 'active', label: '进行中' }, { value: 'inactive', label: '已停用' }, { value: 'archived', label: '已归档' }]} /></Form.Item><Form.Item label="年龄阈值" name="ageThreshold" rules={[{ required: true, message: '请输入年龄阈值' }]}><InputNumber min={1} max={120} addonAfter="岁" style={{ width: '100%' }} /></Form.Item><Form.Item label="年龄预警天数" name="ageWarningDays" rules={[{ required: true, message: '请输入年龄预警天数' }]}><InputNumber min={0} max={3650} addonAfter="天" style={{ width: '100%' }} /></Form.Item><Form.Item label="项目地址" name="address"><Input /></Form.Item><Button type="primary" htmlType="submit">保存</Button></Form></Modal>
  </div>;
}
