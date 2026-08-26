import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import mockData from './data/mockData';
import { buildAgeWarningAlerts } from './pages/AlertsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import { makePersonRows } from './pages/pageUtils';

const admin = { role: 'systemAdmin', accountId: 'account-admin' };
const project = { ...mockData.projects[0], ageThreshold: 55, ageWarningDays: 30 };
const person = { ...mockData.people[0], birthDate: '1971-09-01' };
const relation = { projectId: project.id, personId: person.id, status: 'active' };

describe('project age configuration', () => {
  it('uses the project threshold and warning window for person age state and alerts', () => {
    const people = makePersonRows(admin, undefined, [], [relation], [], [person], [project], []);
    const alerts = buildAgeWarningAlerts({ projects: [project], people: [person], projectPeople: [relation], authorizations: [] });

    expect(people[0].projectRelationships[0].ageAccessState).toBe('warning');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].projectId).toBe(project.id);
  });

  it('shows project age controls in project detail', () => {
    const markup = renderToStaticMarkup(<ProjectDetailPage role={admin} selectedProjectId="project-a" projectsRecords={[project]} peopleRecords={[person]} projectPeople={[relation]} leaveRecords={[]} supplements={[]} rawEvents={[]} />);

    expect(markup).toContain('年龄阈值');
    expect(markup).toContain('年龄预警天数');
  });
});
