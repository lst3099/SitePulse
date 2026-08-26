import React, { useMemo, useState } from 'react';
import { Button, Card, Select, Space, Table, Typography } from 'antd';
import { CameraOutlined } from '@ant-design/icons';
import DetailDrawer from '../components/DetailDrawer';
import FilterBar from '../components/FilterBar';
import PageHeader from '../components/PageHeader';
import StatusTag from '../components/StatusTag';
import { classifyRawEvent, deduplicateRawEvents } from '../domain/attendance';
import { canViewField, filterByDataScope } from '../domain/permissions';
import mockData from '../data/mockData';
import { normalizeUser, scopedProjects } from './pageUtils';

const DEFAULT_DATE = '2026-08-25';

function displayDateTime(value) {
  return value ? String(value).replace('T', ' ').replace(/\+08:00$/, '') : '—';
}

function faceRecognitionLabel(value) {
  return value === 'success' ? '识别成功' : value === 'failure' ? '识别失败' : '未标记';
}

function directionLabel(value) {
  return value === 'in' ? '进门' : value === 'out' ? '出门' : '未标记';
}

function permissionLabel(event) {
  return event.devicePermission === 'allow' || event.deviceAllowed === true
    ? '放行'
    : event.devicePermission === 'deny' || event.deviceAllowed === false
      ? '拒绝'
      : '未标记';
}

