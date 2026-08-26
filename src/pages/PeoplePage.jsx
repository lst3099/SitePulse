import React, { useMemo, useState } from 'react';
import { Button, Card, Input, Select, Table, message } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import FilterBar from '../components/FilterBar';
import PageHeader from '../components/PageHeader';
import PersonDrawer from '../components/PersonDrawer';
import StatusTag from '../components/StatusTag';
import { canOperate } from '../domain/permissions';
import mockData from '../data/mockData';
import { buildPersonEditLog, makePersonRows, normalizeUser, scopedProjects } from './pageUtils';

export function buildPersonRecord(values = {}, { peopleRecords = mockData.people, projectPeople = mockData.projectPeople, projects = mockData.projects, user = {}, existingPerson } = {}) {
  const project = projects.find((item) => item.id === values.projectId);
  if (!project || !canOperate(user, 'editPerson', { projectId: values.projectId })) return { error: '当前角色无权操作该项目' };
  const personId = existingPerson?.personId || existingPerson?.id || values.personId || `person-local-${Date.now()}`;
  const relation = { projectId: values.projectId, personId, status: values.relationStatus || 'active' };
  const hasRelation = projectPeople.some((item) => item.personId === personId && item.projectId === relation.projectId);
  const nextProjectPeople = hasRelation
    ? projectPeople.map((item) => item.personId === personId && item.projectId === relation.projectId ? { ...item, ...relation } : { ...item })
    : [...projectPeople.map((item) => ({ ...item })), relation];
  const projectRelationships = nextProjectPeople.filter((item) => item.personId === personId);
  const existingRecord = peopleRecords.find((item) => item.id === (existingPerson?.id || existingPerson?.personId));
  const person = {
    ...(existingRecord || {}),
    ...(existingPerson || {}),
    ...values,
    id: existingPerson?.id || personId,
    personId,
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

export default function PeoplePage({ role, lifecycleState, projectsRecords = mockData.projects, authorizations, peopleRecords: sharedPeopleRecords, onPeopleRecordsChange, projectPeople: sharedProjectPeople, onProjectPeopleChange, registeredDevices = [], onOperationLog }) {
  const user = normalizeUser(role);
  const projects = scopedProjects(role, lifecycleState, projectsRecords);
  const [peopleEdits, setPeopleEdits] = useState({});
  const [newPeople, setNewPeople] = useState([]);
  const [localProjectPeople, setLocalProjectPeople] = useState(() => sharedProjectPeople ?? mockData.projectPeople);
  const [localPeopleRecords, setLocalPeopleRecords] = useState(() => sharedPeopleRecords ?? mockData.people);
  const projectPeople = sharedProjectPeople ?? localProjectPeople;
  const peopleRecords = sharedPeopleRecords ?? localPeopleRecords;
  const [filters, setFilters] = useState({ name: '', projectId: 'all' });
  const [drawer, setDrawer] = useState({ open: false, mode: 'view', person: null });
  const people = useMemo(() => {
    const rows = makePersonRows(role, lifecycleState, authorizations, projectPeople, registeredDevices, peopleRecords, projectsRecords).map((person) => ({ ...person, ...(peopleEdits[person.id] || {}) }));
    const rowIds = new Set(rows.map((person) => person.id));
    return [...rows, ...newPeople.filter((person) => !rowIds.has(person.id))];
  }, [authorizations, lifecycleState, newPeople, peopleEdits, projectPeople, peopleRecords, projectsRecords, registeredDevices, role]);
  const filtered = people.filter((person) => (!filters.name || person.name.includes(filters.name)) && (filters.projectId === 'all' || person.projectIds.includes(filters.projectId)));
  const canEdit = (person) => canOperate(role, 'editPerson', { projectId: person.projectId || projects[0]?.id });
  const savePerson = (values) => {
    const result = buildPersonRecord(values, { peopleRecords, projectPeople, projects, user, existingPerson: drawer.person });
    if (result.error) {
      message.error(result.error);
      return;
    }
    const next = result.person;
    if (drawer.person?.id) setPeopleEdits((items) => ({ ...items, [drawer.person.id]: next }));
    else setNewPeople((items) => [...items, next]);
    if (onProjectPeopleChange) onProjectPeopleChange(result.projectPeople);
    else setLocalProjectPeople(result.projectPeople);
    if (onPeopleRecordsChange) onPeopleRecordsChange(result.peopleRecords);
    else setLocalPeopleRecords(result.peopleRecords);
    onOperationLog?.(buildPersonEditLog(next.personId, next.projectId || projects[0]?.id, user.accountId || 'account-admin'));
    setDrawer({ open: false, mode: 'view', person: null });
    message.success('人员档案已保存（本地演示）');
  };
  const columns = [
    { title: '姓名', dataIndex: 'name', key: 'name' },
    { title: '身份证（脱敏）', dataIndex: 'idCardNumber', key: 'idCardNumber', render: (value) => value ? `${String(value).slice(0, 3)}********` : '—' },
    { title: '电话', dataIndex: 'phone', key: 'phone' },
    { title: '队伍 / 专业', key: 'team', render: (_, person) => `${person.team} / ${person.profession}` },
    { title: '项目及关系', key: 'projects', render: (_, person) => <div>{person.projectRelationships.map((item) => <div key={item.projectId}>{item.projectName} · {item.relationStatus} · {item.accessStatus === 'revoked' ? '门禁已撤销' : '门禁允许'}</div>)}</div> },
    { title: '在场状态', key: 'attendance', render: (_, person) => <div>{person.projectRelationships.map((item) => <div key={item.projectId}>{item.attendanceStatus}</div>)}</div> },
    { title: '项目数', dataIndex: 'projectCount', key: 'projectCount' },
    { title: '账号', dataIndex: 'account', key: 'account' },
    { title: '人脸', dataIndex: 'face', key: 'face', render: (value) => <StatusTag status={value === '已登记' ? 'success' : 'warning'} label={value} /> },
    { title: '健康', dataIndex: 'health', key: 'health', render: (value) => <StatusTag status={value === '有效' ? 'success' : value === '缺失' ? 'warning' : 'error'} label={value} /> },
    { title: '年龄 / 权限', key: 'age', render: (_, person) => <SpaceText age={person.age} permission={person.permission} reason={person.ageAccessReason} /> },
    { title: '操作', key: 'action', render: (_, person) => <div className="table-actions"><Button type="link" onClick={() => setDrawer({ open: true, mode: 'view', person })}>查看</Button>{canEdit(person) && <Button type="link" icon={<EditOutlined />} onClick={() => setDrawer({ open: true, mode: 'edit', person })}>编辑</Button>}</div> },
  ];

  return <div className="business-page"><PageHeader title="人员管理" description="维护人员主档、项目关系与门禁资质；施工人员角色不显示 PC 管理页。" breadcrumb={['首页', '人员管理']} extra={user.role !== 'worker' && <Button type="primary" icon={<PlusOutlined />} onClick={() => setDrawer({ open: true, mode: 'edit', person: { projectId: projects[0]?.id, registered: false, projectOptions: projects.map((project) => ({ value: project.id, label: project.name })) } })}>新增人员</Button>} /><FilterBar onReset={() => setFilters({ name: '', projectId: 'all' })} onSearch={() => message.success(`已查询 ${filtered.length} 人员`)}><Input placeholder="姓名" allowClear value={filters.name} onChange={(event) => setFilters({ ...filters, name: event.target.value })} /><Select value={filters.projectId} onChange={(projectId) => setFilters({ ...filters, projectId })} options={[{ value: 'all', label: '全部项目' }, ...projects.map((project) => ({ value: project.id, label: project.name }))]} /></FilterBar><Card className="table-card"><Table rowKey="id" columns={columns} dataSource={filtered} scroll={{ x: 1200 }} pagination={false} /></Card><PersonDrawer open={drawer.open} onClose={() => setDrawer({ ...drawer, open: false })} mode={drawer.mode} role={role} person={drawer.person || {}} onSubmit={savePerson} /></div>;
}

function SpaceText({ age, permission, reason }) {
  return <div><div>{age} 岁</div><StatusTag status={permission === '正常' ? 'success' : 'warning'} label={permission} /><div className="muted-text">{reason}</div></div>;
}
