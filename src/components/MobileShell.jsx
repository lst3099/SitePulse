import React from 'react';
import { ArrowLeftOutlined, DownOutlined, HomeOutlined, ProfileOutlined, ProjectOutlined, SyncOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Tag, Typography } from 'antd';

const NAV_ITEMS = [
  { key: 'mobileAttendance', label: '今日', icon: <HomeOutlined /> },
  { key: 'mobileOverview', label: '考勤', icon: <ProfileOutlined /> },
  { key: 'mobileProjects', label: '项目', icon: <ProjectOutlined /> },
  { key: 'mobileFaceSync', label: '人脸同步', icon: <SyncOutlined /> },
  { key: 'mobileProfile', label: '我的', icon: <UserOutlined /> },
];

export { NAV_ITEMS };

export default function MobileShell({ title, currentProject, activeView = 'mobileAttendance', onNavigate, onBack, onOpenProjectSwitch, children }) {
  return (
    <div className="mobile-preview-page">
      <div className="mobile-shell">
        <header className="mobile-header">
          <div className="mobile-header-row">
            {onBack ? <Button type="text" aria-label="返回" icon={<ArrowLeftOutlined />} onClick={onBack} /> : <span className="mobile-header-placeholder" />}
            <Typography.Title level={4}>{title}</Typography.Title>
            <Button type="text" aria-label="切换项目" icon={<DownOutlined />} onClick={onOpenProjectSwitch} />
          </div>
          <button type="button" className="mobile-project-summary" onClick={onOpenProjectSwitch}>
            <span>{currentProject?.name || '暂无授权项目'}</span>
            <Tag color={currentProject?.status === 'active' ? 'green' : 'default'}>{currentProject?.status === 'active' ? '使用中' : '不可用'}</Tag>
          </button>
        </header>
        <main className="mobile-content">{children}</main>
        <nav className="mobile-tabbar" aria-label="移动端导航">
          {NAV_ITEMS.map((item) => (
            <Button key={item.key} type="text" className={activeView === item.key ? 'mobile-tab active' : 'mobile-tab'} onClick={() => onNavigate?.(item.key)} icon={item.icon}>
              {item.label}
            </Button>
          ))}
        </nav>
      </div>
    </div>
  );
}
