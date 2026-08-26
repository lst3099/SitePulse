import { calculateDailyAttendance } from '../../domain/attendance';
import { filterByDataScope } from '../../domain/permissions';
import mockData from '../../data/mockData';

export const MOBILE_VIEW_KEYS = new Set([
  'mobileAttendance',
  'mobileOverview',
  'mobileProjects',
  'mobileFaceSync',
  'mobileProfile',
]);

function isEnabledProject(project) {
  return project.status === 'active' && project.archived !== true;
}

function isActiveRelationship(relation) {
  return relation && !['inactive', 'revoked', 'archived'].includes(relation.status);
}

function getPersonRelationships(person, projectPeople = []) {
  const configured = projectPeople.filter((relation) => relation.personId === person?.id);
  const embedded = Array.isArray(person?.projectRelationships) ? person.projectRelationships : [];
  const seen = new Set();
  return [...configured, ...embedded].filter((relation) => {
    const key = `${relation.projectId}:${relation.personId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getWorkerProjects(user, projects, people, projectPeople) {
  const person = people.find((item) => item.id === user?.personId);
  if (!person) return [];
  const activeProjectIds = new Set(getPersonRelationships(person, projectPeople)
    .filter((relation) => relation.status === undefined || relation.status === 'active')
    .map((relation) => relation.projectId));
  return projects.filter((project) => activeProjectIds.has(project.id) && isEnabledProject(project));
}

export function getAuthorizedProjects(user, projects = mockData.projects, people = mockData.people, projectPeople = mockData.projectPeople) {
  if (user?.role === 'worker') return getWorkerProjects(user, projects, people, projectPeople);
  return filterByDataScope(user, projects.map((project) => ({ projectId: project.id, ...project }))).filter(isEnabledProject);
}

export function getCurrentProject(user, currentProjectId, projects = mockData.projects, people = mockData.people, projectPeople = mockData.projectPeople) {
  const authorized = getAuthorizedProjects(user, projects, people, projectPeople);
  return authorized.find((project) => project.id === currentProjectId) || authorized[0];
}

export function getCurrentPerson(user, people = mockData.people) {
  return people.find((person) => person.id === user?.personId);
}

export function getScopedPersonId({ user, requestedPersonId, previewPersonId, people = mockData.people, projects = mockData.projects, projectPeople = mockData.projectPeople }) {
  if (user?.role === 'worker') return getWorkerProjects(user, projects, people, projectPeople).length ? getCurrentPerson(user, people)?.id : undefined;
  const visibleProjectIds = new Set(getAuthorizedProjects(user, projects, people, projectPeople).map((project) => project.id));
  const visiblePersonIds = new Set(people.filter((person) => getPersonRelationships(person, projectPeople).some((relation) => visibleProjectIds.has(relation.projectId) && isActiveRelationship(relation))).map((person) => person.id));
  const candidate = previewPersonId || requestedPersonId;
  return candidate && visiblePersonIds.has(candidate) && people.some((person) => person.id === candidate)
    ? candidate
    : people.find((person) => visiblePersonIds.has(person.id))?.id;
}

export function getProjectDevices(projectId, registeredDevices = [], devices = mockData.devices) {
  const registered = registeredDevices.filter((device) => device.projectId === projectId);
  const registeredKeys = new Set(registered.map((device) => `${device.projectId}:${device.entranceId || device.id}`));
  return [
    ...devices.filter((device) => !registeredKeys.has(`${device.projectId}:${device.entranceId || device.id}`)),
    ...registered,
  ].filter((device) => device.projectId === projectId);
}

export function maskIdCard(value) {
  const text = String(value || '');
  return text.length > 4 ? `${'*'.repeat(Math.max(4, text.length - 4))}${text.slice(-4)}` : '****';
}

export function getDailyAttendance({ project, currentPersonId, attendance = mockData.rawEvents, leaveRecords = mockData.leaveRecords, supplements = mockData.supplementRecords, date = '2026-08-25' }) {
  if (!project || !currentPersonId) return null;
  return calculateDailyAttendance(attendance, {
    projectId: project.id,
    personId: currentPersonId,
    date,
    workStart: project.workStart,
    workEnd: project.workEnd,
    graceMinutes: project.graceMinutes,
    holidayDates: project.holidayDates,
    restDates: project.restDates,
    dayStatus: project.dayStatus,
    leaves: leaveRecords,
    supplements,
  });
}

function formatDate(month, day) {
  return `${month}-${String(day).padStart(2, '0')}`;
}

export function buildMonthlyAttendance({ project, currentPersonId, attendance = mockData.rawEvents, leaveRecords = mockData.leaveRecords, supplements = mockData.supplementRecords, month = '2026-08', asOfDate = '2026-08-25' }) {
  if (!project || !currentPersonId) return [];
  const lastDay = month === asOfDate.slice(0, 7) ? Number(asOfDate.slice(8, 10)) : new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  return Array.from({ length: lastDay }, (_, index) => {
    const date = formatDate(month, index + 1);
    return getDailyAttendance({ project, currentPersonId, attendance, leaveRecords, supplements, date });
  });
}

export function summarizeMonthlyAttendance(records = []) {
  return records.reduce((summary, record) => {
    if (record.status === '正常') summary.present += 1;
    if (record.status === '缺勤') summary.absent += 1;
    if (record.status === '请假') summary.leave += 1;
    if (record.status === '无需考勤') summary.notRequired += 1;
    if (record.isLate) summary.late += 1;
    if (record.isEarlyLeave) summary.earlyLeave += 1;
    return summary;
  }, { present: 0, late: 0, earlyLeave: 0, absent: 0, leave: 0, notRequired: 0 });
}

export function getSyncStatusLabel(status) {
  return {
    pending: '待平台录入',
    syncing: '同步中',
    success: '已同步',
    failed: '同步失败',
  }[status] || '待平台录入';
}
