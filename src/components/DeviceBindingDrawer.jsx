import React, { useEffect } from 'react';
import { Alert, DatePicker, Drawer, Form, Input, Select, Switch, Typography } from 'antd';
import { canOperate, filterByDataScope } from '../domain/permissions';
import { getEntranceOptions, toDatePickerValue } from '../pages/pageUtils';

function normalizeUser(role) {
  return typeof role === 'string' ? { role } : role || {};
}

export function getDeviceBindingFormValues(values = {}) {
  return { ...values, deviceId: values.deviceId || values.id, effectiveAt: toDatePickerValue(values.effectiveAt) };
}

export function DeviceBindingForm({
  role,
  projectId,
  device = {},
  projects = [],
  entrances = [],
  availableDevices = [],
  fixedProject = false,
  onSubmit,
  onUnbind,
}) {
  const user = normalizeUser(role);
  const [form] = Form.useForm();
  const selectedProjectId = Form.useWatch('projectId', form) || projectId;
  const selectedDeviceId = Form.useWatch('deviceId', form);
  const createMode = device.bindingMode === 'create' || (!device.id && !device.projectId);
  const selectedDevice = createMode ? availableDevices.find((item) => item.id === selectedDeviceId) : device;
  const scopedProjects = filterByDataScope(
    user,
    projects.map((project) => ({ ...project, projectId: project.projectId || project.id })),
  );
  const canBind = canOperate(user, 'bindDevice', {
    projectId,
    device: selectedDevice,
    deviceRegistered: selectedDevice?.registered === true,
  });
  const canSubmit = canBind && typeof onSubmit === 'function';
  const canEditForm = canBind || (createMode && availableDevices.length > 0);
  const crossProject = user.role === 'projectOwner' && projectId && !(user.projectIds || []).includes(projectId);

  useEffect(() => {
    form.resetFields();
    form.setFieldsValue(getDeviceBindingFormValues({ projectId, ...device }));
  }, [device.id, device.effectiveAt, device.bindingMode, form, projectId]);

  return (
    <>
      {crossProject && <Alert type="warning" showIcon message="项目负责人不能跨项目绑定设备" />}
      {device.id && !device.registered && <Alert className="drawer-alert" type="warning" showIcon message="设备未登记，暂不可绑定" />}
      {createMode && availableDevices.length === 0 && <Alert className="drawer-alert" type="warning" showIcon message="暂无已登记且未绑定的设备，请先在设备登记页面完成登记" />}
      {createMode && availableDevices.length > 0 && <Alert className="drawer-alert" type="info" showIcon message="这里只选择已登记设备；绑定后将自动同步当前项目人员、人脸和门禁权限" />}
      <Form form={form} layout="vertical" onFinish={onSubmit} disabled={!canEditForm} initialValues={getDeviceBindingFormValues({ projectId, ...device })}>
        {fixedProject ? <Form.Item label="绑定项目"><Input value={projects.find((project) => project.id === projectId)?.name || projectId || '当前项目'} disabled /></Form.Item> : <Form.Item label="项目" name="projectId" rules={[{ required: true, message: '请选择项目' }]}>
          <Select options={scopedProjects.map((project) => ({ value: project.id || project.projectId, label: project.name || project.projectId }))} />
        </Form.Item>}
        {!createMode ? <Form.Item label="已登记设备"><Input value={`${device.platformId || device.id}${device.hikvisionSerial ? ` · ${device.hikvisionSerial}` : ''}`} disabled /></Form.Item> : <Form.Item label="已登记设备" name="deviceId" rules={[{ required: true, message: '请选择已登记设备' }]}>
          <Select placeholder="请选择设备" options={availableDevices.map((item) => ({ value: item.id, label: `${item.platformId || item.id}${item.hikvisionSerial ? ` · ${item.hikvisionSerial}` : ''}` }))} />
        </Form.Item>}
        <Form.Item label="出入口" name="entranceId" rules={[{ required: true, message: '请选择出入口' }]}><Select options={getEntranceOptions(entrances, selectedProjectId).map((entrance) => ({ value: entrance.id, label: entrance.name }))} /></Form.Item>
        <Form.Item label="进出方向" name="direction" rules={[{ required: true, message: '请选择进出方向' }]}>
          <Select options={[{ value: 'in', label: '进' }, { value: 'out', label: '出' }, { value: 'both', label: '进出' }]} />
        </Form.Item>
        <Form.Item label="是否参与考勤" name="attendanceEnabled" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item label="绑定生效时间" name="effectiveAt"><DatePicker showTime style={{ width: '100%' }} /></Form.Item>
        {device.id && device.projectId && <Alert className="drawer-alert" type={device.syncStatus === 'failed' ? 'error' : 'info'} showIcon message={device.syncStatus === 'failed' ? '当前设备同步失败，请检查同步详情后重试' : '修改绑定后将重新同步项目人员和门禁权限'} />}
        {!canBind && !createMode && <Typography.Paragraph type="secondary">当前角色没有绑定此设备的权限。</Typography.Paragraph>}
        {!canBind && createMode && availableDevices.length > 0 && <Typography.Paragraph type="secondary">请选择设备后继续。</Typography.Paragraph>}
        {canBind && typeof onSubmit !== 'function' && <Typography.Paragraph type="secondary">绑定回调未接入，当前不可保存。</Typography.Paragraph>}
        {canBind && <div className="drawer-actions">{canSubmit && <button className="drawer-submit" type="submit">{createMode ? '绑定并同步人员' : '保存绑定并同步人员'}</button>}{device.projectId && typeof onUnbind === 'function' && <button className="drawer-secondary" type="button" onClick={onUnbind}>解除绑定</button>}</div>}
      </Form>
    </>
  );
}

export default function DeviceBindingDrawer({ open, onClose, ...props }) {
  return (
    <Drawer title="设备绑定" open={open} onClose={onClose} width={480} destroyOnClose>
      <DeviceBindingForm {...props} />
    </Drawer>
  );
}
