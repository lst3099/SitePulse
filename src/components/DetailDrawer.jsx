import React from 'react';
import { Descriptions, Drawer, Form, Input, Typography } from 'antd';
import { canOperate } from '../domain/permissions';

const DETAIL_TITLES = {
  rawEvent: '原始事件',
  attendance: '考勤详情',
  sync: '同步详情',
  alert: '告警详情',
  snapshot: '抓拍详情',
  leave: '请假详情',
  supplement: '补录详情',
  operationLog: '操作日志详情',
  user: '用户账号详情',
};

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function DetailDrawerContent({ type = 'rawEvent', data = {}, role, onSubmit }) {
  const isRawEvent = type === 'rawEvent';
  const isSupplement = type === 'supplement';
  const canSupplement = canOperate(role, 'supplement', { projectId: data.projectId });
  const canSubmitSupplement = canSupplement && typeof onSubmit === 'function';
  const entries = Object.entries(data);

  return (
    <>
      {isRawEvent && <Typography.Paragraph type="secondary">原始事件只读，不可修改。</Typography.Paragraph>}
      <Descriptions bordered size="small" column={1}>
        {entries.map(([key, value]) => <Descriptions.Item key={key} label={key}>{formatValue(value)}</Descriptions.Item>)}
      </Descriptions>
      {isSupplement && (
        <Form className="detail-form" layout="vertical" onFinish={onSubmit} disabled={!canSubmitSupplement}>
          <Form.Item
            label="作废原因"
            name="voidReason"
            rules={[{ required: true, message: '请输入补录作废原因' }]}
          >
            <Input.TextArea disabled={!canSupplement} placeholder="补录作废时必须填写原因" />
          </Form.Item>
          {canSubmitSupplement ? <button className="drawer-submit" type="submit">提交作废</button> : <Typography.Text type="secondary">{canSupplement ? '提交回调未接入，当前不可作废补录。' : '当前角色无权作废补录。'}</Typography.Text>}
        </Form>
      )}
    </>
  );
}

export default function DetailDrawer({ open, onClose, ...props }) {
  return (
    <Drawer title={DETAIL_TITLES[props.type] || '详情'} open={open} onClose={onClose} width={520} destroyOnClose>
      <DetailDrawerContent {...props} />
    </Drawer>
  );
}
