import React from 'react';
import { Divider, Drawer, Form, Input, Select, Typography } from 'antd';
import { canOperate, canViewField } from '../domain/permissions';

function normalizeUser(role) {
  return typeof role === 'string' ? { role } : role || {};
}

export function getEditableProjectOptions(user, projectOptions = []) {
  return projectOptions.filter((option) => canOperate(user, 'editPerson', { projectId: option.value }));
}

export function submitPersonEdit(user, values, onSubmit) {
  if (!canOperate(user, 'editPerson', { projectId: values?.projectId })) return false;
  if (typeof onSubmit !== 'function') return false;
  onSubmit(values);
  return true;
}

export function PersonDrawerContent({
  mode = 'view',
  role,
  person = {},
  onSubmit,
}) {
  const user = normalizeUser(role);
  const subject = { ...person, targetPersonId: person.personId || person.id };
  const canView = (field) => canViewField(user, field, subject);
  const canEdit = mode === 'edit' && canOperate(user, 'editPerson', { projectId: person.projectId });
  const canEditSensitive = canOperate(user, 'replaceFace', { projectId: person.projectId });
  const editableProjectOptions = getEditableProjectOptions(user, person.projectOptions || []);
  const disabled = mode === 'view' || !canEdit || typeof onSubmit !== 'function';

  return (
      <Form layout="vertical" disabled={disabled} onFinish={(values) => submitPersonEdit(user, values, onSubmit)} initialValues={person}>
        <Typography.Title level={5}>基础资料</Typography.Title>
        {canView('name') && <Form.Item label="姓名" name="name"><Input /></Form.Item>}
        {canView('idCardNumber') && <Form.Item label="身份证号" name="idCardNumber"><Input readOnly={mode === 'view'} /></Form.Item>}
        {canView('accountId') && <Form.Item label="账号" name="accountId"><Input readOnly /></Form.Item>}
        {canView('phone') && <Form.Item label="联系电话" name="phone"><Input /></Form.Item>}

        <Divider />
        <Typography.Title level={5}>项目关系</Typography.Title>
        {canView('projectId') && <Form.Item label="所属项目" name="projectId"><Select options={editableProjectOptions} /></Form.Item>}
        {canView('status') && <Form.Item label="人员状态" name="status"><Input /></Form.Item>}

        <Divider />
        <Typography.Title level={5}>门禁资料</Typography.Title>
        {canView('registered') && <Form.Item label="人员注册状态" name="registered"><Input /></Form.Item>}
        {canView('face') && (
          <Form.Item label="人脸" name="face">
            <Input readOnly={!canEditSensitive} placeholder="现场采集不支持" />
          </Form.Item>
        )}
        <Typography.Paragraph type="secondary">现场采集不支持，请使用已接入的登记流程。</Typography.Paragraph>

        <Divider />
        <Typography.Title level={5}>健康报告/资质证书</Typography.Title>
        {canView('healthReport') && <Form.Item label="健康报告" name="healthReport"><Input.TextArea readOnly /></Form.Item>}
        {canView('qualification') && <Form.Item label="资质证书" name="qualification"><Input.TextArea readOnly /></Form.Item>}
        {canEdit && typeof onSubmit !== 'function' && <Typography.Text type="secondary">保存回调未接入，当前不可保存。</Typography.Text>}
        {canEdit && typeof onSubmit === 'function' && <button className="drawer-submit" type="submit">保存档案</button>}
      </Form>
  );
}

export default function PersonDrawer({ open, onClose, ...props }) {
  const user = normalizeUser(props.role);
  const canEdit = props.mode === 'edit' && canOperate(user, 'editPerson', { projectId: props.person?.projectId });

  return (
    <Drawer
      title={props.mode === 'edit' ? '编辑人员档案' : '人员档案'}
      open={open}
      onClose={onClose}
      width={520}
      destroyOnClose
      extra={canEdit ? <Typography.Text type="secondary">仅保存已授权字段</Typography.Text> : null}
    >
      <PersonDrawerContent {...props} />
    </Drawer>
  );
}
