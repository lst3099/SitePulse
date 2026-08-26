import React, { useMemo, useState } from 'react';
import { Button, Card, Drawer, Form, Input, Select, Table, Tag, Typography, message } from 'antd';
import DetailDrawer from '../components/DetailDrawer';
import FilterBar from '../components/FilterBar';
import PageHeader from '../components/PageHeader';
import StatusTag from '../components/StatusTag';
import { canOperate, canViewField } from '../domain/permissions';
import mockData from '../data/mockData';
import { maskIdCard, normalizeUser, projectName, scopedProjects } from './pageUtils';

const ROLE_LABELS = {
  systemAdmin: '系统管理员',
  projectOwner: '项目负责人',
  attendanceGuard: '考勤负责人/门卫',
  worker: '施工人员',
};

export function updateAccountStatus(accounts, accountId, status) {
  return accounts.map((account) => account.accountId === accountId ? { ...account, status } : { ...account });
}

export function resetAccountCredentials(accounts, accountId) {
  return accounts.map((account) => account.accountId === accountId ? { ...account, credentialStatus: 'reset', resetAt: '2026-08-25 12:00' } : { ...account });
}

export function validateWorkerAccount(draft = {}, { peopleRecords = mockData.people, projectPeople = mockData.projectPeople } = {}) {
  if (draft.role !== 'worker') return undefined;
  const person = peopleRecords.find((item) => item.id === draft.personId);
  if (!person) return '施工人员账号必须关联已有人员';
  if (!draft.projectIds?.length || draft.projectIds.some((projectId) => !projectPeople.some((relation) => relation.personId === draft.personId && relation.projectId === projectId && relation.status === 'active'))) return '施工人员必须属于所选项目';
  return undefined;
}

export function createAccount(draft = {}, accounts = [], options = {}) {
  const error = validateWorkerAccount(draft, options);
  if (error) return { error };
  if (draft.role === 'worker' && accounts.some((account) => account.role === 'worker' && account.personId === draft.personId)) return { error: '该人员已有施工人员账号' };
  return {
    account: {
      accountId: draft.accountId || `account-local-${accounts.length + 1}`,
      name: draft.name,
      role: draft.role,
      personId: draft.role === 'worker' ? draft.personId : undefined,
      projectIds: draft.projectIds || [],
      status: 'active',
      credentialStatus: 'active',
    },
  };
}

export function changeAccountStatus(accounts, accountId, status, options = {}) {
  const account = accounts.find((item) => item.accountId === accountId);
  if (status === 'active' && account?.role === 'worker') {
    const error = validateWorkerAccount(account, options);
    if (error) return { accounts: accounts.map((item) => ({ ...item })), error };
  }
  return { accounts: updateAccountStatus(accounts, accountId, status) };
}

