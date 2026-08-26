import React, { useMemo, useState } from 'react';
import { Button, Card, Input, Select, Table, Typography, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import FilterBar from '../components/FilterBar';
import PageHeader from '../components/PageHeader';
import StatusTag from '../components/StatusTag';
import { deduplicateRawEvents } from '../domain/attendance';
import { canOperate, filterByDataScope } from '../domain/permissions';
import mockData from '../data/mockData';
import { buildAttendanceRows } from './AttendancePage';
import { makePersonRows, normalizeUser, projectName, scopedProjects } from './pageUtils';

const REPORT_LABELS = { people: '人员报表', attendance: '考勤报表', events: '进出记录报表' };

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

export function toCsv(rows, fields) {
  return [fields.map((field) => csvCell(field.label)).join(','), ...rows.map((row) => fields.map((field) => csvCell(field.value(row))).join(','))].join('\n');
}

export function getReportRows({ type, role, projectId = 'all', date = '2026-08-25', lifecycleState, projectsRecords = mockData.projects, supplements, leaves, projectPeople = mockData.projectPeople, peopleRecords = mockData.people } = {}) {
  const projects = scopedProjects(role, lifecycleState, projectsRecords);
  const selectedProjectId = projectId === 'all' ? undefined : projectId;
  if (type === 'people') {
    return makePersonRows(role, lifecycleState, undefined, projectPeople, [], peopleRecords, projectsRecords).filter((person) => !selectedProjectId || person.projectIds.includes(selectedProjectId));
  }
  if (type === 'attendance') {
    return buildAttendanceRows({ role, projects, projectId: selectedProjectId, date, supplements, leaves, projectPeople, peopleRecords });
  }
  const visibleEvents = filterByDataScope(normalizeUser(role), deduplicateRawEvents(mockData.rawEvents)).filter((event) => (
    (!selectedProjectId || event.projectId === selectedProjectId) && (!date || String(event.eventTime).slice(0, 10) === date)
  ));
  return visibleEvents.map((event) => ({ ...event, projectName: projectName(event.projectId, projectsRecords), personName: peopleRecords.find((person) => person.id === event.personId)?.name || '未知人员' }));
}

export function downloadCsv(filename, content) {
  if (typeof document === 'undefined') return false;
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}

export default function ReportsPage({ role, lifecycleState, projectsRecords = mockData.projects, peopleRecords = mockData.people, projectPeople, supplements, leaveRecords }) {
  const projects = scopedProjects(role, lifecycleState, projectsRecords);
  const [filters, setFilters] = useState({ projectId: 'all', type: 'people', date: '2026-08-25' });
  const rows = useMemo(() => getReportRows({ ...filters, role, lifecycleState, projectsRecords, peopleRecords, projectPeople, supplements, leaves: leaveRecords }), [filters, leaveRecords, lifecycleState, peopleRecords, projectPeople, projectsRecords, role, supplements]);
  const canExport = canOperate(role, 'export', { projectId: filters.projectId === 'all' ? projects[0]?.id : filters.projectId });
  const fields = filters.type === 'people'
    ? [{ label: '姓名', value: (row) => row.name }, { label: '身份证（脱敏）', value: (row) => row.idCardNumber ? `${String(row.idCardNumber).slice(0, 3)}********` : '—' }, { label: '项目', value: (row) => row.projectRelationships.map((item) => item.projectName).join('、') }, { label: '账号', value: (row) => row.account }, { label: '健康', value: (row) => row.health }]
    : filters.type === 'attendance'
      ? [{ label: '项目', value: (row) => row.projectName }, { label: '人员', value: (row) => row.personName }, { label: '日期', value: (row) => row.date }, { label: '平台考勤结果', value: (row) => row.status }, { label: '最早进门', value: (row) => row.firstEntryAt || '—' }, { label: '最晚出门', value: (row) => row.lastExitAt || '—' }]
      : [{ label: '项目', value: (row) => row.projectName }, { label: '人员', value: (row) => row.personName }, { label: '事件时间', value: (row) => row.eventTime }, { label: '方向', value: (row) => row.direction === 'in' ? '进门' : '出门' }, { label: '设备', value: (row) => row.deviceId }, { label: '事件序列', value: (row) => row.eventSerial }];
  const exportReport = () => {
    const csv = toCsv(rows, fields);
    if (downloadCsv(`${REPORT_LABELS[filters.type]}-${filters.projectId}.csv`, csv)) message.success('CSV 已下载');
    else message.info('当前环境仅生成 CSV 内容，未连接后端');
  };
  const columns = fields.map((field) => ({ title: field.label, key: field.label, render: (_, row) => field.value(row) }));
  if (filters.type === 'attendance') columns.push({ title: '状态', key: 'status', render: (_, row) => <StatusTag status={row.status === '正常' ? 'success' : row.status === '缺勤' ? 'error' : 'warning'} label={row.status} /> });

  return <div className="business-page">
    <PageHeader title="报表中心" description="按项目查看与导出人员、考勤、进出记录报表。" breadcrumb={['首页', '报表中心']} extra={<Button type="primary" icon={<DownloadOutlined />} disabled={!canExport} onClick={exportReport}>导出 CSV</Button>} />
    <div className="workday-note"><StatusTag status="normal" label="导出边界" /> 平台考勤结果可导出；原始设备事件也可导出但不可修改。字段来自当前 mock 数据，不连接后端。</div>
    <FilterBar onReset={() => setFilters({ projectId: 'all', type: 'people', date: '2026-08-25' })} onSearch={() => message.info(`已查询 ${rows.length} 条${REPORT_LABELS[filters.type]}`)}>
      <Select aria-label="报表类型" value={filters.type} onChange={(type) => setFilters({ ...filters, type })} options={Object.entries(REPORT_LABELS).map(([value, label]) => ({ value, label }))} />
      <Select aria-label="报表项目筛选" value={filters.projectId} onChange={(projectId) => setFilters({ ...filters, projectId })} options={[{ value: 'all', label: '全部项目' }, ...projects.map((project) => ({ value: project.id, label: project.name }))]} />
      {filters.type !== 'people' && <Input aria-label="报表日期筛选" type="date" value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} />}
    </FilterBar>
    <Card title={REPORT_LABELS[filters.type]} className="table-card" extra={<Typography.Text type="secondary">共 {rows.length} 条；只读展示</Typography.Text>}><Table rowKey={(row) => row.id || `${row.projectId}-${row.personId}-${row.date}`} columns={columns} dataSource={rows} scroll={{ x: 1200 }} pagination={false} /></Card>
  </div>;
}
