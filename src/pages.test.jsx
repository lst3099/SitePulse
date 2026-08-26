import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import WorkbenchPage from './pages/WorkbenchPage';
import ProjectListPage from './pages/ProjectListPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import PeoplePage from './pages/PeoplePage';
import DevicesPage from './pages/DevicesPage';
import HealthAgePage from './pages/HealthAgePage';
import ToolsPage from './pages/ToolsPage';
import BasicDataPage from './pages/BasicDataPage';

const role = { role: 'systemAdmin' };

describe('PC business pages', () => {
  it('renders the core business page headings', () => {
    const markup = renderToStaticMarkup(
      <>
        <WorkbenchPage role={role} />
        <ProjectListPage role={role} />
        <ProjectDetailPage role={role} selectedProjectId="project-a" />
        <PeoplePage role={role} />
        <DevicesPage role={role} />
        <HealthAgePage role={role} />
        <ToolsPage role={role} />
        <BasicDataPage role={role} />
      </>,
    );

    expect(markup).toContain('工作台');
    expect(markup).toContain('项目管理');
    expect(markup).toContain('项目概况');
    expect(markup).toContain('人员档案');
    expect(markup).toContain('设备与门禁');
    expect(markup).toContain('登记设备');
    expect(markup).toContain('健康报告与年龄限制');
    expect(markup).toContain('工具管理');
    expect(markup).toContain('工具编号');
    expect(markup).toContain('基础资料');
  });
});
