import React, { useMemo, useState } from 'react';
import { Button, Card, Input, Select, Table, message } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import AccountBindingDrawer from '../components/AccountBindingDrawer';
import FilterBar from '../components/FilterBar';
import PageHeader from '../components/PageHeader';
import PersonDrawer from '../components/PersonDrawer';
import StatusTag from '../components/StatusTag';
import { bindWorkerAccount, buildAccountBindingLog, getBindableAccounts, getPersonAccount, unbindWorkerAccount } from '../domain/accounts';
import { canOperate } from '../domain/permissions';
import mockData from '../data/mockData';
import { buildPersonEditLog, makePersonRows, normalizeUser, scopedProjects } from './pageUtils';

export function buildPersonRecord(values = {}, { peopleRecords = mockData.people, projectPeople = mockData.projectPeople, projects = mockData.projects, user = {}, existingPerson } = {}) {
  const project = values.projectId ? projects.find((item) => item.id === values.projectId) : undefined;
  if (values.projectId && (!project || !canOperate(user, 'editPerson', { projectId: values.projectId }))) return { error: '当前角色无权操作该项目' };
  if (!values.projectId && !canOperate(user, 'editPerson')) return { error: '当前角色无权新增未绑定项目的人员' };
  const hasFaceImage = Array.isArray(values.faceImage) ? values.faceImage.length > 0 : Boolean(values.faceImage);
  const hasHealthReport = Array.isArray(values.healthReport) ? values.healthReport.length > 0 : Boolean(values.healthReport);
  const personId = existingPerson?.personId || existingPerson?.id || values.personId || `person-local-${Date.now()}`;
  const relation = project ? { projectId: values.projectId, projectName: project.name, personId, status: values.relationStatus || 'active' } : null;
  const hasRelation = relation && projectPeople.some((item) => item.personId === personId && item.projectId === relation.projectId);
  const nextProjectPeople = relation
    ? hasRelation
      ? projectPeople.map((item) => item.personId === personId && item.projectId === relation.projectId ? { ...item, ...relation } : { ...item })
      : [...projectPeople.map((item) => ({ ...item })), relation]
    : projectPeople.map((item) => ({ ...item }));
  const projectRelationships = nextProjectPeople.filter((item) => item.personId === personId).map((item) => ({
    ...item,
    projectName: item.projectName || projects.find((projectItem) => projectItem.id === item.projectId)?.name || mockData.projects.find((projectItem) => projectItem.id === item.projectId)?.name || '未分配项目',
  }));
  const existingRecord = peopleRecords.find((item) => item.id === (existingPerson?.id || existingPerson?.personId));
  const person = {
    ...(existingRecord || {}),
    ...(existingPerson || {}),
    ...values,
    id: existingPerson?.id || personId,
    personId,
    registered: hasFaceImage ? true : existingRecord?.registered ?? existingPerson?.registered ?? false,
    healthReportStatus: hasHealthReport ? 'valid' : existingRecord?.healthReportStatus || existingPerson?.healthReportStatus || 'missing',
    projectIds: projectRelationships.map((item) => item.projectId),
    projectCount: projectRelationships.length,
    projectRelationships,
    projectOptions: projects.map((item) => ({ value: item.id, label: item.name })),
  };
  const nextPeopleRecords = peopleRecords.some((item) => item.id === person.id)
    ? peopleRecords.map((item) => item.id === person.id ? { ...item, ...person } : { ...item })
    : [...peopleRecords.map((item) => ({ ...item })), person];
  return { person, peopleRecords: nextPeopleRecords, projectPeople: nextProjectPeople };
}

export function getBoundProjectNames(person = {}) {
  return [...new Set((person.projectRelationships || []).map((item) => item.projectName).filter(Boolean))];
}

export function getBoundProjectMessage(person = {}) {
  const projectNames = getBoundProjectNames(person);
  return projectNames.length ? `${person.name || '该人员'} 已绑定项目：${projectNames.join('、')}` : `${person.name || '该人员'} 暂无绑定项目`;
}

