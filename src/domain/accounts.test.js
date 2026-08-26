import { describe, expect, it } from 'vitest';
import {
  bindWorkerAccount,
  buildAccountBindingLog,
  getBindableAccounts,
  getPersonAccountState,
  unbindWorkerAccount,
} from './accounts';

const accounts = [
  { accountId: 'account-worker-1', name: '施工人员张伟', role: 'worker', personId: 'person-1', projectIds: ['project-a'], status: 'active' },
  { accountId: 'account-worker-2', name: '待绑定施工人员账号', role: 'worker', projectIds: ['project-a'], status: 'active' },
  { accountId: 'account-owner-a', name: '项目负责人甲', role: 'projectOwner', projectIds: ['project-a'], status: 'active' },
  { accountId: 'account-disabled-worker', name: '停用账号', role: 'worker', projectIds: ['project-a'], status: 'inactive' },
  { accountId: 'account-worker-other', name: '其他人员账号', role: 'worker', personId: 'person-3', projectIds: ['project-a'], status: 'active' },
];

const person = { id: 'person-2', projectIds: ['project-a'] };
const context = { activeProjectIds: ['project-a'], personProjectIds: ['project-a'] };

describe('worker account binding domain', () => {
  it('returns mutually exclusive binding statuses', () => {
    expect(getPersonAccountState('person-1', accounts)).toBe('bound');
    expect(getPersonAccountState('person-2', accounts)).toBe('unbound');
    expect(getPersonAccountState('person-3', [{ personId: 'person-3', status: 'inactive' }])).toBe('inactive');
  });

  it('only exposes active unbound worker accounts covering an active project', () => {
    expect(getBindableAccounts(accounts, person, context)).toEqual([
      expect.objectContaining({ accountId: 'account-worker-2' }),
    ]);
  });

  it('rejects occupied, inactive, non-worker, and out-of-scope accounts', () => {
    expect(bindWorkerAccount(accounts, 'person-2', 'account-worker-other', context).error).toContain('已关联其他施工人员');
    expect(bindWorkerAccount(accounts, 'person-2', 'account-disabled-worker', context).error).toContain('启用');
    expect(bindWorkerAccount(accounts, 'person-2', 'account-owner-a', context).error).toContain('施工人员账号');
    expect(bindWorkerAccount(accounts, 'person-2', 'account-worker-2', { activeProjectIds: ['project-b'], personProjectIds: ['project-a'] }).error).toContain('有效项目');
  });

  it('binds and unbinds without changing project scope', () => {
    const original = accounts.map((account) => ({ ...account }));
    const bound = bindWorkerAccount(accounts, 'person-2', 'account-worker-2', context);
    expect(bound.error).toBeUndefined();
    expect(bound.accounts.find((item) => item.accountId === 'account-worker-2')).toMatchObject({ personId: 'person-2', projectIds: ['project-a'] });
    expect(accounts).toEqual(original);

    const unbound = unbindWorkerAccount(bound.accounts, 'person-2');
    expect(unbound.error).toBeUndefined();
    expect(unbound.accounts.find((item) => item.accountId === 'account-worker-2')).not.toHaveProperty('personId');
    expect(unbound.accounts.find((item) => item.accountId === 'account-worker-2').projectIds).toEqual(['project-a']);
  });

  it('builds auditable binding logs', () => {
    expect(buildAccountBindingLog({ projectId: 'project-a', personId: 'person-2', accountId: 'account-worker-2', operatorId: 'account-admin', operation: 'accountBind' })).toMatchObject({
      projectId: 'project-a',
      operatorId: 'account-admin',
      operation: 'accountBind',
      module: 'people',
      targetId: 'person-2',
      accountId: 'account-worker-2',
      reason: '绑定施工人员账号',
    });
    expect(buildAccountBindingLog({ projectId: 'project-a', personId: 'person-2', accountId: 'account-worker-2', operatorId: 'account-admin', operation: 'accountUnbind' }).reason).toBe('解除施工人员账号关联');
  });
});
