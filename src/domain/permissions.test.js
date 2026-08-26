import { describe, expect, it } from 'vitest';
import mockData from '../data/mockData';
import { canAccessDevice, canOperate, canViewField, filterByDataScope, getHomeView } from './permissions';
import { scopedProjects } from '../pages/pageUtils';

const admin = { role: 'systemAdmin', accountId: 'admin-1' };
const owner = { role: 'projectOwner', accountId: 'owner-1', projectIds: ['project-a'] };
const worker = { role: 'worker', accountId: 'worker-1', personId: 'person-1', projectIds: ['project-a'] };

describe('permission rules', () => {
  it('maps each role to its home view', () => {
    expect(getHomeView(admin)).toBe('workbench');
    expect(getHomeView(owner)).toBe('projectOverview');
    expect(getHomeView(worker)).toBe('mobileAttendance');
  });

  it('limits field visibility to project scope and keeps sensitive fields self-only for workers', () => {
    expect(canViewField(admin, 'idCardNumber', { projectId: 'project-b', personId: 'person-9' })).toBe(true);
    expect(canViewField(owner, 'healthReport', { projectId: 'project-a', personId: 'person-9' })).toBe(true);
    expect(canViewField(owner, 'healthReport', { projectId: 'project-b', personId: 'person-9' })).toBe(false);
    expect(canViewField(worker, 'face', { projectId: 'project-a', personId: 'person-1' })).toBe(true);
    expect(canViewField(worker, 'face', { projectId: 'project-a', personId: 'person-9' })).toBe(false);
  });

  it('requires worker current user person and target person to be the same for every field', () => {
    expect(canViewField(worker, 'name', {
      projectId: 'project-a',
      currentUserPersonId: 'person-2',
      personId: 'person-1',
    })).toBe(false);
    expect(canViewField(worker, 'name', {
      projectId: 'project-a',
      currentUserPersonId: 'person-1',
      personId: 'person-2',
    })).toBe(false);
    expect(canViewField(worker, 'name', {
      projectId: 'project-a',
      currentUserPersonId: 'person-1',
      personId: 'person-1',
    })).toBe(true);
  });

  it('allows project owners to operate only within authorized projects and only bind registered devices', () => {
    expect(canOperate(owner, 'bindDevice', { projectId: 'project-a', deviceRegistered: true })).toBe(true);
    expect(canOperate(owner, 'bindDevice', { projectId: 'project-a', deviceRegistered: false })).toBe(false);
    expect(canOperate(owner, 'specialAuthorization', { projectId: 'project-b' })).toBe(false);
    expect(canOperate(worker, 'export', { projectId: 'project-a' })).toBe(false);
  });

  it('allows person editing for admins and in-scope project owners but never workers', () => {
    expect(canOperate(admin, 'editPerson', { projectId: 'project-b' })).toBe(true);
    expect(canOperate(owner, 'editPerson', { projectId: 'project-a' })).toBe(true);
    expect(canOperate(owner, 'editPerson', { projectId: 'project-b' })).toBe(false);
    expect(canOperate(worker, 'editPerson', { projectId: 'project-a' })).toBe(false);
  });

  it('rejects a registered device bound to another project but allows same-project or unbound devices', () => {
    expect(canOperate(owner, 'bindDevice', {
      projectId: 'project-a',
      device: { registered: true, projectId: 'project-b' },
    })).toBe(false);
    expect(canOperate(owner, 'bindDevice', {
      projectId: 'project-a',
      device: { registered: true, projectId: 'project-a' },
    })).toBe(true);
    expect(canOperate(owner, 'bindDevice', {
      projectId: 'project-a',
      device: { registered: true },
    })).toBe(true);
  });

  it('allows admin and project owner operations but never remote unlock', () => {
    expect(canOperate(admin, 'export', { projectId: 'project-b' })).toBe(true);
    expect(canOperate(owner, 'replaceFace', { projectId: 'project-a' })).toBe(true);
    expect(canOperate(admin, 'remoteUnlock', { projectId: 'project-a' })).toBe(false);
    expect(canOperate(owner, 'remoteUnlock', { projectId: 'project-a' })).toBe(false);
  });

  it('does not revoke device access merely because the worker is on approved leave', () => {
    expect(canAccessDevice({ registered: true }, { deviceAllowed: true, leaveStatus: 'approved' })).toBe(true);
  });

  it('rejects access before a special authorization becomes effective', () => {
    expect(canAccessDevice({ registered: true }, { ageAccessState: 'pending' })).toBe(false);
    expect(canAccessDevice({ registered: true }, { ageAccessState: 'warning' })).toBe(true);
    expect(canAccessDevice({ registered: true }, { ageAccessAllowed: false })).toBe(false);
    expect(canAccessDevice({ registered: true }, { ageAccessState: 'forbidden', hasValidSpecialAuthorization: true })).toBe(true);
  });

  it('rejects worker remote opening as a dedicated operation', () => {
    expect(canOperate(worker, 'remoteUnlock', { projectId: 'project-a' })).toBe(false);
  });

  it('filters project-scoped data and workers to their own person records without mutating input', () => {
    const records = [
      { projectId: 'project-a', personId: 'person-1' },
      { projectId: 'project-a', personId: 'person-2' },
      { projectId: 'project-b', personId: 'person-1' },
    ];

    expect(filterByDataScope(owner, records)).toEqual(records.slice(0, 2));
    expect(filterByDataScope(worker, records)).toEqual([records[0]]);
    expect(filterByDataScope(worker, records)).not.toBe(records);
    expect(records).toHaveLength(3);
  });

  it('filters project records by projectIds for owners and workers without requiring personId', () => {
    expect(scopedProjects(owner).map((project) => project.id)).toEqual(['project-a']);
    expect(scopedProjects(worker).map((project) => project.id)).toEqual(['project-a']);
  });

  it('returns no records for missing or unknown roles', () => {
    const records = [{ projectId: 'project-a', personId: 'person-1' }];

    expect(filterByDataScope(undefined, records)).toEqual([]);
    expect(filterByDataScope(null, records)).toEqual([]);
    expect(filterByDataScope({ role: 'unknown', projectIds: ['project-a'] }, records)).toEqual([]);
  });

  it('provides page-ready projects, people, accounts, supplements, captures, and audit data', () => {
    expect(mockData.projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ workStart: expect.any(String), workEnd: expect.any(String), graceMinutes: expect.any(Number), holidayDates: expect.any(Array), restDates: expect.any(Array), dayStatus: expect.any(String) }),
    ]));
    expect(new Set(mockData.projectPeople.filter((item) => item.personId === 'person-1').map((item) => item.projectId)).size).toBeGreaterThan(1);
    expect(mockData.accounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'systemAdmin' }),
      expect.objectContaining({ role: 'projectOwner', projectIds: expect.any(Array) }),
      expect.objectContaining({ role: 'worker', personId: 'person-1', projectIds: expect.any(Array) }),
    ]));
    expect(mockData.supplementRecords).toEqual(expect.arrayContaining([
      expect.objectContaining({ operatorId: expect.any(String), reason: expect.any(String), approved: expect.any(Boolean), voided: expect.any(Boolean) }),
    ]));
    expect(mockData.captures).toEqual(expect.arrayContaining([
      expect.objectContaining({ faceRecognition: 'success', personRegistered: true }),
      expect.objectContaining({ faceRecognition: 'failure', securityLog: true, personRegistered: true }),
      expect.objectContaining({ permissionStatus: 'expired', deviceAllowed: true, personRegistered: true }),
    ]));
    expect(mockData.captures.every((capture) => capture.personRegistered === true)).toBe(true);
    expect(mockData.certificates.length).toBeGreaterThan(0);
    expect(mockData.specialAuthorizations.length).toBeGreaterThan(0);
    expect(mockData.operationLogs.length).toBeGreaterThan(0);
    expect(mockData.rawEvents.length).toBeGreaterThan(0);
    expect(mockData.permissionSyncRecords.length).toBeGreaterThan(0);
    expect(mockData.alerts.length).toBeGreaterThan(0);
  });
});
