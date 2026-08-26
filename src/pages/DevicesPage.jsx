import React, { useMemo, useState } from 'react';
import { Button, Card, Form, Input, Modal, Select, Table, Tag, message } from 'antd';
import { LinkOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import DeviceBindingDrawer from '../components/DeviceBindingDrawer';
import DetailDrawer from '../components/DetailDrawer';
import FilterBar from '../components/FilterBar';
import PageHeader from '../components/PageHeader';
import StatusTag from '../components/StatusTag';
import { canOperate } from '../domain/permissions';
import mockData from '../data/mockData';
import { bindDeviceToProject, buildDeviceOperationLog, buildDeviceRegistrationLog, canRestoreDevice, makeDeviceRows, moveDeviceBinding, normalizeUser, projectName, scopedProjects, unbindDevice, updateDeviceAfterSync } from './pageUtils';

export function hasDeviceChangeHandler(onDeviceChange) {
  return typeof onDeviceChange === 'function';
}

export function closeRegistrationModal(form) {
  form?.resetFields();
}

export default function DevicesPage({ role, lifecycleState, projectsRecords = mockData.projects, projectPeople = mockData.projectPeople, peopleRecords = mockData.people, registeredDevices: sharedRegisteredDevices, onRegisteredDevicesChange, authorizations, onDeviceChange, onOperationLog, registrationMode = false }) {
  const user = normalizeUser(role);
  const projects = scopedProjects(role, lifecycleState, projectsRecords);
  const [localRegisteredDevices, setLocalRegisteredDevices] = useState([]);
  const registeredDevices = sharedRegisteredDevices ?? localRegisteredDevices;
  const [filters, setFilters] = useState({ projectId: 'all', online: 'all' });
  const [bindingDevice, setBindingDevice] = useState(null);
  const [detail, setDetail] = useState(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerForm] = Form.useForm();
  const devices = useMemo(() => makeDeviceRows(role, lifecycleState, authorizations, registeredDevices, projectPeople, peopleRecords, projectsRecords), [authorizations, lifecycleState, peopleRecords, projectPeople, projectsRecords, registeredDevices, role]);
  const filtered = useMemo(() => devices.filter((device) => (filters.projectId === 'all' || device.projectId === filters.projectId) && (filters.online === 'all' || String(device.online) === filters.online)), [devices, filters]);
  const canRegister = user.role === 'systemAdmin';
  const updateRegisteredDevices = (updater) => {
    const next = typeof updater === 'function' ? updater(registeredDevices) : updater;
    if (onRegisteredDevicesChange) onRegisteredDevicesChange(next);
    else setLocalRegisteredDevices(next);
  };
  const updateDevice = (id, values) => {
    if (registeredDevices.some((device) => device.id === id)) {
      updateRegisteredDevices((items) => items.map((item) => item.id === id ? { ...item, ...values } : item));
      onOperationLog?.(buildDeviceOperationLog(id, values, user.accountId || 'account-admin'));
      return true;
    }
    if (!hasDeviceChangeHandler(onDeviceChange)) {
      message.error('设备状态未接入，操作未更新');
      return false;
    }
    onDeviceChange(id, values);
    return true;
  };
  const retrySync = (device) => { if (updateDevice(device.id, updateDeviceAfterSync(device))) message.success(`${device.platformId} 已重试全量同步（本地演示）`); };
  const toggleLifecycle = (device) => {
    if (device.archived || device.disabled) {
      if (!canRestoreDevice(device, projects)) {
        message.warning(`${device.platformId} 所属项目未恢复，不能恢复设备在线状态`);
        return;
      }
      if (updateDevice(device.id, { archived: false, disabled: false, online: true, lifecycleStatus: 'active', syncStatus: 'syncing', accessStatus: 'revoked', personnelPermission: 'revoked', facePermission: 'revoked' })) message.info(`${device.platformId} 已恢复，需全量同步（本地演示）`);
    } else {
      if (updateDevice(device.id, { archived: true, disabled: true, online: false, lifecycleStatus: 'archived', syncStatus: 'stopped' })) message.info(`${device.platformId} 已归档并停用（本地演示）`);
    }
  };
  const stopDevice = (device) => { if (updateDevice(device.id, { disabled: true, online: false, lifecycleStatus: 'stopped', syncStatus: 'stopped' })) message.info(`${device.platformId} 已停用（本地演示）`); };
  const recoverDevice = (device) => { if (updateDevice(device.id, { online: true, disabled: false, lifecycleStatus: 'active', syncStatus: 'syncing', accessStatus: 'revoked', personnelPermission: 'revoked', facePermission: 'revoked' })) message.info(`${device.platformId} 已恢复在线，离线告警将自动结束（本地演示）`); };
  const saveRegistration = (values) => {
    const next = { ...values, id: `device-local-${Date.now()}`, registered: true, projectId: undefined, online: true, permissionSync: 'success', syncStatus: 'success', personnelSync: 'success', faceSync: 'success', attendanceEnabled: false, entranceName: '未绑定', direction: 'both', platformPermission: 'allow', devicePermission: 'allow', difference: false, bindingStatus: '未绑定', lifecycleStatus: 'active', disabled: false, archived: false };
    updateRegisteredDevices((items) => [...items, next]);
    onOperationLog?.(buildDeviceRegistrationLog(next.id, user.accountId || 'account-admin'));
    setRegisterOpen(false);
    registerForm.resetFields();
    message.success('设备登记成功（本地演示）');
  };
  const handleRegisterClose = () => {
    setRegisterOpen(false);
    closeRegistrationModal(registerForm);
  };
  const handleBinding = (values) => {
    if (!bindingDevice) return;
    const next = values.projectId && values.projectId !== bindingDevice.projectId
      ? moveDeviceBinding(bindingDevice, values)
      : bindDeviceToProject(bindingDevice, values);
    const entrance = mockData.entrances.find((item) => item.id === values.entranceId);
    if (!updateDevice(bindingDevice.id, { ...next, entranceName: entrance?.name || next.entranceName })) return;
    setBindingDevice(null);
    message.success(values.projectId !== bindingDevice.projectId ? '设备已结束旧绑定并建立新绑定（本地演示）' : '设备绑定关系已更新（本地演示）');
  };
  const handleUnbind = () => { if (!bindingDevice) return; if (!updateDevice(bindingDevice.id, unbindDevice(bindingDevice))) return; setBindingDevice(null); message.success('设备已解除绑定，人员权限已撤销（本地演示）'); };
  const columns = [
    { title: '平台 ID', dataIndex: 'platformId', key: 'platformId' },
    { title: '海康序列号', dataIndex: 'hikvisionSerial', key: 'hikvisionSerial' },
    { title: '型号', dataIndex: 'model', key: 'model' },
    { title: '项目', dataIndex: 'projectId', key: 'projectId', render: (value) => projectName(value, projects) },
    { title: '出入口 / 方向', key: 'entrance', render: (_, device) => `${device.entranceName} / ${device.direction === 'in' ? '进' : device.direction === 'out' ? '出' : '进出'}` },
    { title: '在线状态', dataIndex: 'online', key: 'online', render: (value, device) => <StatusTag status={device.disabled ? 'forbidden' : value ? 'success' : 'offline'} label={device.disabled ? '已停用' : value ? '在线' : '离线'} /> },
    { title: '参与考勤', dataIndex: 'attendanceEnabled', key: 'attendanceEnabled', render: (value) => <Tag color={value ? 'blue' : 'default'}>{value ? '是' : '否'}</Tag> },
    { title: '同步状态', key: 'sync', render: (_, device) => <div className="sync-stack"><StatusTag status={device.personnelSync === 'failed' ? 'error' : 'success'} label={`人员 ${device.personnelSync === 'failed' ? '失败' : '成功'}`} /><StatusTag status={device.faceSync === 'failed' ? 'error' : 'success'} label={`人脸 ${device.faceSync === 'failed' ? '失败' : '成功'}`} /><StatusTag status={device.permissionSync === 'failed' ? 'error' : 'success'} label={`权限 ${device.permissionSync === 'failed' ? '失败' : '成功'}`} /></div> },
    { title: '有效权限', key: 'effectivePermission', render: (_, device) => <StatusTag status={device.accessStatus === 'revoked' ? 'forbidden' : 'success'} label={device.accessStatus === 'revoked' ? '已撤销' : '平台允许'} /> },
    { title: '权限差异', key: 'permission', render: (_, device) => device.permissionMismatch ? <StatusTag status="warning" label={`平台${device.platformPermission === 'deny' ? '禁止' : '未生效'} / 设备${device.devicePermission === 'allow' ? '允许' : '禁止'}`} /> : <StatusTag status="success" label="一致" /> },
    { title: '操作', key: 'action', render: (_, device) => <div className="table-actions">{device.registered && canOperate(role, 'bindDevice', { projectId: device.projectId, device, deviceRegistered: true }) && <Button type="link" icon={<LinkOutlined />} onClick={() => setBindingDevice(device)}>绑定/解绑</Button>}<Button type="link" icon={<ReloadOutlined />} onClick={() => setDetail({ type: 'sync', data: { ...device, platformPermission: device.platformPermission === 'deny' ? '禁止' : '允许', devicePermission: device.devicePermission === 'allow' ? '允许' : '禁止' } })}>同步详情</Button>{device.syncStatus === 'failed' && <Button type="link" onClick={() => retrySync(device)}>重试</Button>}{canRegister && !device.online && !device.disabled && <Button type="link" onClick={() => recoverDevice(device)}>恢复在线</Button>}{canRegister && (device.archived || device.disabled) && <Button type="link" onClick={() => toggleLifecycle(device)}>恢复</Button>}{canRegister && !device.archived && !device.disabled && <Button type="link" danger onClick={() => toggleLifecycle(device)}>归档</Button>}{canRegister && !device.archived && !device.disabled && <Button type="link" danger onClick={() => stopDevice(device)}>停用</Button>}</div> },
  ];

  return <div className="business-page"><PageHeader title={registrationMode ? '设备登记' : '设备与门禁'} description="登记设备、绑定项目与维护权限同步状态；不接入真实海康 SDK。" breadcrumb={['首页', registrationMode ? '设备登记' : '设备与门禁']} extra={canRegister && <Button type="primary" icon={<PlusOutlined />} onClick={() => setRegisterOpen(true)}>登记设备</Button>} />{user.role === 'projectOwner' && <div className="workday-note"><StatusTag status="warning" label="权限说明" /> 项目负责人不能登记设备，只能在授权项目绑定已登记设备。</div>}<FilterBar onReset={() => setFilters({ projectId: 'all', online: 'all' })} onSearch={() => message.success(`已查询 ${filtered.length} 台设备`)}><Select value={filters.projectId} onChange={(projectId) => setFilters({ ...filters, projectId })} options={[{ value: 'all', label: '全部项目' }, ...projects.map((project) => ({ value: project.id, label: project.name }))]} /><Select value={filters.online} onChange={(online) => setFilters({ ...filters, online })} options={[{ value: 'all', label: '全部在线状态' }, { value: 'true', label: '在线' }, { value: 'false', label: '离线' }]} /></FilterBar><Card className="table-card"><Table rowKey="id" columns={columns} dataSource={filtered} scroll={{ x: 1600 }} pagination={false} /></Card><DeviceBindingDrawer open={Boolean(bindingDevice)} onClose={() => setBindingDevice(null)} role={role} projectId={bindingDevice?.projectId} device={bindingDevice || {}} projects={projects} entrances={mockData.entrances} onSubmit={handleBinding} onUnbind={handleUnbind} /><DetailDrawer open={Boolean(detail)} onClose={() => setDetail(null)} type={detail?.type} data={detail?.data} role={role} /><Modal title="登记设备" open={registerOpen} onCancel={handleRegisterClose} footer={null} destroyOnHidden><Form form={registerForm} layout="vertical" onFinish={saveRegistration}><Form.Item label="平台 ID" name="platformId" rules={[{ required: true, message: '请输入平台 ID' }]}><Input /></Form.Item><Form.Item label="海康序列号" name="hikvisionSerial" rules={[{ required: true, message: '请输入海康序列号' }]}><Input /></Form.Item><Form.Item label="设备型号" name="model" rules={[{ required: true, message: '请输入设备型号' }]}><Input /></Form.Item><Button type="primary" htmlType="submit">保存登记</Button></Form></Modal></div>;
}
