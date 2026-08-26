export const projects = [
  {
    id: 'project-a', name: '滨江综合体项目', status: 'active', workStart: '09:00', workEnd: '18:00', graceMinutes: 15, ageThreshold: 60, ageWarningDays: 30,
    holidayDates: ['2026-10-01'], restDates: ['2026-08-30'], dayStatus: 'workday',
  },
  {
    id: 'project-b', name: '北站枢纽项目', status: 'active', workStart: '08:30', workEnd: '17:30', graceMinutes: 10, ageThreshold: 60, ageWarningDays: 30,
    holidayDates: ['2026-10-01'], restDates: ['2026-08-29'], dayStatus: 'workday',
  },
];

export const people = [
  { id: 'person-1', name: '张伟', role: 'worker', registered: true, idCardNumber: 'mock-id-001', birthDate: '1968-02-10', healthReportStatus: 'valid' },
  { id: 'person-2', name: '李娜', role: 'worker', registered: true, idCardNumber: 'mock-id-002', birthDate: '1962-05-10', healthReportStatus: 'missing' },
  { id: 'person-3', name: '王强', role: 'worker', registered: true, idCardNumber: 'mock-id-003', birthDate: '1964-12-01', healthReportStatus: 'expired' },
];

export const projectPeople = [
  { projectId: 'project-a', personId: 'person-1', status: 'active' },
  { projectId: 'project-b', personId: 'person-1', status: 'temporary' },
  { projectId: 'project-a', personId: 'person-2', status: 'active' },
  { projectId: 'project-b', personId: 'person-3', status: 'active' },
];

export const accounts = [
  { accountId: 'account-admin', name: '系统管理员', role: 'systemAdmin', projectIds: [], status: 'active' },
  { accountId: 'account-owner-a', name: '项目负责人甲', role: 'projectOwner', projectIds: ['project-a'], status: 'active' },
  { accountId: 'account-guard-a', name: '考勤负责人/门卫', role: 'attendanceGuard', projectIds: ['project-a'], status: 'inactive' },
  { accountId: 'account-worker-1', name: '施工人员张伟', role: 'worker', personId: 'person-1', projectIds: ['project-a', 'project-b'], status: 'active' },
  { accountId: 'account-worker-2', name: '待绑定施工人员账号', role: 'worker', projectIds: ['project-a'], status: 'active' },
];

export const users = accounts;

export const entrances = [
  { id: 'entrance-a-in', projectId: 'project-a', name: '东门入口', direction: 'in' },
  { id: 'entrance-a-out', projectId: 'project-a', name: '东门出口', direction: 'out' },
  { id: 'entrance-b-main', projectId: 'project-b', name: '主门出入口', direction: 'both' },
];

export const devices = [
  { id: 'device-a-in', entranceId: 'entrance-a-in', projectId: 'project-a', registered: true },
  { id: 'device-a-out', entranceId: 'entrance-a-out', projectId: 'project-a', registered: true },
  { id: 'device-b-main', entranceId: 'entrance-b-main', projectId: 'project-b', registered: true },
  { id: 'device-unbound-1', platformId: 'PLAT-004', hikvisionSerial: 'HIK-UNBOUND-004', model: 'DS-K1T341', registered: true, online: true, personnelSync: 'notStarted', faceSync: 'notStarted', permissionSync: 'notStarted', syncStatus: 'notStarted' },
];

