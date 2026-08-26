import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App, { getSafeViewForRole } from './App';
import AttendancePage, { buildAttendanceRows, canViewCapture, createLeaveRecord, getCaptureForEvent, getPermissionMarkers, isPersonInProject, voidSupplementRecord } from './pages/AttendancePage';
import AlertsPage, { buildAgeWarningAlerts, getAlertReceiverLabel, getVisibleAlerts, markAlertRead, syncDeviceAlertState } from './pages/AlertsPage';
import PeoplePage, { buildPersonRecord, getBoundProjectMessage, getBoundProjectNames } from './pages/PeoplePage';
import DevicesPage from './pages/DevicesPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import ReportsPage, { getReportRows } from './pages/ReportsPage';
import WorkbenchPage from './pages/WorkbenchPage';
import UsersPermissionsPage, { changeAccountStatus, createAccount, resetAccountCredentials, updateAccountStatus } from './pages/UsersPermissionsPage';
import HealthAgePage, { buildAuthorizationAuditLog, buildAuthorizationRecord, getVisibleAuthorizations, revokeAuthorization, validateAuthorizationScope } from './pages/HealthAgePage';
import OperationLogsPage from './pages/OperationLogsPage';
import mockData from './data/mockData';
import { applyLeaveAndSupplement, calculateDailyAttendance } from './domain/attendance';
import { canAccessDevice, canOperate } from './domain/permissions';
import { appendOperationLog, applyProjectLifecycle, buildDeviceOperationLog, buildDeviceRegistrationLog, buildPersonEditLog, buildProjectEditLog, buildProjectLifecycleLog, createLifecycleState, getAgeAccessState, getProjectAttendanceRows, getProjectDevicePermission, getSpecialAuthorizationStatus, getTodayAttendance, hasEffectiveProjectDevice, makeDeviceRows, makePersonRows, moveDeviceBinding, unbindDevice } from './pages/pageUtils';
import { canManageProjectAction } from './pages/ProjectListPage';

const admin = { role: 'systemAdmin', accountId: 'account-admin' };

