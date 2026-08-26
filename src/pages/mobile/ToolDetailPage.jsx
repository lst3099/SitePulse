import React from 'react';
import { Button, Card, Descriptions, Empty, Space, Tag, Typography } from 'antd';
import { canOperate } from '../../domain/permissions';
import { getInspectionCycle, getLatestToolInspection, getToolInspectionStatus, TOOL_USAGE_STATUS } from '../../domain/tools';
import { projectName } from '../pageUtils';

const INSPECTION_COLORS = { 正常: 'success', 待检查: 'warning', 已逾期: 'error', 不合格: 'error' };
const USAGE_COLORS = { 在用: 'green', 遗失: 'orange', 报废: 'default' };

export default function ToolDetailPage({ role, tool, inspections = [], policy, projectsRecords, asOfDate, onInspect }) {
  if (!tool) return <Empty description="工具信息不存在或二维码已失效" />;
  const inspectionStatus = getToolInspectionStatus(tool, inspections, policy, asOfDate);
  const latest = getLatestToolInspection(tool, inspections);
  const cycle = getInspectionCycle(asOfDate, policy);
  const canInspect = canOperate(role, 'inspectTool', { projectId: tool.projectId }) && tool.usageStatus === TOOL_USAGE_STATUS.ACTIVE;
  return (
    <div className="mobile-page-stack">
      <Card className="mobile-hero-card">
        <Typography.Text type="secondary">工具详情</Typography.Text>
        <Typography.Title level={3}>{tool.name}</Typography.Title>
        <Space wrap>
          <Tag color={USAGE_COLORS[tool.usageStatus]}>{tool.usageStatus}</Tag>
          {inspectionStatus !== '—' && <Tag color={INSPECTION_COLORS[inspectionStatus]}>{inspectionStatus}</Tag>}
        </Space>
      </Card>
      <Card title="工具信息">
        <Descriptions column={1} size="small">
          <Descriptions.Item label="工具编号">{tool.toolCode}</Descriptions.Item>
          <Descriptions.Item label="型号">{tool.model}</Descriptions.Item>
          <Descriptions.Item label="所属项目">{projectName(tool.projectId, projectsRecords)}</Descriptions.Item>
          <Descriptions.Item label="当前周期">{cycle.startDate} 至 {cycle.deadline}</Descriptions.Item>
          <Descriptions.Item label="本周期检查">{inspectionStatus === '正常' ? '已完成' : inspectionStatus === '—' ? '不适用' : '未完成'}</Descriptions.Item>
          <Descriptions.Item label="最近检查">{latest?.inspectedAt || '暂无'}</Descriptions.Item>
          <Descriptions.Item label="检查结果">{latest?.result || '暂无'}</Descriptions.Item>
          <Descriptions.Item label="检查人">{latest?.inspectorName || '暂无'}</Descriptions.Item>
          <Descriptions.Item label="备注">{latest?.remark || tool.remark || '—'}</Descriptions.Item>
        </Descriptions>
      </Card>
      {canInspect && <Button type="primary" size="large" block onClick={() => onInspect?.(tool)}>开始检查</Button>}
    </div>
  );
}
