import React, { useMemo, useState } from 'react';
import {
  AlertOutlined,
  AppstoreOutlined,
  AuditOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  FormOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MobileOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  ToolOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Button, Layout, Menu, Select, Space, Typography } from 'antd';
import { canOperate, filterByDataScope, getHomeView } from '../domain/permissions';

const { Header, Sider, Content } = Layout;

const ROLE_LABELS = {
  systemAdmin: '系统管理员',
  projectOwner: '项目负责人',
  worker: '施工人员',
};

const KNOWN_ROLES = new Set(Object.keys(ROLE_LABELS));

const MENU_DEFINITIONS = [
  { key: 'workbench', label: '工作台', icon: <DashboardOutlined /> },
  { key: 'projectOverview', label: '项目管理', icon: <AppstoreOutlined /> },
  { key: 'people', label: '人员档案', icon: <TeamOutlined /> },
  { key: 'deviceAccess', label: '设备与门禁', icon: <SafetyCertificateOutlined /> },
  { key: 'accessRecords', label: '门禁记录', icon: <AuditOutlined /> },
  { key: 'tools', label: '工具管理', icon: <ToolOutlined /> },
  { key: 'alerts', label: '告警中心', icon: <AlertOutlined /> },
  { key: 'reports', label: '报表中心', icon: <FileTextOutlined /> },
  { key: 'basicData', label: '基础资料', icon: <DatabaseOutlined /> },
  { key: 'users', label: '用户与权限', icon: <UserOutlined />, systemOnly: true },
  { key: 'operationLogs', label: '操作日志', icon: <FormOutlined />, systemOnly: true },
];

function normalizeUser(role) {
  const user = typeof role === 'string' ? { role } : role || {};
  return KNOWN_ROLES.has(user.role) ? user : { ...user, role: null };
}

export function getShellMenu(role) {
  const user = normalizeUser(role);
  if (!user.role) return [];
  if (user.role === 'worker') {
    return [{ key: 'mobileAttendance', label: '移动端考勤', icon: <MobileOutlined /> }];
  }

  return MENU_DEFINITIONS
    .filter((item) => !item.systemOnly || user.role === 'systemAdmin')
    .map(({ systemOnly, ...item }) => item);
}

export default function AppShell({
  role,
  activeView,
  onNavigate,
  onRoleChange,
  onToggleMobile,
  mobilePreview = false,
  children,
}) {
  const user = normalizeUser(role);
  const [collapsed, setCollapsed] = useState(false);
  const menuItems = useMemo(() => getShellMenu(user), [user]);
  const homeView = getHomeView(user);
  const scopedProjects = filterByDataScope(
    user,
    (user.projectIds || []).map((projectId) => ({ projectId })),
  );

  return (
    <Layout className="app-shell">
      <Sider
        className="app-sider"
        theme="dark"
        width={232}
        collapsible
        collapsed={collapsed}
        collapsedWidth={0}
        trigger={null}
        breakpoint="md"
        onBreakpoint={setCollapsed}
      >
        <div className="brand">施工人员管理系统</div>
        <div className="brand-subtitle">人员 · 设备 · 考勤一体化</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={activeView || homeView ? [activeView || homeView] : []}
          items={menuItems}
          onClick={({ key }) => onNavigate?.(key)}
        />
        <div className="sider-footer">
          <span className="scope-dot" />
          {user.role === 'systemAdmin' ? '全量数据范围' : `${scopedProjects.length} 个项目范围`}
        </div>
      </Sider>
      <Layout>
        <Header className="app-header">
          <Button
            type="text"
            aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed((value) => !value)}
          />
          <Typography.Title level={3}>施工人员管理系统</Typography.Title>
          <div className="header-spacer" />
          <Space>
            <Button
              type={mobilePreview ? 'primary' : 'default'}
              icon={<MobileOutlined />}
              onClick={onToggleMobile}
            >
              APP 预览
            </Button>
            <Select
              aria-label="切换角色"
              value={user.role}
              options={Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))}
              onChange={onRoleChange}
              suffixIcon={<LogoutOutlined />}
            />
          </Space>
        </Header>
        <Content className="app-content">{children}</Content>
      </Layout>
    </Layout>
  );
}
