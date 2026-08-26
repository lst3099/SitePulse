import React, { useEffect, useMemo, useState } from 'react';
import { ReloadOutlined, SyncOutlined } from '@ant-design/icons';
import { Button, Card, Collapse, Empty, Space, Tag, Typography } from 'antd';
import mockData from '../../data/mockData';
import { getProjectDevices, getSyncStatusLabel } from './mobileUtils';

export function getFaceSyncRecords({ projectId, person, registeredDevices = [], devices = mockData.devices, permissionSyncRecords = mockData.permissionSyncRecords, lifecycleState }) {
  if (!projectId || !person) return [];
  const projectDevices = getProjectDevices(projectId, registeredDevices, devices);
  return projectDevices.map((device) => {
    const override = lifecycleState?.deviceOverrides?.[device.id] || {};
    const syncRecords = permissionSyncRecords.filter((item) => item.projectId === projectId && item.deviceId === device.id);
    const explicitStatuses = [
      ...syncRecords.map((item) => item.status),
      override.faceSyncStatus,
      override.faceSync,
      override.syncStatus,
      override.permissionSync,
      device.faceSyncStatus,
      device.faceSync,
      device.syncStatus,
      device.permissionSync,
    ].filter(Boolean);
    const status = explicitStatuses.includes('failed') ? 'failed' : explicitStatuses.includes('syncing') ? 'syncing' : explicitStatuses.includes('success') ? 'success' : 'pending';
    const failure = syncRecords.find((item) => item.status === 'failed');
    const failureReason = status === 'failed' ? override.failureReason || failure?.reason || device.failureReason || '' : '';
    return { device: { ...device, ...override }, status, failureReason };
  });
}

export function retryFaceSync(records, deviceId, onRetry) {
  onRetry?.(deviceId);
  return records.map((item) => item.device.id === deviceId ? { ...item, status: 'syncing', failureReason: '' } : item);
}

const STATUS_COLOR = { pending: 'default', syncing: 'processing', success: 'green', failed: 'red' };

export default function FaceSyncPage({ project, person, devices = mockData.devices, registeredDevices = [], permissionSyncRecords = mockData.permissionSyncRecords, lifecycleState, onRetry }) {
  const initial = useMemo(() => getFaceSyncRecords({ projectId: project?.id, person, devices, registeredDevices, permissionSyncRecords, lifecycleState }), [devices, lifecycleState, permissionSyncRecords, person, project?.id, registeredDevices]);
  const [records, setRecords] = useState(initial);
  useEffect(() => setRecords(initial), [initial]);
  const retry = (deviceId) => {
    onRetry?.(deviceId);
    setRecords((current) => retryFaceSync(current, deviceId));
  };

  if (!project || !person) return <Empty description="暂无人脸同步数据" />;

  return (
    <div className="mobile-page-stack">
      <Card className="mobile-hero-card"><Typography.Text type="secondary">平台人脸录入</Typography.Text><Typography.Title level={3}>{person.name}</Typography.Title><Tag color="green">{person.registered ? '已录入平台' : '待平台录入'}</Tag></Card>
      <Card title="设备同步状态">
        <Space direction="vertical" className="full-width">
          {['pending', 'syncing', 'success', 'failed'].map((status) => <Tag key={status} color={STATUS_COLOR[status]}>{getSyncStatusLabel(status)}</Tag>)}
          {records.length ? records.map(({ device, status, failureReason }) => <Card key={device.id} size="small" title={device.name || device.id} extra={<Tag color={STATUS_COLOR[status]}>{getSyncStatusLabel(status)}</Tag>}>
            <Space direction="vertical"><Typography.Text type="secondary">项目设备同步状态仅供查看</Typography.Text>{failureReason && <><Typography.Text type="danger">失败原因：{failureReason}</Typography.Text><Collapse items={[{ key: 'reason', label: '查看失败原因', children: failureReason }]} /></>}{status === 'failed' && <Button icon={<ReloadOutlined />} onClick={() => retry(device.id)}>重试同步</Button>}</Space>
          </Card>) : <Typography.Text type="secondary">暂无已登记设备同步记录</Typography.Text>}
        </Space>
      </Card>
      <Typography.Paragraph type="secondary">施工人员只能查看本人状态，平台不开放人脸或设备权限编辑。</Typography.Paragraph>
    </div>
  );
}
