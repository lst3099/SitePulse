import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from './App';
import AppShell, { getShellMenu } from './components/AppShell';
import ProjectDetailPage from './pages/ProjectDetailPage';
import { buildAccessRecordRows } from './pages/AccessRecordsPage';
import mockData from './data/mockData';

const admin = { role: 'systemAdmin', accountId: 'account-admin' };

describe('门禁记录与项目考勤结果拆分', () => {
  it('builds device-centered rows from raw events without requiring a project relationship', () => {
    const unlinkedEvent = {
      id: 'event-unlinked-face-failed',
      projectId: 'project-a',
      personId: 'person-not-linked',
      deviceId: 'device-a-in',
      eventSerial: 'serial-unlinked',
      eventTime: '2026-08-25T09:30:00+08:00',
      source: 'realtime',
      faceRecognition: 'failure',
      direction: 'in',
      devicePermission: 'deny',
    };
    const duplicate = { ...unlinkedEvent, id: 'event-unlinked-face-failed-history', source: 'history-replay' };
    const rows = buildAccessRecordRows({
      role: admin,
      rawEvents: [...mockData.rawEvents, unlinkedEvent, duplicate],
      projectsRecords: mockData.projects,
      peopleRecords: mockData.people,
      devices: mockData.devices,
    });

    expect(rows.filter((row) => row.eventSerial === 'serial-unlinked')).toHaveLength(1);
    expect(rows.find((row) => row.eventSerial === 'serial-unlinked').personName).toBe('未知人员');
    expect(rows.find((row) => row.eventSerial === 'serial-unlinked').securityLog).toBe(true);
    expect(rows.find((row) => row.eventSerial === 'serial-unlinked').deviceName).toBe('device-a-in');
  });

  it('limits door access rows to the project owner scope', () => {
    const rows = buildAccessRecordRows({
      role: { role: 'projectOwner', projectIds: ['project-a'] },
      rawEvents: mockData.rawEvents,
      projectsRecords: mockData.projects,
      peopleRecords: mockData.people,
      devices: mockData.devices,
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.projectId === 'project-a')).toBe(true);
  });

  it('filters door access events by device, project, and event date', () => {
    const rows = buildAccessRecordRows({
      role: admin,
      rawEvents: mockData.rawEvents,
      projectsRecords: mockData.projects,
      peopleRecords: mockData.people,
      devices: mockData.devices,
      deviceId: 'device-a-in',
      projectId: 'project-a',
      date: '2026-08-25',
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.deviceId === 'device-a-in' && row.projectId === 'project-a' && row.eventTime.startsWith('2026-08-25'))).toBe(true);
  });

  it('exposes door access as a sidebar page instead of standalone attendance management', () => {
    const menuKeys = getShellMenu(admin).map((item) => item.key);

    expect(menuKeys).toContain('accessRecords');
    expect(menuKeys).not.toContain('attendance');
    expect(renderToStaticMarkup(<AppShell role={admin} />)).toContain('门禁记录');
  });

  it('renders the standalone door access page without platform attendance results', () => {
    const markup = renderToStaticMarkup(<App initialView="accessRecords" />);

    expect(markup).toContain('门禁记录');
    expect(markup).toContain('设备筛选');
    expect(markup).toContain('刷脸结果');
    expect(markup).not.toContain('平台考勤结果');
  });

  it('puts attendance statistics in project overview and result rows in the attendance tab', () => {
    const markup = renderToStaticMarkup(
      <ProjectDetailPage
        role={admin}
        selectedProjectId="project-a"
        projectsRecords={mockData.projects}
        peopleRecords={mockData.people}
        projectPeople={mockData.projectPeople}
        registeredDevices={[]}
        leaveRecords={mockData.leaveRecords}
        supplements={mockData.supplementRecords}
        rawEvents={mockData.rawEvents}
      />,
    );

    expect(markup).toContain('考勤统计');
    expect(markup).toContain('考勤记录');
    expect(markup).not.toContain('项目考勤');
    expect(markup).toContain('平台考勤结果');
  });

  it('fixes embedded attendance to the current project and hides the project filter', () => {
    const markup = renderToStaticMarkup(
      <ProjectDetailPage
        role={admin}
        selectedProjectId="project-a"
        defaultTab="attendance"
        projectsRecords={mockData.projects}
        peopleRecords={mockData.people}
        projectPeople={mockData.projectPeople}
        leaveRecords={[]}
        supplements={[]}
        rawEvents={mockData.rawEvents}
      />,
    );

    expect(markup).toContain('考勤记录');
    expect(markup).toContain('滨江综合体项目');
    expect(markup).not.toContain('北站枢纽项目');
    expect(markup).not.toContain('项目筛选');
  });
});