function mergeDevices(devices = [], registeredDevices = []) {
  return [...devices, ...registeredDevices.filter((item) => !devices.some((device) => device.id === item.id))];
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

export function buildAccessRecordRows({
  role,
  lifecycleState,
  rawEvents = mockData.rawEvents,
  projectsRecords = mockData.projects,
  peopleRecords = mockData.people,
  devices = mockData.devices,
  registeredDevices = [],
  entrances = mockData.entrances,
  captures = mockData.captures,
  deviceId,
  projectId,
  date,
} = {}) {
  const user = normalizeUser(role);
  const projects = scopedProjects(role, lifecycleState, projectsRecords);
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const peopleMap = new Map(peopleRecords.map((person) => [person.id, person]));
  const entranceMap = new Map(entrances.map((entrance) => [entrance.id, entrance]));
  const deviceMap = new Map(mergeDevices(devices, registeredDevices).map((device) => [device.id, device]));

  return filterByDataScope(user, deduplicateRawEvents(rawEvents))
    .filter((event) => !event.projectId || projectMap.has(event.projectId))
    .filter((event) => !deviceId || event.deviceId === deviceId)
    .filter((event) => !projectId || event.projectId === projectId)
    .filter((event) => !date || String(event.eventTime || '').slice(0, 10) === date)
    .map((event) => {
      const classified = classifyRawEvent(event);
      const device = deviceMap.get(event.deviceId);
      const entrance = entranceMap.get(device?.entranceId);
      const person = peopleMap.get(event.personId);
      const capture = getCaptureForEvent(event, captures);
      return {
        ...classified,
        capture,
        deviceName: device?.platformId || event.deviceId || '未知设备',
        deviceModel: device?.model || '—',
        projectName: projectMap.get(event.projectId)?.name || '未归属项目',
        entranceName: device?.entranceName || entrance?.name || '未配置出入口',
        personName: person?.name || '未知人员',
        faceRecognitionLabel: faceRecognitionLabel(event.faceRecognition),
        directionLabel: directionLabel(event.direction),
        permissionLabel: permissionLabel(event),
      };
    });
}

export default function AccessRecordsPage({ role, lifecycleState, rawEvents = mockData.rawEvents, projectsRecords = mockData.projects, peopleRecords = mockData.people, devices = mockData.devices, registeredDevices = [], entrances = mockData.entrances, captures = mockData.captures }) {
  const user = normalizeUser(role);
  const projects = scopedProjects(role, lifecycleState, projectsRecords);
  const [filters, setFilters] = useState({ deviceId: 'all', projectId: 'all', date: DEFAULT_DATE });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [detail, setDetail] = useState(null);
  const allRows = useMemo(() => buildAccessRecordRows({ role, lifecycleState, rawEvents, projectsRecords, peopleRecords, devices, registeredDevices, entrances, captures }), [captures, devices, entrances, lifecycleState, peopleRecords, projectsRecords, rawEvents, registeredDevices, role]);
  const rows = useMemo(() => buildAccessRecordRows({ role, lifecycleState, rawEvents, projectsRecords, peopleRecords, devices, registeredDevices, entrances, captures, deviceId: appliedFilters.deviceId === 'all' ? undefined : appliedFilters.deviceId, projectId: appliedFilters.projectId === 'all' ? undefined : appliedFilters.projectId, date: appliedFilters.date }), [appliedFilters, captures, devices, entrances, lifecycleState, peopleRecords, projectsRecords, rawEvents, registeredDevices, role]);
  const deviceOptions = [{ value: 'all', label: '全部门禁设备' }, ...Array.from(new Map(allRows.map((row) => [row.deviceId, row.deviceName])).entries()).map(([value, label]) => ({ value, label }))];
  const projectOptions = [{ value: 'all', label: '全部项目' }, ...projects.map((project) => ({ value: project.id, label: project.name }))];
  const columns = [
    { title: '门禁设备', key: 'device', render: (_, record) => <div><strong>{record.deviceName}</strong><div className="muted-text">{record.deviceModel} · {record.deviceId || '—'}</div></div> },
    { title: '项目 / 出入口', key: 'project', render: (_, record) => <div>{record.projectName}<div className="muted-text">{record.entranceName}</div></div> },
    { title: '刷脸时间', dataIndex: 'eventTime', key: 'eventTime', render: displayDateTime },
    { title: '人员', dataIndex: 'personName', key: 'personName' },
    { title: '刷脸结果', dataIndex: 'faceRecognitionLabel', key: 'faceRecognition' },
    { title: '进出方向', dataIndex: 'directionLabel', key: 'direction' },
    { title: '设备侧放行', dataIndex: 'permissionLabel', key: 'permission' },
    { title: '来源 / 事件序列', key: 'source', render: (_, record) => `${record.source || '—'} / ${record.eventSerial || '—'}` },
    { title: '事件结论', key: 'result', render: (_, record) => <StatusTag status={record.isEffective ? 'success' : record.securityLog ? 'error' : 'warning'} label={record.isEffective ? '有效进出' : record.securityLog ? '安全日志' : '无效事件'} /> },
    { title: '操作', key: 'action', render: (_, record) => { const canView = canViewCapture(user, record, record.capture); return <Space><Button type="link" onClick={() => setDetail({ type: 'rawEvent', data: record })}>原始详情</Button>{canView ? <Button type="link" icon={<CameraOutlined />} onClick={() => setDetail({ type: 'snapshot', data: record.capture })}>抓拍</Button> : <Typography.Text type="secondary">{record.capture ? '无权限查看' : '无抓拍'}</Typography.Text>}</Space>; } },
  ];

  return <div className="business-page">
    <PageHeader title="门禁记录" description="按门禁设备查看系统原始刷脸事件，原始数据只读保存。" breadcrumb={['首页', '门禁记录']} />
    <div className="workday-note"><StatusTag status="normal" label="原始事件" /> 门禁记录直接来自设备上报；重复事件只在展示时按设备事件身份去重，不改变原始事件内容。</div>
    <FilterBar onReset={() => { setFilters({ deviceId: 'all', projectId: 'all', date: DEFAULT_DATE }); setAppliedFilters({ deviceId: 'all', projectId: 'all', date: DEFAULT_DATE }); }} onSearch={() => setAppliedFilters(filters)}>
      <Select aria-label="设备筛选" value={filters.deviceId} onChange={(deviceId) => setFilters({ ...filters, deviceId })} options={deviceOptions} />
      <Select aria-label="项目筛选" value={filters.projectId} onChange={(projectId) => setFilters({ ...filters, projectId })} options={projectOptions} />
      <input aria-label="日期筛选" type="date" value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} />
    </FilterBar>
    <Card title="门禁刷脸记录" className="table-card" extra={<Typography.Text type="secondary">共 {rows.length} 条去重事件</Typography.Text>}><Table rowKey="id" columns={columns} dataSource={rows} scroll={{ x: 1500 }} pagination={false} /></Card>
    <DetailDrawer open={Boolean(detail)} onClose={() => setDetail(null)} type={detail?.type} data={detail?.data} role={role} />
  </div>;
}
