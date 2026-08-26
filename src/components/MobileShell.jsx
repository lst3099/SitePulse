import React from 'react';
import { ArrowLeftOutlined, ClockCircleOutlined, DownOutlined, ToolOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Tag, Typography } from 'antd';

const NAV_ITEMS = [
  { key: 'mobileAttendance', label: '打卡记录', icon: <ClockCircleOutlined /> },
  { key: 'mobileTools', label: '工具管理', icon: <ToolOutlined /> },
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
            <span className="mobile-header-placeholder" />
          </div>
          <button type="button" className="mobile-project-summary" onClick={onOpenProjectSwitch}>
            <span className="mobile-project-switch-label">
              <span>{currentProject?.name || '暂无授权项目'}</span>
              <DownOutlined aria-hidden="true" />
            </span>
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
