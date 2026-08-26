const SENSITIVE_FIELDS = new Set([
  'idCard',
  'idCardNumber',
  'face',
  'faceImage',
  'healthReport',
  'qualification',
  'qualifications',
  'capturePhoto',
  'snapshotPhoto',
]);

const OWNER_OPERATIONS = new Set([
  'editPerson',
  'bindDevice',
  'replaceFace',
  'leave',
  'applyLeave',
  'supplement',
  'specialAuthorization',
  'export',
]);

const SUPPORTED_OPERATIONS = new Set([
  ...OWNER_OPERATIONS,
  'accountOpen',
  'accountDisable',
  'accountReset',
]);

function roleOf(user) {
  return typeof user === 'string' ? user : user?.role;
}

function projectIdsOf(user) {
  return user?.projectIds || user?.authorizedProjectIds || [];
}

function isInProjectScope(user, projectId) {
  return roleOf(user) === 'systemAdmin' || (Boolean(projectId) && projectIdsOf(user).includes(projectId));
}

export function canViewField(user, field, subject = {}) {
  const role = roleOf(user);
  if (!role || !isInProjectScope(user, subject.projectId)) return false;
  if (role === 'systemAdmin' || role === 'projectOwner') return true;
  if (role !== 'worker') return false;
  const currentUserPersonId = subject.currentUserPersonId || user.currentUserPersonId || user.personId;
  const targetPersonId = subject.targetPersonId || subject.personId;
  const accountPersonId = user.personId || user.currentUserPersonId;
  const isOwnPerson = Boolean(accountPersonId && currentUserPersonId && targetPersonId) &&
    accountPersonId === currentUserPersonId && currentUserPersonId === targetPersonId;

  if (!isOwnPerson) return false;
  if (!SENSITIVE_FIELDS.has(field)) return true;
  return subject.accountId === undefined || subject.accountId === user.accountId;
}

export function canOperate(user, operation, context = {}) {
  const role = roleOf(user);
  if (!role || !SUPPORTED_OPERATIONS.has(operation)) return false;
  if (role === 'systemAdmin') return true;
  if (role !== 'projectOwner' || !isInProjectScope(user, context.projectId)) return false;
  if (operation === 'bindDevice') {
    if (context.device?.projectId && context.device.projectId !== context.projectId) return false;
    return context.deviceRegistered === true || context.device?.registered === true;
  }
  return OWNER_OPERATIONS.has(operation);
}

export function canAccessDevice(person = {}, context = {}) {
  if (!(person.registered === true || person.personRegistered === true)) return false;
  if (context.disabled === true || context.archived === true || context.lifecycleStatus === 'stopped' || context.lifecycleStatus === 'archived' || context.projectActive === false) return false;
  if (context.authorizationState === 'first-sync-failed') return false;
  if (['pending', 'expired', 'revoked'].includes(context.specialAuthorizationStatus)) return false;
  if (context.platformPermission === 'deny') return false;
  if (context.deviceAllowed === false || context.devicePermission === 'deny' || context.effectivePermission === false) return false;
  if (context.ageAccessState === 'pending' || (context.ageAccessAllowed === false && context.ageAccessState !== 'warning')) return false;
  if (context.ageAccessState === 'forbidden' && context.hasValidSpecialAuthorization !== true) return false;
  return true;
}

export function filterByDataScope(user, records) {
  const role = roleOf(user);
  if (!['systemAdmin', 'projectOwner', 'worker'].includes(role)) return [];
  if (role === 'systemAdmin') return records.slice();
  const projects = projectIdsOf(user);
  return records.filter((record) => {
    if (!projects.includes(record.projectId)) return false;
    return role !== 'worker' || record.personId === undefined || record.personId === user.personId;
  });
}

export function getHomeView(user) {
  const role = roleOf(user);
  return {
    systemAdmin: 'workbench',
    projectOwner: 'projectOverview',
    worker: 'mobileAttendance',
  }[role] || null;
}
