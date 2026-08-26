import React, { useMemo, useState } from 'react';
import { ArrowLeftOutlined, LinkOutlined } from '@ant-design/icons';
import { Button, Card, Descriptions, Space, Table, Tabs, Tag, message } from 'antd';
import DeviceBindingDrawer from '../components/DeviceBindingDrawer';
import PageHeader from '../components/PageHeader';
import StatusTag from '../components/StatusTag';
import mockData from '../data/mockData';
import { canOperate } from '../domain/permissions';
import { getVisibleAlerts } from './AlertsPage';
import { bindDeviceToProject, getProjectAttendanceRows, makeDeviceRows, makePersonRows, normalizeUser, scopedProjects, statusLabel, unbindDevice } from './pageUtils';

export default function ProjectDetailPage({ role, lifecycleState, projectsRecords = mockData.projects, peopleRecords = mockData.people, projectPeople = mockData.projectPeople, registeredDevices = [], selectedProjectId, authorizations, leaveRecords, supplements, alerts = mockData.alerts, onDeviceChange, onBack }) {
  const user = normalizeUser(role);
  const projects = scopedProjects(role, lifecycleState, projectsRecords);
  const project = projects.find((item) => item.id === selectedProjectId) || projects[0] || projectsRecords[0];
  const visibleAlerts = getVisibleAlerts(role, alerts).filter((alert) => alert.projectId === project.id);
  const [bindingDevice, setBindingDevice] = useState(null);
  const devices = useMemo(() => makeDeviceRows(role, lifecycleState, authorizations, registeredDevices, projectPeople, peopleRecords, projectsRecords).filter((device) => device.projectId === project.id), [authorizations, lifecycleState, peopleRecords, project.id, projectPeople, projectsRecords, registeredDevices, role]);
  const attendanceRecords = useMemo(() => getProjectAttendanceRows({ role, lifecycleState, projectId: project.id, projectsRecords, projectPeople, leaveRecords, supplements }), [leaveRecords, lifecycleState, project.id, projectPeople, projectsRecords, role, supplements]);
  const personRows = makePersonRows(role, lifecycleState, authorizations, projectPeople, registeredDevices, peopleRecords, projectsRecords);
  const people = projectPeople.filter((relation) => relation.projectId === project.id).map((relation) => {
    const profile = personRows.find((person) => person.id === relation.personId) || {};
    const attendance = attendanceRecords.find((item) => item.personId === relation.personId);
    return { ...relation, ...profile, attendanceStatus: attendance?.status || '—' };
  });
  const canBind = project.status === 'active' && canOperate(role, 'bindDevice', { projectId: project.id, deviceRegistered: true });
  const updateBinding = (values) => {
    if (!bindingDevice) return;
    if (typeof onDeviceChange !== 'function') {
      message.error('设备状态未接入，绑定未更新');
      return;
    }
    const next = bindDeviceToProject(bindingDevice, values);
    onDeviceChange(bindingDevice.id, next);
    setBindingDevice(null);
    message.success('设备绑定关系已更新（本地演示）');
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
  const personColumns = [
    { title: '姓名', dataIndex: 'name', key: 'name' },
    { title: '人员状态', dataIndex: 'status', key: 'status', render: (value) => <StatusTag status={value === 'active' ? 'success' : 'warning'} label={statusLabel(value)} /> },
    { title: '项目关系', dataIndex: 'status', key: 'relation', render: (value) => value === 'temporary' ? '临时项目' : '主项目' },
    { title: '今日考勤', dataIndex: 'attendanceStatus', key: 'attendanceStatus' },
    { title: '门禁权限', key: 'access', render: (_, person) => { const relation = person.projectRelationships?.find((item) => item.projectId === project.id); return <div><StatusTag status={relation?.accessStatus === 'revoked' ? 'forbidden' : 'success'} label={relation?.permission || '允许'} />{relation?.effectivePermission === false && <div className="muted-text">平台未生效；设备侧{relation.deviceSideAccess ? '当前可放行' : '禁止放行'}</div>}</div>; } },
  ];
  const deviceColumns = [
    { title: '设备', dataIndex: 'platformId', key: 'platformId' },
    { title: '出入口', dataIndex: 'entranceName', key: 'entranceName' },
    { title: '在线状态', dataIndex: 'online', key: 'online', render: (online, device) => <StatusTag status={device.disabled ? 'forbidden' : online ? 'success' : 'offline'} label={device.disabled ? '已停用' : online ? '在线' : '离线'} /> },
    { title: '权限同步', dataIndex: 'syncStatus', key: 'syncStatus', render: (value) => <StatusTag status={value === 'failed' ? 'error' : value === 'syncing' ? 'syncing' : 'success'} label={value === 'failed' ? '失败' : value === 'syncing' ? '同步中' : '成功'} /> },
    { title: '平台有效权限', key: 'platformPermission', render: (_, device) => <StatusTag status={device.accessStatus === 'revoked' ? 'forbidden' : 'success'} label={device.accessStatus === 'revoked' ? '已撤销/未生效' : '已生效'} /> },
    { title: '设备侧权限', dataIndex: 'devicePermission', key: 'devicePermission', render: (value) => value === 'allow' ? '当前可放行' : '禁止放行' },
  ];
  const items = [
    { key: 'overview', label: '项目概况', children: <Space direction="vertical" size="large" className="full-width"><Card><Descriptions column={{ xs: 1, sm: 2 }} bordered><Descriptions.Item label="项目名称">{project.name}</Descriptions.Item><Descriptions.Item label="项目地址">{project.address || '滨江区江南大道 88 号'}</Descriptions.Item><Descriptions.Item label="负责人">{project.owner || '项目负责人甲'}</Descriptions.Item><Descriptions.Item label="项目状态"><StatusTag status={project.status} label={statusLabel(project.status)} /></Descriptions.Item><Descriptions.Item label="考勤规则">{project.workStart} - {project.workEnd}，宽限 {project.graceMinutes} 分钟</Descriptions.Item><Descriptions.Item label="历史数据">保留原始事件与考勤结果，只读查看</Descriptions.Item></Descriptions></Card><Card title="设备同步摘要"><div className="summary-strip"><StatisticItem label="项目设备" value={devices.length} /><StatisticItem label="在线" value={devices.filter((device) => device.online).length} /><StatisticItem label="同步失败" value={devices.filter((device) => device.syncStatus === 'failed').length} /><StatisticItem label="告警" value={visibleAlerts.length} /></div></Card></Space> },
    { key: 'people', label: '项目人员', children: <Card className="table-card"><Table rowKey="personId" columns={personColumns} dataSource={people} pagination={false} /></Card> },
    { key: 'devices', label: '出入口与设备', children: <Card className="table-card" extra={canBind && <Button type="primary" icon={<LinkOutlined />} onClick={() => setBindingDevice(makeDeviceRows(role, lifecycleState, authorizations, registeredDevices, projectPeople, peopleRecords, projectsRecords).find((device) => device.projectId === project.id && device.registered))}>绑定已登记设备</Button>}><Table rowKey="id" columns={deviceColumns} dataSource={devices} pagination={false} /></Card> },
    { key: 'attendance', label: '项目考勤', children: <Card><div className="summary-strip"><StatisticItem label="今日正常" value={attendanceRecords.filter((item) => item.status === '正常').length} /><StatisticItem label="迟到" value={attendanceRecords.filter((item) => item.isLate).length} /><StatisticItem label="早退" value={attendanceRecords.filter((item) => item.isEarlyLeave).length} /><StatisticItem label="缺勤" value={attendanceRecords.filter((item) => item.status === '缺勤').length} /><StatisticItem label="请假" value={attendanceRecords.filter((item) => item.status === '请假').length} /><StatisticItem label="无需考勤" value={attendanceRecords.filter((item) => item.status === '无需考勤').length} /></div><p className="muted-text">平台考勤结果按项目、人员、日期汇总有效进出；任一有效进出即可正常，原始事件只读。</p></Card> },
    { key: 'alerts', label: '项目告警', children: <Card><Table rowKey="id" columns={[{ title: '告警类型', dataIndex: 'type', key: 'type' }, { title: '状态', key: 'status', render: (_, alert) => <Tag>{alert.status === 'closed' ? '已自动关闭' : '当前告警'}</Tag> }]} dataSource={visibleAlerts} pagination={false} /></Card> },
    { key: 'tools', label: '工器具', children: <Card><p>项目工器具档案共 3 项，检查周期为每三个月；借还流程暂未实现。</p></Card> },
  ];

  return <div className="business-page"><PageHeader title={project.name} description="查看项目范围、人员、设备与现场业务状态。" breadcrumb={['首页', '项目管理', project.name]} extra={<Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回项目列表</Button>} /><Tabs items={items} /><DeviceBindingDrawer open={Boolean(bindingDevice)} onClose={() => setBindingDevice(null)} role={role} projectId={project.id} device={bindingDevice || { registered: true }} projects={projects} entrances={mockData.entrances} onSubmit={updateBinding} onUnbind={removeBinding} /></div>;
}

function StatisticItem({ label, value }) {
  return <div className="summary-stat"><span>{label}</span><strong>{value}</strong></div>;
}
