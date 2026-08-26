import React, { useState } from 'react';
import { RightOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Descriptions, Empty, Form, Input, Tag, Typography } from 'antd';
import mockData from '../../data/mockData';
import { getSyncStatusLabel, maskIdCard } from './mobileUtils';

export function saveLocalPasswordSettings() {
  return { feedback: '密码已更新（本地演示状态）' };
}

export function PasswordSettings() {
  const [feedback, setFeedback] = useState('');
  const [form] = Form.useForm();

  const save = () => {
    setFeedback(saveLocalPasswordSettings().feedback);
    form.resetFields();
  };

  return <Card title="账号设置"><Form form={form} layout="vertical" onFinish={save}>
    <Form.Item label="当前密码" name="currentPassword" rules={[{ required: true, message: '请输入当前密码' }]}><Input.Password /></Form.Item>
    <Form.Item label="新密码" name="newPassword" rules={[{ required: true, message: '请输入新密码' }]}><Input.Password /></Form.Item>
    <Form.Item label="确认新密码" name="confirmPassword" dependencies={['newPassword']} rules={[{ required: true, message: '请再次输入新密码' }, ({ getFieldValue }) => ({ validator(_, value) { return !value || getFieldValue('newPassword') === value ? Promise.resolve() : Promise.reject(new Error('两次密码不一致')); } })]}><Input.Password /></Form.Item>
    <Button type="primary" htmlType="submit">保存本地演示设置</Button>
  </Form>{feedback && <Alert className="drawer-alert" type="success" message={feedback} />}</Card>;
}

export default function ProfilePage({ person, project, onOpenFaceSync, initialSettingsOpen = false }) {
  const [settingsOpen, setSettingsOpen] = useState(initialSettingsOpen);
  if (!person || !project) return <Empty description="暂无个人信息" />;
  const healthLabel = person.healthReportStatus === 'valid' ? '有效' : person.healthReportStatus === 'expired' ? '已过期' : '未上传';
  return (
    <div className="mobile-page-stack">
      <Card className="mobile-hero-card"><Typography.Text type="secondary">个人信息</Typography.Text><Typography.Title level={3}>{person.name}</Typography.Title><Tag color="green">账号正常</Tag></Card>
      <Card>
        <Descriptions column={1} size="small">
          <Descriptions.Item label="姓名">{person.name}</Descriptions.Item>
          <Descriptions.Item label="身份证号">{maskIdCard(person.idCardNumber)}</Descriptions.Item>
          <Descriptions.Item label="所属项目">{project.name}</Descriptions.Item>
          <Descriptions.Item label="账号状态"><Tag color="green">正常</Tag></Descriptions.Item>
          <Descriptions.Item label="人脸同步状态"><Tag color="green">{getSyncStatusLabel(person.registered ? 'success' : 'pending')}</Tag></Descriptions.Item>
          <Descriptions.Item label="健康报告">{healthLabel}{person.healthReportExpiresAt ? ` · 有效期至 ${person.healthReportExpiresAt}` : ''}</Descriptions.Item>
        </Descriptions>
      </Card>
      <Button block icon={<RightOutlined />} onClick={onOpenFaceSync}>查看人脸同步状态</Button>
      <Button block onClick={() => setSettingsOpen((value) => !value)}>账号设置 / 修改密码</Button>
      {settingsOpen && <PasswordSettings />}
      <Typography.Paragraph type="secondary">健康报告为可选资料，仅展示上传记录与有效期；本页面只读。</Typography.Paragraph>
    </div>
  );
}
