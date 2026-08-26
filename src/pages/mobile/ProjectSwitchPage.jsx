import React from 'react';
import { CheckCircleOutlined, CloudSyncOutlined } from '@ant-design/icons';
import { Button, Card, Empty, List, Space, Tag, Typography } from 'antd';
import mockData from '../../data/mockData';
import { getAuthorizedProjects, getProjectDevices } from './mobileUtils';

export { getAuthorizedProjects };

export function switchMobileProject({ user, projectId, projects = mockData.projects, people = mockData.people, projectPeople = mockData.projectPeople, onSwitch }) {
  const target = getAuthorizedProjects(user, projects, people, projectPeople).find((project) => project.id === projectId);
  if (!target) return null;
  onSwitch?.(target.id);
  return target.id;
}

export default function ProjectSwitchPage({ role, currentProjectId, projectsRecords = mockData.projects, peopleRecords = mockData.people, projectPeople = mockData.projectPeople, registeredDevices = [], onSwitch }) {
  const projects = getAuthorizedProjects(role, projectsRecords, peopleRecords, projectPeople);

  if (!projects.length) return <Empty description="暂无已授权且启用的项目" />;

  return (
    <div className="mobile-page-stack">
      <Card className="mobile-hero-card"><Typography.Text type="secondary">当前账号授权范围</Typography.Text><Typography.Title level={3}>项目切换</Typography.Title><Typography.Text type="secondary">仅显示当前账号可查看的启用项目。</Typography.Text></Card>
      <List
        dataSource={projects}
        renderItem={(project) => {
          const devices = getProjectDevices(project.id, registeredDevices);
          const synced = devices.filter((device) => device.syncStatus !== 'failed').length;
          const isCurrent = currentProjectId === project.id;
          return <Card className={isCurrent ? 'mobile-project-card current' : 'mobile-project-card'}>
            <Space direction="vertical" className="full-width">
              <Space><Typography.Text strong>{project.name}</Typography.Text>{isCurrent && <Tag color="blue">当前项目</Tag>}</Space>
              <Typography.Text type="secondary"><CloudSyncOutlined /> {devices.length ? `设备同步 ${synced}/${devices.length}` : '设备同步待平台录入'}</Typography.Text>
              <Button type={isCurrent ? 'default' : 'primary'} disabled={isCurrent} icon={isCurrent ? <CheckCircleOutlined /> : undefined} onClick={() => switchMobileProject({ user: role, projectId: project.id, projects: projectsRecords, people: peopleRecords, projectPeople, onSwitch })}>{isCurrent ? '当前项目' : '切换到此项目'}</Button>
            </Space>
          </Card>;
        }}
      />
    </div>
  );
}