export const rawEvents = [
  {
    id: 'event-1-live', projectId: 'project-a', personId: 'person-1', deviceId: 'device-a-in', eventSerial: 'serial-1',
    eventTime: '2026-08-25T08:58:00+08:00', source: 'realtime', personRegistered: true, faceRecognition: 'success',
    direction: 'in', doorOpened: true, permissionStatus: 'valid',
  },
  {
    id: 'event-1-history', projectId: 'project-a', personId: 'person-1', deviceId: 'device-a-in', eventSerial: 'serial-1',
    eventTime: '2026-08-25T08:58:00+08:00', source: 'history-replay', personRegistered: true, faceRecognition: 'success',
    direction: 'in', doorOpened: true, permissionStatus: 'valid',
  },
  {
    id: 'event-2-failed-face', projectId: 'project-a', personId: 'person-2', deviceId: 'device-a-in', eventSerial: 'serial-2',
    eventTime: '2026-08-25T09:12:00+08:00', source: 'realtime', personRegistered: true, faceRecognition: 'failure',
    direction: 'in', doorOpened: false, securityLog: true,
  },
  {
    id: 'event-3-expired-allowed', projectId: 'project-b', personId: 'person-3', deviceId: 'device-b-main', eventSerial: 'serial-3',
    eventTime: '2026-08-25T09:05:00+08:00', source: 'realtime', personRegistered: true, faceRecognition: 'success',
    direction: 'in', doorOpened: true, permissionStatus: 'expired', devicePermission: 'allow', marked: true,
  },
  {
    id: 'event-4-drift', projectId: 'project-b', personId: 'person-3', deviceId: 'device-b-main', eventSerial: 'serial-4',
    eventTime: '2026-08-25T18:10:00+08:00', source: 'realtime', personRegistered: true, faceRecognition: 'success',
    direction: 'out', doorOpened: true, platformPermission: 'deny', devicePermission: 'allow', syncStatus: 'failed', difference: true,
  },
  {
    id: 'event-5-first-sync-failed', projectId: 'project-a', personId: 'person-2', deviceId: 'device-a-in', eventSerial: 'serial-5',
    eventTime: '2026-08-25T10:00:00+08:00', source: 'sync', personRegistered: true, faceRecognition: 'success',
    direction: 'in', doorOpened: false, authorizationState: 'first-sync-failed', effectivePermission: false,
  },
  {
    id: 'event-6-other-device', projectId: 'project-a', personId: 'person-1', deviceId: 'device-a-out', eventSerial: 'serial-1',
    eventTime: '2026-08-25T08:58:00+08:00', source: 'realtime', personRegistered: true, faceRecognition: 'success',
    direction: 'out', doorOpened: true, permissionStatus: 'valid',
  },
  {
    id: 'event-7-entry', projectId: 'project-a', personId: 'person-1', deviceId: 'device-a-in', eventSerial: 'serial-18-in',
    eventTime: '2026-08-18T08:56:00+08:00', source: 'realtime', personRegistered: true, faceRecognition: 'success',
    direction: 'in', doorOpened: true, permissionStatus: 'valid',
  },
  {
    id: 'event-8-exit', projectId: 'project-a', personId: 'person-1', deviceId: 'device-a-out', eventSerial: 'serial-18-out',
    eventTime: '2026-08-18T18:03:00+08:00', source: 'realtime', personRegistered: true, faceRecognition: 'success',
    direction: 'out', doorOpened: true, permissionStatus: 'valid',
  },
  {
    id: 'event-9-entry', projectId: 'project-a', personId: 'person-1', deviceId: 'device-a-in', eventSerial: 'serial-20-in',
    eventTime: '2026-08-20T09:27:00+08:00', source: 'realtime', personRegistered: true, faceRecognition: 'success',
    direction: 'in', doorOpened: true, permissionStatus: 'valid',
  },
  {
    id: 'event-10-exit', projectId: 'project-a', personId: 'person-1', deviceId: 'device-a-out', eventSerial: 'serial-20-out',
    eventTime: '2026-08-20T18:01:00+08:00', source: 'realtime', personRegistered: true, faceRecognition: 'success',
    direction: 'out', doorOpened: true, permissionStatus: 'valid',
  },
  {
    id: 'event-11-entry', projectId: 'project-a', personId: 'person-1', deviceId: 'device-a-in', eventSerial: 'serial-22-in',
    eventTime: '2026-08-22T08:48:00+08:00', source: 'realtime', personRegistered: true, faceRecognition: 'success',
    direction: 'in', doorOpened: true, permissionStatus: 'valid',
  },
  {
    id: 'event-12-exit', projectId: 'project-a', personId: 'person-1', deviceId: 'device-a-out', eventSerial: 'serial-22-out',
    eventTime: '2026-08-22T17:32:00+08:00', source: 'realtime', personRegistered: true, faceRecognition: 'success',
    direction: 'out', doorOpened: true, permissionStatus: 'valid',
  },
];

