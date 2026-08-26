import React, { useMemo, useState } from 'react';
import { ArrowLeftOutlined, LinkOutlined } from '@ant-design/icons';
import { Button, Card, DatePicker, Descriptions, Drawer, Form, Input, Select, Space, Table, Tabs, Tag, message } from 'antd';
import DeviceBindingDrawer from '../components/DeviceBindingDrawer';
import PageHeader from '../components/PageHeader';
import StatusTag from '../components/StatusTag';
import ToolsPage from './ToolsPage';
import AttendancePage from './AttendancePage';
import { AUTH_STATUS_META, buildAuthorizationAuditLog, buildAuthorizationRecord, revokeAuthorization, validateAuthorizationScope } from './HealthAgePage';
import mockData from '../data/mockData';
import { canOperate } from '../domain/permissions';
import { getVisibleAlerts } from './AlertsPage';
import { DEMO_AS_OF_DATE, beginDeviceBindingSync, getProjectAttendanceRows, getSpecialAuthorizationStatus, makeDeviceRows, makePersonRows, normalizeUser, scopedProjects, statusLabel, toDatePickerValue, unbindDevice } from './pageUtils';

export default function ProjectDetailPage({ role, lifecycleState, projectsRecords = mockData.projects, peopleRecords = mockData.people, projectPeople = mockData.projectPeople, registeredDevices = [], selectedProjectId, authorizations, leaveRecords, supplements, rawEvents = mockData.rawEvents, alerts = mockData.alerts, toolsRecords = mockData.tools, inspectionsRecords = mockData.toolInspections, toolInspectionPolicy = mockData.toolInspectionPolicy, onToolsChange, onInspectionsChange, onPolicyChange, onAuthorizationsChange, onSupplementsChange, onLeaveRecordsChange, onOperationLog, onOpenMobileTool, onDeviceChange, onOpenAccessRecords, onBack, defaultTab = 'overview' }) {
  const user = normalizeUser(role);
  const projects = scopedProjects(role, lifecycleState, projectsRecords);
  const project = projects.find((item) => item.id === selectedProjectId) || projects[0] || projectsRecords[0];
  const visibleAlerts = getVisibleAlerts(role, alerts).filter((alert) => alert.projectId === project.id);
  const [bindingDevice, setBindingDevice] = useState(null);
  const [localAuthorizations, setLocalAuthorizations] = useState(() => authorizations ?? mockData.specialAuthorizations);
  const currentAuthorizations = authorizations ?? localAuthorizations;
  const [authorizationDrawerOpen, setAuthorizationDrawerOpen] = useState(false);
  const [authorizationForm] = Form.useForm();
  const [editingAuthorization, setEditingAuthorization] = useState(null);
  const devices = useMemo(() => makeDeviceRows(role, lifecycleState, currentAuthorizations, registeredDevices, projectPeople, peopleRecords, projectsRecords).filter((device) => device.projectId === project.id), [currentAuthorizations, lifecycleState, peopleRecords, project.id, projectPeople, projectsRecords, registeredDevices, role]);
  const allDeviceRows = useMemo(() => makeDeviceRows({ role: 'systemAdmin' }, lifecycleState, currentAuthorizations, registeredDevices, projectPeople, peopleRecords, projectsRecords), [currentAuthorizations, lifecycleState, peopleRecords, projectPeople, projectsRecords, registeredDevices]);
  const availableDevices = useMemo(() => allDeviceRows.filter((device) => device.registered && !device.projectId && !device.disabled && !device.archived), [allDeviceRows]);
  const attendanceRecords = useMemo(() => getProjectAttendanceRows({ role, lifecycleState, projectId: project.id, projectsRecords, projectPeople, leaveRecords, supplements, rawEvents }), [leaveRecords, lifecycleState, project.id, projectPeople, projectsRecords, rawEvents, role, supplements]);
  const personRows = makePersonRows(role, lifecycleState, currentAuthorizations, projectPeople, registeredDevices, peopleRecords, projectsRecords);
  const people = projectPeople.filter((relation) => relation.projectId === project.id).map((relation) => {
    const profile = personRows.find((person) => person.id === relation.personId) || {};
    const attendance = attendanceRecords.find((item) => item.personId === relation.personId);
    return { ...relation, ...profile, attendanceStatus: attendance?.status || '—' };
  });
  const projectAuthorizations = currentAuthorizations.filter((authorization) => authorization.projectId === project.id);
  const canManageAuthorization = canOperate(user, 'specialAuthorization', { projectId: project.id });
  const canBind = project.status === 'active' && canOperate(role, 'bindDevice', { projectId: project.id, deviceRegistered: true });
  const openBinding = () => setBindingDevice({ projectId: project.id, registered: false, bindingMode: 'create' });
  const updateBinding = (values) => {
    if (!bindingDevice) return;
    if (typeof onDeviceChange !== 'function') {
      message.error('设备状态未接入，绑定未更新');
      return;
    }
    const selectedDevice = bindingDevice.id ? bindingDevice : availableDevices.find((device) => device.id === values.deviceId);
    if (!selectedDevice) {
      message.error('请选择已登记且未绑定的设备');
      return;
    }
    const entrance = mockData.entrances.find((item) => item.id === values.entranceId);
    const next = beginDeviceBindingSync(selectedDevice, { ...values, projectId: project.id, entranceName: entrance?.name });
    onDeviceChange(selectedDevice.id, next);
    setBindingDevice(null);
    message.success('设备已绑定，项目人员开始同步（本地演示）');
  };
  const removeBinding = () => {
    if (!bindingDevice) return;
    if (typeof onDeviceChange !== 'function') {
      message.error('设备状态未接入，解绑未更新');
      return;
    }
    onDeviceChange(bindingDevice.id, unbindDevice(bindingDevice));
    setBindingDevice(null);
    message.success('设备已解除绑定，人员权限已撤销（本地演示）');
  };
  const closeAuthorizationEditor = () => {
    setAuthorizationDrawerOpen(false);
    setEditingAuthorization(null);
    authorizationForm.resetFields();
  };
  const openAuthorizationEditor = (authorization, personId) => {
    if (!canManageAuthorization || authorization?.status === 'revoked') {
      message.error(authorization?.status === 'revoked' ? '已撤销授权不可编辑' : '当前角色无权操作特殊授权');
      return;
    }
    setEditingAuthorization(authorization?.id ? authorization : null);
    authorizationForm.resetFields();
    if (authorization?.id) {
      authorizationForm.setFieldsValue({ ...authorization, effectiveAt: toDatePickerValue(authorization.effectiveAt), expiresAt: toDatePickerValue(authorization.expiresAt) });
    } else {
      authorizationForm.setFieldsValue({ personId });
    }
    setAuthorizationDrawerOpen(true);
  };
  const saveAuthorization = (values) => {
    if (editingAuthorization?.status === 'revoked') {
      message.error('已撤销授权不可编辑或重新激活');
      return;
    }
    const valuesWithProject = { ...values, projectId: project.id };
    const scopeError = validateAuthorizationScope(valuesWithProject, user, projectPeople);
    if (scopeError) {
      message.error(scopeError);
      return;
    }
    const authorization = buildAuthorizationRecord(valuesWithProject, editingAuthorization?.id || `authorization-local-${Date.now()}`, editingAuthorization);
    if (!authorization.effectiveAt || !authorization.expiresAt || Date.parse(authorization.effectiveAt) >= Date.parse(authorization.expiresAt)) {
      message.error('授权时间无效，请填写有效的开始和结束时间');
      return;
    }
    const isEditing = Boolean(editingAuthorization?.id);
    const next = isEditing ? currentAuthorizations.map((item) => item.id === authorization.id ? { ...item, ...authorization } : item) : [...currentAuthorizations, authorization];
    if (onAuthorizationsChange) onAuthorizationsChange(next);
    else setLocalAuthorizations(next);
    onOperationLog?.(buildAuthorizationAuditLog(authorization, isEditing ? 'update' : 'create', user.accountId || 'account-admin'));
    closeAuthorizationEditor();
    message.success(`特殊授权已保存（${AUTH_STATUS_META[getSpecialAuthorizationStatus(authorization, DEMO_AS_OF_DATE)].label}）`);
  };
  const cancelAuthorization = (authorization) => {
    if (!canOperate(user, 'specialAuthorization', { projectId: authorization.projectId })) {
      message.error('当前角色无权撤销该项目特殊授权');
      return;
    }
    const next = revokeAuthorization(currentAuthorizations, authorization.id, '手工撤销');
    if (onAuthorizationsChange) onAuthorizationsChange(next);
    else setLocalAuthorizations(next);
    onOperationLog?.(buildAuthorizationAuditLog({ ...authorization, revokeReason: '手工撤销' }, 'revoke', user.accountId || 'account-admin'));
    message.success('特殊授权已撤销（本地演示）');
  };
  const personColumns = [
    { title: '姓名', dataIndex: 'name', key: 'name' },
    { title: '人员状态', dataIndex: 'status', key: 'status', render: (value) => <StatusTag status={value === 'active' ? 'success' : 'warning'} label={statusLabel(value)} /> },
    { title: '项目关系', dataIndex: 'status', key: 'relation', render: (value) => value === 'temporary' ? '临时项目' : '主项目' },
    { title: '健康报告', dataIndex: 'health', key: 'health', render: (value) => <StatusTag status={value === '有效' ? 'success' : value === '缺失' ? 'warning' : 'error'} label={value} /> },
    { title: '年龄 / 权限', key: 'age', render: (_, person) => <div><div>{person.age} 岁</div><StatusTag status={person.ageAccessState === 'forbidden' ? 'error' : person.ageAccessState === 'warning' ? 'warning' : 'success'} label={person.ageAccessState === 'forbidden' ? '禁止' : person.ageAccessState === 'warning' ? '预警' : person.permission} /><div className="muted-text">{person.ageAccessReason}</div></div> },
    { title: '今日考勤', dataIndex: 'attendanceStatus', key: 'attendanceStatus' },
    { title: '门禁权限', key: 'access', render: (_, person) => { const relation = person.projectRelationships?.find((item) => item.projectId === project.id); return <div><StatusTag status={relation?.accessStatus === 'revoked' ? 'forbidden' : 'success'} label={relation?.permission || '允许'} />{relation?.effectivePermission === false && <div className="muted-text">平台未生效；设备侧{relation.deviceSideAccess ? '当前可放行' : '禁止放行'}</div>}</div>; } },
    { title: '操作', key: 'action', render: (_, person) => canManageAuthorization && <Button type="link" onClick={() => openAuthorizationEditor(null, person.personId)}>特殊授权</Button> },
  ];
  const authorizationColumns = [
    { title: '授权类型', dataIndex: 'type', key: 'type' },
    { title: '人员', key: 'person', render: (_, record) => peopleRecords.find((person) => person.id === record.personId)?.name || record.personId || '未指定人员' },
    { title: '状态', key: 'status', render: (_, record) => { const meta = AUTH_STATUS_META[getSpecialAuthorizationStatus(record, DEMO_AS_OF_DATE)]; return <StatusTag status={meta.status} label={meta.label} />; } },
    { title: '授权人', key: 'authorizer', render: (_, record) => record.authorizer || record.operatorId },
    { title: '依据', dataIndex: 'basis', key: 'basis' },
    { title: '有效期', key: 'period', render: (_, record) => `${record.effectiveAt || '-'} 至 ${record.expiresAt || '-'}` },
    { title: '操作', key: 'action', render: (_, record) => <div className="table-actions">{record.status !== 'revoked' && canManageAuthorization && <Button type="link" onClick={() => openAuthorizationEditor(record)}>修改</Button>}{record.status !== 'revoked' && canManageAuthorization && <Button type="link" danger onClick={() => cancelAuthorization(record)}>撤销</Button>}{record.status === 'revoked' && <span className="muted-text">已撤销（不可编辑）</span>}</div> },
  ];
  const deviceColumns = [
    { title: '设备', dataIndex: 'platformId', key: 'platformId' },
    { title: '出入口', dataIndex: 'entranceName', key: 'entranceName' },
    { title: '方向', dataIndex: 'direction', key: 'direction', render: (value) => directionLabel(value) },
    { title: '在线状态', dataIndex: 'online', key: 'online', render: (online, device) => <StatusTag status={device.disabled ? 'forbidden' : online ? 'success' : 'offline'} label={device.disabled ? '已停用' : online ? '在线' : '离线'} /> },
    { title: '权限同步', dataIndex: 'syncStatus', key: 'syncStatus', render: (value) => <StatusTag status={value === 'failed' ? 'error' : value === 'syncing' ? 'syncing' : 'success'} label={value === 'failed' ? '失败' : value === 'syncing' ? '同步中' : '成功'} /> },
    { title: '平台有效权限', key: 'platformPermission', render: (_, device) => <StatusTag status={device.accessStatus === 'revoked' ? 'forbidden' : 'success'} label={device.accessStatus === 'revoked' ? '已撤销/未生效' : '已生效'} /> },
    { title: '设备侧权限', dataIndex: 'devicePermission', key: 'devicePermission', render: (value) => value === 'allow' ? '当前可放行' : '禁止放行' },
    { title: '操作', key: 'action', render: (_, device) => canBind && <Button type="link" onClick={() => setBindingDevice(device)}>配置绑定</Button> },
  ];
  const deviceTab = <Card title="绑定设备" extra={canBind && <Button type="primary" icon={<LinkOutlined />} onClick={openBinding}>绑定已登记设备</Button>}>
      <p className="muted-text">设备必须先在“设备登记”中登记；绑定后平台将自动同步当前项目人员、人脸和门禁权限。项目下多个出入口的有效记录统一参与考勤统计。</p>
      <Table rowKey="id" columns={deviceColumns} dataSource={devices} pagination={false} locale={{ emptyText: '暂无已绑定设备' }} />
    </Card>;
  const items = [
    { key: 'overview', label: '项目概况', children: <Space direction="vertical" size="large" className="full-width"><Card><Descriptions column={{ xs: 1, sm: 2 }} bordered><Descriptions.Item label="项目名称">{project.name}</Descriptions.Item><Descriptions.Item label="项目地址">{project.address || '滨江区江南大道 88 号'}</Descriptions.Item><Descriptions.Item label="负责人">{project.owner || '项目负责人甲'}</Descriptions.Item><Descriptions.Item label="项目状态"><StatusTag status={project.status} label={statusLabel(project.status)} /></Descriptions.Item><Descriptions.Item label="考勤规则">{project.workStart} - {project.workEnd}，宽限 {project.graceMinutes} 分钟</Descriptions.Item><Descriptions.Item label="门禁配置">绑定设备时选择出入口</Descriptions.Item><Descriptions.Item label="历史数据" span={2}>保留原始事件与考勤结果，只读查看</Descriptions.Item></Descriptions></Card><Card title="设备同步摘要"><div className="summary-strip"><StatisticItem label="项目设备" value={devices.length} /><StatisticItem label="在线" value={devices.filter((device) => device.online).length} /><StatisticItem label="同步失败" value={devices.filter((device) => device.syncStatus === 'failed').length} /><StatisticItem label="告警" value={visibleAlerts.length} /></div></Card><Card title="考勤统计"><div className="summary-strip"><StatisticItem label="今日正常" value={attendanceRecords.filter((item) => item.status === '正常').length} /><StatisticItem label="迟到" value={attendanceRecords.filter((item) => item.isLate).length} /><StatisticItem label="早退" value={attendanceRecords.filter((item) => item.isEarlyLeave).length} /><StatisticItem label="缺勤" value={attendanceRecords.filter((item) => item.status === '缺勤').length} /><StatisticItem label="请假" value={attendanceRecords.filter((item) => item.status === '请假').length} /><StatisticItem label="无需考勤" value={attendanceRecords.filter((item) => item.status === '无需考勤').length} /></div><p className="muted-text">统计当前项目演示日期的考勤结果，明细请进入“考勤记录”。</p></Card></Space> },
    { key: 'people', label: '项目人员', children: <Space direction="vertical" size="middle" className="full-width"><Card className="table-card"><Table rowKey="personId" columns={personColumns} dataSource={people} pagination={false} /></Card><Card title="特殊授权记录" className="table-card"><Table rowKey="id" dataSource={projectAuthorizations} pagination={false} columns={authorizationColumns} /></Card></Space> },
    { key: 'devices', label: '出入口与设备', children: deviceTab },
    { key: 'attendance', label: '考勤记录', forceRender: true, children: <AttendancePage role={role} lifecycleState={lifecycleState} projectsRecords={projectsRecords} peopleRecords={peopleRecords} projectPeople={projectPeople} rawEvents={rawEvents} fixedProjectId={project.id} embedded supplements={supplements} onSupplementsChange={onSupplementsChange} leaveRecords={leaveRecords} onLeaveRecordsChange={onLeaveRecordsChange} onOperationLog={onOperationLog} onOpenAccessRecords={onOpenAccessRecords} /> },
    { key: 'alerts', label: '项目告警', children: <Card><Table rowKey="id" columns={[{ title: '告警类型', dataIndex: 'type', key: 'type' }, { title: '状态', key: 'status', render: (_, alert) => <Tag>{alert.status === 'closed' ? '已自动关闭' : '当前告警'}</Tag> }]} dataSource={visibleAlerts} pagination={false} /></Card> },
    { key: 'tools', label: '工具管理', children: <ToolsPage role={role} lifecycleState={lifecycleState} projectsRecords={projectsRecords} toolsRecords={toolsRecords} inspectionsRecords={inspectionsRecords} policy={toolInspectionPolicy} fixedProjectId={project.id} embedded onToolsChange={onToolsChange} onInspectionsChange={onInspectionsChange} onPolicyChange={onPolicyChange} onOperationLog={onOperationLog} onOpenMobileTool={onOpenMobileTool} /> },
  ];

  return <div className="business-page"><PageHeader title={project.name} description="查看项目范围、人员、设备与现场业务状态。" breadcrumb={['首页', '项目管理', project.name]} extra={<Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回项目列表</Button>} /><Tabs defaultActiveKey={defaultTab} items={items} /><DeviceBindingDrawer open={Boolean(bindingDevice)} onClose={() => setBindingDevice(null)} role={role} projectId={project.id} device={bindingDevice || { projectId: project.id, registered: false }} projects={projects} entrances={mockData.entrances} availableDevices={availableDevices} fixedProject onSubmit={updateBinding} onUnbind={removeBinding} /><Drawer title={editingAuthorization ? '修改特殊授权' : '新增特殊授权'} open={authorizationDrawerOpen} onClose={closeAuthorizationEditor} width={480}><Form form={authorizationForm} layout="vertical" onFinish={saveAuthorization}><Form.Item label="授权人" name="authorizer" rules={[{ required: true, message: '请输入授权人' }]}><Input /></Form.Item><Form.Item label="授权依据" name="basis" rules={[{ required: true, message: '请输入授权依据' }]}><Input.TextArea /></Form.Item><Form.Item label="人员" name="personId" rules={[{ required: true, message: '请选择人员' }]}><Select options={people.map((person) => ({ value: person.personId, label: person.name }))} /></Form.Item><Form.Item label="授权类型" name="type" rules={[{ required: true, message: '请输入授权类型' }]}><Input /></Form.Item><Form.Item label="生效时间" name="effectiveAt" rules={[{ required: true, message: '请选择生效时间' }]}><DatePicker showTime style={{ width: '100%' }} /></Form.Item><Form.Item label="失效时间" name="expiresAt" rules={[{ required: true, message: '请选择失效时间' }]}><DatePicker showTime style={{ width: '100%' }} /></Form.Item><Button type="primary" htmlType="submit">保存授权</Button></Form></Drawer></div>;
}

function StatisticItem({ label, value }) {
  return <div className="summary-stat"><span>{label}</span><strong>{value}</strong></div>;
}

function directionLabel(value) {
  return { in: '进门', out: '出门', both: '进出' }[value] || '未配置';
}