export default function UsersPermissionsPage({ role, lifecycleState, peopleRecords = mockData.people, projectPeople = mockData.projectPeople, onOperationLog }) {
  const user = normalizeUser(role);
  const projects = scopedProjects(role, lifecycleState);
  const [projectId, setProjectId] = useState('all');
  const [detail, setDetail] = useState(null);
  const [accountDrawerOpen, setAccountDrawerOpen] = useState(false);
  const [accounts, setAccounts] = useState(() => mockData.accounts.map((account) => ({ ...account })));
  const [form] = Form.useForm();
  const canManageAccounts = canOperate(user, 'accountOpen');
  const visibleAccounts = useMemo(() => accounts.filter((account) => (
    user.role === 'systemAdmin' || account.projectIds?.some((id) => projects.some((project) => project.id === id))
  )), [accounts, projects, user.role]);
  const filteredAccounts = visibleAccounts.filter((account) => projectId === 'all' || account.projectIds?.includes(projectId));
  const writeLog = (entry) => onOperationLog?.({ ...entry, module: 'users', occurredAt: '2026-08-25 12:00' });
  const saveAccount = (values) => {
    const result = createAccount(values, accounts, { peopleRecords, projectPeople });
    if (result.error) return message.error(result.error);
    setAccounts((current) => [...current, result.account]);
    writeLog({ projectId: result.account.projectIds[0], operatorId: user.accountId || 'account-admin', operation: 'accountOpen', targetId: result.account.accountId, reason: '开通账号' });
    setAccountDrawerOpen(false);
    form.resetFields();
    message.success('账号已开通（本地演示）');
  };
  const handleAccountStatusChange = (account, status) => {
    const result = changeAccountStatus(accounts, account.accountId, status, { peopleRecords, projectPeople });
    if (result.error) return message.error(result.error);
    setAccounts(result.accounts);
    writeLog({ projectId: account.projectIds?.[0], operatorId: user.accountId || 'account-admin', operation: status === 'active' ? 'accountOpen' : 'accountDisable', targetId: account.accountId, reason: status === 'active' ? '开通账号' : '停用账号' });
    message.success(status === 'active' ? '账号已开通（本地演示）' : '账号已停用（本地演示）');
  };
  const resetCredentials = (account) => {
    setAccounts((current) => resetAccountCredentials(current, account.accountId));
    writeLog({ projectId: account.projectIds?.[0], operatorId: user.accountId || 'account-admin', operation: 'accountReset', targetId: account.accountId, reason: '重置登录凭据' });
    message.success('登录凭据已重置（本地演示）');
  };
  const permissionRows = [
    { id: 'page', dimension: '页面', subject: '考勤 / 告警 / 报表', admin: '可见', owner: '授权项目可见', worker: '仅移动端入口' },
    { id: 'field', dimension: '字段', subject: '身份证 / 健康 / 抓拍照片', admin: '可见（列表脱敏）', owner: '授权项目可见', worker: '本人且脱敏' },
    { id: 'operation', dimension: '操作', subject: '补录 / 绑定 / 导出 / 账号操作', admin: '可操作', owner: '按项目授权', worker: '不可操作' },
    { id: 'scope', dimension: '数据范围', subject: '项目与人员', admin: '全量项目', owner: '授权项目', worker: '本人移动端' },
  ];
  const accountColumns = [
    { title: '账号', dataIndex: 'accountId', key: 'accountId' },
    { title: '用户', dataIndex: 'name', key: 'name' },
    { title: '角色', dataIndex: 'role', key: 'role', render: (value) => <Tag>{ROLE_LABELS[value] || value}</Tag> },
    { title: '关联人员', key: 'person', render: (_, account) => { const person = peopleRecords.find((item) => item.id === account.personId); return person ? person.name : '—'; } },
    { title: '身份证（脱敏）', key: 'idCard', render: (_, account) => { const person = peopleRecords.find((item) => item.id === account.personId); return person && canViewField(user, 'idCardNumber', { projectId: account.projectIds?.[0], personId: person.id, targetPersonId: person.id }) ? maskIdCard(person.idCardNumber) : '********'; } },
    { title: '项目范围', key: 'scope', render: (_, account) => account.projectIds?.length ? account.projectIds.map((id) => projectName(id)).join('、') : '全量项目' },
    { title: '账号状态', key: 'status', render: (_, account) => <StatusTag status={account.status === 'active' ? 'success' : 'warning'} label={account.status === 'active' ? '启用' : '停用'} /> },
    { title: '操作', key: 'operation', render: (_, account) => <div className="table-actions">{canManageAccounts && (account.status === 'active' ? <Button type="link" danger onClick={() => handleAccountStatusChange(account, 'inactive')}>停用</Button> : <Button type="link" onClick={() => handleAccountStatusChange(account, 'active')}>开通</Button>)}{canManageAccounts && <Button type="link" onClick={() => resetCredentials(account)}>重置</Button>}<Button type="link" onClick={() => setDetail({ type: 'user', data: { ...account, role: ROLE_LABELS[account.role] || account.role } })}>查看</Button></div> },
  ];

  return <div className="business-page">
    <PageHeader title="用户与权限" description="管理系统账号、角色与数据范围；施工人员移动端账号必须关联已有人员。" breadcrumb={['首页', '用户与权限']} extra={canManageAccounts && <Button type="primary" onClick={() => setAccountDrawerOpen(true)}>新增/开通账号</Button>} />
    {user.role === 'worker' && <div className="workday-note"><StatusTag status="normal" label="移动端范围" /> 施工人员只能看到本人移动端入口。</div>}
    <FilterBar onReset={() => setProjectId('all')} onSearch={() => {}}><Select aria-label="用户项目筛选" value={projectId} onChange={setProjectId} options={[{ value: 'all', label: '全部项目' }, ...projects.map((project) => ({ value: project.id, label: project.name }))]} /></FilterBar>
    <Card title="系统用户 / 账号" className="table-card" extra={<Typography.Text type="secondary">账号状态、角色、关联人员、项目范围均为本地演示状态</Typography.Text>}><Table rowKey="accountId" columns={accountColumns} dataSource={filteredAccounts} scroll={{ x: 1400 }} pagination={false} /></Card>
    <Card title="权限模型" className="table-card" extra={<Typography.Text type="secondary">沿用 canViewField / canOperate / filterByDataScope</Typography.Text>}>
      <Typography.Paragraph>权限分为：<strong>页面 / 字段 / 操作 / 数据范围</strong>；敏感字段在列表中始终脱敏，详情仍按角色与本人范围判断。</Typography.Paragraph>
      <Table rowKey="id" pagination={false} dataSource={permissionRows} columns={[{ title: '权限维度', dataIndex: 'dimension', key: 'dimension' }, { title: '范围', dataIndex: 'subject', key: 'subject' }, { title: '系统管理员', dataIndex: 'admin', key: 'admin' }, { title: '项目负责人', dataIndex: 'owner', key: 'owner' }, { title: '施工人员', dataIndex: 'worker', key: 'worker' }]} />
    </Card>
    <Drawer title="新增/开通账号" open={accountDrawerOpen} onClose={() => { setAccountDrawerOpen(false); form.resetFields(); }} width={480} destroyOnClose>
      <Typography.Paragraph type="secondary">施工人员角色必须选择已有人员；账号操作只更新本地状态并写入操作日志。</Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={saveAccount} initialValues={{ role: 'worker', projectIds: [] }}>
        <Form.Item label="账号名称" name="name" rules={[{ required: true, message: '请输入账号名称' }]}><Input /></Form.Item>
        <Form.Item label="角色" name="role" rules={[{ required: true, message: '请选择角色' }]}><Select options={Object.entries(ROLE_LABELS).filter(([value]) => value !== 'worker' || user.role === 'systemAdmin').map(([value, label]) => ({ value, label }))} /></Form.Item>
        <Form.Item label="关联已有人员（施工人员必选）" name="personId"><Select allowClear options={peopleRecords.map((person) => ({ value: person.id, label: `${person.name}（${person.id}）` }))} /></Form.Item>
        <Form.Item label="项目范围" name="projectIds"><Select mode="multiple" options={projects.map((project) => ({ value: project.id, label: project.name }))} /></Form.Item>
        <Button type="primary" htmlType="submit">确认开通</Button>
      </Form>
    </Drawer>
    <DetailDrawer open={Boolean(detail)} onClose={() => setDetail(null)} type={detail?.type} data={detail?.data} role={role} />
  </div>;
}