export default function PeoplePage({ role, lifecycleState, projectsRecords = mockData.projects, authorizations, peopleRecords: sharedPeopleRecords, onPeopleRecordsChange, projectPeople: sharedProjectPeople, onProjectPeopleChange, registeredDevices = [], accounts: sharedAccounts, onAccountsChange, onOperationLog, onNavigate }) {
  const user = normalizeUser(role);
  const [messageApi, messageContextHolder] = message.useMessage();
  const projects = scopedProjects(role, lifecycleState, projectsRecords);
  const [peopleEdits, setPeopleEdits] = useState({});
  const [newPeople, setNewPeople] = useState([]);
  const [localProjectPeople, setLocalProjectPeople] = useState(() => sharedProjectPeople ?? mockData.projectPeople);
  const [localPeopleRecords, setLocalPeopleRecords] = useState(() => sharedPeopleRecords ?? mockData.people);
  const [localAccounts, setLocalAccounts] = useState(() => mockData.accounts.map((account) => ({ ...account })));
  const projectPeople = sharedProjectPeople ?? localProjectPeople;
  const peopleRecords = sharedPeopleRecords ?? localPeopleRecords;
  const accounts = sharedAccounts ?? localAccounts;
  const updateAccounts = (next) => {
    if (onAccountsChange) onAccountsChange(typeof next === 'function' ? next(accounts) : next);
    else setLocalAccounts(typeof next === 'function' ? next : () => next);
  };
  const [filters, setFilters] = useState({ name: '', projectId: 'all', accountState: 'all' });
  const [drawer, setDrawer] = useState({ open: false, mode: 'view', person: null });
  const [accountDrawer, setAccountDrawer] = useState({ open: false, person: null });
  const people = useMemo(() => {
    const rows = makePersonRows(role, lifecycleState, authorizations, projectPeople, registeredDevices, peopleRecords, projectsRecords, accounts).map((person) => ({ ...person, ...(peopleEdits[person.id] || {}) }));
    const rowIds = new Set(rows.map((person) => person.id));
    return [...rows, ...newPeople.filter((person) => !rowIds.has(person.id))];
  }, [accounts, authorizations, lifecycleState, newPeople, peopleEdits, projectPeople, peopleRecords, projectsRecords, registeredDevices, role]);
  const filtered = people.filter((person) => (
    (!filters.name || person.name.includes(filters.name))
    && (filters.projectId === 'all' || person.projectIds.includes(filters.projectId))
    && (filters.accountState === 'all' || person.accountBindingState === filters.accountState)
  ));
  const canEdit = (person) => canOperate(role, 'editPerson', { projectId: person.projectId || projects[0]?.id });
  const canManageAccountBinding = canOperate(user, 'accountBind') && canOperate(user, 'accountUnbind');
  const savePerson = (values) => {
    const result = buildPersonRecord(values, { peopleRecords, projectPeople, projects, user, existingPerson: drawer.person });
    if (result.error) {
      messageApi.error(result.error);
      return;
    }
    const next = result.person;
    const nextRow = next.accountBindingState ? next : { ...next, accountBindingState: 'unbound' };
    if (drawer.person?.id) setPeopleEdits((items) => ({ ...items, [drawer.person.id]: nextRow }));
    else setNewPeople((items) => [...items, nextRow]);
    if (onProjectPeopleChange) onProjectPeopleChange(result.projectPeople);
    else setLocalProjectPeople(result.projectPeople);
    if (onPeopleRecordsChange) onPeopleRecordsChange(result.peopleRecords);
    else setLocalPeopleRecords(result.peopleRecords);
    onOperationLog?.(buildPersonEditLog(next.personId, next.projectId, user.accountId || 'account-admin'));
    setDrawer({ open: false, mode: 'view', person: null });
    messageApi.success('人员档案已保存（本地演示）');
  };
  const getAccountProjectContext = (person) => {
    const activeProjectIds = projects.filter((project) => project.status === 'active').map((project) => project.id);
    const personProjectIds = person.projectRelationships.filter((item) => item.status === 'active' && activeProjectIds.includes(item.projectId)).map((item) => item.projectId);
    return { activeProjectIds, personProjectIds };
  };
  const openAccountDrawer = (person) => setAccountDrawer({ open: true, person });
  const closeAccountDrawer = () => setAccountDrawer({ open: false, person: null });
  const handleBindAccount = (accountId) => {
    const person = accountDrawer.person;
    if (!person || !canManageAccountBinding) return;
    const result = bindWorkerAccount(accounts, person.id, accountId, getAccountProjectContext(person));
    if (result.error) return messageApi.error(result.error);
    updateAccounts(result.accounts);
    onOperationLog?.(buildAccountBindingLog({
      projectId: person.projectRelationships.find((item) => item.status === 'active')?.projectId || person.projectId,
      personId: person.id,
      accountId,
      operatorId: user.accountId || 'account-admin',
      operation: 'accountBind',
    }));
    closeAccountDrawer();
    messageApi.success('施工人员账号已绑定（本地演示）');
  };
  const handleUnbindAccount = () => {
    const person = accountDrawer.person;
    const account = person && getPersonAccount(accounts, person.id);
    if (!person || !account || !canManageAccountBinding) return;
    const result = unbindWorkerAccount(accounts, person.id);
    if (result.error) return messageApi.error(result.error);
    updateAccounts(result.accounts);
    onOperationLog?.(buildAccountBindingLog({
      projectId: person.projectRelationships.find((item) => item.status === 'active')?.projectId || person.projectId,
      personId: person.id,
      accountId: account.accountId,
      operatorId: user.accountId || 'account-admin',
      operation: 'accountUnbind',
    }));
    closeAccountDrawer();
    messageApi.success('施工人员账号已解绑（本地演示）');
  };
  const selectedAccountPerson = accountDrawer.person ? people.find((person) => person.id === accountDrawer.person.id) || accountDrawer.person : null;
  const selectedAccount = selectedAccountPerson ? getPersonAccount(accounts, selectedAccountPerson.id) : null;
  const bindableAccounts = selectedAccountPerson ? getBindableAccounts(accounts, selectedAccountPerson, getAccountProjectContext(selectedAccountPerson)) : [];
  const columns = [
    { title: '姓名', dataIndex: 'name', key: 'name' },
    { title: '身份证（脱敏）', dataIndex: 'idCardNumber', key: 'idCardNumber', render: (value) => value ? `${String(value).slice(0, 3)}********` : '—' },
    { title: '电话', dataIndex: 'phone', key: 'phone' },
    { title: '专业', dataIndex: 'profession', key: 'profession' },
    { title: '绑定项目', key: 'projectCount', render: (_, person) => <Button type="link" className="project-count-button" onClick={() => messageApi.info(getBoundProjectMessage(person))}>{person.projectCount}</Button> },
    { title: '账号绑定', key: 'accountBinding', render: (_, person) => <div className="account-summary"><StatusTag status={person.accountBindingState === 'bound' ? 'success' : person.accountBindingState === 'inactive' ? 'warning' : 'normal'} label={person.accountBindingState === 'bound' ? '已绑定' : person.accountBindingState === 'inactive' ? '账号已停用' : '未绑定'} /><div>{person.accountName || '未关联系统账号'}</div>{person.accountBindingState !== 'unbound' && <div className="muted-text">门禁权限独立管理</div>}</div> },
    { title: '人脸', dataIndex: 'face', key: 'face', render: (value) => <StatusTag status={value === '已登记' ? 'success' : 'warning'} label={value} /> },
    { title: '健康', dataIndex: 'health', key: 'health', render: (value) => <StatusTag status={value === '有效' ? 'success' : value === '缺失' ? 'warning' : 'error'} label={value} /> },
    { title: '年龄 / 权限', key: 'age', render: (_, person) => <SpaceText age={person.age} permission={person.permission} reason={person.ageAccessReason} /> },
    { title: '操作', key: 'action', render: (_, person) => <div className="table-actions"><Button type="link" onClick={() => setDrawer({ open: true, mode: 'view', person })}>查看</Button>{canEdit(person) && <Button type="link" icon={<EditOutlined />} onClick={() => setDrawer({ open: true, mode: 'edit', person })}>编辑</Button>}{person.accountBindingState !== 'unbound' && <Button type="link" onClick={() => openAccountDrawer(person)}>查看账号</Button>}{person.accountBindingState === 'unbound' && canManageAccountBinding && <Button type="link" onClick={() => openAccountDrawer(person)}>绑定账号</Button>}{person.accountBindingState !== 'unbound' && canManageAccountBinding && <Button type="link" danger onClick={() => openAccountDrawer(person)}>解绑</Button>}</div> },
  ];

  return <div className="business-page">{messageContextHolder}<PageHeader title="人员档案" description="维护人员主档、项目关系、门禁资质与系统账号绑定关系；账号与门禁权限独立管理。" breadcrumb={['首页', '人员档案']} extra={user.role !== 'worker' && <Button type="primary" icon={<PlusOutlined />} onClick={() => setDrawer({ open: true, mode: 'edit', person: { registered: false, projectOptions: projects.map((project) => ({ value: project.id, label: project.name })) } })}>新增人员</Button>} /><FilterBar onReset={() => setFilters({ name: '', projectId: 'all', accountState: 'all' })} onSearch={() => messageApi.success(`已查询 ${filtered.length} 人员`)}><Input placeholder="姓名" allowClear value={filters.name} onChange={(event) => setFilters({ ...filters, name: event.target.value })} /><Select value={filters.projectId} onChange={(projectId) => setFilters({ ...filters, projectId })} options={[{ value: 'all', label: '全部项目' }, ...projects.map((project) => ({ value: project.id, label: project.name }))]} /><Select aria-label="账号绑定状态筛选" value={filters.accountState} onChange={(accountState) => setFilters({ ...filters, accountState })} options={[{ value: 'all', label: '账号状态：全部' }, { value: 'bound', label: '账号状态：已绑定' }, { value: 'unbound', label: '账号状态：未绑定' }, { value: 'inactive', label: '账号状态：已停用' }]} /></FilterBar><Card className="table-card"><Table rowKey="id" columns={columns} dataSource={filtered} scroll={{ x: 1320 }} pagination={false} /></Card><PersonDrawer open={drawer.open} onClose={() => setDrawer({ ...drawer, open: false })} mode={drawer.mode} role={role} person={drawer.person || {}} peopleRecords={peopleRecords} people={people} onSubmit={savePerson} /><AccountBindingDrawer open={accountDrawer.open} person={selectedAccountPerson || {}} account={selectedAccount} bindableAccounts={bindableAccounts} projects={projects} canManage={canManageAccountBinding} onBind={handleBindAccount} onUnbind={handleUnbindAccount} onOpenPermissions={() => { closeAccountDrawer(); onNavigate?.('users'); }} onClose={closeAccountDrawer} /></div>;
}

function SpaceText({ age, permission, reason }) {
  return <div><div>{age} 岁</div><StatusTag status={permission === '正常' ? 'success' : 'warning'} label={permission} /><div className="muted-text">{reason}</div></div>;
}
