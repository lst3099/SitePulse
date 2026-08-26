import React, { useEffect } from 'react';
import { Alert, DatePicker, Drawer, Form, Input, Select, Switch, Typography } from 'antd';
import { canOperate, filterByDataScope } from '../domain/permissions';
import { getEntranceOptions, toDatePickerValue } from '../pages/pageUtils';

function normalizeUser(role) {
  return typeof role === 'string' ? { role } : role || {};
}

export function getDeviceBindingFormValues(values = {}) {
  return { ...values, effectiveAt: toDatePickerValue(values.effectiveAt) };
}

export function DeviceBindingForm({
  role,
  projectId,
  device = {},
  projects = [],
  entrances = [],
  onSubmit,
  onUnbind,
}) {
  const user = normalizeUser(role);
  const [form] = Form.useForm();
  const selectedProjectId = Form.useWatch('projectId', form) || projectId;
  const scopedProjects = filterByDataScope(
    user,
    projects.map((project) => ({ ...project, projectId: project.projectId || project.id })),
  );
  const canBind = canOperate(user, 'bindDevice', {
    projectId,
    device,
    deviceRegistered: device.registered === true,
  });
  const canSubmit = canBind && typeof onSubmit === 'function';
  const crossProject = user.role === 'projectOwner' && projectId && !(user.projectIds || []).includes(projectId);

  useEffect(() => {
    form.resetFields();
    form.setFieldsValue(getDeviceBindingFormValues({ projectId, ...device }));
  }, [device.id, device.effectiveAt, form, projectId]);

  return (
    <>
      {crossProject && <Alert type="warning" showIcon message="项目负责人不能跨项目绑定设备" />}
      {!device.registered && <Alert className="drawer-alert" type="warning" showIcon message="设备未登记，暂不可绑定" />}
      <Form form={form} layout="vertical" onFinish={onSubmit} disabled={!canSubmit} initialValues={getDeviceBindingFormValues({ projectId, ...device })}>
        <Form.Item label="项目" name="projectId" rules={[{ required: true, message: '请选择项目' }]}>
          <Select options={scopedProjects.map((project) => ({ value: project.id || project.projectId, label: project.name || project.projectId }))} />
        </Form.Item>
        <Form.Item label="出入口" name="entranceId" rules={[{ required: true, message: '请选择出入口' }]}><Select options={getEntranceOptions(entrances, selectedProjectId).map((entrance) => ({ value: entrance.id, label: entrance.name }))} /></Form.Item>
        <Form.Item label="进出方向" name="direction" rules={[{ required: true, message: '请选择进出方向' }]}>
          <Select options={[{ value: 'in', label: '进' }, { value: 'out', label: '出' }, { value: 'both', label: '进出' }]} />
        </Form.Item>
        <Form.Item label="是否参与考勤" name="attendanceEnabled" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item label="生效时间" name="effectiveAt"><DatePicker showTime style={{ width: '100%' }} /></Form.Item>
        <Form.Item label="绑定状态" name="bindingStatus"><Input placeholder="待绑定 / 已绑定 / 已解除" /></Form.Item>
        {!canBind && <Typography.Paragraph type="secondary">当前角色没有绑定此设备的权限。</Typography.Paragraph>}
        {canBind && typeof onSubmit !== 'function' && <Typography.Paragraph type="secondary">绑定回调未接入，当前不可保存。</Typography.Paragraph>}
        {canBind && <div className="drawer-actions">{canSubmit && <button className="drawer-submit" type="submit">保存绑定</button>}{device.projectId && typeof onUnbind === 'function' && <button className="drawer-secondary" type="button" onClick={onUnbind}>解除绑定</button>}</div>}
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
