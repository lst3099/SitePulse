import React, { useEffect } from 'react';
import { Button, Drawer, Form, Input, Select, Space } from 'antd';

const STATUS_OPTIONS = [
  { value: '在用', label: '在用' },
  { value: '遗失', label: '遗失' },
  { value: '报废', label: '报废' },
];

export default function ToolEditorDrawer({ open, tool, projects = [], fixedProjectId, onClose, onSubmit }) {
  const [form] = Form.useForm();
  const projectId = fixedProjectId || tool?.projectId;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: tool?.name || '',
      model: tool?.model || '',
      projectId: projectId || projects[0]?.id,
      usageStatus: tool?.usageStatus || '在用',
      remark: tool?.remark || '',
    });
  }, [form, open, projectId, projects, tool]);

  const handleFinish = (values) => {
    onSubmit?.({ ...values, id: tool?.id });
    form.resetFields();
  };

  return (
    <Drawer
      title={tool ? '编辑工具' : '新增工具'}
      open={open}
      onClose={onClose}
      destroyOnHidden
      width={420}
      footer={<Space><Button onClick={onClose}>取消</Button><Button type="primary" onClick={() => form.submit()}>保存</Button></Space>}
    >
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        {tool && <Form.Item label="工具编号"><Input value={tool.toolCode} disabled /></Form.Item>}
        <Form.Item label="工具名称" name="name" rules={[{ required: true, message: '请输入工具名称' }]}><Input placeholder="例如：绝缘手套" /></Form.Item>
        <Form.Item label="工具型号" name="model" rules={[{ required: true, message: '请输入工具型号' }]}><Input placeholder="例如：10KV-A" /></Form.Item>
        <Form.Item label="所属项目" name="projectId" rules={[{ required: true, message: '请选择所属项目' }]}>
          <Select disabled={Boolean(fixedProjectId)} options={projects.map((project) => ({ value: project.id, label: project.name }))} />
        </Form.Item>
        <Form.Item label="使用状态" name="usageStatus" rules={[{ required: true, message: '请选择使用状态' }]}><Select options={STATUS_OPTIONS} /></Form.Item>
        <Form.Item label="备注" name="remark"><Input.TextArea rows={4} placeholder="遗失或报废时可填写说明" /></Form.Item>
      </Form>
    </Drawer>
  );
}
