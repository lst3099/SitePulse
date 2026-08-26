import React from 'react';
import { Card, Empty, List, Tag } from 'antd';
import mockData from '../../data/mockData';

const STATUS_COLORS = { 在用: 'green', 遗失: 'red', 报废: 'default' };

export default function MobileToolsPage({ project, tools = mockData.tools }) {
  if (!project) return <Empty description="暂无项目工具数据" />;

  const projectTools = tools.filter((tool) => tool.projectId === project.id);

  return (
    <div className="mobile-page-stack">
      <Card title={`工具清单（${projectTools.length}）`}>
        {projectTools.length ? (
          <List
            dataSource={projectTools}
            renderItem={(tool) => (
              <List.Item extra={<Tag color={STATUS_COLORS[tool.usageStatus] || 'default'}>{tool.usageStatus}</Tag>}>
                <List.Item.Meta title={tool.name} description={`${tool.toolCode} · ${tool.model}`} />
              </List.Item>
            )}
          />
        ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前项目暂无工具" />}
      </Card>
    </div>
  );
}
