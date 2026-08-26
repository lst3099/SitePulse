import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { buildAgeWarningAlerts } from './pages/AlertsPage';
import AlertsPage from './pages/AlertsPage';
import OperationLogsPage from './pages/OperationLogsPage';
import HealthAgePage, { buildAuthorizationRecord } from './pages/HealthAgePage';
import DeviceBindingDrawer, { getDeviceBindingFormValues } from './components/DeviceBindingDrawer';
import { getReportRows, toCsv, downloadCsv } from './pages/ReportsPage';
import ReportsPage from './pages/ReportsPage';
import { makeDeviceRows, createLifecycleState, getAgeAccessState, getProjectDevicePermission, scopedProjects, toDateKey, toDatePickerValue, toDateTimeKey } from './pages/pageUtils';
import { closeRegistrationModal } from './pages/DevicesPage';
import mockData from './data/mockData';

const admin = { role: 'systemAdmin', accountId: 'account-admin' };

describe('代码质量复核行为', () => {
  it('uses shared device fields for device rows and project permission state', () => {
    const registered = [{
      id: 'device-quality-1', projectId: 'project-a', entranceId: 'entrance-a-in', registered: true,
      platformId: 'SHARED-PLATFORM-1', platformDeviceId: 'SHARED-PLATFORM-1', online: false,
      syncStatus: 'failed', permissionSync: 'failed', attendanceEnabled: false,
      accessStatus: 'revoked', personnelPermission: 'revoked', facePermission: 'revoked', devicePermission: 'deny',
    }];

    const row = makeDeviceRows(admin, createLifecycleState(), [], registered).find((item) => item.id === 'device-quality-1');
    const permission = getProjectDevicePermission('project-a', createLifecycleState(), 'device-quality-1', registered);

    expect(row).toMatchObject({ platformId: 'SHARED-PLATFORM-1', online: false, syncStatus: 'failed', attendanceEnabled: false, accessStatus: 'revoked' });
    expect(permission).toMatchObject({ effectivePermission: false, syncStatus: 'failed', devicePermission: 'deny' });
  });

  it('recalculates device age access and age warnings from shared people and relationships', () => {
    const peopleRecords = [{ id: 'person-shared-age', name: '共享年龄人员', birthDate: '1966-09-01' }];
    const projectPeople = [{ projectId: 'project-a', personId: 'person-shared-age' }];
    const registered = [{ id: 'device-age-1', projectId: 'project-a', entranceId: 'entrance-a-in', registered: true, online: true, syncStatus: 'success' }];
    const warningDevice = makeDeviceRows(admin, createLifecycleState(), [], registered, projectPeople, peopleRecords).find((item) => item.id === 'device-age-1');
    const expiredPeople = [{ ...peopleRecords[0], birthDate: '1964-01-01' }];
    const forbiddenDevice = makeDeviceRows(admin, createLifecycleState(), [], registered, projectPeople, expiredPeople).find((item) => item.id === 'device-age-1');
    const alerts = buildAgeWarningAlerts({ people: peopleRecords, projectPeople, asOfDate: '2026-08-25' });

    expect(warningDevice).toMatchObject({ accessStatus: 'allowed' });
    expect(forbiddenDevice).toMatchObject({ accessStatus: 'revoked', personnelPermission: 'revoked' });
    expect(alerts[0]).toMatchObject({ type: 'age-warning', personId: 'person-shared-age', receivers: ['systemAdmin', 'projectOwner'] });
  });

  it('uses App-provided project records across the workbench and project scope', () => {
    const projectsRecords = [{ ...mockData.projects[0], id: 'project-shared', name: '共享项目', status: 'active' }];
    const markup = renderToStaticMarkup(<App initialView="workbench" initialProjectsRecords={projectsRecords} />);

    expect(scopedProjects(admin, createLifecycleState(), projectsRecords)).toEqual([expect.objectContaining({ id: 'project-shared', name: '共享项目' })]);
    expect(markup).toContain('共享项目');
  });

  it('validates dates without throwing and preserves the project-local date portion across day boundaries', () => {
    expect(toDateKey('2026-02-30')).toBe('');
    expect(toDateKey('2026-08-31T23:59:59-07:00')).toBe('2026-08-31');
    expect(() => getAgeAccessState({ birthDate: '1960-02-30', asOfDate: 'not-a-date' })).not.toThrow();
  });

  it('converts stored datetime strings to DatePicker values and clears binding values', () => {
    expect(toDatePickerValue('2026-08-25T10:30:00').format('YYYY-MM-DD HH:mm:ss')).toBe('2026-08-25 10:30:00');
    expect(getDeviceBindingFormValues({ projectId: 'project-a', effectiveAt: '2026-08-25T10:30:00' }).effectiveAt.format('YYYY-MM-DD HH:mm:ss')).toBe('2026-08-25 10:30:00');
    expect(renderToStaticMarkup(<DeviceBindingDrawer open={false} role={admin} device={{ effectiveAt: '2026-08-25T10:30:00' }} projects={[]} entrances={[]} />)).not.toContain('Invalid Date');
  });

  it('escapes CSV cells and revokes object URLs after the download click', () => {
    expect(toCsv([{ value: 'a,b"c\nd' }], [{ label: '内容', value: (row) => row.value }])).toBe('"内容"\n"a,b""c\nd"');
    const clicked = [];
    const revoked = [];
    const previousCreate = URL.createObjectURL;
    const previousRevoke = URL.revokeObjectURL;
    const previousDocument = globalThis.document;
    vi.useFakeTimers();
    URL.createObjectURL = () => 'blob:quality';
    URL.revokeObjectURL = (url) => revoked.push(url);
    globalThis.document = { createElement: () => ({ set href(value) { this.url = value; }, set download(value) { this.filename = value; }, click() { clicked.push(this); } }) };
    try {
      expect(downloadCsv('quality.csv', 'csv')).toBe(true);
      expect(clicked).toHaveLength(1);
      expect(clicked[0]).toMatchObject({ url: 'blob:quality', filename: 'quality.csv' });
      expect(revoked).toEqual([]);
      vi.runAllTimers();
      expect(revoked).toEqual(['blob:quality']);
    } finally {
      vi.useRealTimers();
      URL.createObjectURL = previousCreate;
      URL.revokeObjectURL = previousRevoke;
      globalThis.document = previousDocument;
    }
  });

  it('resets the device registration form whenever the modal closes', () => {
    const form = { resetFields: () => {} };
    const reset = vi.spyOn(form, 'resetFields');
    closeRegistrationModal(form);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('uses shared project records for alert, log, and report project names', () => {
    const projectsRecords = [{ ...mockData.projects[0], name: '统一共享项目名' }];
    const alerts = [{ id: 'alert-quality-project', projectId: 'project-a', type: 'sync-failed', status: 'open', receivers: ['systemAdmin'], occurredAt: '2026-08-25 10:00' }];
    const logs = [{ id: 'log-quality-project', projectId: 'project-a', operatorId: 'account-admin', operation: 'edit', module: 'projects', occurredAt: '2026-08-25 10:00' }];
    expect(renderToStaticMarkup(<AlertsPage role={admin} projectsRecords={projectsRecords} alerts={alerts} />)).toContain('统一共享项目名');
    expect(renderToStaticMarkup(<OperationLogsPage role={admin} projectsRecords={projectsRecords} operationLogs={logs} />)).toContain('统一共享项目名');
    expect(getReportRows({ type: 'events', role: admin, projectsRecords, date: '2026-08-25' }).find((row) => row.projectId === 'project-a')).toMatchObject({ projectName: '统一共享项目名' });
    expect(renderToStaticMarkup(<ReportsPage role={admin} projectsRecords={projectsRecords} />)).toContain('统一共享项目名');
  });

  it('uses shared registered devices when calculating health and age permission rows', () => {
    const projectsRecords = [{ id: 'project-health', name: '健康项目', status: 'active' }];
    const peopleRecords = [{ id: 'person-health', name: '健康人员', birthDate: '1990-01-01', healthReportStatus: 'valid' }];
    const projectPeople = [{ projectId: 'project-health', personId: 'person-health', status: 'active' }];
    const registeredDevices = [{ id: 'device-health', projectId: 'project-health', entranceId: 'entrance-health', registered: true, online: true, syncStatus: 'success', accessStatus: 'allowed', effectivePermission: true, devicePermission: 'allow' }];
    expect(renderToStaticMarkup(<HealthAgePage role={admin} projectsRecords={projectsRecords} peopleRecords={peopleRecords} projectPeople={projectPeople} registeredDevices={registeredDevices} />)).toContain('正常');
  });

  it('rejects invalid calendar dates in special authorization datetime values', () => {
    expect(toDateTimeKey('2026-02-30T10:00:00')).toBe('');
    expect(buildAuthorizationRecord({ projectId: 'project-a', personId: 'person-1', type: '临时授权', authorizer: '管理员', basis: '测试', effectiveAt: '2026-02-30T10:00:00', expiresAt: '2026-03-01T10:00:00' }).effectiveAt).toBe('');
    expect(toDateTimeKey('2026-08-25T10:00:00+08:00')).toBe('2026-08-25T10:00:00+08:00');
  });
});
