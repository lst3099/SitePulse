import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import App, { getSafeViewForRole } from './App';
import { calculateDailyAttendance } from './domain/attendance';
import AttendanceOverviewPage, { buildMonthlyAttendance, summarizeMonthlyAttendance } from './pages/mobile/AttendanceOverviewPage';
import FaceSyncPage, { getFaceSyncRecords, retryFaceSync } from './pages/mobile/FaceSyncPage';
import MyAttendancePage, { getAttendanceSelectionKey, selectAttendanceDate } from './pages/mobile/MyAttendancePage';
import ProfilePage, { saveLocalPasswordSettings } from './pages/mobile/ProfilePage';
import ProjectSwitchPage, { getAuthorizedProjects, switchMobileProject } from './pages/mobile/ProjectSwitchPage';
import { selectAttendanceMonth } from './pages/mobile/AttendanceOverviewPage';
import MobileShell, { NAV_ITEMS } from './components/MobileShell';
import mockData from './data/mockData';

const render = (element) => renderToStaticMarkup(element);

const worker = {
  accountId: 'account-worker-1',
  role: 'worker',
  personId: 'person-1',
  projectIds: ['project-a', 'project-b'],
  status: 'active',
};

describe('Task 6 移动端原型', () => {
  it('worker 始终进入移动端壳层，不显示 PC 管理导航', () => {
    const markup = render(<App initialRole={worker} />);

    expect(markup).toContain('打卡记录');
    expect(markup).toContain('我的考勤');
    expect(markup).not.toContain('工作台');
    expect(markup).not.toContain('项目管理');
    expect(markup).not.toContain('用户与权限');
  });

  it('移动端页面均可按页面状态渲染', () => {
    const pages = [
      ['mobileAttendance', '我的考勤'],
      ['mobileOverview', '考勤概览'],
      ['mobileTools', '工具管理'],
      ['mobileProjects', '项目切换'],
      ['mobileFaceSync', '人脸同步'],
      ['mobileProfile', '个人信息'],
    ];

    pages.forEach(([view, title]) => {
      expect(render(<App initialRole={worker} initialView={view} />)).toContain(title);
    });
  });

  it('worker 的移动端页面不提供补卡、修正、远程开门或加班入口', () => {
    const markup = render(<App initialRole={worker} />);

    ['补卡', '修正', '远程开门', '加班'].forEach((label) => {
      expect(markup).not.toContain(label);
    });
  });

  it('移动端只展示本人和当前授权项目范围', () => {
    const markup = render(
      <App
        initialRole={{ ...worker, projectIds: ['project-a'] }}
        initialPeopleRecords={[
          { id: 'person-1', name: '张伟', registered: true, idCardNumber: 'mock-id-001', healthReportStatus: 'missing' },
          { id: 'person-2', name: '李娜', registered: true, idCardNumber: 'mock-id-002', healthReportStatus: 'valid' },
        ]}
        initialProjectsRecords={[
          { id: 'project-a', name: '授权项目', status: 'active', workStart: '09:00', workEnd: '18:00' },
          { id: 'project-b', name: '无权项目', status: 'active', workStart: '09:00', workEnd: '18:00' },
        ]}
        initialProjectPeople={[
          { projectId: 'project-a', personId: 'person-1', status: 'active' },
          { projectId: 'project-b', personId: 'person-2', status: 'active' },
        ]}
      />,
    );

    expect(markup).toContain('张伟');
    expect(markup).toContain('授权项目');
    expect(markup).not.toContain('李娜');
    expect(markup).not.toContain('无权项目');
  });

  it('多个出入口任一有效进出即为正常，原始设备事件保持可追溯', () => {
    const events = [
      { id: 'in-event', projectId: 'project-a', personId: 'person-1', deviceId: 'device-a-in', eventSerial: 'in-1', eventTime: '2026-08-25T09:05:00+08:00', source: 'realtime', personRegistered: true, faceRecognition: 'success', direction: 'in', devicePermission: 'allow' },
      { id: 'out-event', projectId: 'project-a', personId: 'person-1', deviceId: 'device-a-out', eventSerial: 'out-1', eventTime: '2026-08-25T17:30:00+08:00', source: 'history-replay', personRegistered: true, faceRecognition: 'success', direction: 'out', devicePermission: 'allow' },
    ];
    const result = calculateDailyAttendance(events, { projectId: 'project-a', personId: 'person-1', date: '2026-08-25', workStart: '09:00', workEnd: '18:00' });

    expect(result.status).toBe('正常');
    expect(result.effectiveRecords).toHaveLength(2);
    expect(result.rawRecords).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'in-event' }), expect.objectContaining({ id: 'out-event' })]));
    expect(events).toHaveLength(2);
  });

  it('无健康报告仍可进入施工人员移动端', () => {
    const markup = render(<App initialRole={{ ...worker, personId: 'person-2' }} initialView="mobileProfile" />);

    expect(markup).toContain('李娜');
    expect(markup).toContain('健康报告');
    expect(markup).not.toContain('禁止进入');
  });

  it('worker 请求 PC 页面时仍被限制到移动端视图', () => {
    expect(getSafeViewForRole(worker, 'people')).toBe('mobileAttendance');
    expect(getSafeViewForRole(worker, 'deviceAccess')).toBe('mobileAttendance');
  });

  it('项目切换只保留授权且启用的项目', () => {
    const projects = [
      { id: 'project-a', name: '启用项目', status: 'active' },
      { id: 'project-b', name: '停用项目', status: 'inactive' },
      { id: 'project-c', name: '归档项目', status: 'archived' },
    ];

    expect(getAuthorizedProjects(worker, projects).map((project) => project.id)).toEqual(['project-a']);
    expect(render(<ProjectSwitchPage role={worker} currentProjectId="project-a" projectsRecords={projects} />)).not.toContain('停用项目');
  });

  it('月度概览使用真实有效设备事件汇总', () => {
    const project = { id: 'project-a', name: '启用项目', status: 'active', workStart: '09:00', workEnd: '18:00' };
    const attendance = [{ projectId: 'project-a', personId: 'person-1', deviceId: 'device-a-in', eventSerial: 'real-1', eventTime: '2026-08-02T09:05:00+08:00', personRegistered: true, faceRecognition: 'success', direction: 'in', devicePermission: 'allow' }];
    const records = buildMonthlyAttendance({ project, currentPersonId: 'person-1', attendance, leaveRecords: [], month: '2026-08', asOfDate: '2026-08-02' });

    expect(summarizeMonthlyAttendance(records)).toMatchObject({ present: 1, late: 1, absent: 1 });
    expect(render(<AttendanceOverviewPage project={project} currentPersonId="person-1" attendance={attendance} leaveRecords={[]} month="2026-08" asOfDate="2026-08-02" />)).toContain('出勤');
  });

  it('人脸同步页只读展示状态、失败原因和重试，不提供现场采集', () => {
    const markup = render(<FaceSyncPage project={{ id: 'project-a', name: '启用项目' }} person={{ id: 'person-1', name: '张伟', registered: true }} registeredDevices={[{ id: 'device-local', projectId: 'project-a', faceSyncStatus: 'failed', failureReason: '平台同步超时' }]} />);

    expect(markup).toContain('同步失败');
    expect(markup).toContain('重试同步');
    expect(markup).toContain('平台同步超时');
    expect(markup).not.toContain('现场采集');
  });

  it('worker 忽略外部 currentPersonId，只展示账号绑定的本人', () => {
    const markup = render(<App initialRole={worker} currentPersonId="person-2" initialView="mobileProfile" />);

    expect(markup).toContain('张伟');
    expect(markup).not.toContain('李娜');
  });

  it('worker 仅使用账号人员的有效关系，不信任外部项目范围或无效关系', () => {
    const markup = render(
      <App
        initialRole={{ ...worker, personId: 'person-1', projectIds: ['project-b'] }}
        initialCurrentProjectId="project-b"
        initialView="mobileProfile"
        initialPeopleRecords={[{ id: 'person-1', name: '张伟', idCardNumber: '身份证-不应泄露', healthReportStatus: 'valid', registered: true }]}
        initialProjectsRecords={[{ id: 'project-b', name: '外部项目', status: 'active' }]}
        initialProjectPeople={[{ projectId: 'project-b', personId: 'person-1', status: 'temporary' }]}
      />,
    );

    expect(markup).toContain('暂无个人信息');
    expect(markup).not.toContain('外部项目');
    expect(markup).not.toContain('身份证-不应泄露');
  });

  it('管理员无 projectIds 时可预览全部启用项目内的显式人员', () => {
    const markup = render(
      <App
        initialRole={{ role: 'systemAdmin', accountId: 'account-admin' }}
        initialMobilePreview
        initialView="mobileProfile"
        initialCurrentProjectId="project-c"
        previewPersonId="person-3"
        initialProjectsRecords={[
          { id: 'project-a', name: '项目 A', status: 'active' },
          { id: 'project-c', name: '项目 C', status: 'active' },
        ]}
        initialPeopleRecords={[{ id: 'person-3', name: '王强', registered: true, idCardNumber: 'mock-id-003', healthReportStatus: 'valid' }]}
        initialProjectPeople={[{ projectId: 'project-c', personId: 'person-3', status: 'active' }]}
      />,
    );

    expect(markup).toContain('项目 C');
    expect(markup).toContain('王强');
  });

  it('项目负责人预览人员仍受 scopedProjects 限制', () => {
    const markup = render(
      <App
        initialRole={{ role: 'projectOwner', accountId: 'account-owner-a', projectIds: ['project-a'] }}
        initialMobilePreview
        initialView="mobileProfile"
        initialCurrentProjectId="project-a"
        previewPersonId="person-3"
        initialProjectsRecords={[{ id: 'project-a', name: '项目 A', status: 'active' }, { id: 'project-b', name: '项目 B', status: 'active' }]}
        initialPeopleRecords={[{ id: 'person-1', name: '张伟', registered: true }, { id: 'person-3', name: '王强', registered: true }]}
        initialProjectPeople={[{ projectId: 'project-a', personId: 'person-1' }, { projectId: 'project-b', personId: 'person-3' }]}
      />,
    );

    expect(markup).toContain('张伟');
    expect(markup).not.toContain('王强');
    expect(markup).not.toContain('项目 B');
  });

  it('FaceSyncPage 使用共享设备同步记录和 lifecycle 状态', () => {
    const records = getFaceSyncRecords({
      projectId: 'project-a',
      person: { id: 'person-1', registered: true },
      devices: [{ id: 'device-1', projectId: 'project-a', faceSync: 'success' }],
      permissionSyncRecords: [{ deviceId: 'device-1', projectId: 'project-a', status: 'failed', reason: '共享记录失败' }],
      lifecycleState: { deviceOverrides: { 'device-1': { syncStatus: 'syncing' } } },
    });

    expect(records).toEqual([expect.objectContaining({ status: 'failed' })]);
    expect(records[0].failureReason).toBe('共享记录失败');
  });

  it('FaceSync 不因人员已录入而伪造设备已同步，失败优先', () => {
    const pending = getFaceSyncRecords({
      projectId: 'project-a',
      person: { id: 'person-1', registered: true },
      devices: [{ id: 'device-1', projectId: 'project-a' }],
      permissionSyncRecords: [],
      lifecycleState: { deviceOverrides: {} },
    });
    const failed = getFaceSyncRecords({
      projectId: 'project-a',
      person: { id: 'person-1', registered: true },
      devices: [{ id: 'device-1', projectId: 'project-a' }],
      permissionSyncRecords: [{ deviceId: 'device-1', projectId: 'project-a', status: 'failed', reason: '同步失败' }],
      lifecycleState: { deviceOverrides: { 'device-1': { syncStatus: 'syncing' } } },
    });

    expect(pending[0].status).toBe('pending');
    expect(failed[0].status).toBe('failed');
  });

  it('移动端共享回调能切换授权项目、重试人脸同步、选择日期月份并反馈账号设置', () => {
    const switchCallback = vi.fn();
    const retryCallback = vi.fn();
    const projects = [{ id: 'project-a', name: '项目 A', status: 'active' }, { id: 'project-b', name: '项目 B', status: 'inactive' }];
    const projectPeople = [{ projectId: 'project-a', personId: 'person-1', status: 'active' }];

    expect(switchMobileProject({ user: worker, projectId: 'project-a', projects, projectPeople, onSwitch: switchCallback })).toBe('project-a');
    expect(switchCallback).toHaveBeenCalledWith('project-a');
    expect(switchMobileProject({ user: worker, projectId: 'project-b', projects, projectPeople, onSwitch: switchCallback })).toBeNull();

    const records = retryFaceSync([{ device: { id: 'device-1' }, status: 'failed', failureReason: '超时' }], 'device-1', retryCallback);
    expect(records[0]).toMatchObject({ status: 'syncing', failureReason: '' });
    expect(retryCallback).toHaveBeenCalledWith('device-1');

    expect(selectAttendanceDate({ format: () => '2026-08-26' })).toBe('2026-08-26');
    expect(getAttendanceSelectionKey('2026-08-26', 'project-a', 'person-1')).not.toBe(getAttendanceSelectionKey('2026-08-26', 'project-b', 'person-1'));
    expect(selectAttendanceMonth({ format: () => '2026-09' })).toBe('2026-09');
    expect(saveLocalPasswordSettings()).toMatchObject({ feedback: '密码已更新（本地演示状态）' });
  });

  it('我的考勤使用月历选择日期，考勤概览保留月份选择器', () => {
    const project = { id: 'project-a', name: '项目 A', status: 'active', workStart: '09:00', workEnd: '18:00' };
    const attendance = [{ projectId: 'project-a', personId: 'person-1', deviceId: 'device-1', eventSerial: 'event-1', eventTime: '2026-08-26T09:00:00+08:00', personRegistered: true, faceRecognition: 'success', direction: 'in', devicePermission: 'allow' }];

    expect(render(<MyAttendancePage project={project} currentPersonId="person-1" peopleRecords={[{ id: 'person-1', name: '张伟' }]} attendance={attendance} leaveRecords={[]} date="2026-08-26" />)).toContain('考勤月历');
    expect(render(<AttendanceOverviewPage project={project} currentPersonId="person-1" attendance={attendance} leaveRecords={[]} month="2026-08" asOfDate="2026-08-26" />)).toContain('ant-picker');
  });

  it('打卡记录跟随顶部当前项目展示，并在月历标记出勤日', () => {
    const projects = [
      { id: 'project-a', name: '项目 A', status: 'active', workStart: '09:00', workEnd: '18:00' },
      { id: 'project-b', name: '项目 B', status: 'active', workStart: '08:30', workEnd: '17:30' },
      { id: 'project-c', name: '外部工程 C', status: 'active', workStart: '09:00', workEnd: '18:00' },
    ];
    const attendance = [
      { id: 'event-a-in', projectId: 'project-a', personId: 'person-1', deviceId: 'device-a-in', eventSerial: 'a-in', eventTime: '2026-08-25T08:58:00+08:00', personRegistered: true, faceRecognition: 'success', direction: 'in', devicePermission: 'allow' },
      { id: 'event-b-out', projectId: 'project-b', personId: 'person-1', deviceId: 'device-b-main', eventSerial: 'b-out', eventTime: '2026-08-25T17:35:00+08:00', personRegistered: true, faceRecognition: 'success', direction: 'out', devicePermission: 'allow' },
    ];
    const markup = render(
      <App
        initialRole={worker}
        initialView="mobileAttendance"
        initialProjectsRecords={projects}
        initialPeopleRecords={[{ id: 'person-1', name: '张伟' }]}
        initialProjectPeople={[
          { projectId: 'project-a', personId: 'person-1', status: 'active' },
          { projectId: 'project-b', personId: 'person-1', status: 'active' },
        ]}
        attendance={attendance}
      />,
    );

    expect(markup).not.toContain('项目范围');
    expect(markup).not.toContain('全部项目');
    expect(markup).toContain('绑定 2 个项目');
    expect(markup).toContain('项目 A');
    expect(markup).not.toContain('项目 B');
    expect(markup).not.toContain('外部工程 C');
    expect(markup).toContain('上班打卡');
    expect(markup).not.toContain('下班打卡');
    expect(markup).toContain('2026年8月25日');
    expect(markup).toContain('calendar-dot');

    const switchedMarkup = render(
      <App
        initialRole={worker}
        initialView="mobileAttendance"
        initialCurrentProjectId="project-b"
        initialProjectsRecords={projects}
        initialPeopleRecords={[{ id: 'person-1', name: '张伟' }]}
        initialProjectPeople={[
          { projectId: 'project-a', personId: 'person-1', status: 'active' },
          { projectId: 'project-b', personId: 'person-1', status: 'active' },
        ]}
        attendance={attendance}
      />,
    );

    expect(switchedMarkup).toContain('项目 B');
    expect(switchedMarkup).not.toContain('项目 A');
    expect(switchedMarkup).toContain('下班打卡');
  });

  it('打卡记录页不重复展示日期选择和项目记录摘要，并使用多天有效打卡样例标记月历', () => {
    const markup = render(<MyAttendancePage project={mockData.projects[0]} currentPersonId="person-1" peopleRecords={mockData.people} attendance={mockData.rawEvents} leaveRecords={[]} date="2026-08-25" />);

    expect(markup).not.toContain('快速选择日期');
    expect(markup).not.toContain('涉及 1 个项目');
    expect(markup).not.toContain('有效记录 2 条');
    expect(markup.match(/calendar-dot/g)).toHaveLength(4);
  });

  it('个人信息提供本地账号设置和修改密码原型反馈入口', () => {
    const markup = render(<ProfilePage initialSettingsOpen project={{ id: 'project-a', name: '项目 A' }} person={{ id: 'person-1', name: '张伟', registered: true, idCardNumber: 'mock-id-001', healthReportStatus: 'valid' }} />);

    expect(markup).toContain('账号设置');
    expect(markup).toContain('修改密码');
    expect(markup).toContain('保存本地演示设置');
  });

  it('MobileShell 底部导航保留三个业务入口', () => {
    const markup = render(<MobileShell title="打卡记录" currentProject={{ name: '项目 A', status: 'active' }} activeView="mobileAttendance"><div>导航内容</div></MobileShell>);

    expect(NAV_ITEMS.map(({ key, label }) => [key, label])).toEqual([
      ['mobileAttendance', '打卡记录'],
      ['mobileTools', '工具管理'],
      ['mobileProfile', '我的'],
    ]);
    expect(markup).toContain('anticon-down');
    expect(markup).not.toContain('考勤概览');
    expect(markup).toContain('工具管理');
    expect(markup).toContain('打卡记录');
    expect(markup).toContain('我的');
    expect(markup).not.toContain('项目切换');
    expect(markup).not.toContain('人脸同步');
    expect(render(<App initialRole={worker} initialView="mobileTools" />)).toContain('工具管理');
    expect(render(<App initialRole={worker} initialView="mobileFaceSync" />)).toContain('人脸同步');
  });
});
