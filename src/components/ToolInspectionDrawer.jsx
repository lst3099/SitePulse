import React, { useEffect } from 'react';
import { Button, DatePicker, Drawer, Form, Input, Select, Space, Typography } from 'antd';
import dayjs from 'dayjs';

export default function ToolInspectionDrawer({ open, tool, inspectorName, defaultDate, onClose, onSubmit }) {
  const [form] = Form.useForm();
  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({ inspectedAt: dayjs(defaultDate || undefined), result: '合格', remark: '' });
  }, [defaultDate, form, open]);

  const handleFinish = (values) => {
    onSubmit?.({
      ...values,
      inspectedAt: values.inspectedAt?.format('YYYY-MM-DD'),
    });
    form.resetFields();
  };

  return (
    <Drawer
      title="完成工具检查"
      open={open}
      onClose={onClose}
      destroyOnHidden
      width={420}
      footer={<Space><Button onClick={onClose}>取消</Button><Button type="primary" onClick={() => form.submit()}>提交检查</Button></Space>}
    >
      <Typography.Paragraph type="secondary">工具：{tool?.toolCode} · {tool?.name}</Typography.Paragraph>
      <Typography.Paragraph type="secondary">检查人：{inspectorName || '当前登录用户'}</Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item label="检查时间" name="inspectedAt" rules={[{ required: true, message: '请选择检查时间' }]}><DatePicker className="full-width" /></Form.Item>
        <Form.Item label="检查结果" name="result" rules={[{ required: true, message: '请选择检查结果' }]}><Select options={[{ value: '合格', label: '合格' }, { value: '不合格', label: '不合格' }]} /></Form.Item>
        <Form.Item noStyle shouldUpdate={(prev, next) => prev.result !== next.result}>
          {({ getFieldValue }) => <Form.Item label="备注" name="remark" rules={getFieldValue('result') === '不合格' ? [{ required: true, message: '检查不合格时必须填写备注' }] : []}><Input.TextArea rows={4} placeholder="记录检查结果或问题说明" /></Form.Item>}
        </Form.Item>
      </Form>
    </Drawer>
  );
}
