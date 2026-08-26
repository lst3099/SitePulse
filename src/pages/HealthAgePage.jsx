import React, { useState } from 'react';
import { Alert, Button, Card, DatePicker, Descriptions, Drawer, Form, Input, Select, Table, message } from 'antd';
import PageHeader from '../components/PageHeader';
import StatusTag from '../components/StatusTag';
import { canOperate, filterByDataScope } from '../domain/permissions';
import mockData from '../data/mockData';
import { DEMO_AS_OF_DATE, getSpecialAuthorizationStatus, makePersonRows, normalizeUser, scopedProjects, toDatePickerValue, toDateTimeKey } from './pageUtils';

export const AUTH_STATUS_META = {
  pending: { label: '生效前', status: 'warning' },
  active: { label: '有效期内', status: 'success' },
  expired: { label: '已失效', status: 'error' },
  revoked: { label: '已撤销', status: 'error' },
};

export function buildAuthorizationRecord(values = {}, id = `authorization-local-${Date.now()}`, existing) {
  return {
    ...values,
    id,
    authorizer: values.authorizer,
    operatorId: values.authorizer,
    effectiveAt: toDateTimeKey(values.effectiveAt),
    expiresAt: toDateTimeKey(values.expiresAt),
    status: existing?.status === 'revoked' ? 'revoked' : values.status || existing?.status || 'active',
  };
}

export function validateAuthorizationScope(values = {}, user, projectPeople = mockData.projectPeople) {
  if (!canOperate(user, 'specialAuthorization', { projectId: values.projectId })) return '当前角色无权操作该项目的特殊授权';
  if (!projectPeople.some((relation) => relation.projectId === values.projectId && relation.personId === values.personId)) return '授权人员必须属于所选项目';
  return '';
}

export function getVisibleAuthorizations(user, authorizations = []) {
  return filterByDataScope(normalizeUser(user), authorizations);
}

export function revokeAuthorization(authorizations, authorizationId, reason, revokedAt = '2026-08-25 12:00') {
  return (authorizations || []).map((authorization) => authorization.id === authorizationId ? { ...authorization, status: 'revoked', revokeReason: reason, revokedAt } : { ...authorization });
}

export function buildAuthorizationAuditLog(authorization, operation, operatorId = 'account-admin') {
  return {
    projectId: authorization.projectId,
    operatorId,
    operation: { create: 'specialAuthorizationCreate', update: 'specialAuthorizationUpdate', revoke: 'specialAuthorizationRevoke' }[operation] || operation,
    module: 'health',
    targetId: authorization.id,
    occurredAt: '2026-08-25 12:00',
    reason: operation === 'revoke' ? authorization.revokeReason : `${operation === 'update' ? '修改' : '新增'}特殊授权`,
  };
}