describe('Task 5 PC pages', () => {
  it('renders the five management page headings and core business boundaries', () => {
    const markup = renderToStaticMarkup(
      <>
        <AttendancePage role={admin} lifecycleState={createLifecycleState()} />
        <AlertsPage role={admin} lifecycleState={createLifecycleState()} />
        <ReportsPage role={admin} lifecycleState={createLifecycleState()} />
        <UsersPermissionsPage role={admin} lifecycleState={createLifecycleState()} />
        <OperationLogsPage role={admin} lifecycleState={createLifecycleState()} />
      </>,
    );

    expect(markup).toContain('考勤管理');
    expect(markup).toContain('设备原始事件');
    expect(markup).toContain('平台考勤结果');
    expect(markup).toContain('补录');
    expect(markup).toContain('告警中心');
    expect(markup).toContain('年龄预警按阈值和提前 30 天生成站内消息');
    expect(markup).toContain('报表中心');
    expect(markup).toContain('平台考勤结果可导出');
    expect(markup).toContain('用户与权限');
    expect(markup).toContain('页面 / 字段 / 操作 / 数据范围');
    expect(markup).toContain('操作日志');
    expect(markup).toContain('只读');
  });

  it('keeps raw events deduplicated while aggregating effective records into platform results', () => {
    const rows = buildAttendanceRows({
      role: admin,
      projects: mockData.projects,
      rawEvents: mockData.rawEvents,
      leaves: mockData.leaveRecords,
      supplements: mockData.supplementRecords,
      date: '2026-08-25',
    });
    const personOne = rows.find((row) => row.personId === 'person-1' && row.projectId === 'project-a');

    expect(personOne.rawRecords).toHaveLength(2);
    expect(personOne.status).toBe('正常');
    expect(personOne.effectiveRecords).toHaveLength(2);
    expect(personOne.firstEntryAt).toContain('08:58:00');
    expect(personOne.lastExitAt).toContain('08:58:00');
  });

  it('marks an alert read in local state without changing its history record', () => {
    const next = markAlertRead(mockData.alerts, 'alert-1');

    expect(next.find((item) => item.id === 'alert-1')).toMatchObject({ read: true });
    expect(mockData.alerts.find((item) => item.id === 'alert-1')).not.toHaveProperty('read');
  });

  it('opens, disables, and resets accounts while requiring worker accounts to link an existing person', () => {
    const opened = updateAccountStatus(mockData.accounts, 'account-guard-a', 'active');
    const disabled = updateAccountStatus(opened, 'account-guard-a', 'inactive');
    const reset = resetAccountCredentials(disabled, 'account-guard-a');
    const created = createAccount({ name: '新施工人员', role: 'worker', personId: 'person-2', projectIds: ['project-a'] }, reset);
    const invalid = createAccount({ name: '未关联人员', role: 'worker', projectIds: ['project-a'] }, reset);

    expect(reset.find((item) => item.accountId === 'account-guard-a')).toMatchObject({ status: 'inactive', credentialStatus: 'reset' });
    expect(created.error).toBeUndefined();
    expect(created.account).toMatchObject({ role: 'worker', personId: 'person-2', status: 'active' });
    expect(invalid.error).toContain('必须关联已有人员');
  });

  it('derives person account state from the shared accounts collection', () => {
    const rows = makePersonRows(admin, createLifecycleState(), undefined, mockData.projectPeople, [], mockData.people, mockData.projects, mockData.accounts);
    expect(rows.find((row) => row.id === 'person-1')).toMatchObject({ accountName: '施工人员张伟', accountBindingState: 'bound', accountStatus: 'active' });
    expect(rows.find((row) => row.id === 'person-2')).toMatchObject({ accountBindingState: 'unbound' });

    const inactiveAccounts = mockData.accounts.map((account) => account.accountId === 'account-worker-1' ? { ...account, status: 'inactive' } : account);
    expect(makePersonRows(admin, createLifecycleState(), undefined, mockData.projectPeople, [], mockData.people, mockData.projects, inactiveAccounts).find((row) => row.id === 'person-1')).toMatchObject({ accountBindingState: 'inactive', accountStatus: 'inactive' });
    expect(renderToStaticMarkup(<PeoplePage role={admin} lifecycleState={createLifecycleState()} accounts={mockData.accounts} />)).toContain('账号绑定');
    expect(renderToStaticMarkup(<PeoplePage role={{ role: 'projectOwner', projectIds: ['project-a'] }} lifecycleState={createLifecycleState()} accounts={mockData.accounts} />)).not.toContain('绑定账号');
  });

  it('renders worker account binding operations in the read-only log page', () => {
    const markup = renderToStaticMarkup(<OperationLogsPage role={admin} operationLogs={[
      { id: 'account-bind-log', projectId: 'project-a', operatorId: 'account-admin', operation: 'accountBind', module: 'people', targetId: 'person-2', accountId: 'account-worker-2', occurredAt: '2026-08-25 12:00', reason: '绑定施工人员账号' },
      { id: 'account-unbind-log', projectId: 'project-a', operatorId: 'account-admin', operation: 'accountUnbind', module: 'people', targetId: 'person-2', accountId: 'account-worker-2', occurredAt: '2026-08-25 12:01', reason: '解除人员账号关联' },
    ]} />);

    expect(markup).toContain('绑定施工人员账号');
    expect(markup).toContain('解除施工人员账号关联');
  });

  it('shows bound project count as a compact detail trigger', () => {
    const rows = makePersonRows(admin, createLifecycleState(), undefined, mockData.projectPeople, [], mockData.people, mockData.projects, mockData.accounts);
    const person = rows.find((row) => row.id === 'person-1');
    const markup = renderToStaticMarkup(<PeoplePage role={admin} lifecycleState={createLifecycleState()} accounts={mockData.accounts} />);

    expect(getBoundProjectNames(person)).toEqual(['滨江综合体项目', '北站枢纽项目']);
    expect(getBoundProjectMessage(person)).toContain('已绑定项目：滨江综合体项目、北站枢纽项目');
    expect(markup).toContain('绑定项目');
    expect(markup).not.toContain('项目及关系');
    expect(markup).not.toContain('在场状态');
    expect(markup).not.toContain('项目数');
  });

  it('rejects a worker account when the linked person is not in the selected project', () => {
    const invalid = createAccount({ name: '跨项目施工人员', role: 'worker', personId: 'person-2', projectIds: ['project-b'] }, mockData.accounts);

    expect(invalid.error).toContain('必须属于所选项目');
  });

  it('only opens a worker account for an active person-project relationship', () => {
    const draft = { name: '关系状态施工人员', role: 'worker', personId: 'person-2', projectIds: ['project-a'] };
    const statuses = ['temporary', 'inactive', 'revoked'];

    statuses.forEach((status) => {
      const result = createAccount(draft, mockData.accounts, { projectPeople: [{ projectId: 'project-a', personId: 'person-2', status }] });
      expect(result.error).toContain('必须属于所选项目');
      expect(result.account).toBeUndefined();
    });

    expect(createAccount(draft, mockData.accounts, { projectPeople: [{ projectId: 'project-a', personId: 'person-2', status: 'active' }] }).error).toBeUndefined();
  });

  it('reopening a disabled worker account reuses the active relationship check', () => {
    const account = { accountId: 'account-disabled-worker', name: '停用施工人员', role: 'worker', personId: 'person-2', projectIds: ['project-a'], status: 'inactive' };
    const accounts = [account];

    ['temporary', 'inactive', 'revoked'].forEach((status) => {
      const result = changeAccountStatus(accounts, account.accountId, 'active', { projectPeople: [{ projectId: 'project-a', personId: 'person-2', status }] });
      expect(result.error).toContain('必须属于所选项目');
      expect(result.accounts[0].status).toBe('inactive');
    });

    const reopened = changeAccountStatus(accounts, account.accountId, 'active', { projectPeople: [{ projectId: 'project-a', personId: 'person-2', status: 'active' }] });
    expect(reopened.error).toBeUndefined();
    expect(reopened.accounts[0].status).toBe('active');
  });

  it('registers shared leave data and keeps leave ahead of holiday or rest-day status', () => {
    const leave = createLeaveRecord({ projectId: 'project-a', personId: 'person-1', date: '2026-10-01', endDate: '2026-10-02', reason: '个人事假' }, 'account-admin');
    const rows = buildAttendanceRows({ role: admin, projects: mockData.projects, leaves: [leave], date: '2026-10-01' });
    const row = rows.find((item) => item.projectId === 'project-a' && item.personId === 'person-1');

    expect(leave).toMatchObject({ status: 'approved', operatorId: 'account-admin', reason: '个人事假', endDate: '2026-10-02' });
    expect(row.status).toBe('请假');
    expect(row.leave).toMatchObject({ id: leave.id });
  });

  it('exposes expired-device-release and permission-mismatch markers without changing raw events', () => {
    const event = mockData.rawEvents.find((item) => item.id === 'event-3-expired-allowed');
    const result = buildAttendanceRows({ role: admin, projects: mockData.projects, date: '2026-08-25' }).find((item) => item.projectId === 'project-b' && item.personId === 'person-3');
    const marker = getPermissionMarkers(event);

    expect(marker).toMatchObject({ expiredPermission: true, permissionMismatch: true, deviceRelease: '设备放行' });
    expect(result.effectiveRecords.find((item) => item.id === event.id)).toMatchObject({ expiredPermission: true, permissionMismatch: true });
    expect(mockData.rawEvents.find((item) => item.id === event.id)).not.toHaveProperty('permissionMismatch');
  });

  it('creates, modifies, and revokes authorization with audit log entries', () => {
    const authorization = buildAuthorizationRecord({ authorizer: '系统管理员', basis: '专项授权', projectId: 'project-a', personId: 'person-1', type: '临时夜班', effectiveAt: '2026-08-01', expiresAt: '2026-09-01' }, 'authorization-local-1');
    const revoked = revokeAuthorization([authorization], authorization.id, '不再需要');

    expect(authorization).toMatchObject({ id: 'authorization-local-1', authorizer: '系统管理员', effectiveAt: '2026-08-01T00:00:00', expiresAt: '2026-09-01T00:00:00' });
    expect(revoked[0]).toMatchObject({ status: 'revoked', revokeReason: '不再需要' });
    expect(buildAuthorizationAuditLog(authorization, 'create', 'account-admin')).toMatchObject({ operation: 'specialAuthorizationCreate', module: 'health', targetId: authorization.id });
    expect(buildAuthorizationAuditLog(authorization, 'update', 'account-admin')).toMatchObject({ operation: 'specialAuthorizationUpdate' });
    expect(buildAuthorizationAuditLog(revoked[0], 'revoke', 'account-admin')).toMatchObject({ operation: 'specialAuthorizationRevoke', reason: '不再需要' });
  });

  it('closes only the device-offline alert when its device becomes online', () => {
    const next = syncDeviceAlertState(mockData.alerts, [{ id: 'device-a-out', online: true }]);
    const offline = next.find((item) => item.id === 'alert-3');

    expect(offline).toMatchObject({ type: 'device-offline', status: 'closed' });
    expect(next.find((item) => item.id === 'alert-4')).toMatchObject({ type: 'sync-failed', status: 'open' });
    expect(next.find((item) => item.id === 'alert-2')).toBeUndefined();
  });

  it('uses only explicit capture records, enforces capture permission, and voids supplements with an audit reason', () => {
    const eventWithCapture = mockData.rawEvents.find((event) => event.id === 'event-1-live');
    const eventWithoutCapture = mockData.rawEvents.find((event) => event.id === 'event-6-other-device');
    const voided = voidSupplementRecord(mockData.supplementRecords, 'supplement-1', '重复补录');

    expect(getCaptureForEvent(eventWithCapture)).toMatchObject({ id: 'capture-success', eventId: 'event-1-live' });
    expect(getCaptureForEvent(eventWithoutCapture)).toBeUndefined();
    expect(canViewCapture(admin, eventWithCapture, getCaptureForEvent(eventWithCapture))).toBe(true);
    expect(voided.find((item) => item.id === 'supplement-1')).toMatchObject({ voided: true, status: 'voided', voidReason: '重复补录' });
    expect(mockData.supplementRecords.find((item) => item.id === 'supplement-1')).not.toHaveProperty('voidReason');
  });

  it('appends immutable audit records for supplement void and account actions', () => {
    const next = appendOperationLog(mockData.operationLogs, { projectId: 'project-a', operatorId: 'account-admin', operation: 'supplementVoid', module: 'attendance', targetId: 'supplement-1', reason: '重复补录' });

    expect(next).toHaveLength(mockData.operationLogs.length + 1);
    expect(next.at(-1)).toMatchObject({ operation: 'supplementVoid', targetId: 'supplement-1', reason: '重复补录' });
    expect(mockData.operationLogs.at(-1)).not.toMatchObject({ operation: 'supplementVoid' });
  });

  it('lets an approved leave record take priority over a holiday attendance status', () => {
    const result = calculateDailyAttendance([], {
      projectId: 'project-a',
      personId: 'person-1',
      date: '2026-10-01',
      holidayDates: ['2026-10-01'],
      leaves: [{ projectId: 'project-a', personId: 'person-1', date: '2026-10-01', status: 'approved' }],
    });

    expect(result.status).toBe('请假');
  });

  it('keeps workers on the mobile app even if a management view is requested', () => {
    expect(getSafeViewForRole('worker', 'attendance')).toBe('mobileAttendance');
    expect(renderToStaticMarkup(<App initialRole="worker" initialView="operationLogs" />)).toContain('我的考勤');
  });

  it('uses shared leave records in workbench and report attendance calculations', () => {
    const leave = createLeaveRecord({ projectId: 'project-a', personId: 'person-1', date: '2026-08-25', reason: '临时请假' }, 'account-admin', 'leave-shared-1');
    const attendance = getTodayAttendance(admin, createLifecycleState(), [leave]);
    const report = getReportRows({ type: 'attendance', role: admin, lifecycleState: createLifecycleState(), projectId: 'project-a', date: '2026-08-25', leaves: [leave] });

    expect(attendance.excluded).toBeGreaterThan(0);
    expect(report.find((row) => row.personId === 'person-1')).toMatchObject({ status: '请假', leave: { id: 'leave-shared-1' } });
  });

  it('filters effective access by age while keeping warning access allowed', () => {
    expect(getAgeAccessState({ birthDate: '1966-09-01', asOfDate: '2026-08-25' })).toMatchObject({ status: 'warning', allowed: true });
    const people = makePersonRows(admin, createLifecycleState());
    const person = people.find((item) => item.id === 'person-3');
    const device = makeDeviceRows(admin, createLifecycleState()).find((item) => item.id === 'device-b-main');

    expect(person.projectRelationships.find((item) => item.projectId === 'project-b')).toMatchObject({ accessStatus: 'revoked', ageAccessState: 'forbidden' });
    expect(device).toMatchObject({ accessStatus: 'revoked', personnelPermission: 'revoked' });
    expect(canAccessDevice({ registered: true }, { ageAccessState: 'warning' })).toBe(true);
  });

  it('rejects undefined and explicitly unsupported operations for every role', () => {
    for (const operation of ['unknown', 'overtime', 'correctAttendance', 'alertLevel', 'approval', 'manualCloseAlert', 'remoteUnlock']) {
      expect(canOperate(admin, operation, { projectId: 'project-a' })).toBe(false);
      expect(canOperate({ role: 'projectOwner', projectIds: ['project-a'] }, operation, { projectId: 'project-a' })).toBe(false);
    }
  });

  it('uses shared alerts in the alert page and workbench', () => {
    const shared = [{ id: 'alert-shared-1', projectId: 'project-a', type: 'sync-failed', status: 'open', occurredAt: '2026-08-25 10:00', receivers: ['systemAdmin', 'projectOwner'] }];
    expect(renderToStaticMarkup(<AlertsPage role={admin} lifecycleState={createLifecycleState()} alerts={shared} />)).toContain('alert-shared-1');
    expect(renderToStaticMarkup(<WorkbenchPage role={admin} lifecycleState={createLifecycleState()} alerts={shared} />)).toContain('同步失败');
  });

  it('does not reactivate a revoked authorization when editing it', () => {
    const record = { id: 'authorization-revoked-1', status: 'revoked', projectId: 'project-a', personId: 'person-1', authorizer: '管理员', effectiveAt: '2026-08-01', expiresAt: '2026-09-01' };
    expect(buildAuthorizationRecord({ ...record, status: 'active' }, record.id, record)).toMatchObject({ id: record.id, status: 'revoked' });
  });

  it('validates leave, supplement, and special authorization person-project scope', () => {
    expect(isPersonInProject('project-a', 'person-1')).toBe(true);
    expect(isPersonInProject('project-a', 'person-3')).toBe(false);
    expect(validateAuthorizationScope({ projectId: 'project-a', personId: 'person-3' }, admin)).toContain('必须属于所选项目');
    expect(validateAuthorizationScope({ projectId: 'project-a', personId: 'person-1' }, { role: 'worker', personId: 'person-1', projectIds: ['project-a'] })).toContain('无权');
  });

  it('does not expose special-authorization operations to workers', () => {
    expect(renderToStaticMarkup(<HealthAgePage role={{ role: 'worker', personId: 'person-1', projectIds: ['project-a'] }} lifecycleState={createLifecycleState()} />)).not.toContain('新增特殊授权');
  });

  it('blocks access before, after, or when a special authorization is revoked', () => {
    const pending = { status: 'active', effectiveAt: '2026-09-01', expiresAt: '2026-10-01' };
    const active = { status: 'active', effectiveAt: '2026-08-01', expiresAt: '2026-09-01' };
    const expired = { status: 'active', effectiveAt: '2026-07-01', expiresAt: '2026-08-01' };
    const revoked = { status: 'revoked', effectiveAt: '2026-08-01', expiresAt: '2026-09-01' };
    const options = { birthDate: '1964-12-01', asOfDate: '2026-08-25' };

    expect(getAgeAccessState({ ...options, specialAuthorization: pending })).toMatchObject({ status: 'pending', allowed: false });
    expect(getAgeAccessState({ ...options, specialAuthorization: active })).toMatchObject({ status: 'allowed', allowed: true });
    expect(getAgeAccessState({ ...options, specialAuthorization: expired })).toMatchObject({ status: 'forbidden', allowed: false });
    expect(getAgeAccessState({ ...options, specialAuthorization: revoked })).toMatchObject({ status: 'forbidden', allowed: false });
    expect(canAccessDevice({ registered: true }, { ageAccessState: 'pending' })).toBe(false);
  });

  it('uses one authorization collection across person, device, and project views', () => {
    const authorization = { id: 'authorization-shared-1', projectId: 'project-b', personId: 'person-3', status: 'active', effectiveAt: '2026-08-01', expiresAt: '2026-09-01' };
    const state = createLifecycleState();
    expect(makePersonRows(admin, state, [authorization]).find((person) => person.id === 'person-3').projectRelationships.find((item) => item.projectId === 'project-b')).toMatchObject({ ageAccessState: 'allowed', accessStatus: 'revoked', effectivePermission: false });
    expect(makeDeviceRows(admin, state, [authorization]).find((device) => device.id === 'device-b-main')).toMatchObject({ accessStatus: 'revoked', effectivePermission: false });
    expect(renderToStaticMarkup(<PeoplePage role={admin} lifecycleState={state} authorizations={[authorization]} />)).toContain('特殊授权有效期内');
    expect(renderToStaticMarkup(<DevicesPage role={admin} lifecycleState={state} authorizations={[authorization]} />)).toContain('权限同步');
    expect(renderToStaticMarkup(<ProjectDetailPage role={admin} lifecycleState={state} selectedProjectId="project-b" authorizations={[authorization]} />)).toContain('考勤记录');
  });

  it('revokes person access when a project has no effective device', () => {
    const state = createLifecycleState();
    state.deviceOverrides['device-a-in'] = { projectId: undefined, disabled: true, archived: true };
    state.deviceOverrides['device-a-out'] = { projectId: undefined, disabled: true, archived: true };

    expect(hasEffectiveProjectDevice('project-a', state)).toBe(false);
    expect(makePersonRows(admin, state).find((person) => person.id === 'person-1').projectRelationships.find((item) => item.projectId === 'project-a')).toMatchObject({ accessStatus: 'revoked', permission: '禁止' });
  });

  it('filters shared alerts and authorizations by role data scope', () => {
    const alerts = [{ id: 'alert-a', projectId: 'project-a', receivers: ['projectOwner'] }, { id: 'alert-b', projectId: 'project-b', receivers: ['projectOwner'] }];
    const authorizations = [
      { id: 'auth-a', projectId: 'project-a', personId: 'person-1' },
      { id: 'auth-b', projectId: 'project-b', personId: 'person-3' },
    ];
    const owner = { role: 'projectOwner', projectIds: ['project-a'] };
    const worker = { role: 'worker', projectIds: ['project-a', 'project-b'], personId: 'person-1' };

    expect(getVisibleAlerts(owner, alerts)).toHaveLength(1);
    expect(getVisibleAuthorizations(owner, authorizations)).toHaveLength(1);
    expect(getVisibleAuthorizations(worker, authorizations)).toEqual([authorizations[0]]);
  });

  it('uses calculated project attendance status rather than personnel status', () => {
    const result = getProjectAttendanceRows({ role: admin, projectId: 'project-a', date: '2026-08-25', leaveRecords: [], supplements: [], rawEvents: [{ id: 'late-early', projectId: 'project-a', personId: 'person-1', deviceId: 'device-a-in', eventSerial: 'late-early', eventTime: '2026-08-25T09:30:00+08:00', personRegistered: true, faceRecognition: 'success', direction: 'in', doorOpened: true, devicePermission: 'allow' }, { id: 'late-early-out', projectId: 'project-a', personId: 'person-1', deviceId: 'device-a-out', eventSerial: 'late-early-out', eventTime: '2026-08-25T17:00:00+08:00', personRegistered: true, faceRecognition: 'success', direction: 'out', doorOpened: true, devicePermission: 'allow' }] });
    const person = result.find((row) => row.personId === 'person-1');

    expect(person).toMatchObject({ status: '正常', isLate: true, isEarlyLeave: true });
  });

  it('keeps supplements out of raw device events while using them in platform results', () => {
    const supplement = { id: 'supplement-layer-1', projectId: 'project-a', personId: 'person-1', date: '2026-08-25', direction: 'in', eventTime: '2026-08-25T09:10:00+08:00', recordType: 'supplement', approved: true };
    const result = applyLeaveAndSupplement([], { projectId: 'project-a', personId: 'person-1', date: '2026-08-25', supplements: [supplement] });

    expect(result.rawRecords).toEqual([]);
    expect(result.effectiveRecords).toMatchObject([{ id: 'supplement-layer-1', recordType: 'supplement' }]);
  });

  it('creates age-warning inbox alerts for system admins and project owners without severity', () => {
    const alerts = buildAgeWarningAlerts({
      asOfDate: '2026-08-25',
      projects: mockData.projects,
      people: [{ id: 'person-near-limit', name: '临界人员', birthDate: '1966-09-01' }],
      projectPeople: [{ projectId: 'project-a', personId: 'person-near-limit' }],
      authorizations: [],
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ type: 'age-warning', projectId: 'project-a', status: 'open', receivers: ['systemAdmin', 'projectOwner'] });
    expect(alerts[0]).not.toHaveProperty('severity');
  });

  it('revokes device, face, and access permissions when a device or project is disabled, and only restores after sync', () => {
    const stopped = applyProjectLifecycle(createLifecycleState(), 'project-a', 'inactive');
    const device = makeDeviceRows(admin, stopped).find((item) => item.id === 'device-a-out');

    expect(device).toMatchObject({ disabled: true, accessStatus: 'revoked', personnelPermission: 'revoked', facePermission: 'revoked' });

    const recovering = { ...stopped, projectOverrides: { ...stopped.projectOverrides, 'project-a': { status: 'active' } }, deviceOverrides: { ...stopped.deviceOverrides, 'device-a-in': { ...stopped.deviceOverrides['device-a-in'], lifecycleStatus: 'active', disabled: false, archived: false, online: true, syncStatus: 'syncing' } } };
    expect(makeDeviceRows(admin, recovering).find((item) => item.id === 'device-a-in')).toMatchObject({ online: true, syncStatus: 'syncing', accessStatus: 'revoked', personnelPermission: 'revoked', facePermission: 'revoked', devicePermission: 'deny' });
  });

  it('keeps platform effective permission false separate from device-side release after a failed first sync', () => {
    const device = makeDeviceRows(admin, createLifecycleState()).find((item) => item.id === 'device-a-in');
    const projectPermission = getProjectDevicePermission('project-a', createLifecycleState());
    const person = makePersonRows(admin, createLifecycleState()).find((item) => item.id === 'person-2');

    expect(device).toMatchObject({ effectivePermission: false, platformPermission: 'deny', devicePermission: 'allow', deviceSideAccess: true, permissionSync: 'failed', permissionMismatch: true, accessStatus: 'revoked' });
    expect(projectPermission).toMatchObject({ effectivePermission: false, devicePermission: 'allow', syncStatus: 'failed' });
    expect(person.projectRelationships.find((item) => item.projectId === 'project-a')).toMatchObject({ effectivePermission: false, permissionMismatch: true, deviceSideAccess: true });
    expect(canAccessDevice({ registered: true }, device)).toBe(false);
  });

  it('applies project lifecycle to a device using its current moved project binding', () => {
    const moved = updateDeviceBindingForTest('device-a-in', 'project-b');
    const projectBStopped = applyProjectLifecycle(moved, 'project-b', 'archived');
    const movedDevice = makeDeviceRows(admin, projectBStopped).find((item) => item.id === 'device-a-in');

    expect(movedDevice).toMatchObject({ projectId: 'project-b', lifecycleStatus: 'archived', disabled: true, accessStatus: 'revoked' });
    expect(projectBStopped.deviceOverrides['device-a-in']).toMatchObject({ lifecycleStatus: 'archived', archived: true });
    expect(projectBStopped.deviceOverrides['device-a-out']).toBeUndefined();
  });

  it('filters alerts by both data scope and receiver role', () => {
    const alerts = [
      { id: 'owner-alert', projectId: 'project-a', type: 'sync-failed', receivers: ['projectOwner'] },
      { id: 'admin-alert', projectId: 'project-a', type: 'sync-failed', receivers: ['systemAdmin'] },
      { id: 'worker-alert', projectId: 'project-a', personId: 'person-1', type: 'person-message', receivers: ['worker'] },
      { id: 'worker-device-alert', projectId: 'project-a', personId: 'person-1', type: 'device-offline', receivers: ['worker'] },
    ];

    expect(getVisibleAlerts({ role: 'projectOwner', projectIds: ['project-a'] }, alerts).map((item) => item.id)).toEqual(['owner-alert']);
    expect(getVisibleAlerts({ role: 'systemAdmin' }, alerts).map((item) => item.id)).toEqual(['admin-alert']);
    expect(getVisibleAlerts({ role: 'worker', projectIds: ['project-a'], personId: 'person-1' }, alerts).map((item) => item.id)).toEqual(['worker-alert']);
  });

  it('compares special authorization with full datetime precision and preserves datetime values', () => {
    const authorization = { status: 'active', effectiveAt: '2026-08-25T10:00:00+08:00', expiresAt: '2026-08-25T18:00:00+08:00' };

    expect(getAgeAccessState({ birthDate: '1964-12-01', asOfDate: '2026-08-25T09:59:59+08:00', specialAuthorization: authorization })).toMatchObject({ status: 'pending', allowed: false });
    expect(getAgeAccessState({ birthDate: '1964-12-01', asOfDate: '2026-08-25T10:00:00+08:00', specialAuthorization: authorization })).toMatchObject({ status: 'allowed', allowed: true });
    expect(getAgeAccessState({ birthDate: '1964-12-01', asOfDate: '2026-08-25T18:00:01+08:00', specialAuthorization: authorization })).toMatchObject({ status: 'forbidden', allowed: false });
    expect(getSpecialAuthorizationStatus(authorization, '2026-08-25T09:59:59+08:00')).toBe('pending');
    expect(buildAuthorizationRecord({ ...authorization, authorizer: '管理员', basis: '测试', projectId: 'project-a', personId: 'person-1', type: '临时授权' }, 'authorization-datetime').effectiveAt).toBe('2026-08-25T10:00:00+08:00');
  });

  it('builds immutable operation log entries for device, project, and person changes', () => {
    expect(buildDeviceOperationLog('device-a-in', { projectId: undefined, bindingStatus: '已解除' }, 'account-admin')).toMatchObject({ operation: 'deviceUnbind', module: 'devices', targetId: 'device-a-in' });
    expect(buildDeviceOperationLog('device-a-in', { projectId: 'project-b', previousProjectId: 'project-a', bindingStatus: '已绑定' }, 'account-admin')).toMatchObject({ operation: 'deviceMove', module: 'devices', projectId: 'project-b' });
    expect(buildDeviceOperationLog('device-a-in', { lifecycleStatus: 'archived', projectId: 'project-a' }, 'account-admin')).toMatchObject({ operation: 'deviceArchive', module: 'devices' });
    expect(buildProjectLifecycleLog('project-a', 'inactive', 'account-admin')).toMatchObject({ operation: 'projectStatus', module: 'projects', projectId: 'project-a' });
    expect(buildPersonEditLog('person-1', 'project-a', 'account-admin')).toMatchObject({ operation: 'personEdit', module: 'people', targetId: 'person-1' });
  });

  it('uses the same scoped alert set in workbench and project detail and displays actual receivers', () => {
    const alerts = [
      { id: 'owner-alert-visible', projectId: 'project-a', type: 'sync-failed', receivers: ['projectOwner'], status: 'open' },
      { id: 'admin-alert-hidden', projectId: 'project-a', type: 'device-offline', receivers: ['systemAdmin'], status: 'open' },
    ];
    const owner = { role: 'projectOwner', projectIds: ['project-a'] };
    const workbench = renderToStaticMarkup(<WorkbenchPage role={owner} lifecycleState={createLifecycleState()} alerts={alerts} />);

    expect(workbench).toContain('owner-alert-visible');
    expect(workbench).not.toContain('admin-alert-hidden');
    expect(getVisibleAlerts(owner, alerts)).toEqual([alerts[0]]);
    expect(getAlertReceiverLabel(alerts[0])).toBe('项目负责人');
  });

  it('persists person project relationships and initializes new person rows safely', () => {
    const result = buildPersonRecord({ name: '新人员', projectId: 'project-a', status: 'active' }, { projectPeople: [], projects: mockData.projects, user: admin });
    const unassigned = buildPersonRecord({ name: '待分配人员' }, { projectPeople: [], projects: mockData.projects, user: admin });

    expect(result.error).toBeUndefined();
    expect(result.person.projectRelationships).toEqual([expect.objectContaining({ projectId: 'project-a', personId: result.person.personId })]);
    expect(result.projectPeople).toEqual([expect.objectContaining({ projectId: 'project-a', personId: result.person.personId })]);
    expect(unassigned.error).toBeUndefined();
    expect(unassigned).toMatchObject({ person: { projectIds: [], projectCount: 0, projectRelationships: [] }, projectPeople: [] });
    expect(buildPersonRecord({ name: '越权人员', projectId: 'project-b', status: 'active' }, { projectPeople: [], projects: mockData.projects, user: { role: 'projectOwner', projectIds: ['project-a'] } }).error).toContain('无权');
  });

  it('keeps project names and uploaded person materials when creating a person', () => {
    const result = buildPersonRecord({
      name: '上传资料人员',
      projectId: 'project-a',
      faceImage: [{ uid: 'face-1', name: 'face.jpg' }],
      healthReport: [{ uid: 'health-1', name: 'health.jpg' }],
      qualifications: [{ uid: 'certificate-1', name: 'certificate-a.jpg' }, { uid: 'certificate-2', name: 'certificate-b.jpg' }],
    }, { projectPeople: [], projects: mockData.projects, user: admin });

    expect(result.person).toMatchObject({ registered: true, healthReportStatus: 'valid' });
    expect(result.person.projectRelationships[0]).toMatchObject({ projectId: 'project-a', projectName: '滨江综合体项目' });
    expect(result.person.qualifications).toHaveLength(2);
  });

  it('allows project lifecycle and edits only for system admins or scoped project owners', () => {
    const owner = { role: 'projectOwner', projectIds: ['project-a'] };

    expect(canManageProjectAction(admin, 'project-a', 'edit')).toBe(true);
    expect(canManageProjectAction(owner, 'project-a', 'edit')).toBe(true);
    expect(canManageProjectAction(owner, 'project-b', 'edit')).toBe(false);
    expect(canManageProjectAction(owner, undefined, 'create')).toBe(false);
  });

  it('keeps registered devices in the shared lifecycle and revokes them with their project', () => {
    const registered = [{ id: 'device-local-1', projectId: 'project-a', entranceId: 'entrance-a-in', registered: true, online: true, syncStatus: 'success' }];
    const state = applyProjectLifecycle(createLifecycleState(), 'project-a', 'inactive', registered);
    const row = makeDeviceRows(admin, state, mockData.specialAuthorizations, registered).find((item) => item.id === 'device-local-1');

    expect(row).toMatchObject({ projectId: 'project-a', disabled: true, accessStatus: 'revoked', personnelPermission: 'revoked', facePermission: 'revoked' });
  });

  it('retains binding history when unbinding and moving devices', () => {
    const device = { id: 'device-history-1', projectId: 'project-a', entranceId: 'entrance-a-in', entranceName: '东门入口', effectiveFrom: '2026-08-01', registered: true };
    const unbound = unbindDevice(device);
    const moved = moveDeviceBinding(device, { projectId: 'project-b', entranceId: 'entrance-b-main', entranceName: '主门出入口', direction: 'both' });

    expect(unbound.bindingHistory).toEqual([expect.objectContaining({ projectId: 'project-a', entrance: '东门入口', effectiveFrom: '2026-08-01', action: 'unbind', status: 'closed' })]);
    expect(moved.bindingHistory).toEqual([expect.objectContaining({ projectId: 'project-a', action: 'move', status: 'closed' })]);
    expect(moved).toMatchObject({ projectId: 'project-b', bindingStatus: '已绑定' });
  });

  it('creates shared logs for ordinary project edits and new device registration', () => {
    expect(buildProjectEditLog('project-a', 'account-admin')).toMatchObject({ operation: 'projectEdit', module: 'projects', targetId: 'project-a' });
    expect(buildDeviceRegistrationLog('device-local-1', 'account-admin')).toMatchObject({ operation: 'deviceRegister', module: 'devices', targetId: 'device-local-1' });
  });

  it('requires explicit alert receivers and does not infer recipients when missing', () => {
    expect(mockData.alerts.every((alert) => Array.isArray(alert.receivers))).toBe(true);
    expect(getAlertReceiverLabel({ id: 'alert-without-receivers' })).toBe('未配置');
    expect(getVisibleAlerts(admin, [{ id: 'alert-without-receivers', projectId: 'project-a', type: 'sync-failed' }])).toEqual([]);
    expect(buildAgeWarningAlerts({ asOfDate: '2026-08-25', people: [{ id: 'person-near-limit', birthDate: '1966-09-01' }], projectPeople: [{ projectId: 'project-a', personId: 'person-near-limit' }] })[0].receivers).toEqual(['systemAdmin', 'projectOwner']);
  });

  it('keeps edited people records in the shared source used by person rows', () => {
    const result = buildPersonRecord({ name: '共享新人员', projectId: 'project-a', status: 'active' }, { peopleRecords: mockData.people, projectPeople: [], projects: mockData.projects, user: admin });

    expect(result.peopleRecords).toContainEqual(expect.objectContaining({ id: result.person.id, name: '共享新人员' }));
    expect(makePersonRows(admin, createLifecycleState(), undefined, result.projectPeople, [], result.peopleRecords)).toContainEqual(expect.objectContaining({ id: result.person.id, name: '共享新人员' }));
  });

  it('keeps a saved profession when building person rows', () => {
    const result = buildPersonRecord({ name: '专业人员', profession: '塔吊司机' }, { peopleRecords: mockData.people, projectPeople: [], projects: mockData.projects, user: admin });
    const rows = makePersonRows(admin, createLifecycleState(), undefined, result.projectPeople, [], result.peopleRecords, mockData.projects);

    expect(result.person).toHaveProperty('profession', '塔吊司机');
    expect(rows).toContainEqual(expect.objectContaining({ id: result.person.id, profession: '塔吊司机' }));
  });

  it('uses App-provided registered devices when calculating people access', () => {
    const registered = [{ id: 'device-local-replacement', projectId: 'project-a', entranceId: 'entrance-a-in', registered: true, online: true, syncStatus: 'success' }];
    const person = makePersonRows(admin, createLifecycleState(), undefined, mockData.projectPeople, registered).find((item) => item.id === 'person-1');

    expect(person.projectRelationships.find((item) => item.projectId === 'project-a')).toMatchObject({ accessStatus: 'allowed', effectivePermission: true });
  });
});

function updateDeviceBindingForTest(deviceId, projectId) {
  const state = createLifecycleState();
  const device = mockData.devices.find((item) => item.id === deviceId);
  const moved = moveDeviceBinding(device, { projectId, entranceId: 'entrance-b-main', direction: 'both' });
  state.deviceOverrides[deviceId] = moved;
  return state;
}
