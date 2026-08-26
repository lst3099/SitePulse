import React from 'react';
import { Tag } from 'antd';

const STATUS_META = {
  normal: { color: 'default', label: '正常' },
  success: { color: 'success', label: '成功' },
  warning: { color: 'warning', label: '注意' },
  error: { color: 'error', label: '异常' },
  forbidden: { color: 'error', label: '禁止' },
  offline: { color: 'default', label: '离线' },
  archived: { color: 'default', label: '已归档' },
  syncing: { color: 'processing', label: '同步中' },
};

export default function StatusTag({ status, label, ...props }) {
  const meta = STATUS_META[status] || { color: 'default', label: status || '未知' };
  return <Tag color={meta.color} {...props}>{label || meta.label}</Tag>;
}

