import React from 'react';
import { Button, Divider, Drawer, Form, Input, Select, Typography, Upload } from 'antd';
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

export function getUniqueFieldRule(field, label, records = [], currentPersonId) {
  return {
    validator: (_, value) => {
      const normalizedValue = String(value || '').trim();
      if (!normalizedValue) return Promise.resolve();
      const duplicated = records.some((record) => record.id !== currentPersonId && String(record[field] || '').trim() === normalizedValue);
      return duplicated ? Promise.reject(new Error(`${label}已存在，请勿重复录入`)) : Promise.resolve();
    },
  };
}

function hasUpload(value) {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function normalizeFileList(value, fallbackName) {
  if (Array.isArray(value)) return value;
  return value ? [{ uid: `existing-${fallbackName}`, name: fallbackName, status: 'done' }] : [];
}

function normalizeUploadEvent(event) {
  return event?.fileList || [];
}

export function PersonDrawerContent({
  mode = 'view',
  role,
  person = {},
  peopleRecords = [],
  people = [],
  onSubmit,
}) {
  const user = normalizeUser(role);
  const editableProjectOptions = getEditableProjectOptions(user, person.projectOptions || []);
  const scopeProjectId = person.projectId || editableProjectOptions[0]?.value;
  const subject = { ...person, projectId: scopeProjectId, targetPersonId: person.personId || person.id };
  const canView = (field) => canViewField(user, field, subject);
  const canEdit = mode === 'edit' && canOperate(user, 'editPerson', { projectId: scopeProjectId });
  const canEditSensitive = canOperate(user, 'replaceFace', { projectId: scopeProjectId });
  const uniqueRecords = people.length ? people : peopleRecords;
  const disabled = mode === 'view' || !canEdit || typeof onSubmit !== 'function';
  const hasExistingFace = person.registered === true || hasUpload(person.faceImage);
  const initialValues = {
    ...person,
    relationStatus: person.relationStatus || person.projectRelationships?.[0]?.status || 'active',
    faceImage: normalizeFileList(person.faceImage || (person.registered ? '已登记人脸照片' : ''), '已登记人脸照片'),
    healthReport: normalizeFileList(person.healthReport, '健康报告'),
    qualifications: normalizeFileList(person.qualifications || person.qualification, '资质证书'),
  };

  return (
      <Form layout="vertical" disabled={disabled} onFinish={(values) => submitPersonEdit(user, values, onSubmit)} initialValues={initialValues}>
        <Typography.Title level={5}>基础资料</Typography.Title>
        {canView('name') && <Form.Item label="姓名" name="name" rules={[{ required: true, whitespace: true, message: '请输入姓名' }]}><Input /></Form.Item>}
        {canView('idCardNumber') && <Form.Item label="身份证号" name="idCardNumber" rules={[{ required: true, whitespace: true, message: '请输入身份证号' }, getUniqueFieldRule('idCardNumber', '身份证号', uniqueRecords, person.id)]}><Input readOnly={mode === 'view'} /></Form.Item>}
        {canView('phone') && <Form.Item label="联系电话" name="phone" rules={[{ required: true, whitespace: true, message: '请输入联系电话' }, getUniqueFieldRule('phone', '联系电话', uniqueRecords, person.id)]}><Input /></Form.Item>}

        <Divider />
        <Typography.Title level={5}>项目关系</Typography.Title>
        {canView('projectId') && <Form.Item label="所属项目" name="projectId"><Select allowClear placeholder="暂不绑定项目" options={editableProjectOptions} /></Form.Item>}
        {canView('status') && <Form.Item label="关系类型" name="relationStatus"><Select allowClear placeholder="暂不设置关系类型" options={[{ value: 'active', label: '主项目' }, { value: 'temporary', label: '临时项目' }]} /></Form.Item>}
        {canView('status') && <Form.Item label="人员状态" name="status"><Input /></Form.Item>}

        <Divider />
        <Typography.Title level={5}>门禁资料</Typography.Title>
        {canView('registered') && <Form.Item label="人员注册状态" name="registered"><Input /></Form.Item>}
        {canView('face') && (
          <Form.Item label="人脸照片" name="faceImage" valuePropName="fileList" getValueFromEvent={normalizeUploadEvent} required={!hasExistingFace} rules={[{ validator: (_, value) => hasExistingFace || hasUpload(value) ? Promise.resolve() : Promise.reject(new Error('请上传人脸照片')) }]}>
            <Upload accept="image/*" beforeUpload={() => false} maxCount={1} listType="picture" disabled={!canEditSensitive}>
              <Button disabled={!canEditSensitive}>上传人脸照片</Button>
            </Upload>
          </Form.Item>
        )}
        <Typography.Paragraph type="secondary">请上传清晰正面照片，用于现场人脸核验。</Typography.Paragraph>

        <Divider />
        <Typography.Title level={5}>健康报告/资质证书</Typography.Title>
        {canView('healthReport') && (
          <Form.Item label="健康报告（选填）" name="healthReport" valuePropName="fileList" getValueFromEvent={normalizeUploadEvent}>
            <Upload accept="image/*" beforeUpload={() => false} maxCount={1} listType="picture">
              <Button>上传健康报告图片</Button>
            </Upload>
          </Form.Item>
        )}
        {canView('qualification') && (
          <Form.Item label="资质证书（选填，可多张）" name="qualifications" valuePropName="fileList" getValueFromEvent={normalizeUploadEvent}>
            <Upload accept="image/*" beforeUpload={() => false} multiple listType="picture">
              <Button>上传资质证书图片</Button>
            </Upload>
          </Form.Item>
        )}
        {canEdit && typeof onSubmit !== 'function' && <Typography.Text type="secondary">保存回调未接入，当前不可保存。</Typography.Text>}
        {canEdit && typeof onSubmit === 'function' && <button className="drawer-submit" type="submit">保存档案</button>}
      </Form>
  );
}

export default function PersonDrawer({ open, onClose, ...props }) {
  const user = normalizeUser(props.role);
  const editableProjectId = props.person?.projectId || getEditableProjectOptions(user, props.person?.projectOptions || [])[0]?.value;
  const canEdit = props.mode === 'edit' && canOperate(user, 'editPerson', { projectId: editableProjectId });
  const title = props.mode !== 'edit' ? '人员档案' : props.person?.id || props.person?.personId ? '编辑人员档案' : '新增人员档案';

  return (
    <Drawer
      title={title}
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
