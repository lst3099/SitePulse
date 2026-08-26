import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AppShell, { getShellMenu } from './AppShell';
import StatusTag from './StatusTag';
import PageHeader from './PageHeader';
import FilterBar from './FilterBar';
import { getEditableProjectOptions, PersonDrawerContent, submitPersonEdit } from './PersonDrawer';
import { DeviceBindingForm } from './DeviceBindingDrawer';
import { DetailDrawerContent } from './DetailDrawer';

const render = (element) => renderToStaticMarkup(element);

describe('PC shell and shared components', () => {
  it('denies unknown or missing roles instead of showing management navigation', () => {
    expect(getShellMenu()).toEqual([]);
    expect(getShellMenu(undefined)).toEqual([]);
    expect(getShellMenu('unknown')).toEqual([]);

    const unknown = render(<AppShell role="unknown" />);
    expect(unknown).not.toContain('工作台');
    expect(unknown).not.toContain('用户与权限');
    expect(unknown).not.toContain('设备登记');
  });

  it('shows role-scoped navigation and renders its content', () => {
    const admin = render(
      <AppShell role="systemAdmin" activeView="workbench">
        <div>管理内容</div>
      </AppShell>,
    );
    const owner = render(<AppShell role={{ role: 'projectOwner', projectIds: ['project-a'] }} />);
    const worker = render(<AppShell role="worker" />);

    expect(admin).toContain('工作台');
    expect(admin).toContain('用户与权限');
    expect(admin).toContain('设备登记');
    expect(admin).toContain('管理内容');
    expect(owner).not.toContain('用户与权限');
    expect(owner).not.toContain('操作日志');
    expect(owner).not.toContain('设备登记');
    expect(worker).toContain('移动端考勤');
    expect(worker).not.toContain('项目管理');
  });

  it('renders shared status and page controls', () => {
    const markup = render(
      <>
        <StatusTag status="syncing" />
        <PageHeader
          title="人员管理"
          description="维护项目人员档案"
          breadcrumb={['项目管理', '人员管理']}
          extra={<button type="button">新增人员</button>}
        />
        <FilterBar onReset={() => {}} onSearch={() => {}}>
          <span>项目筛选</span>
        </FilterBar>
      </>,
    );

    expect(markup).toContain('同步中');
    expect(markup).toContain('维护项目人员档案');
    expect(markup).toContain('项目管理');
    expect(markup).toContain('新增人员');
    expect(markup).toContain('项目筛选');
    expect(markup).toContain('重置');
    expect(markup).toContain('查询');
  });

  it('exposes required drawer sections and protects restricted operations', () => {
    const person = render(
      <PersonDrawerContent
        mode="view"
        role={{ role: 'worker', projectIds: ['project-a'], personId: 'person-1', currentUserPersonId: 'person-1' }}
        person={{ projectId: 'project-a', personId: 'person-9', name: '李娜', phone: '13800000000', status: 'active', registered: true }}
      />,
    );
    const binding = render(
      <DeviceBindingForm role={{ role: 'projectOwner', projectIds: ['project-a'] }} projectId="project-b" />,
    );
    const rawEvent = render(<DetailDrawerContent type="rawEvent" data={{ eventSerial: 'serial-1' }} />);
    const supplement = render(<DetailDrawerContent type="supplement" data={{}} />);

    expect(person).toContain('基础资料');
    expect(person).toContain('项目关系');
    expect(person).toContain('门禁资料');
    expect(person).toContain('健康报告/资质证书');
    expect(person).toContain('现场采集不支持');
    expect(person).not.toContain('姓名');
    expect(person).not.toContain('联系电话');
    expect(person).not.toContain('所属项目');
    expect(person).not.toContain('人员状态');
    expect(person).not.toContain('人员注册状态');
    expect(person).not.toContain('身份证号');
    expect(binding).toContain('项目负责人不能跨项目绑定设备');
    expect(binding).toContain('是否参与考勤');
    expect(rawEvent).toContain('原始事件');
    expect(rawEvent).toContain('只读');
    expect(supplement).toContain('作废原因');
  });

  it('only renders the person save action for admin and in-scope project owner', () => {
    const person = { projectId: 'project-a', personId: 'person-1', name: '张伟', phone: '13800000000' };
    const admin = render(<PersonDrawerContent mode="edit" role={{ role: 'systemAdmin' }} person={person} onSubmit={() => {}} />);
    const owner = render(<PersonDrawerContent mode="edit" role={{ role: 'projectOwner', projectIds: ['project-a'] }} person={person} onSubmit={() => {}} />);
    const worker = render(<PersonDrawerContent mode="edit" role={{ role: 'worker', projectIds: ['project-a'], personId: 'person-1', currentUserPersonId: 'person-1' }} person={person} />);
    const outOfScopeOwner = render(<PersonDrawerContent mode="edit" role={{ role: 'projectOwner', projectIds: ['project-b'] }} person={person} />);

    expect(admin).toContain('保存档案');
    expect(owner).toContain('保存档案');
    expect(worker).not.toContain('保存档案');
    expect(outOfScopeOwner).not.toContain('保存档案');
  });

  it('filters person project options by edit permission and rejects cross-project submission', () => {
    const owner = { role: 'projectOwner', projectIds: ['project-a'] };
    const worker = { role: 'worker', projectIds: ['project-a'], personId: 'person-1', currentUserPersonId: 'person-1' };
    const options = [
      { value: 'project-a', label: '项目 A' },
      { value: 'project-b', label: '项目 B' },
    ];
    let submitted = false;

    expect(getEditableProjectOptions(owner, options)).toEqual([options[0]]);
    expect(getEditableProjectOptions(worker, options)).toEqual([]);
    expect(submitPersonEdit(owner, { projectId: 'project-b' }, () => { submitted = true; })).toBe(false);
    expect(submitted).toBe(false);
    expect(submitPersonEdit(owner, { projectId: 'project-a' }, () => { submitted = true; })).toBe(true);
    expect(submitted).toBe(true);
  });

  it('does not expose drawer submit paths when their callbacks are missing', () => {
    const admin = { role: 'systemAdmin' };
    const person = render(<PersonDrawerContent mode="edit" role={admin} person={{ projectId: 'project-a', personId: 'person-1', name: '张伟' }} />);
    const binding = render(<DeviceBindingForm role={admin} projectId="project-a" device={{ registered: true, projectId: 'project-a' }} projects={[{ id: 'project-a', name: '项目 A' }]} entrances={[{ id: 'entrance-a-in', projectId: 'project-a', name: '东门入口' }]} />);
    const detail = render(<DetailDrawerContent type="supplement" role={admin} data={{ projectId: 'project-a', id: 'supplement-1' }} />);

    expect(person).not.toContain('保存档案');
    expect(submitPersonEdit(admin, { projectId: 'project-a' })).toBe(false);
    expect(binding).not.toContain('保存绑定');
    expect(binding).not.toContain('解除绑定');
    expect(detail).not.toContain('提交作废');
  });

  it('keeps drawer submit paths available when callbacks are connected', () => {
    const admin = { role: 'systemAdmin' };
    const binding = render(<DeviceBindingForm role={admin} projectId="project-a" device={{ registered: true, projectId: 'project-a' }} projects={[{ id: 'project-a', name: '项目 A' }]} entrances={[{ id: 'entrance-a-in', projectId: 'project-a', name: '东门入口' }]} onSubmit={() => {}} onUnbind={() => {}} />);
    const detail = render(<DetailDrawerContent type="supplement" role={admin} data={{ projectId: 'project-a', id: 'supplement-1' }} onSubmit={() => {}} />);

    expect(binding).toContain('保存绑定');
    expect(binding).toContain('解除绑定');
    expect(detail).toContain('提交作废');
  });
});
