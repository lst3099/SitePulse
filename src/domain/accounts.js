import { DEMO_AS_OF_DATE } from '../pages/pageUtils';

const ACCOUNT_ROLE_LABELS = {
  worker: '打卡人员',
  projectOwner: '项目负责人',
  attendanceGuard: '考勤负责人/门卫',
  systemAdmin: '系统管理员',
};

export function getAccountRoleLabel(role) {
  return ACCOUNT_ROLE_LABELS[role] || role || '未设置';
}

export function getPersonAccount(accounts = [], personId) {
  return accounts.find((account) => account.personId === personId);
}

export function getPersonAccountState(personId, accounts = []) {
  const account = getPersonAccount(accounts, personId);
  if (!account) return 'unbound';
  return account.status === 'inactive' ? 'inactive' : 'bound';
}

function getPersonId(person = {}) {
  return person.personId || person.id;
}

function getSharedProjectIds({ activeProjectIds = [], personProjectIds = [] } = {}) {
  const personProjects = new Set(personProjectIds);
  return new Set(activeProjectIds.filter((projectId) => personProjects.has(projectId)));
}

function accountCoversProject(account, projectIds) {
  return (account.projectIds || []).some((projectId) => projectIds.has(projectId));
}

export function getBindableAccounts(accounts = [], person = {}, context = {}) {
  const sharedProjects = getSharedProjectIds(context);
  if (!sharedProjects.size) return [];
  return accounts.filter((account) => (
    account.role === 'worker'
    && account.status === 'active'
    && !account.personId
    && accountCoversProject(account, sharedProjects)
  ));
}

function validateBinding(accounts, personId, accountId, context) {
  if (!personId || !accountId) return '请选择人员和系统账号';
  if (getPersonAccount(accounts, personId)) return '该人员已绑定系统账号';
  const account = accounts.find((item) => item.accountId === accountId);
  if (!account) return '系统账号不存在';
  if (account.personId) return '该账号已关联其他施工人员';
  if (account.role !== 'worker') return '只能绑定施工人员账号';
  if (account.status !== 'active') return '只能绑定启用状态的账号';
  if (!getBindableAccounts(accounts, { id: personId }, context).some((item) => item.accountId === accountId)) return '账号与人员没有共同有效项目';
  return undefined;
}

export function bindWorkerAccount(accounts = [], personId, accountId, context = {}) {
  const error = validateBinding(accounts, personId, accountId, context);
  if (error) return { accounts: accounts.map((account) => ({ ...account })), error };
  const nextAccounts = accounts.map((account) => account.accountId === accountId ? { ...account, personId } : { ...account });
  return { accounts: nextAccounts, account: nextAccounts.find((account) => account.accountId === accountId) };
}

export function unbindWorkerAccount(accounts = [], personId) {
  const account = getPersonAccount(accounts, personId);
  if (!account) return { accounts: accounts.map((item) => ({ ...item })), error: '该人员当前未绑定系统账号' };
  const { personId: _personId, ...unboundAccount } = account;
  const nextAccounts = accounts.map((item) => item.accountId === account.accountId ? { ...unboundAccount } : { ...item });
  return { accounts: nextAccounts, account: unboundAccount };
}

export function buildAccountBindingLog({ projectId, personId, accountId, operatorId = 'account-admin', operation }) {
  const isBind = operation === 'accountBind';
  return {
    projectId,
    operatorId,
    operation: isBind ? 'accountBind' : 'accountUnbind',
    module: 'people',
    targetId: personId,
    accountId,
    occurredAt: `${DEMO_AS_OF_DATE} 12:00`,
    reason: isBind ? '绑定施工人员账号' : '解除施工人员账号关联',
  };
}
