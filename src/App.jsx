import React, { useState } from 'react';
import { getHomeView } from './domain/permissions';
import AppShell from './components/AppShell';
import MobileShell from './components/MobileShell';
import PageHeader from './components/PageHeader';
import WorkbenchPage from './pages/WorkbenchPage';
import ProjectListPage from './pages/ProjectListPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import PeoplePage from './pages/PeoplePage';
import DevicesPage from './pages/DevicesPage';
import HealthAgePage from './pages/HealthAgePage';
import ToolsPage from './pages/ToolsPage';
import BasicDataPage from './pages/BasicDataPage';
import AttendancePage from './pages/AttendancePage';
import AlertsPage, { buildAgeWarningAlerts, closeRecoveredDeviceAlert } from './pages/AlertsPage';
import ReportsPage from './pages/ReportsPage';
import UsersPermissionsPage from './pages/UsersPermissionsPage';
import OperationLogsPage from './pages/OperationLogsPage';
import MyAttendancePage from './pages/mobile/MyAttendancePage';
import AttendanceOverviewPage from './pages/mobile/AttendanceOverviewPage';
import ProjectSwitchPage from './pages/mobile/ProjectSwitchPage';
import FaceSyncPage from './pages/mobile/FaceSyncPage';
import ProfilePage from './pages/mobile/ProfilePage';
import { MOBILE_VIEW_KEYS, getAuthorizedProjects, getCurrentPerson, getCurrentProject, getScopedPersonId } from './pages/mobile/mobileUtils';
import mockData from './data/mockData';
import { appendOperationLog, applyProjectLifecycle, buildDeviceOperationLog, createLifecycleState, updateDeviceOverride } from './pages/pageUtils';

const VIEW_META = {
  workbench: { title: '工作台', description: '查看项目、人员、设备与考勤运行概况。' },
  projectOverview: { title: '项目管理', description: '管理项目范围、考勤规则与现场配置。' },
  people: { title: '人员管理', description: '维护人员档案、项目关系与门禁资质。' },
  deviceAccess: { title: '设备与门禁', description: '查看设备连接、出入口与权限同步状态。' },
  deviceRegistration: { title: '设备登记', description: '登记已接入的门禁设备。' },
  attendance: { title: '考勤管理', description: '查看原始事件与日考勤结果。' },
  health: { title: '健康报告与年龄限制', description: '维护健康报告、资质证书与年龄规则。' },
  tools: { title: '工器具', description: '管理工器具领用与归还记录。' },
  alerts: { title: '告警中心', description: '跟踪权限、同步与现场安全告警。' },
  reports: { title: '报表中心', description: '生成项目人员与考勤报表。' },
  basicData: { title: '基础资料', description: '维护系统基础字典与项目资料。' },
  users: { title: '用户与权限', description: '管理账号、角色与数据范围。' },
  operationLogs: { title: '操作日志', description: '追溯关键操作与业务变更。' },
  mobileAttendance: { title: '移动端考勤', description: '施工人员使用移动端完成考勤与状态查看。' },
};

export function getSafeViewForRole(role, requestedView) {
  const roleName = typeof role === 'string' ? role : role?.role;
  if (roleName === 'worker') return MOBILE_VIEW_KEYS.has(requestedView) ? requestedView : 'mobileAttendance';
  return requestedView;
}

export function resolveRoleContext(nextRole) {
  if (nextRole && typeof nextRole === 'object') return nextRole;
  return mockData.accounts.find((account) => account.role === nextRole) || { role: nextRole };
}

