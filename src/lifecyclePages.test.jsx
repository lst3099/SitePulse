import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from './App';
import DevicesPage from './pages/DevicesPage';
import HealthAgePage from './pages/HealthAgePage';
import PeoplePage from './pages/PeoplePage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import { applyProjectLifecycle, createLifecycleState } from './pages/pageUtils';

const admin = { role: 'systemAdmin' };

describe('App lifecycle state page chain', () => {
  it('renders one App-provided lifecycle state consistently in list, detail, people, and devices pages', () => {
    const lifecycleState = applyProjectLifecycle(createLifecycleState(), 'project-a', 'inactive');
    const appMarkup = renderToStaticMarkup(React.createElement(App, { initialRole: 'systemAdmin', initialView: 'projectOverview', initialLifecycleState: lifecycleState }));
    const detailMarkup = renderToStaticMarkup(React.createElement(ProjectDetailPage, { role: admin, lifecycleState, selectedProjectId: 'project-a' }));
    const peopleMarkup = renderToStaticMarkup(React.createElement(PeoplePage, { role: admin, lifecycleState }));
    const devicesMarkup = renderToStaticMarkup(React.createElement(DevicesPage, { role: admin, lifecycleState }));

    expect(appMarkup).toContain('已停用');
    expect(detailMarkup).toContain('已停用');
    expect(detailMarkup).toContain('历史数据');
    expect(peopleMarkup).toContain('58 岁');
    expect(peopleMarkup).not.toContain('年龄 / 权限');
    expect(devicesMarkup).toContain('已停用');
  });

  it('renders HealthAge authorization status from page state and feeds it into person access state', () => {
    const authorizations = [{ id: 'authorization-pending', projectId: 'project-b', personId: 'person-3', type: '超龄临时授权', operatorId: 'admin-1', authorizer: '系统管理员', basis: '专项审批', effectiveAt: '2026-09-01', expiresAt: '2026-09-30' }];
    const markup = renderToStaticMarkup(React.createElement(HealthAgePage, { role: admin, authorizations }));

    expect(markup).toContain('生效前');
    expect(markup).toContain('超龄临时授权');
    expect(markup).toContain('超龄');
  });
});
