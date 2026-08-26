import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App, { getSafeViewForRole, resolveRoleContext } from './App';
import { canAccessDevice } from './domain/permissions';
import mockData from './data/mockData';
import { DeviceBindingForm } from './components/DeviceBindingDrawer';
import { saveProjectChanges } from './pages/ProjectListPage';
import { hasDeviceChangeHandler } from './pages/DevicesPage';
import { hasProjectLifecycleHandler } from './pages/ProjectListPage';
import {
  applyProjectLifecycle,
  bindDeviceToProject,
  createLifecycleState,
  getAgeAccessState,
  getEntranceOptions,
  makeDeviceRows,
  makePersonRows,
  moveDeviceBinding,
  canRestoreDevice,
  updateDeviceAfterSync,
  unbindDevice,
  scopedProjects,
} from './pages/pageUtils';

const admin = { role: 'systemAdmin' };

describe('Task 4 spec review behaviors', () => {
  it('propagates project lifecycle to project, device, and person access state without mutating history', () => {
    const history = JSON.stringify(mockData.rawEvents);
    const state = applyProjectLifecycle(createLifecycleState(), 'project-a', 'inactive');
    const device = makeDeviceRows(admin, state).find((item) => item.id === 'device-a-in');
    const person = makePersonRows(admin, state).find((item) => item.id === 'person-1');

    expect(state.projectOverrides['project-a']).toMatchObject({ status: 'inactive' });
    expect(device).toMatchObject({ lifecycleStatus: 'stopped', online: false, disabled: true });
    expect(person.projectRelationships).toEqual(expect.arrayContaining([
      expect.objectContaining({ projectId: 'project-a', accessStatus: 'revoked', permission: '禁止' }),
    ]));
    expect(JSON.stringify(mockData.rawEvents)).toBe(history);
  });

  it('restores a project and device as syncing while preserving a revoked history boundary', () => {
    const stopped = applyProjectLifecycle(createLifecycleState(), 'project-a', 'archived');
    const restored = applyProjectLifecycle(stopped, 'project-a', 'active');
    const device = makeDeviceRows(admin, restored).find((item) => item.id === 'device-a-in');

    expect(restored.projectOverrides['project-a']).toMatchObject({ status: 'active' });
    expect(device).toMatchObject({ online: true, disabled: false, archived: false, syncStatus: 'syncing' });
    expect(restored.historyBoundaries['project-a'].history).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'archived', readOnly: true }),
    ]));
  });

  it('keeps a stopped project from restoring its device online', () => {
    const stopped = applyProjectLifecycle(createLifecycleState(), 'project-a', 'inactive');
    const deviceId = 'device-a-in';
    const attemptedRestore = { ...stopped, deviceOverrides: { ...stopped.deviceOverrides, [deviceId]: { ...stopped.deviceOverrides[deviceId], online: true, disabled: false, lifecycleStatus: 'active' } } };
    const device = makeDeviceRows(admin, attemptedRestore).find((item) => item.id === deviceId);

    expect(canRestoreDevice(device, scopedProjects(admin, stopped))).toBe(false);
    expect(device).toMatchObject({ online: false, disabled: true, lifecycleStatus: 'stopped' });
  });

  it('clears all sync drift on retry and models bind, move, and unbind transitions', () => {
    const failed = { id: 'device-b-main', projectId: 'project-b', registered: true, difference: true, platformPermission: 'deny', devicePermission: 'allow', personnelSync: 'failed', faceSync: 'failed', permissionSync: 'failed', syncStatus: 'failed' };
    expect(updateDeviceAfterSync(failed)).toMatchObject({ personnelSync: 'success', faceSync: 'success', permissionSync: 'success', syncStatus: 'success', difference: false, platformPermission: 'allow', devicePermission: 'allow' });
    expect(bindDeviceToProject(failed, { projectId: 'project-a', entranceId: 'entrance-a-in', direction: 'in' })).toMatchObject({ projectId: 'project-a', entranceId: 'entrance-a-in', bindingStatus: '已绑定', accessStatus: 'allowed' });
    expect(moveDeviceBinding(failed, { projectId: 'project-a', entranceId: 'entrance-a-in', direction: 'in' })).toMatchObject({ previousProjectId: 'project-b', projectId: 'project-a', bindingStatus: '已绑定' });
    expect(unbindDevice(failed)).toMatchObject({ projectId: undefined, entranceId: undefined, direction: undefined, bindingStatus: '已解除', accessStatus: 'revoked' });
  });

  it('exposes project-filtered entrances to the binding form and an explicit unbind action', () => {
    expect(getEntranceOptions(mockData.entrances, 'project-a')).toEqual([
      expect.objectContaining({ id: 'entrance-a-in', name: '东门入口' }),
      expect.objectContaining({ id: 'entrance-a-out', name: '东门出口' }),
    ]);
    const markup = renderToStaticMarkup(React.createElement(DeviceBindingForm, { role: admin, projectId: 'project-a', device: { registered: true, projectId: 'project-a' }, projects: mockData.projects, entrances: mockData.entrances, onUnbind: () => {} }));
    expect(markup).toContain('解除绑定');
  });

  it('calculates age access states and applies age denial in device permission checks', () => {
    expect(getAgeAccessState({ birthDate: '1965-08-24', asOfDate: '2026-08-25' })).toMatchObject({ age: 61, status: 'forbidden' });
    expect(getAgeAccessState({ birthDate: '1966-08-25', asOfDate: '2026-08-25' })).toMatchObject({ age: 60, status: 'warning' });
    expect(getAgeAccessState({ birthDate: '1965-08-24', asOfDate: '2026-08-25', specialAuthorization: { effectiveAt: '2026-08-01', expiresAt: '2026-09-01' } })).toMatchObject({ status: 'allowed' });
    expect(getAgeAccessState({ birthDate: '1965-08-24', asOfDate: '2026-07-01', specialAuthorization: { effectiveAt: '2026-08-01', expiresAt: '2026-09-01' } })).toMatchObject({ status: 'pending', allowed: false });
    expect(getAgeAccessState({ birthDate: '1965-08-24', asOfDate: '2026-10-01', specialAuthorization: { effectiveAt: '2026-08-01', expiresAt: '2026-09-01' } })).toMatchObject({ status: 'forbidden' });
    expect(canAccessDevice({ registered: true }, { ageAccessState: 'forbidden' })).toBe(false);
    expect(canAccessDevice({ registered: true }, { ageAccessState: 'forbidden', hasValidSpecialAuthorization: true })).toBe(true);
  });

  it('builds person rows from birthdays and shows concrete project relationships', () => {
    const person = makePersonRows(admin).find((item) => item.id === 'person-1');
    expect(person.age).toBe(58);
    expect(person.healthReportStatus).toBe('valid');
    expect(person.projectRelationships).toEqual(expect.arrayContaining([
      expect.objectContaining({ projectName: '滨江综合体项目', relationStatus: '主项目', attendanceStatus: '在场' }),
      expect.objectContaining({ projectName: '北站枢纽项目', relationStatus: '临时项目' }),
    ]));
  });

  it('matches special authorization to each person project relationship', () => {
    const person = makePersonRows(admin, undefined, [{
      id: 'authorization-project-b',
      projectId: 'project-b',
      personId: 'person-1',
      effectiveAt: '2026-08-01',
      expiresAt: '2026-09-01',
    }]).find((item) => item.id === 'person-1');
    const projectA = person.projectRelationships.find((item) => item.projectId === 'project-a');
    const projectB = person.projectRelationships.find((item) => item.projectId === 'project-b');

    expect(projectA).toMatchObject({ ageAccessState: 'normal', permission: '平台禁止（设备侧状态见详情）' });
    expect(projectB).toMatchObject({ ageAccessState: 'allowed', ageAccessAllowed: true, permission: '平台禁止（设备侧状态见详情）' });
  });

  it('notifies shared lifecycle state when editing a project status', () => {
    const calls = [];
    const next = saveProjectChanges({
      editing: { id: 'project-a', name: '滨江综合体项目', status: 'active' },
      values: { name: '滨江综合体项目', status: 'archived' },
      onProjectLifecycle: (...args) => calls.push(args),
    });

    expect(next.status).toBe('archived');
    expect(calls).toEqual([['project-a', 'archived']]);
  });

  it('forces workers to the mobile app even when a management view is requested', () => {
    expect(getSafeViewForRole('worker', 'people')).toBe('mobileAttendance');
    const markup = renderToStaticMarkup(React.createElement(App, { initialRole: 'worker', initialView: 'people' }));
    expect(markup).toContain('我的考勤');
    expect(markup).not.toContain('维护人员主档');
  });

  it('restores complete role context when switching from a role name', () => {
    expect(resolveRoleContext('projectOwner')).toMatchObject({ role: 'projectOwner', projectIds: ['project-a'] });
    expect(resolveRoleContext('worker')).toMatchObject({ role: 'worker', personId: 'person-1', projectIds: ['project-a', 'project-b'] });
    expect(resolveRoleContext({ role: 'projectOwner', projectIds: ['project-b'] })).toEqual({ role: 'projectOwner', projectIds: ['project-b'] });
  });

  it('does not report core operations as successful without state callbacks', () => {
    expect(hasProjectLifecycleHandler()).toBe(false);
    expect(hasDeviceChangeHandler()).toBe(false);
  });
});
