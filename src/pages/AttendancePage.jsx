import React, { useMemo, useState } from 'react';
import { Button, Card, Drawer, Form, Input, Select, Space, Table, Typography, message } from 'antd';
import { CameraOutlined, PlusOutlined } from '@ant-design/icons';
import DetailDrawer from '../components/DetailDrawer';
import FilterBar from '../components/FilterBar';
import PageHeader from '../components/PageHeader';
import StatusTag from '../components/StatusTag';
import { applyLeaveAndSupplement, classifyRawEvent } from '../domain/attendance';
import { canOperate, canViewField, filterByDataScope } from '../domain/permissions';
import mockData from '../data/mockData';
import { normalizeUser, scopedProjects, toDateKey } from './pageUtils';

const DEFAULT_DATE = '2026-08-25';

function personName(personId, peopleRecords = mockData.people) {
  return peopleRecords.find((person) => person.id === personId)?.name || '未知人员';
}

function displayDateTime(value) {
  return value ? String(value).replace('T', ' ').replace(/\+08:00$/, '') : '—';
}

export function getCaptureForEvent(event, captures = mockData.captures) {
  return captures.find((capture) => capture.eventId === event?.id);
}

export function canViewCapture(user, event, capture) {
  return Boolean(capture && canViewField(user, 'capturePhoto', {
    projectId: event?.projectId,
    personId: event?.personId,
    targetPersonId: event?.personId,
  }));
}

export function getPermissionMarkers(event) {
  const classified = classifyRawEvent(event || {});
  return {
    expiredPermission: classified.expiredPermission,
    permissionMismatch: classified.permissionMismatch,
    deviceRelease: classified.expiredPermission && (event.devicePermission === 'allow' || event.deviceAllowed === true) ? '设备放行' : event.devicePermission === 'allow' || event.deviceAllowed === true ? '设备放行' : event.devicePermission === 'deny' || event.deviceAllowed === false ? '设备拒绝' : '未标记',
  };
}

export function voidSupplementRecord(supplements, supplementId, voidReason, voidedAt = '2026-08-25 12:00') {
  return (supplements || []).map((record) => record.id === supplementId ? {
    ...record,
    status: 'voided',
    voided: true,
    voidReason,
    voidedAt,
  } : { ...record });
}

export function createLeaveRecord(values = {}, operatorId = 'account-admin', id = `leave-local-${Date.now()}`) {
  return {
    id,
    projectId: values.projectId,
    personId: values.personId,
    date: values.date,
    endDate: values.endDate || values.date,
    reason: values.reason,
    type: values.type || 'personal',
    status: 'approved',
    operatorId,
    source: 'admin-registration',
  };
}

export function isPersonInProject(projectId, personId, projectPeople = mockData.projectPeople) {
  return Boolean(projectId && personId && projectPeople.some((relation) => relation.projectId === projectId && relation.personId === personId));
}

export function buildAttendanceRows({
  role,
  projects = mockData.projects,
  rawEvents = mockData.rawEvents,
  leaves = mockData.leaveRecords,
  supplements = mockData.supplementRecords,
  projectPeople = mockData.projectPeople,
  peopleRecords = mockData.people,
  date = DEFAULT_DATE,
  projectId,
  personId,
} = {}) {
  const user = normalizeUser(role);
  const visibleProjects = filterByDataScope(user, projects)
    .filter((project) => !projectId || project.id === projectId);
  const relations = filterByDataScope(user, projectPeople)
    .filter((relation) => !projectId || relation.projectId === projectId)
    .filter((relation) => !personId || relation.personId === personId);

  return visibleProjects.flatMap((project) => relations
    .filter((relation) => relation.projectId === project.id)
    .map((relation) => {
      const result = applyLeaveAndSupplement(rawEvents, {
        projectId: project.id,
        personId: relation.personId,
        date: toDateKey(date) || DEFAULT_DATE,
        workStart: project.workStart,
        workEnd: project.workEnd,
        graceMinutes: project.graceMinutes,
        holidayDates: project.holidayDates,
        restDates: project.restDates,
        dayStatus: project.dayStatus,
        leaves,
        supplements,
      });
      const supplementRecords = supplements.filter((record) => record.projectId === project.id && record.personId === relation.personId && toDateKey(record.eventTime || record.date) === toDateKey(date));
      return {
        ...result,
        supplementRecords,
        permissionMarkers: result.effectiveRecords.filter((record) => !record.recordType).map((record) => getPermissionMarkers(record)).filter((marker) => marker.expiredPermission || marker.permissionMismatch),
        sourceLabel: result.status === '请假' ? '管理员登记请假' : result.supplemented ? '管理员补录 + 有效设备事件' : '设备原始事件',
        supplementStatus: supplementRecords.some((record) => record.voided === true) ? '含已作废补录' : supplementRecords.length ? '有效补录' : '无补录',
        projectName: project.name,
        personName: personName(relation.personId, peopleRecords),
      };
    }));
}

