import React, { useMemo, useState } from 'react';
import { Button, Card, Input, Select, Table, Typography, message } from 'antd';
import DetailDrawer from '../components/DetailDrawer';
import FilterBar from '../components/FilterBar';
import PageHeader from '../components/PageHeader';
import { filterByDataScope } from '../domain/permissions';
import mockData from '../data/mockData';
import { normalizeUser, projectName, scopedProjects } from './pageUtils';

const MODULE_LABELS = { attendance: '考勤', devices: '设备', permissions: '授权', health: '健康与年龄', alerts: '告警', users: '用户与权限', projects: '项目', people: '人员' };
const OPERATION_LABELS = { supplement: '补录', supplementVoid: '补录作废', edit: '编辑', bind: '绑定', deviceUnbind: '设备解绑', deviceMove: '设备换项目', deviceDisable: '设备停用', deviceArchive: '设备归档', deviceRegister: '设备登记', sync: '同步', authorize: '授权', alertRead: '告警已读', leave: '请假', accountOpen: '账号开通', accountDisable: '账号停用', accountReset: '账号重置', specialAuthorizationCreate: '特殊授权新增', specialAuthorizationUpdate: '特殊授权修改', specialAuthorizationRevoke: '特殊授权撤销', projectCreate: '项目新增', projectEdit: '项目编辑', projectStatus: '项目状态变更', personEdit: '人员编辑' };

export default function OperationLogsPage({ role, lifecycleState, projectsRecords = mockData.projects, operationLogs = mockData.operationLogs }) {
  const projects = scopedProjects(role, lifecycleState, projectsRecords);
  const [filters, setFilters] = useState({ operatorId: 'all', module: 'all', date: '', projectId: 'all' });
  const [detail, setDetail] = useState(null);
  const logs = useMemo(() => filterByDataScope(normalizeUser(role), operationLogs).map((log) => ({
    ...log,
    operatorName: mockData.accounts.find((account) => account.accountId === log.operatorId)?.name || log.operatorId,
    moduleName: MODULE_LABELS[log.module] || log.module || '其他',
    operationName: OPERATION_LABELS[log.operation] || log.operation,
  })), [operationLogs, role]);
  const filtered = logs.filter((log) => (
    (filters.operatorId === 'all' || log.operatorId === filters.operatorId) &&
    (filters.module === 'all' || log.module === filters.module) &&
    (filters.projectId === 'all' || log.projectId === filters.projectId) &&
    (!filters.date || String(log.occurredAt).startsWith(filters.date))
  ));
  const columns = [
    { title: '发生时间', dataIndex: 'occurredAt', key: 'occurredAt' },
    { title: '操作人', dataIndex: 'operatorName', key: 'operatorName' },
    { title: '模块', dataIndex: 'moduleName', key: 'moduleName' },
    { title: '操作', dataIndex: 'operationName', key: 'operationName' },
    { title: '项目', dataIndex: 'projectId', key: 'projectId', render: (value) => projectName(value, projectsRecords) },
    { title: '目标 / 原因', key: 'target', render: (_, log) => `${log.targetId || '—'} · ${log.reason || '—'}` },
    { title: '详情', key: 'action', render: (_, log) => <Button type="link" onClick={() => setDetail({ type: 'operationLog', data: log })}>查看</Button> },
  ];

  return <div className="business-page">
    <PageHeader title="操作日志" description="只读追溯新增、编辑、补录、绑定、同步、授权与告警已读等关键操作。" breadcrumb={['首页', '操作日志']} />
    <div className="workday-note"><Typography.Text type="secondary">日志只读，不提供修改或删除；筛选条件仅影响当前查看范围。</Typography.Text></div>
    <FilterBar onReset={() => setFilters({ operatorId: 'all', module: 'all', date: '', projectId: 'all' })} onSearch={() => message.info(`已查询 ${filtered.length} 条操作日志`)}>
      <Select aria-label="操作人筛选" value={filters.operatorId} onChange={(operatorId) => setFilters({ ...filters, operatorId })} options={[{ value: 'all', label: '全部操作人' }, ...mockData.accounts.map((account) => ({ value: account.accountId, label: account.name }))]} />
      <Select aria-label="日志模块筛选" value={filters.module} onChange={(module) => setFilters({ ...filters, module })} options={[{ value: 'all', label: '全部模块' }, ...Object.entries(MODULE_LABELS).map(([value, label]) => ({ value, label }))]} />
      <Input aria-label="日志时间筛选" type="date" value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} />
      <Select aria-label="日志项目筛选" value={filters.projectId} onChange={(projectId) => setFilters({ ...filters, projectId })} options={[{ value: 'all', label: '全部项目' }, ...projects.map((project) => ({ value: project.id, label: project.name }))]} />
    </FilterBar>
    <Card title="操作日志" className="table-card" extra={<Typography.Text type="secondary">共 {filtered.length} 条</Typography.Text>}><Table rowKey="id" columns={columns} dataSource={filtered} scroll={{ x: 1200 }} pagination={false} /></Card>
    <DetailDrawer open={Boolean(detail)} onClose={() => setDetail(null)} type={detail?.type} data={detail?.data} role={role} />
  </div>;
}