export const attendance = rawEvents;

export const leaveRecords = [
  { id: 'leave-1', projectId: 'project-a', personId: 'person-2', date: '2026-08-25', status: 'approved', type: 'personal' },
];

export const supplementRecords = [
  {
    id: 'supplement-1', projectId: 'project-a', personId: 'person-2', date: '2026-08-26', direction: 'in',
    eventTime: '2026-08-26T09:00:00+08:00', recordType: 'supplement', operatorId: 'account-owner-a',
    reason: '设备离线补录', source: 'platform-supplement', status: 'active', approved: true, voided: false, cancelled: false,
  },
];

export const captures = [
  {
    id: 'capture-success', eventId: 'event-1-live', projectId: 'project-a', personId: 'person-1', personRegistered: true,
    faceRecognition: 'success', capturePhoto: 'mock-capture-success', captureStatus: 'saved', eventTime: '2026-08-25T08:58:00+08:00', deviceAllowed: true,
  },
  {
    id: 'capture-face-failed', eventId: 'event-2-failed-face', projectId: 'project-a', personId: 'person-2', personRegistered: true,
    faceRecognition: 'failure', capturePhoto: 'mock-capture-face-failed', captureStatus: 'saved', securityLog: true, eventTime: '2026-08-25T09:12:00+08:00', deviceAllowed: false,
  },
  {
    id: 'capture-expired-allowed', eventId: 'event-3-expired-allowed', projectId: 'project-b', personId: 'person-3', personRegistered: true,
    faceRecognition: 'success', capturePhoto: 'mock-capture-expired-allowed', captureStatus: 'saved', permissionStatus: 'expired', deviceAllowed: true,
    eventTime: '2026-08-25T09:05:00+08:00', marked: true,
  },
];

export const certificates = [
  { id: 'certificate-1', personId: 'person-1', type: '特种作业证', status: 'valid', expiresOn: '2027-05-01' },
  { id: 'certificate-2', personId: 'person-3', type: '安全培训证', status: 'expiring', expiresOn: '2026-09-15' },
];

export const specialAuthorizations = [
  { id: 'authorization-1', projectId: 'project-a', personId: 'person-1', type: '临时夜班', status: 'active', operatorId: 'account-owner-a', basis: '夜间施工审批单', effectiveAt: '2026-08-01', expiresAt: '2026-09-01' },
];

export const tools = [
  { id: 'tool-1', toolCode: 'TL-000001', name: '塔吊安全绳', model: 'TL-5M', projectId: 'project-a', usageStatus: '在用', qrToken: 'tool-token-1', createdAt: '2026-07-20' },
  { id: 'tool-2', toolCode: 'TL-000002', name: '绝缘手套', model: '10KV-A', projectId: 'project-a', usageStatus: '在用', qrToken: 'tool-token-2', createdAt: '2026-07-20' },
  { id: 'tool-3', toolCode: 'TL-000003', name: '扭力扳手', model: 'TW-300', projectId: 'project-b', usageStatus: '在用', qrToken: 'tool-token-3', createdAt: '2026-07-20' },
  { id: 'tool-4', toolCode: 'TL-000004', name: '电焊机', model: 'ZX7-400', projectId: 'project-a', usageStatus: '遗失', qrToken: 'tool-token-4', createdAt: '2026-07-20', remark: '现场盘点未找到' },
  { id: 'tool-5', toolCode: 'TL-000005', name: '手持切割机', model: 'J3G-400', projectId: 'project-b', usageStatus: '报废', qrToken: 'tool-token-5', createdAt: '2026-07-20', remark: '设备损坏无法维修' },
];

export const toolInspectionPolicy = {
  id: 'tool-policy-default',
  enabled: true,
  frequency: 'monthly',
  day: 1,
  expectedDays: 3,
};