export default function AttendancePage({ role, lifecycleState, projectsRecords = mockData.projects, peopleRecords = mockData.people, projectPeople = mockData.projectPeople, supplements: sharedSupplements, onSupplementsChange, leaveRecords: sharedLeaves, onLeaveRecordsChange, onOperationLog }) {
  const user = normalizeUser(role);
  const projects = scopedProjects(role, lifecycleState, projectsRecords);
  const [filters, setFilters] = useState({ projectId: 'all', personId: 'all', date: DEFAULT_DATE });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [localSupplements, setLocalSupplements] = useState(sharedSupplements || mockData.supplementRecords);
  const [localLeaves, setLocalLeaves] = useState(sharedLeaves || mockData.leaveRecords);
  const [detail, setDetail] = useState(null);
  const [supplementOpen, setSupplementOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [form] = Form.useForm();
  const [leaveForm] = Form.useForm();
  const supplementProjectId = Form.useWatch('projectId', form);
  const leaveProjectId = Form.useWatch('projectId', leaveForm);

  const peopleOptions = useMemo(() => {
    const projectIds = appliedFilters.projectId === 'all' ? projects.map((project) => project.id) : [appliedFilters.projectId];
    const ids = new Set(projectPeople.filter((relation) => projectIds.includes(relation.projectId)).map((relation) => relation.personId));
    return peopleRecords.filter((person) => ids.has(person.id)).map((person) => ({ value: person.id, label: person.name }));
  }, [appliedFilters.projectId, peopleRecords, projectPeople, projects]);
  const peopleOptionsForProject = (projectId) => peopleRecords
    .filter((person) => isPersonInProject(projectId, person.id, projectPeople))
    .map((person) => ({ value: person.id, label: person.name }));
  const supplementPeopleOptions = useMemo(() => peopleOptionsForProject(supplementProjectId || projects[0]?.id), [projectPeople, projects, supplementProjectId]);
  const leavePeopleOptions = useMemo(() => peopleOptionsForProject(leaveProjectId || projects[0]?.id), [leaveProjectId, projectPeople, projects]);
  const rows = useMemo(() => buildAttendanceRows({
    role,
    projects,
    date: appliedFilters.date,
    projectId: appliedFilters.projectId === 'all' ? undefined : appliedFilters.projectId,
    personId: appliedFilters.personId === 'all' ? undefined : appliedFilters.personId,
    supplements: localSupplements,
    leaves: localLeaves,
    projectPeople,
    peopleRecords,
  }), [appliedFilters, localLeaves, localSupplements, peopleRecords, projectPeople, projects, role]);
  const rawRows = rows.flatMap((row) => row.rawRecords.map((event) => ({ ...event, capture: getCaptureForEvent(event), projectName: row.projectName, personName: row.personName })));
  const canSupplement = canOperate(user, 'supplement', { projectId: appliedFilters.projectId === 'all' ? projects[0]?.id : appliedFilters.projectId });
  const canLeave = canOperate(user, 'leave', { projectId: appliedFilters.projectId === 'all' ? projects[0]?.id : appliedFilters.projectId });

  const updateSupplements = (next) => {
    setLocalSupplements(next);
    onSupplementsChange?.(next);
  };

  const saveSupplement = (values) => {
    if (!isPersonInProject(values.projectId, values.personId, projectPeople)) {
      message.error('人员不属于所选项目，无法保存补录');
      return;
    }
    const date = values.date || appliedFilters.date;
    const record = {
      id: `supplement-local-${Date.now()}`,
      projectId: values.projectId,
      personId: values.personId,
      date,
      direction: values.direction,
      eventTime: `${date}T${values.time}:00+08:00`,
      recordType: 'supplement',
      source: 'platform-supplement',
      status: 'active',
      operatorId: user.accountId || 'account-admin',
      reason: values.reason,
      approved: true,
      voided: false,
      cancelled: false,
    };
    updateSupplements([...localSupplements, record]);
    onOperationLog?.({ projectId: record.projectId, operatorId: record.operatorId, operation: 'supplement', module: 'attendance', targetId: record.id, occurredAt: '2026-08-25 12:00', reason: record.reason });
    setSupplementOpen(false);
    form.resetFields();
    message.success('补录已新增到平台考勤结果（原始设备事件未改变）');
  };

  const voidSupplement = (supplementId, reason) => {
    updateSupplements(voidSupplementRecord(localSupplements, supplementId, reason));
    const supplement = localSupplements.find((record) => record.id === supplementId);
    onOperationLog?.({ projectId: supplement?.projectId, operatorId: user.accountId || 'account-admin', operation: 'supplementVoid', module: 'attendance', targetId: supplementId, occurredAt: '2026-08-25 12:00', reason });
    setDetail(null);
    message.success('补录已作废，原始设备事件未改变（本地演示）');
  };

  const saveLeave = (values) => {
    if (!isPersonInProject(values.projectId, values.personId, projectPeople)) {
      message.error('人员不属于所选项目，无法保存请假');
      return;
    }
    const leave = createLeaveRecord(values, user.accountId || 'account-admin');
    const next = [...localLeaves, leave];
    setLocalLeaves(next);
    onLeaveRecordsChange?.(next);
    onOperationLog?.({ projectId: leave.projectId, operatorId: leave.operatorId, operation: 'leave', module: 'attendance', targetId: leave.id, occurredAt: '2026-08-25 12:00', reason: leave.reason });
    setLeaveOpen(false);
    leaveForm.resetFields();
    message.success('请假已登记，考勤结果已更新（本地演示）');
  };

  const projectOptions = [{ value: 'all', label: '全部项目' }, ...projects.map((project) => ({ value: project.id, label: project.name }))];
  const personSelectOptions = [{ value: 'all', label: '全部人员' }, ...peopleOptions];
  const rawColumns = [
    { title: '项目', dataIndex: 'projectName', key: 'projectName' },
    { title: '人员', dataIndex: 'personName', key: 'personName' },
    { title: '事件时间', dataIndex: 'eventTime', key: 'eventTime', render: displayDateTime },
    { title: '方向', dataIndex: 'direction', key: 'direction', render: (value) => value === 'in' ? '进门' : '出门' },
    { title: '事件来源', dataIndex: 'source', key: 'eventSource', render: (value) => value || '—' },
    { title: '设备 / 事件序列', key: 'source', render: (_, record) => `${record.deviceId || '—'} / ${record.eventSerial || '—'}` },
    { title: '设备侧放行', key: 'devicePermission', render: (_, record) => record.devicePermission === 'allow' || record.deviceAllowed === true ? '放行' : record.devicePermission === 'deny' || record.deviceAllowed === false ? '拒绝' : '未标记' },
    { title: '权限解释', key: 'permissionMarkers', render: (_, record) => record.expiredPermission && record.permissionMismatch ? '权限过期设备放行 / 权限不一致' : record.expiredPermission ? '权限过期设备放行' : record.permissionMismatch ? '权限不一致' : '—' },
    { title: '事件结论', key: 'result', render: (_, record) => <StatusTag status={record.isEffective ? 'success' : record.securityLog ? 'error' : 'warning'} label={record.isEffective ? '有效进出' : record.securityLog ? '安全日志' : '无效事件'} /> },
    { title: '查看', key: 'action', render: (_, record) => { const canView = canViewCapture(user, record, record.capture); return <Space><Button type="link" onClick={() => setDetail({ type: 'rawEvent', data: record })}>原始详情</Button>{canView ? <Button type="link" icon={<CameraOutlined />} onClick={() => setDetail({ type: 'snapshot', data: record.capture })}>抓拍</Button> : <Typography.Text type="secondary">{record.capture ? '无权限查看' : '无抓拍'}</Typography.Text>}</Space>; } },
  ];
  const resultColumns = [
    { title: '项目 / 人员', key: 'person', render: (_, row) => <div><strong>{row.projectName}</strong><div>{row.personName}</div></div> },
    { title: '日期', dataIndex: 'date', key: 'date' },
    { title: '平台考勤结果', key: 'status', render: (_, row) => <StatusTag status={row.status === '正常' ? 'success' : row.status === '缺勤' ? 'error' : 'warning'} label={row.status} /> },
    { title: '来源 / 补录状态', key: 'source', render: (_, row) => <div>{row.sourceLabel}<div className="muted-text">{row.supplementStatus}</div></div> },
    { title: '设备 / 平台权限解释', key: 'permission', render: (_, row) => row.permissionMarkers.length ? row.permissionMarkers.map((marker) => marker.expiredPermission ? '权限过期设备放行' : '权限不一致').join('、') : '—' },
    { title: '最早进门', dataIndex: 'firstEntryAt', key: 'firstEntryAt', render: displayDateTime },
    { title: '最晚出门', dataIndex: 'lastExitAt', key: 'lastExitAt', render: displayDateTime },
    { title: '迟到 / 早退', key: 'flags', render: (_, row) => <Space>{row.isLate && <StatusTag status="warning" label="迟到" />}{row.isEarlyLeave && <StatusTag status="warning" label="早退" />}{!row.isLate && !row.isEarlyLeave && '—'}</Space> },
    { title: '操作', key: 'action', render: (_, row) => { const activeSupplement = row.supplementRecords.find((record) => record.voided !== true && record.approved !== false); return <div className="table-actions"><Button type="link" onClick={() => setDetail({ type: row.leave ? 'leave' : 'attendance', data: row.leave || row })}>详情</Button>{activeSupplement && <Button type="link" onClick={() => setDetail({ type: 'supplement', data: activeSupplement })}>补录详情</Button>}{canSupplement && <Button type="link" onClick={() => { form.setFieldsValue({ projectId: row.projectId, personId: row.personId, date: row.date }); setSupplementOpen(true); }}>补录</Button>}</div>; } },
  ];

  return <div className="business-page">
    <PageHeader title="考勤管理" description="按项目、人员、日期查看不可修改的设备原始事件与平台汇总结果。" breadcrumb={['首页', '考勤管理']} extra={<Space>{canLeave && <Button onClick={() => setLeaveOpen(true)}>登记请假</Button>}{canSupplement && <Button type="primary" icon={<PlusOutlined />} onClick={() => setSupplementOpen(true)}>新增补录</Button>}</Space>} />
    <div className="workday-note"><StatusTag status="normal" label="规则边界" /> 原始设备事件不可修改、不可合并；同一设备事件已去重。只有“补录”，补录只新增平台结果，不改变原始事件；不实现加班、APP补录、远程开门。</div>
    <FilterBar onReset={() => { setFilters({ projectId: 'all', personId: 'all', date: DEFAULT_DATE }); setAppliedFilters({ projectId: 'all', personId: 'all', date: DEFAULT_DATE }); }} onSearch={() => setAppliedFilters(filters)}>
      <Select aria-label="项目筛选" value={filters.projectId} onChange={(projectId) => setFilters({ ...filters, projectId, personId: 'all' })} options={projectOptions} />
      <Input aria-label="日期筛选" type="date" value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} />
      <Select aria-label="人员筛选" value={filters.personId} onChange={(personId) => setFilters({ ...filters, personId })} options={personSelectOptions} />
    </FilterBar>
    <Card title="设备原始事件" className="table-card" extra={<Typography.Text type="secondary">共 {rawRows.length} 条去重事件</Typography.Text>}><Table rowKey="id" columns={rawColumns} dataSource={rawRows} scroll={{ x: 1200 }} pagination={false} /></Card>
    <Card title="平台考勤结果" className="table-card" extra={<Typography.Text type="secondary">按项目 + 人员 + 日期汇总有效进出</Typography.Text>}><Table rowKey={(row) => `${row.projectId}-${row.personId}-${row.date}`} columns={resultColumns} dataSource={rows} scroll={{ x: 1200 }} pagination={false} /></Card>
    <DetailDrawer open={Boolean(detail)} onClose={() => setDetail(null)} type={detail?.type} data={detail?.data} role={role} onSubmit={detail?.type === 'supplement' ? ({ voidReason }) => voidSupplement(detail.data.id, voidReason) : undefined} />
    <Drawer title="新增平台补录" open={supplementOpen} onClose={() => { setSupplementOpen(false); form.resetFields(); }} width={480} destroyOnClose>
      <Typography.Paragraph type="secondary">补录只进入平台考勤结果，设备原始事件保持只读。</Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={saveSupplement} initialValues={{ projectId: projects[0]?.id, personId: peopleOptions[0]?.value, date: appliedFilters.date, direction: 'in', time: '09:00' }}>
        <Form.Item label="项目" name="projectId" rules={[{ required: true, message: '请选择项目' }]}><Select onChange={() => form.setFieldValue('personId', undefined)} options={projects.map((project) => ({ value: project.id, label: project.name }))} /></Form.Item>
        <Form.Item label="人员" name="personId" rules={[{ required: true, message: '请选择人员' }]}><Select options={supplementPeopleOptions} /></Form.Item>
        <Form.Item label="日期" name="date" rules={[{ required: true, message: '请选择日期' }]}><Input type="date" /></Form.Item>
        <Form.Item label="方向" name="direction" rules={[{ required: true }]}><Select options={[{ value: 'in', label: '进门' }, { value: 'out', label: '出门' }]} /></Form.Item>
        <Form.Item label="时间" name="time" rules={[{ required: true, message: '请输入时间' }]}><Input type="time" /></Form.Item>
        <Form.Item label="补录原因" name="reason" rules={[{ required: true, message: '请输入补录原因' }]}><Input.TextArea /></Form.Item>
        <Button type="primary" htmlType="submit">保存补录</Button>
      </Form>
    </Drawer>
    <Drawer title="登记请假" open={leaveOpen} onClose={() => { setLeaveOpen(false); leaveForm.resetFields(); }} width={480} destroyOnClose>
      <Typography.Paragraph type="secondary">仅系统管理员和项目负责人可登记；登记后请假优先于节假日/休息日状态。</Typography.Paragraph>
      <Form form={leaveForm} layout="vertical" onFinish={saveLeave} initialValues={{ projectId: projects[0]?.id, personId: peopleOptions[0]?.value, date: appliedFilters.date, endDate: appliedFilters.date }}>
        <Form.Item label="项目" name="projectId" rules={[{ required: true, message: '请选择项目' }]}><Select onChange={() => leaveForm.setFieldValue('personId', undefined)} options={projects.map((project) => ({ value: project.id, label: project.name }))} /></Form.Item>
        <Form.Item label="人员" name="personId" rules={[{ required: true, message: '请选择人员' }]}><Select options={leavePeopleOptions} /></Form.Item>
        <Form.Item label="开始日期" name="date" rules={[{ required: true, message: '请选择开始日期' }]}><Input type="date" /></Form.Item>
        <Form.Item label="结束日期" name="endDate" rules={[{ required: true, message: '请选择结束日期' }]}><Input type="date" /></Form.Item>
        <Form.Item label="请假原因" name="reason" rules={[{ required: true, message: '请输入请假原因' }]}><Input.TextArea /></Form.Item>
        <Button type="primary" htmlType="submit">保存请假</Button>
      </Form>
    </Drawer>
  </div>;
}
