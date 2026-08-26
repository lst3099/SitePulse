import mockData from '../data/mockData';
import { applyLeaveAndSupplement, calculateDailyAttendance } from '../domain/attendance';
import { filterByDataScope } from '../domain/permissions';
import dayjs from 'dayjs';

export const DEMO_AS_OF_DATE = '2026-08-25';
export const DEFAULT_AGE_THRESHOLD = 60;
export const DEFAULT_AGE_WARNING_DAYS = 30;

export function normalizeUser(role) {
  return typeof role === 'string' ? { role } : role || {};
}

export function roleOf(role) {
  return normalizeUser(role).role;
}

export function toDateKey(value) {
  if (value?.format) return isValidDateKey(value.format('YYYY-MM-DD')) ? value.format('YYYY-MM-DD') : '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const match = String(value ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/);
  const key = match ? `${match[1]}-${match[2]}-${match[3]}` : '';
  return isValidDateKey(key) ? key : '';
}

export function toDateTimeKey(value) {
  if (value?.format) return value.format('YYYY-MM-DDTHH:mm:ss');
  const text = String(value ?? '').trim().replace(' ', 'T');
  const datePart = text.slice(0, 10);
  if (!isValidDateKey(datePart)) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T00:00:00`;
  return Number.isFinite(Date.parse(text)) ? text : '';
}

function toDateTimeMs(value, endOfDay = false) {
  const key = toDateTimeKey(value);
  const time = Date.parse(endOfDay && /^\d{4}-\d{2}-\d{2}T00:00:00$/.test(key) ? `${key.slice(0, 10)}T23:59:59` : key);
  return Number.isFinite(time) ? time : null;
}

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function toDatePickerValue(value) {
  const key = toDateTimeKey(value);
  if (!toDateKey(key)) return null;
  const result = dayjs(key);
  return result.isValid() ? result : null;
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addYears(value, years) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

function ageOnDate(birthDate, asOfDate) {
  const birth = toDateKey(birthDate);
  const asOf = toDateKey(asOfDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null;
  let age = Number(asOf.slice(0, 4)) - Number(birth.slice(0, 4));
  if (asOf.slice(5) < birth.slice(5)) age -= 1;
  return age;
}

export function getAgeAccessState({
  birthDate,
  asOfDate = DEMO_AS_OF_DATE,
  threshold = 60,
  warningDays = 30,
  specialAuthorization,
} = {}) {
  const asOf = toDateKey(asOfDate);
  const age = ageOnDate(birthDate, asOf);
  if (age === null) return { age: null, status: 'normal', allowed: true, warning: false, reason: '缺少生日' };

  const thresholdDate = addYears(toDateKey(birthDate), threshold);
  const forbiddenDate = addDays(thresholdDate, 1);
  const warningDate = addDays(thresholdDate, -warningDays);
  const authorizationStart = toDateTimeMs(specialAuthorization?.effectiveAt);
  const authorizationEnd = toDateTimeMs(specialAuthorization?.expiresAt, true);
  const asOfTime = toDateTimeMs(asOfDate);
  if (specialAuthorization?.status === 'revoked' || specialAuthorization?.status === 'expired') {
    return { age, status: 'forbidden', allowed: false, warning: false, reason: specialAuthorization.status === 'revoked' ? '特殊授权已撤销' : '特殊授权已过期' };
  }
  if (specialAuthorization?.status === 'pending') {
    return { age, status: 'pending', allowed: false, warning: false, reason: '特殊授权尚未生效' };
  }
  const hasAuthorizationWindow = specialAuthorization?.status !== 'revoked' && asOfTime !== null && authorizationStart !== null && authorizationEnd !== null;

  if (hasAuthorizationWindow && asOfTime < authorizationStart) {
    return { age, status: 'pending', allowed: false, warning: false, reason: '特殊授权尚未生效' };
  }
  if (hasAuthorizationWindow && asOfTime <= authorizationEnd) {
    return { age, status: 'allowed', allowed: true, warning: false, reason: '特殊授权有效期内' };
  }
  if (hasAuthorizationWindow && asOfTime > authorizationEnd) {
    return { age, status: 'forbidden', allowed: false, warning: false, reason: '特殊授权已过期' };
  }
  if (asOf >= forbiddenDate) return { age, status: 'forbidden', allowed: false, warning: false, reason: '超过年龄阈值次日禁止进入' };
  if (asOf >= warningDate) return { age, status: 'warning', allowed: true, warning: true, reason: '接近年龄阈值，提前预警' };
  return { age, status: 'normal', allowed: true, warning: false, reason: '年龄规则正常' };
}

export function getProjectAgeConfig(project = {}) {
  return {
    ageThreshold: Number.isFinite(Number(project.ageThreshold)) ? Number(project.ageThreshold) : DEFAULT_AGE_THRESHOLD,
    ageWarningDays: Number.isFinite(Number(project.ageWarningDays)) ? Number(project.ageWarningDays) : DEFAULT_AGE_WARNING_DAYS,
  };
}

export function createLifecycleState() {
  return { projectOverrides: {}, deviceOverrides: {}, personOverrides: {}, historyBoundaries: {} };
}

function copyLifecycleState(state) {
  const source = state || createLifecycleState();
  return {
    projectOverrides: { ...source.projectOverrides },
    deviceOverrides: { ...source.deviceOverrides },
    personOverrides: { ...source.personOverrides },
    historyBoundaries: Object.fromEntries(Object.entries(source.historyBoundaries || {}).map(([projectId, boundary]) => [projectId, {
      ...boundary,
      current: boundary?.current ? { ...boundary.current } : undefined,
      history: Array.isArray(boundary?.history) ? boundary.history.map((item) => ({ ...item })) : undefined,
    }])),
  };
}

export function applyProjectLifecycle(state, projectId, status, registeredDevices = [], projectPeople = mockData.projectPeople, projects = mockData.projects) {
  const next = copyLifecycleState(state);
  const lifecycleStatus = status === 'inactive' ? 'stopped' : status === 'archived' ? 'archived' : 'active';
  next.projectOverrides[projectId] = { ...(next.projectOverrides[projectId] || {}), status };
  const current = { status, readOnly: status !== 'active', preservedAt: DEMO_AS_OF_DATE };
  const previous = next.historyBoundaries[projectId];
  const history = [
    ...(Array.isArray(previous?.history) ? previous.history : previous ? [{ ...previous, current: undefined, history: undefined }] : []),
    current,
  ];
  next.historyBoundaries[projectId] = { ...current, current, history };

  [...mockData.devices, ...registeredDevices].forEach((device) => {
    const deviceOverride = next.deviceOverrides[device.id] || {};
    const effectiveProjectId = Object.prototype.hasOwnProperty.call(deviceOverride, 'projectId') ? deviceOverride.projectId : device.projectId;
    if (effectiveProjectId !== projectId) return;
    next.deviceOverrides[device.id] = {
      ...deviceOverride,
      lifecycleStatus,
      online: status === 'active',
      disabled: status !== 'active',
      archived: status === 'archived',
      syncStatus: status === 'active' ? 'syncing' : 'stopped',
      accessStatus: status === 'active' ? 'revoked' : 'revoked',
      personnelPermission: 'revoked',
      facePermission: 'revoked',
    };
  });
  projectPeople.filter((relation) => relation.projectId === projectId).forEach((relation) => {
    const key = `${projectId}:${relation.personId}`;
    next.personOverrides[key] = {
      ...(next.personOverrides[key] || {}),
      accessStatus: status === 'active' ? 'allowed' : 'revoked',
      permission: status === 'active' ? '允许' : '禁止',
    };
  });
  return next;
}

export function updateDeviceOverride(state, deviceId, values) {
  const next = copyLifecycleState(state);
  next.deviceOverrides[deviceId] = { ...(next.deviceOverrides[deviceId] || {}), ...values };
  return next;
}

export function projectName(projectId, projects = mockData.projects) {
  return projects.find((project) => project.id === projectId)?.name || '未分配项目';
}

export function appendOperationLog(logs, entry = {}) {
  return [
    ...(logs || []).map((log) => ({ ...log })),
    {
      id: entry.id || `operation-local-${(logs || []).length + 1}`,
      occurredAt: entry.occurredAt || DEMO_AS_OF_DATE,
      ...entry,
    },
  ];
}

export function maskIdCard(value) {
  const text = String(value || '');
  if (!text) return '—';
  if (text.length <= 6) return `${text.slice(0, 2)}****`;
  return `${text.slice(0, 3)}********${text.slice(-2)}`;
}

export function scopedProjects(role, lifecycleState, projects = mockData.projects) {
  const overrides = lifecycleState?.projectOverrides || {};
  return filterByDataScope(normalizeUser(role), projects.map((project) => ({ projectId: project.id, ...project, ...(overrides[project.id] || {}) })));
}

export function scopedProjectPeople(role, projectId, projectPeople = mockData.projectPeople) {
  return filterByDataScope(
    normalizeUser(role),
    projectPeople.filter((item) => !projectId || item.projectId === projectId),
  );
}

export function hasEffectiveProjectDevice(projectId, lifecycleState, registeredDevices = [], projects = mockData.projects) {
  if (!projectId) return false;
  const projectStatus = lifecycleState?.projectOverrides?.[projectId]?.status || projects.find((project) => project.id === projectId)?.status;
  if (projectStatus !== 'active') return false;
  return mergeDevices(registeredDevices).some((device) => {
    const override = lifecycleState?.deviceOverrides?.[device.id] || {};
    const effectiveProjectId = Object.prototype.hasOwnProperty.call(override, 'projectId') ? override.projectId : device.projectId;
    return effectiveProjectId === projectId && override.disabled !== true && override.archived !== true && !['stopped', 'archived'].includes(override.lifecycleStatus);
  });
}

function mergeDevices(registeredDevices = []) {
  const registeredKeys = new Set(registeredDevices.map((device) => `${device.projectId || ''}:${device.entranceId || ''}`));
  return [...mockData.devices.filter((device) => !registeredKeys.has(`${device.projectId || ''}:${device.entranceId || ''}`)), ...registeredDevices];
}

function healthStatus(status, expiresAt) {
  if (!status || status === 'missing') return 'missing';
  if (status === 'expired') return 'expired';
  const expiryDate = toDateKey(expiresAt);
  return expiryDate && expiryDate < DEMO_AS_OF_DATE ? 'expired' : 'valid';
}

function healthLabel(status, expiresAt) {
  return { valid: '有效', expired: '已过期', missing: '缺失' }[healthStatus(status, expiresAt)];
}

export function getSpecialAuthorizationStatus(authorization, asOfDate = DEMO_AS_OF_DATE) {
  const asOf = toDateTimeMs(asOfDate);
  const start = toDateTimeMs(authorization?.effectiveAt);
  const end = toDateTimeMs(authorization?.expiresAt, true);
  if (!authorization || asOf === null || start === null || end === null) return 'normal';
  if (authorization.status === 'revoked') return 'revoked';
  if (asOf < start) return 'pending';
  if (asOf <= end) return 'active';
  return 'expired';
}

export function makePersonRows(role, lifecycleState, authorizations = mockData.specialAuthorizations, projectPeople = mockData.projectPeople, registeredDevices = [], peopleRecords = mockData.people, projectsRecords = mockData.projects, accounts = mockData.accounts) {
  const user = normalizeUser(role);
  const projects = scopedProjects(role, lifecycleState, projectsRecords);
  const records = peopleRecords.map((person) => {
    const relations = projectPeople.filter((item) => item.personId === person.id);
    const visibleRelations = filterByDataScope(user, relations).map((relation) => {
      const project = projects.find((item) => item.id === relation.projectId) || projectsRecords.find((item) => item.id === relation.projectId);
      const lifecycle = lifecycleState?.personOverrides?.[`${relation.projectId}:${relation.personId}`];
      const projectOverride = lifecycleState?.projectOverrides?.[relation.projectId];
      const authorization = authorizations.find((item) => item.personId === relation.personId && item.projectId === relation.projectId);
      const ageConfig = getProjectAgeConfig(project);
      const relationAgeAccess = getAgeAccessState({ birthDate: person.birthDate, asOfDate: DEMO_AS_OF_DATE, threshold: ageConfig.ageThreshold, warningDays: ageConfig.ageWarningDays, specialAuthorization: authorization });
      const lifecyclePermission = lifecycle?.permission || (project?.status === 'active' ? '允许' : '禁止');
      const deviceAvailable = hasEffectiveProjectDevice(relation.projectId, lifecycleState, registeredDevices, projectsRecords);
      const devicePermissionState = getProjectDevicePermission(relation.projectId, lifecycleState, undefined, registeredDevices, projectsRecords);
      const platformPermissionAllowed = devicePermissionState.effectivePermission !== false;
      return {
        ...relation,
        projectName: project?.name || '未分配项目',
        relationStatus: relation.status === 'temporary' ? '临时项目' : '主项目',
        attendanceStatus: projectOverride?.status === 'active' || !projectOverride ? '在场' : '已离场',
        accessStatus: !relationAgeAccess.allowed || !deviceAvailable || !platformPermissionAllowed ? 'revoked' : lifecycle?.accessStatus || (project?.status === 'active' ? 'allowed' : 'revoked'),
        age: relationAgeAccess.age,
        ageAccessState: relationAgeAccess.status,
        ageAccessAllowed: relationAgeAccess.allowed,
        ageAccessReason: relationAgeAccess.reason,
        effectivePermission: platformPermissionAllowed,
        devicePermission: devicePermissionState.devicePermission,
        deviceSideAccess: devicePermissionState.devicePermission === 'allow',
        permissionMismatch: devicePermissionState.permissionMismatch,
        syncStatus: devicePermissionState.syncStatus,
        failedDeviceIds: devicePermissionState.failedDeviceIds,
        permission: lifecyclePermission === '禁止' || !deviceAvailable ? '禁止' : !platformPermissionAllowed ? '平台禁止（设备侧状态见详情）' : relationAgeAccess.allowed ? lifecyclePermission : '年龄禁止',
      };
    });
    const primaryRelationship = visibleRelations[0];
    const account = accounts.find((item) => item.personId === person.id);
    const ageAccessState = primaryRelationship ? { age: primaryRelationship.age, status: primaryRelationship.ageAccessState, allowed: primaryRelationship.ageAccessAllowed, reason: primaryRelationship.ageAccessReason } : getAgeAccessState({ birthDate: person.birthDate, asOfDate: DEMO_AS_OF_DATE });
    return {
      ...person,
      personId: person.id,
      projectId: visibleRelations[0]?.projectId,
      projectIds: visibleRelations.map((item) => item.projectId),
      projectCount: visibleRelations.length,
      projectRelationships: visibleRelations,
      phone: person.id === 'person-1' ? '13800000000' : person.id === 'person-2' ? '13900000000' : '13700000000',
      team: person.id === 'person-3' ? '钢筋一队' : '土建一队',
      profession: person.profession || (person.id === 'person-2' ? '电工' : '钢筋工'),
      accountId: account?.accountId,
      accountName: account?.name,
      accountBindingState: account ? account.status === 'inactive' ? 'inactive' : 'bound' : 'unbound',
      accountStatus: account?.status,
      account: account?.name || '未开通',
      face: person.registered ? '已登记' : '未登记',
      healthReportStatus: healthStatus(person.healthReportStatus, person.healthReportExpiresAt),
      health: healthLabel(person.healthReportStatus, person.healthReportExpiresAt),
      age: ageAccessState.age,
      ageAccessState: ageAccessState.status,
      ageAccessReason: ageAccessState.reason,
      permission: visibleRelations.some((item) => item.accessStatus === 'revoked') ? '禁止' : ageAccessState.allowed ? '正常' : ageAccessState.status === 'forbidden' ? '年龄禁止' : '年龄预警',
      projectOptions: projects.map((project) => ({ value: project.id, label: project.name })),
    };
  });

  if (user.role === 'worker') return records.filter((person) => person.id === user.personId);
  if (user.role === 'projectOwner') return records.filter((person) => person.projectCount > 0);
  return records;
}

export function getEntranceOptions(entrances, projectId) {
  return (entrances || []).filter((entrance) => !projectId || entrance.projectId === projectId);
}

export function buildDeviceOperationLog(deviceId, values = {}, operatorId = 'account-admin') {
  const operation = values.lifecycleStatus === 'archived' ? 'deviceArchive'
    : values.lifecycleStatus === 'stopped' ? 'deviceDisable'
      : values.projectId === undefined && values.bindingStatus === '已解除' ? 'deviceUnbind'
        : values.previousProjectId && values.previousProjectId !== values.projectId ? 'deviceMove'
          : ['已绑定', '待同步'].includes(values.bindingStatus) ? 'bind' : values.syncStatus ? 'sync' : 'edit';
  return {
    projectId: values.projectId,
    operatorId,
    operation,
    module: 'devices',
    targetId: deviceId,
    occurredAt: `${DEMO_AS_OF_DATE} 12:00`,
    reason: operation === 'deviceMove' ? '设备换项目' : operation === 'deviceUnbind' ? '解除设备绑定' : operation === 'deviceArchive' ? '设备归档' : operation === 'deviceDisable' ? '设备停用' : operation === 'bind' ? '绑定设备' : '设备状态变更',
  };
}

export function buildPersonEditLog(personId, projectId, operatorId = 'account-admin') {
  return { projectId, operatorId, operation: 'personEdit', module: 'people', targetId: personId, occurredAt: `${DEMO_AS_OF_DATE} 12:00`, reason: '编辑人员档案' };
}

export function buildProjectEditLog(projectId, operatorId = 'account-admin') {
  return { projectId, operatorId, operation: 'projectEdit', module: 'projects', targetId: projectId, occurredAt: `${DEMO_AS_OF_DATE} 12:00`, reason: '编辑项目资料' };
}

export function buildProjectCreateLog(projectId, operatorId = 'account-admin') {
  return { projectId, operatorId, operation: 'projectCreate', module: 'projects', targetId: projectId, occurredAt: `${DEMO_AS_OF_DATE} 12:00`, reason: '新增项目' };
}

export function buildDeviceRegistrationLog(deviceId, operatorId = 'account-admin') {
  return { operatorId, operation: 'deviceRegister', module: 'devices', targetId: deviceId, occurredAt: `${DEMO_AS_OF_DATE} 12:00`, reason: '登记设备' };
}

export function buildProjectLifecycleLog(projectId, status, operatorId = 'account-admin') {
  return { projectId, operatorId, operation: 'projectStatus', module: 'projects', targetId: projectId, occurredAt: `${DEMO_AS_OF_DATE} 12:00`, reason: `项目${status === 'inactive' ? '停用' : status === 'archived' ? '归档' : '恢复'}` };
}

export function updateDeviceAfterSync(device) {
  return { ...device, personnelSync: 'success', faceSync: 'success', permissionSync: 'success', syncStatus: 'success', difference: false, platformPermission: 'allow', devicePermission: 'allow' };
}

function closeBinding(device, action) {
  if (!device?.projectId) return [];
  return [{
    projectId: device.projectId,
    entranceId: device.entranceId,
    entrance: device.entranceName,
    effectiveFrom: device.effectiveFrom || DEMO_AS_OF_DATE,
    effectiveTo: DEMO_AS_OF_DATE,
    action,
    status: 'closed',
  }];
}

export function unbindDevice(device, action = 'unbind') {
  return { ...device, projectId: undefined, entranceId: undefined, entranceName: '未绑定', direction: undefined, bindingStatus: '已解除', attendanceEnabled: false, accessStatus: 'revoked', personnelPermission: 'revoked', facePermission: 'revoked', devicePermission: 'deny', deviceSideAccess: false, bindingHistory: [...(device.bindingHistory || []), ...closeBinding(device, action)] };
}

export function bindDeviceToProject(device, values = {}) {
  const next = { ...device, ...values, projectId: values.projectId || device.projectId, entranceId: values.entranceId, bindingStatus: '已绑定', accessStatus: 'allowed', personnelPermission: 'allowed', facePermission: 'allowed', disabled: false, archived: false, effectiveFrom: values.effectiveFrom || DEMO_AS_OF_DATE, bindingHistory: device.bindingHistory || [] };
  return { ...next, entranceName: values.entranceName || next.entranceName || '已绑定出入口' };
}

export function beginDeviceBindingSync(device, values = {}) {
  return {
    ...bindDeviceToProject(device, values),
    bindingStatus: '待同步',
    personnelSync: 'syncing',
    faceSync: 'syncing',
    permissionSync: 'syncing',
    syncStatus: 'syncing',
    platformPermission: 'allow',
    devicePermission: 'deny',
    effectivePermission: false,
    accessStatus: 'revoked',
    personnelPermission: 'revoked',
    facePermission: 'revoked',
  };
}

export function moveDeviceBinding(device, values = {}) {
  return { ...bindDeviceToProject(unbindDevice(device, 'move'), values), previousProjectId: device.projectId, syncStatus: 'syncing' };
}

export function canRestoreDevice(device, projects = mockData.projects) {
  const project = projects.find((item) => item.id === device?.projectId);
  return !project || project.status === 'active';
}

export function makeDeviceRows(role, lifecycleState, authorizations = mockData.specialAuthorizations, registeredDevices = [], projectPeople = mockData.projectPeople, peopleRecords = mockData.people, projectsRecords = mockData.projects) {
  const entranceMap = Object.fromEntries(mockData.entrances.map((entrance) => [entrance.id, entrance]));
  const syncMap = Object.fromEntries(mockData.permissionSyncRecords.map((record) => [record.deviceId, record]));
  const overrides = lifecycleState?.deviceOverrides || {};
  const projectOverrides = lifecycleState?.projectOverrides || {};
  const rows = mergeDevices(registeredDevices).map((device, index) => {
    const entrance = entranceMap[device.entranceId] || {};
    const sync = syncMap[device.id] || {};
    const deviceOverride = overrides[device.id] || {};
    const effectiveProjectId = Object.prototype.hasOwnProperty.call(deviceOverride, 'projectId') ? deviceOverride.projectId : device.projectId;
    const projectStatus = projectOverrides[effectiveProjectId]?.status || projectsRecords.find((project) => project.id === effectiveProjectId)?.status || 'active';
    const project = projectsRecords.find((item) => item.id === effectiveProjectId);
    const ageConfig = getProjectAgeConfig(project);
    const effectiveSyncStatus = deviceOverride.syncStatus ?? device.syncStatus ?? device.permissionSync ?? sync.status ?? 'success';
    const overrideEffectivePermission = Object.prototype.hasOwnProperty.call(deviceOverride, 'effectivePermission') ? deviceOverride.effectivePermission : undefined;
    const rawEffectivePermission = overrideEffectivePermission !== undefined ? overrideEffectivePermission : (device.effectivePermission !== undefined ? device.effectivePermission : (sync.effectivePermission !== undefined ? sync.effectivePermission : (device.platformPermission ?? sync.platformPermission) !== 'deny'));
    const effectivePermission = effectiveSyncStatus === 'success' && rawEffectivePermission !== false;
    const platformPermission = deviceOverride.platformPermission ?? device.platformPermission ?? sync.platformPermission ?? (effectivePermission === false ? 'deny' : 'allow');
    const devicePermission = deviceOverride.devicePermission ?? device.devicePermission ?? sync.devicePermission ?? 'allow';
    const ageRestricted = projectPeople
      .filter((relation) => relation.projectId === effectiveProjectId)
      .some((relation) => {
        const person = peopleRecords.find((item) => item.id === relation.personId);
        const authorization = authorizations.find((item) => item.projectId === relation.projectId && item.personId === relation.personId);
        return getAgeAccessState({ birthDate: person?.birthDate, asOfDate: DEMO_AS_OF_DATE, threshold: ageConfig.ageThreshold, warningDays: ageConfig.ageWarningDays, specialAuthorization: authorization }).allowed === false;
      });
    const projectLifecycle = projectStatus === 'active' ? {} : {
      lifecycleStatus: projectStatus === 'archived' ? 'archived' : 'stopped',
      online: false,
      disabled: true,
      archived: projectStatus === 'archived',
      syncStatus: 'stopped',
    };
    const row = {
      ...device,
      platformId: device.platformId ?? device.platformDeviceId ?? `PLAT-${String(index + 1).padStart(3, '0')}`,
      platformDeviceId: device.platformDeviceId ?? device.platformId ?? `PLAT-${String(index + 1).padStart(3, '0')}`,
      hikvisionSerial: device.hikvisionSerial ?? `HIK-${device.id.toUpperCase()}`,
      model: device.model ?? (index === 1 ? 'DS-K1T341' : 'DS-K1T671'),
      entranceName: device.entranceName ?? entrance.name ?? '未配置',
      direction: device.direction ?? entrance.direction ?? 'both',
      online: device.online ?? device.id !== 'device-a-out',
      attendanceEnabled: device.attendanceEnabled ?? device.id !== 'device-b-main',
      personnelSync: device.personnelSync ?? (device.id === 'device-a-in' ? 'failed' : 'success'),
      faceSync: device.faceSync ?? (device.id === 'device-a-in' ? 'failed' : 'success'),
      permissionSync: effectiveSyncStatus,
      syncStatus: effectiveSyncStatus,
      platformPermission,
      devicePermission,
      effectivePermission,
      deviceSideAccess: devicePermission === 'allow',
      permissionMismatch: device.permissionMismatch ?? device.difference ?? (sync.difference === true || (effectivePermission === false && devicePermission === 'allow')),
      difference: device.difference ?? (sync.difference === true || (effectivePermission === false && devicePermission === 'allow')),
      bindingStatus: effectiveProjectId ? '已绑定' : '未绑定',
      accessStatus: device.accessStatus ?? (ageRestricted ? 'revoked' : 'allowed'),
      personnelPermission: device.personnelPermission ?? (ageRestricted ? 'revoked' : 'allowed'),
      facePermission: device.facePermission ?? (ageRestricted ? 'revoked' : 'allowed'),
      lifecycleStatus: device.lifecycleStatus ?? 'active',
      disabled: device.disabled ?? false,
      archived: device.archived ?? false,
      ...deviceOverride,
      ...projectLifecycle,
    };
    const lifecycleRevoked = projectStatus !== 'active' || !effectiveProjectId || deviceOverride.disabled === true || deviceOverride.archived === true || ['stopped', 'archived'].includes(deviceOverride.lifecycleStatus);
    const revokeDeviceSide = lifecycleRevoked || deviceOverride.syncStatus === 'syncing';
    return lifecycleRevoked || ageRestricted || effectivePermission === false || effectiveSyncStatus !== 'success'
      ? { ...row, accessStatus: 'revoked', personnelPermission: 'revoked', facePermission: 'revoked', devicePermission: revokeDeviceSide ? 'deny' : row.devicePermission, deviceSideAccess: revokeDeviceSide ? false : row.deviceSideAccess }
      : row;
  });
  return filterByDataScope(normalizeUser(role), rows);
}

export function getProjectDevicePermission(projectId, lifecycleState, deviceId, registeredDevices = [], projectsRecords = mockData.projects) {
  const syncMap = Object.fromEntries(mockData.permissionSyncRecords.map((record) => [record.deviceId, record]));
  const projectStatus = lifecycleState?.projectOverrides?.[projectId]?.status || projectsRecords.find((project) => project.id === projectId)?.status;
  if (projectStatus !== 'active') return { hasDevice: false, effectivePermission: false, devicePermission: 'deny', deviceSideAccess: false, syncStatus: 'stopped', permissionMismatch: false, failedDeviceIds: [], devices: [] };
  const candidates = mergeDevices(registeredDevices).filter((device) => {
    if (deviceId && device.id !== deviceId) return false;
    const override = lifecycleState?.deviceOverrides?.[device.id] || {};
    const effectiveProjectId = Object.prototype.hasOwnProperty.call(override, 'projectId') ? override.projectId : device.projectId;
    return effectiveProjectId === projectId && override.disabled !== true && override.archived !== true && !['stopped', 'archived'].includes(override.lifecycleStatus);
  });
  const states = candidates.map((device) => {
    const override = lifecycleState?.deviceOverrides?.[device.id] || {};
    const sync = syncMap[device.id] || {};
    const syncStatus = override.syncStatus ?? device.syncStatus ?? device.permissionSync ?? sync.status ?? 'success';
    const rawEffectivePermission = Object.prototype.hasOwnProperty.call(override, 'effectivePermission') ? override.effectivePermission : (device.effectivePermission !== undefined ? device.effectivePermission : (sync.effectivePermission !== undefined ? sync.effectivePermission : (device.platformPermission ?? sync.platformPermission) !== 'deny'));
    const effectivePermission = syncStatus === 'success' && rawEffectivePermission !== false;
    const devicePermission = override.devicePermission ?? device.devicePermission ?? sync.devicePermission ?? 'allow';
    return { deviceId: device.id, effectivePermission, devicePermission, deviceSideAccess: devicePermission === 'allow' && syncStatus !== 'syncing', syncStatus, permissionMismatch: device.permissionMismatch ?? device.difference ?? (sync.difference === true || (effectivePermission === false && devicePermission === 'allow')) };
  });
  return {
    hasDevice: states.length > 0,
    effectivePermission: states.length > 0 && states.every((item) => item.effectivePermission !== false),
    devicePermission: states.some((item) => item.devicePermission === 'allow') ? 'allow' : 'deny',
    deviceSideAccess: states.some((item) => item.deviceSideAccess),
    syncStatus: states.find((item) => item.syncStatus === 'failed')?.syncStatus || states[0]?.syncStatus || 'stopped',
    permissionMismatch: states.some((item) => item.permissionMismatch),
    failedDeviceIds: states.filter((item) => item.syncStatus === 'failed').map((item) => item.deviceId),
    devices: states,
  };
}

export function getTodayAttendance(role, lifecycleState, leaveRecords = mockData.leaveRecords, projectPeople = mockData.projectPeople, projectsRecords = mockData.projects) {
  const date = DEMO_AS_OF_DATE;
  const projects = scopedProjects(role, lifecycleState, projectsRecords);
  const people = projects.flatMap((project) =>
    projectPeople
      .filter((relation) => relation.projectId === project.id)
      .map((relation) => calculateDailyAttendance(mockData.rawEvents, {
        projectId: project.id,
        personId: relation.personId,
        date,
        workStart: project.workStart,
        workEnd: project.workEnd,
        graceMinutes: project.graceMinutes,
        holidayDates: project.holidayDates,
        restDates: project.restDates,
        dayStatus: project.dayStatus,
        leaves: leaveRecords,
      })),
  );
  const workdayRows = people.filter((item) => item.status !== '无需考勤' && item.status !== '请假');
  return {
    rows: workdayRows,
    present: workdayRows.filter((item) => item.status === '正常').length,
    late: workdayRows.filter((item) => item.isLate).length,
    earlyLeave: workdayRows.filter((item) => item.isEarlyLeave).length,
    absent: workdayRows.filter((item) => item.status === '缺勤').length,
    excluded: people.length - workdayRows.length,
  };
}

export function getProjectAttendanceRows({ role, lifecycleState, projectId, date = DEMO_AS_OF_DATE, leaveRecords = mockData.leaveRecords, supplements = mockData.supplementRecords, rawEvents = mockData.rawEvents, projectPeople = mockData.projectPeople, projectsRecords = mockData.projects } = {}) {
  const project = scopedProjects(role, lifecycleState, projectsRecords).find((item) => item.id === projectId);
  if (!project) return [];
  return scopedProjectPeople(role, projectId, projectPeople).map((relation) => applyLeaveAndSupplement(rawEvents, {
    projectId,
    personId: relation.personId,
    date,
    workStart: project.workStart,
    workEnd: project.workEnd,
    graceMinutes: project.graceMinutes,
    holidayDates: project.holidayDates,
    restDates: project.restDates,
    dayStatus: project.dayStatus,
    leaves: leaveRecords,
    supplements,
  }));
}

export function statusLabel(status) {
  return {
    active: '进行中', inactive: '已停用', archived: '已归档', temporary: '临时', valid: '有效', expiring: '即将到期', expired: '已过期', missing: '缺失', failed: '失败', success: '成功',
  }[status] || status || '未知';
}