export const toolInspections = [
  { id: 'tool-inspection-1', toolId: 'tool-1', projectId: 'project-a', cycleKey: '2026-08', inspectedAt: '2026-08-01', inspectorId: 'account-owner-a', inspectorName: '项目负责人甲', result: '合格', remark: '外观和强度正常' },
  { id: 'tool-inspection-2', toolId: 'tool-3', projectId: 'project-b', cycleKey: '2026-08', inspectedAt: '2026-08-02', inspectorId: 'account-admin', inspectorName: '系统管理员', result: '不合格', remark: '扭力校准异常，需处理' },
];

export const operationLogs = [
  { id: 'operation-1', projectId: 'project-a', operatorId: 'account-owner-a', operation: 'supplement', module: 'attendance', targetId: 'supplement-1', occurredAt: '2026-08-25 09:20', reason: '设备离线补录' },
  { id: 'operation-2', projectId: 'project-a', operatorId: 'account-admin', operation: 'bind', module: 'devices', targetId: 'device-a-in', occurredAt: '2026-08-25 08:30', reason: '绑定东门入口' },
  { id: 'operation-3', projectId: 'project-b', operatorId: 'account-admin', operation: 'sync', module: 'devices', targetId: 'device-b-main', occurredAt: '2026-08-25 09:30', reason: '重试权限同步' },
  { id: 'operation-4', projectId: 'project-a', operatorId: 'account-admin', operation: 'authorize', module: 'permissions', targetId: 'authorization-1', occurredAt: '2026-08-24 16:10', reason: '登记临时夜班授权' },
  { id: 'operation-5', projectId: 'project-a', operatorId: 'account-owner-a', operation: 'alertRead', module: 'alerts', targetId: 'alert-4', occurredAt: '2026-08-25 10:05', reason: '查看同步失败告警' },
  { id: 'operation-6', projectId: 'project-a', operatorId: 'account-owner-a', operation: 'leave', module: 'attendance', targetId: 'leave-1', occurredAt: '2026-08-25 08:00', reason: '登记李娜请假' },
  { id: 'operation-7', projectId: 'project-a', operatorId: 'account-admin', operation: 'accountOpen', module: 'users', targetId: 'account-guard-a', occurredAt: '2026-08-24 09:00', reason: '开通考勤负责人账号' },
  { id: 'operation-8', projectId: 'project-a', operatorId: 'account-admin', operation: 'accountDisable', module: 'users', targetId: 'account-guard-a', occurredAt: '2026-08-24 18:00', reason: '停用账号' },
  { id: 'operation-9', projectId: 'project-a', operatorId: 'account-admin', operation: 'accountReset', module: 'users', targetId: 'account-worker-1', occurredAt: '2026-08-24 18:10', reason: '重置登录凭据' },
];

export const permissionSyncRecords = [
  { id: 'sync-1', projectId: 'project-a', deviceId: 'device-a-in', status: 'failed', firstAuthorization: true, effectivePermission: false },
  { id: 'sync-2', projectId: 'project-b', deviceId: 'device-b-main', status: 'failed', platformPermission: 'deny', devicePermission: 'allow', difference: true },
];

export const alerts = [
  { id: 'alert-1', projectId: 'project-b', type: 'expired-permission-allowed', eventId: 'event-3-expired-allowed', occurredAt: '2026-08-25 09:05', status: 'open', receivers: ['systemAdmin', 'projectOwner'] },
  { id: 'alert-3', projectId: 'project-a', type: 'device-offline', deviceId: 'device-a-out', occurredAt: '2026-08-25 08:45', status: 'open', receivers: ['systemAdmin', 'projectOwner'] },
  { id: 'alert-4', projectId: 'project-a', type: 'sync-failed', deviceId: 'device-a-in', occurredAt: '2026-08-25 10:00', status: 'open', receivers: ['systemAdmin', 'projectOwner'] },
];

export const mockData = {
  projects,
  people,
  projectPeople,
  accounts,
  users,
  entrances,
  devices,
  rawEvents,
  attendance,
  leaveRecords,
  supplementRecords,
  captures,
  certificates,
  specialAuthorizations,
  operationLogs,
  permissionSyncRecords,
  tools,
  toolInspectionPolicy,
  toolInspections,
  alerts,
};

export default mockData;