export default function HealthAgePage({ role, lifecycleState, projectsRecords = mockData.projects, peopleRecords = mockData.people, projectPeople, registeredDevices = [], authorizations: controlledAuthorizations, onAuthorizationsChange, onOperationLog }) {
  const user = normalizeUser(role);
  const [localAuthorizations, setLocalAuthorizations] = useState(mockData.specialAuthorizations);
  const authorizations = controlledAuthorizations ?? localAuthorizations;
  const visibleAuthorizations = getVisibleAuthorizations(user, authorizations);
  const rows = makePersonRows(role, lifecycleState, authorizations, projectPeople, registeredDevices, peopleRecords, projectsRecords);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form] = Form.useForm();
  const [editingAuthorization, setEditingAuthorization] = useState(null);
  const availableProjects = scopedProjects(role, lifecycleState, projectsRecords);
  const authorizationProjectId = Form.useWatch('projectId', form);
  const canManageAuthorization = canOperate(user, 'specialAuthorization', { projectId: availableProjects[0]?.id });
  const authorizationPeople = rows.filter((person) => !authorizationProjectId || person.projectIds.includes(authorizationProjectId));

  const saveAuthorization = (values) => {
    if (editingAuthorization?.status === 'revoked') {
      message.error('已撤销授权不可编辑或重新激活');
      return;
    }
    const scopeError = validateAuthorizationScope(values, user, projectPeople);
    if (scopeError) {
      message.error(scopeError);
      return;
    }
    const authorization = buildAuthorizationRecord(values, editingAuthorization?.id || `authorization-local-${Date.now()}`, editingAuthorization);
    if (!authorization.effectiveAt || !authorization.expiresAt || Date.parse(authorization.effectiveAt) >= Date.parse(authorization.expiresAt)) {
      message.error('授权时间无效，请填写有效的开始和结束时间');
      return;
    }
    const isEditing = Boolean(editingAuthorization?.id);
    const next = isEditing ? authorizations.map((item) => item.id === authorization.id ? { ...item, ...authorization } : item) : [...authorizations, authorization];
    if (onAuthorizationsChange) onAuthorizationsChange(next);
    else setLocalAuthorizations(next);
    onOperationLog?.(buildAuthorizationAuditLog(authorization, isEditing ? 'update' : 'create', user.accountId || 'account-admin'));
    setDrawerOpen(false);
    setEditingAuthorization(null);
    form.resetFields();
    message.success(`特殊授权已保存（${AUTH_STATUS_META[getSpecialAuthorizationStatus(authorization, DEMO_AS_OF_DATE)].label}）`);
  };

  const openAuthorizationEditor = (authorization) => {
    if (!canManageAuthorization || authorization?.status === 'revoked') {
      message.error(authorization?.status === 'revoked' ? '已撤销授权不可编辑' : '当前角色无权操作特殊授权');
      return;
    }
    const isExisting = Boolean(authorization?.id);
    setEditingAuthorization(isExisting ? authorization : null);
    form.resetFields();
    if (authorization) form.setFieldsValue({ ...authorization, effectiveAt: toDatePickerValue(authorization.effectiveAt), expiresAt: toDatePickerValue(authorization.expiresAt) });
    setDrawerOpen(true);
  };

  const cancelAuthorization = (authorization) => {
    if (!canOperate(user, 'specialAuthorization', { projectId: authorization.projectId })) {
      message.error('当前角色无权撤销该项目特殊授权');
      return;
    }
    const next = revokeAuthorization(authorizations, authorization.id, '手工撤销');
    if (onAuthorizationsChange) onAuthorizationsChange(next);
    else setLocalAuthorizations(next);
    onOperationLog?.(buildAuthorizationAuditLog({ ...authorization, revokeReason: '手工撤销' }, 'revoke', user.accountId || 'account-admin'));
    message.success('特殊授权已撤销（本地演示）');
  };

  const projectName = (projectId) => projectsRecords.find((project) => project.id === projectId)?.name || projectId || '未指定项目';
  const personName = (personId) => peopleRecords.find((person) => person.id === personId)?.name || personId || '未指定人员';
  const getAccessLabel = (person) => person.ageAccessState === 'forbidden' ? '禁止' : person.ageAccessState === 'warning' ? '预警' : person.permission;
  const columns = [
    { title: '人员', dataIndex: 'name', key: 'name' },
    { title: '年龄', dataIndex: 'age', key: 'age', render: (age, person) => <span className={person.ageAccessState === 'forbidden' || person.ageAccessState === 'warning' ? 'age-warning' : ''}>{age} 岁</span> },
    { title: '健康报告', dataIndex: 'health', key: 'health', render: (value) => <StatusTag status={value === '有效' ? 'success' : value === '缺失' ? 'warning' : 'error'} label={value} /> },
    { title: '年龄规则', key: 'ageRule', render: (_, person) => person.ageAccessReason },
    { title: '权限状态', key: 'permission', render: (_, person) => <StatusTag status={person.ageAccessState === 'forbidden' ? 'error' : person.ageAccessState === 'warning' ? 'warning' : 'success'} label={getAccessLabel(person)} /> },
    { title: '操作', key: 'action', render: (_, person) => canManageAuthorization && <Button type="link" onClick={() => openAuthorizationEditor({ projectId: person.projectId, personId: person.id })}>特殊授权</Button> },
  ];
  const authorizationColumns = [
    { title: '授权类型', dataIndex: 'type', key: 'type' },
    { title: '项目', key: 'project', render: (_, record) => projectName(record.projectId) },
    { title: '人员', key: 'person', render: (_, record) => personName(record.personId) },
    { title: '状态', key: 'status', render: (_, record) => { const meta = AUTH_STATUS_META[getSpecialAuthorizationStatus(record, DEMO_AS_OF_DATE)]; return <StatusTag status={meta.status} label={meta.label} />; } },
    { title: '授权人', key: 'authorizer', render: (_, record) => record.authorizer || record.operatorId },
    { title: '依据', dataIndex: 'basis', key: 'basis' },
    { title: '有效期', key: 'period', render: (_, record) => `${record.effectiveAt || '-'} 至 ${record.expiresAt || '-'}` },
    { title: '操作', key: 'action', render: (_, record) => <div className="table-actions">{record.status !== 'revoked' && canManageAuthorization && <Button type="link" onClick={() => openAuthorizationEditor(record)}>修改</Button>}{record.status !== 'revoked' && canManageAuthorization && <Button type="link" danger onClick={() => cancelAuthorization(record)}>撤销</Button>}{record.status === 'revoked' && <span className="muted-text">已撤销（不可编辑）</span>}</div> },
  ];

  return <div className="business-page">
    <PageHeader title="健康报告与年龄限制" description="仅展示健康报告、年龄预警与特殊授权状态；健康报告不直接限制门禁。" breadcrumb={['首页', '健康报告与年龄限制']} extra={canManageAuthorization && <Button type="primary" onClick={() => openAuthorizationEditor(null)}>新增特殊授权</Button>} />
    <Alert type="info" showIcon message="规则说明" description="健康报告有效/过期/缺失只做展示，不限制门禁；年龄默认阈值 60 岁，提前 30 天生成站内预警，超龄次日禁止进入。" />
    <Card className="rule-card"><Descriptions column={{ xs: 1, sm: 3 }} bordered><Descriptions.Item label="演示日期">{DEMO_AS_OF_DATE}</Descriptions.Item><Descriptions.Item label="默认年龄阈值">60 岁</Descriptions.Item><Descriptions.Item label="提前预警">30 天</Descriptions.Item><Descriptions.Item label="门禁策略">生效前禁止 · 有效期内允许 · 到期后禁止</Descriptions.Item></Descriptions></Card>
    <Card className="table-card"><Table rowKey="id" columns={columns} dataSource={rows} pagination={false} /></Card>
    <Card title="特殊授权记录" className="table-card"><Table rowKey="id" dataSource={visibleAuthorizations} pagination={false} columns={authorizationColumns} /></Card>
    <Drawer title={editingAuthorization ? '修改特殊授权' : '新增特殊授权'} open={drawerOpen} onClose={() => { setDrawerOpen(false); setEditingAuthorization(null); form.resetFields(); }} width={480}>
      <Form form={form} layout="vertical" onFinish={saveAuthorization}>
        <Form.Item label="授权人" name="authorizer" rules={[{ required: true, message: '请输入授权人' }]}><Input /></Form.Item>
        <Form.Item label="授权依据" name="basis" rules={[{ required: true, message: '请输入授权依据' }]}><Input.TextArea /></Form.Item>
        <Form.Item label="项目" name="projectId" rules={[{ required: true, message: '请选择项目' }]}><Select onChange={() => form.setFieldValue('personId', undefined)} options={availableProjects.map((project) => ({ value: project.id, label: project.name }))} /></Form.Item>
        <Form.Item label="人员" name="personId" rules={[{ required: true, message: '请选择人员' }]}><Select options={authorizationPeople.map((person) => ({ value: person.id, label: person.name }))} /></Form.Item>
        <Form.Item label="授权类型" name="type" rules={[{ required: true, message: '请输入授权类型' }]}><Input /></Form.Item>
        <Form.Item label="生效时间" name="effectiveAt" rules={[{ required: true, message: '请选择生效时间' }]}><DatePicker showTime style={{ width: '100%' }} /></Form.Item>
        <Form.Item label="失效时间" name="expiresAt" rules={[{ required: true, message: '请选择失效时间' }]}><DatePicker showTime style={{ width: '100%' }} /></Form.Item>
        <Button type="primary" htmlType="submit">保存授权</Button>
      </Form>
    </Drawer>
  </div>;
}