export default function App({ initialRole = 'systemAdmin', initialView, initialLifecycleState, initialAuthorizations, authorizationRecords: providedAuthorizationRecords, initialProjectsRecords, projectsRecords: providedProjectsRecords, initialProjectPeople, initialPeopleRecords, peopleRecords: providedPeopleRecords, initialRegisteredDevices, registeredDevices: providedRegisteredDevices, devices: providedDevices, permissionSyncRecords: providedPermissionSyncRecords, leaveRecords: providedLeaveRecords, attendance: providedAttendance, initialCurrentProjectId, currentProjectId: providedCurrentProjectId, currentPersonId: providedCurrentPersonId, previewPersonId: providedPreviewPersonId, initialMobilePreview = false }) {
  const [role, setRole] = useState(() => resolveRoleContext(initialRole));
  const [activeView, setActiveView] = useState(initialView || getHomeView(resolveRoleContext(initialRole)));
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [mobilePreview, setMobilePreview] = useState(initialMobilePreview);
  const [lifecycleState, setLifecycleState] = useState(() => initialLifecycleState || createLifecycleState());
  const [projectsRecords, setProjectsRecords] = useState(() => providedProjectsRecords ?? initialProjectsRecords ?? mockData.projects);
  const [peopleRecords, setPeopleRecords] = useState(() => providedPeopleRecords ?? initialPeopleRecords ?? mockData.people);
  const [projectPeople, setProjectPeople] = useState(() => initialProjectPeople ?? mockData.projectPeople);
  const [registeredDevices, setRegisteredDevices] = useState(() => providedRegisteredDevices ?? initialRegisteredDevices ?? []);
  const [devices] = useState(() => providedDevices ?? mockData.devices);
  const [permissionSyncRecords, setPermissionSyncRecords] = useState(() => providedPermissionSyncRecords ?? mockData.permissionSyncRecords);
  const [authorizations, setAuthorizations] = useState(() => providedAuthorizationRecords ?? initialAuthorizations ?? mockData.specialAuthorizations);
  const [supplements, setSupplements] = useState(() => mockData.supplementRecords);
  const [leaveRecords, setLeaveRecords] = useState(() => providedLeaveRecords ?? mockData.leaveRecords);
  const [attendance] = useState(() => providedAttendance ?? mockData.rawEvents);
  const [currentProjectId, setCurrentProjectId] = useState(() => providedCurrentProjectId || initialCurrentProjectId || resolveRoleContext(initialRole).projectIds?.[0] || mockData.projects[0]?.id);
  const [currentPersonId, setCurrentPersonId] = useState(() => providedCurrentPersonId || resolveRoleContext(initialRole).personId || 'person-1');
  const [alerts, setAlerts] = useState(() => [...mockData.alerts, ...buildAgeWarningAlerts({ authorizations: initialAuthorizations ?? mockData.specialAuthorizations, people: peopleRecords, projectPeople, projects: projectsRecords })]);
  const [operationLogs, setOperationLogs] = useState(() => mockData.operationLogs);
  const safeActiveView = getSafeViewForRole(role, activeView);
  const view = VIEW_META[safeActiveView] || VIEW_META.workbench;

  const handleRoleChange = (nextRole) => {
    const nextContext = resolveRoleContext(nextRole);
    setRole(nextContext);
    setActiveView(getHomeView(nextContext));
    setSelectedProjectId(null);
    setCurrentProjectId(nextContext.projectIds?.[0] || mockData.projects[0]?.id);
    setCurrentPersonId(nextContext.personId || 'person-1');
  };

  const handleNavigate = (nextView) => {
    const safeView = getSafeViewForRole(role, nextView);
    if (safeView !== 'projectOverview') setSelectedProjectId(null);
    setActiveView(safeView);
  };

  const handleToggleMobile = () => {
    const next = !mobilePreview;
    setMobilePreview(next);
    setActiveView(next ? 'mobileAttendance' : getHomeView(role));
  };

  const mobileRole = role;
  const mobileProject = getCurrentProject(mobileRole, currentProjectId, projectsRecords, peopleRecords, projectPeople);
  const mobilePersonId = getScopedPersonId({ user: role, requestedPersonId: currentPersonId, previewPersonId: role.role === 'worker' ? undefined : providedPreviewPersonId, people: peopleRecords, projects: projectsRecords, projectPeople });
  const mobilePerson = getCurrentPerson({ personId: mobilePersonId }, peopleRecords);
  const mobileView = MOBILE_VIEW_KEYS.has(getSafeViewForRole(mobileRole, activeView)) ? getSafeViewForRole(mobileRole, activeView) : 'mobileAttendance';

  const handleMobileProjectChange = (projectId) => {
    if (getAuthorizedProjects(role, projectsRecords, peopleRecords, projectPeople).some((project) => project.id === projectId)) setCurrentProjectId(projectId);
  };

  const handleRetrySync = (deviceId) => {
    setPermissionSyncRecords((current) => current.some((record) => record.deviceId === deviceId)
      ? current.map((record) => record.deviceId === deviceId ? { ...record, status: 'syncing', retryAt: '2026-08-25 12:00' } : { ...record })
      : [...current, { id: `sync-local-${deviceId}`, deviceId, status: 'syncing', retryAt: '2026-08-25 12:00' }]);
    handleDeviceChange(deviceId, { syncStatus: 'syncing', permissionSync: 'syncing' });
  };

  const renderMobileView = () => {
    if (mobileView === 'mobileOverview') return <AttendanceOverviewPage project={mobileProject} currentPersonId={mobilePersonId} attendance={attendance} leaveRecords={leaveRecords} supplements={supplements} />;
    if (mobileView === 'mobileProjects') return <ProjectSwitchPage role={mobileRole} currentProjectId={mobileProject?.id} projectsRecords={projectsRecords} peopleRecords={peopleRecords} projectPeople={projectPeople} registeredDevices={registeredDevices} onSwitch={handleMobileProjectChange} />;
    if (mobileView === 'mobileFaceSync') return <FaceSyncPage project={mobileProject} person={mobilePerson} devices={devices} registeredDevices={registeredDevices} permissionSyncRecords={permissionSyncRecords} lifecycleState={lifecycleState} onRetry={handleRetrySync} />;
    if (mobileView === 'mobileProfile') return <ProfilePage person={mobilePerson} project={mobileProject} onOpenFaceSync={() => handleNavigate('mobileFaceSync')} />;
    return <MyAttendancePage project={mobileProject} currentPersonId={mobilePersonId} peopleRecords={peopleRecords} attendance={attendance} leaveRecords={leaveRecords} supplements={supplements} />;
  };

  const mobileTitles = {
    mobileAttendance: '我的考勤',
    mobileOverview: '考勤概览',
    mobileProjects: '项目切换',
    mobileFaceSync: '人脸同步',
    mobileProfile: '个人信息',
  };

  const handleProjectLifecycle = (projectId, status) => {
    setLifecycleState((current) => applyProjectLifecycle(current, projectId, status, registeredDevices, projectPeople, projectsRecords));
    setProjectsRecords((current) => current.map((project) => project.id === projectId ? { ...project, status } : { ...project }));
  };

  const handleDeviceChange = (deviceId, values) => {
    setLifecycleState((current) => updateDeviceOverride(current, deviceId, values));
    const syncStatus = values?.syncStatus ?? values?.permissionSync;
    if (syncStatus) {
      const device = [...devices, ...registeredDevices].find((item) => item.id === deviceId);
      setPermissionSyncRecords((current) => current.some((record) => record.deviceId === deviceId)
        ? current.map((record) => record.deviceId === deviceId ? { ...record, status: syncStatus } : { ...record })
        : [...current, { id: `sync-local-${deviceId}`, deviceId, projectId: values.projectId ?? device?.projectId, status: syncStatus }]);
    }
    if (values?.online === true) setAlerts((current) => closeRecoveredDeviceAlert(current, deviceId, true));
    handleOperationLog(buildDeviceOperationLog(deviceId, values, role.accountId || 'account-admin'));
  };

  const handleOperationLog = (entry) => {
    setOperationLogs((current) => appendOperationLog(current, entry));
  };

  const refreshAgeWarnings = (current, nextPeople = peopleRecords, nextProjectPeople = projectPeople, nextAuthorizations = authorizations) => {
    const nextAge = buildAgeWarningAlerts({ authorizations: nextAuthorizations, people: nextPeople, projectPeople: nextProjectPeople, projects: projectsRecords });
    const nextIds = new Set(nextAge.map((alert) => alert.id));
    const history = current.filter((alert) => alert.type === 'age-warning').map((alert) => nextIds.has(alert.id)
      ? { ...alert, ...nextAge.find((item) => item.id === alert.id), read: alert.read }
      : { ...alert, status: 'closed', closedAt: alert.closedAt || '2026-08-25 12:00' });
    const created = nextAge.filter((alert) => !current.some((item) => item.id === alert.id));
    return [...current.filter((alert) => alert.type !== 'age-warning'), ...history, ...created];
  };

  const handlePeopleRecordsChange = (next) => {
    setPeopleRecords(next);
    setAlerts((current) => refreshAgeWarnings(current, next));
  };

  const handleProjectPeopleChange = (next) => {
    setProjectPeople(next);
    setAlerts((current) => refreshAgeWarnings(current, peopleRecords, next));
  };

  const handleAuthorizationsChange = (next) => {
    setAuthorizations(next);
    setAlerts((current) => refreshAgeWarnings(current, peopleRecords, projectPeople, next));
  };

  const renderView = () => {
    const renderViewKey = getSafeViewForRole(role, activeView);
    if (renderViewKey === 'workbench') {
      return <WorkbenchPage role={role} lifecycleState={lifecycleState} projectsRecords={projectsRecords} peopleRecords={peopleRecords} projectPeople={projectPeople} registeredDevices={registeredDevices} leaveRecords={leaveRecords} alerts={alerts} onNavigate={handleNavigate} mobilePreview={mobilePreview} onToggleMobile={handleToggleMobile} />;
    }
    if (renderViewKey === 'projectOverview') {
      return selectedProjectId
        ? <ProjectDetailPage role={role} lifecycleState={lifecycleState} projectsRecords={projectsRecords} peopleRecords={peopleRecords} projectPeople={projectPeople} registeredDevices={registeredDevices} selectedProjectId={selectedProjectId} authorizations={authorizations} leaveRecords={leaveRecords} supplements={supplements} alerts={alerts} onDeviceChange={handleDeviceChange} onBack={() => setSelectedProjectId(null)} />
        : <ProjectListPage role={role} lifecycleState={lifecycleState} projectsRecords={projectsRecords} onProjectsRecordsChange={setProjectsRecords} onProjectLifecycle={handleProjectLifecycle} onOperationLog={handleOperationLog} onOpenProject={setSelectedProjectId} />;
    }
    if (renderViewKey === 'people') return <PeoplePage role={role} lifecycleState={lifecycleState} projectsRecords={projectsRecords} peopleRecords={peopleRecords} onPeopleRecordsChange={handlePeopleRecordsChange} projectPeople={projectPeople} onProjectPeopleChange={handleProjectPeopleChange} registeredDevices={registeredDevices} authorizations={authorizations} onOperationLog={handleOperationLog} />;
    if (renderViewKey === 'deviceAccess' || renderViewKey === 'deviceRegistration') return <DevicesPage role={role} lifecycleState={lifecycleState} projectsRecords={projectsRecords} projectPeople={projectPeople} peopleRecords={peopleRecords} registeredDevices={registeredDevices} onRegisteredDevicesChange={setRegisteredDevices} authorizations={authorizations} onDeviceChange={handleDeviceChange} onOperationLog={handleOperationLog} registrationMode={renderViewKey === 'deviceRegistration'} />;
    if (renderViewKey === 'health') return <HealthAgePage role={role} lifecycleState={lifecycleState} projectsRecords={projectsRecords} peopleRecords={peopleRecords} projectPeople={projectPeople} registeredDevices={registeredDevices} authorizations={authorizations} onAuthorizationsChange={handleAuthorizationsChange} onOperationLog={handleOperationLog} />;
    if (renderViewKey === 'tools') return <ToolsPage role={role} />;
    if (renderViewKey === 'basicData') return <BasicDataPage role={role} />;
    if (renderViewKey === 'attendance') return <AttendancePage role={role} lifecycleState={lifecycleState} projectsRecords={projectsRecords} peopleRecords={peopleRecords} projectPeople={projectPeople} supplements={supplements} onSupplementsChange={setSupplements} leaveRecords={leaveRecords} onLeaveRecordsChange={setLeaveRecords} onOperationLog={handleOperationLog} />;
    if (renderViewKey === 'alerts') return <AlertsPage role={role} lifecycleState={lifecycleState} projectsRecords={projectsRecords} alerts={alerts} onAlertsChange={setAlerts} onOperationLog={handleOperationLog} />;
    if (renderViewKey === 'reports') return <ReportsPage role={role} lifecycleState={lifecycleState} projectsRecords={projectsRecords} peopleRecords={peopleRecords} projectPeople={projectPeople} supplements={supplements} leaveRecords={leaveRecords} />;
    if (renderViewKey === 'users') return <UsersPermissionsPage role={role} lifecycleState={lifecycleState} peopleRecords={peopleRecords} projectPeople={projectPeople} onOperationLog={handleOperationLog} />;
    if (renderViewKey === 'operationLogs') return <OperationLogsPage role={role} lifecycleState={lifecycleState} projectsRecords={projectsRecords} operationLogs={operationLogs} />;

    return <PageHeader title={view.title} description={view.description} breadcrumb={['首页', view.title]} />;
  };

  if (role.role === 'worker') {
    return <MobileShell title={mobileTitles[mobileView]} currentProject={mobileProject} activeView={mobileView} onNavigate={handleNavigate} onOpenProjectSwitch={() => handleNavigate('mobileProjects')} onBack={mobileView === 'mobileFaceSync' ? () => handleNavigate('mobileProfile') : undefined}>{renderMobileView()}</MobileShell>;
  }

  if (mobilePreview) {
    return <AppShell role={role} activeView={mobileView} onNavigate={handleNavigate} onRoleChange={handleRoleChange} onToggleMobile={handleToggleMobile} mobilePreview={mobilePreview}><MobileShell title={mobileTitles[mobileView]} currentProject={mobileProject} activeView={mobileView} onNavigate={handleNavigate} onOpenProjectSwitch={() => handleNavigate('mobileProjects')} onBack={mobileView === 'mobileFaceSync' ? () => handleNavigate('mobileProfile') : undefined}>{renderMobileView()}</MobileShell></AppShell>;
  }

  return (
    <AppShell
      role={role}
      activeView={safeActiveView}
      onNavigate={handleNavigate}
      onRoleChange={handleRoleChange}
      onToggleMobile={handleToggleMobile}
      mobilePreview={mobilePreview}
    >
      {renderView()}
    </AppShell>
  );
}
