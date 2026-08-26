# 考勤与门禁分层及项目年龄配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让考勤只按最早/最晚有效打卡时间判断迟到、早退和正常，并将考勤详情导航到按项目、人员、日期筛选的门禁记录，同时补齐项目级年龄配置和方案正文口径。

**Architecture:** 保留原始门禁事件的设备、出入口、方向和开门结果，把考勤领域计算改为按有效事件时间排序的独立汇总。App 持有考勤详情跳转筛选条件，`AccessRecordsPage` 消费该条件；项目年龄阈值和预警天数作为项目记录字段，由人员、设备和告警计算共同读取。

**Tech Stack:** React 19, Ant Design 5, Vite, Vitest, dayjs, pnpm

---

### Task 1: 建立干净基线并确认待改动范围

**Files:**
- Verify: `src/domain/attendance.js`
- Verify: `src/pages/AttendancePage.jsx`
- Verify: `src/pages/AccessRecordsPage.jsx`
- Verify: `src/App.jsx`
- Verify: `workspace/source-materials/系统建设方案.md`

- [ ] **Step 1: Run the existing test suite before implementation**

Run:

```bash
corepack pnpm test:run
```

Expected: the existing Vitest suite exits with code 0. If it fails, record the pre-existing failure before changing production code.

- [ ] **Step 2: Confirm the user-owned comparison-table change remains unstaged**

Run:

```bash
git status --short
git diff -- workspace/方案与原型MECE对照表.md
```

Expected: `workspace/方案与原型MECE对照表.md`, `src/components/AppShell.test.jsx`, and `src/pages/PeoplePage.jsx` remain existing working-tree changes and are not included in implementation commits unless a task explicitly requires those files.

### Task 2: Change attendance calculation to chronological first/last punches

**Files:**
- Modify: `src/domain/attendance.test.js:90-143`
- Modify: `src/domain/attendance.js:153-218`

- [ ] **Step 1: Add the failing chronological-punch regression test**

Add this test after the existing aggregation test. It deliberately uses two effective events with no usable direction so the old direction-based implementation cannot satisfy it:

```js
  it('uses chronological first and last effective punches without reading gate direction', () => {
    const result = calculateDailyAttendance([
      { ...baseEvent, direction: undefined, eventSerial: 'punch-late', eventTime: '2026-08-25T09:20:00+08:00' },
      { ...baseEvent, direction: undefined, eventSerial: 'punch-early', eventTime: '2026-08-25T17:30:00+08:00' },
    ], {
      projectId: 'project-a',
      personId: 'person-1',
      date: '2026-08-25',
      workStart: '09:00',
      workEnd: '18:00',
      graceMinutes: 15,
    });

    expect(result.status).toBe('正常');
    expect(result.firstPunchAt).toContain('09:20');
    expect(result.lastPunchAt).toContain('17:30');
    expect(result.firstEntryAt).toContain('09:20');
    expect(result.lastExitAt).toContain('17:30');
    expect(result.isLate).toBe(true);
    expect(result.isEarlyLeave).toBe(true);
  });
```

Update the old single-event expectation in the same test block from a missing first entry to the chronological result:

```js
    expect(initial.firstPunchAt).toContain('18:00');
    expect(initial.lastPunchAt).toContain('18:00');
```

- [ ] **Step 2: Run the focused test and verify the failure is caused by the missing behavior**

Run:

```bash
corepack pnpm exec vitest run src/domain/attendance.test.js
```

Expected: the new test fails because `firstPunchAt`/`lastPunchAt` do not exist and directionless events are not selected as first/last punches. Do not change production code until this red result is observed.

- [ ] **Step 3: Implement the minimal domain change**

In `calculateDailyAttendance`, keep leave and non-working results unchanged except for adding null punch fields, and replace the direction partition with a chronological list:

```js
  if (leave) {
    return {
      projectId: options.projectId,
      personId: options.personId,
      date,
      status: '请假',
      leave,
      rawRecords,
      effectiveRecords: [],
      firstPunchAt: null,
      lastPunchAt: null,
      firstEntryAt: null,
      lastExitAt: null,
      isLate: false,
      isEarlyLeave: false,
    };
  }

  if (nonWorking) {
    return {
      projectId: options.projectId,
      personId: options.personId,
      date,
      status: '无需考勤',
      rawRecords,
      effectiveRecords: [],
      firstPunchAt: null,
      lastPunchAt: null,
      firstEntryAt: null,
      lastExitAt: null,
      isLate: false,
      isEarlyLeave: false,
    };
  }

  const effectiveRecords = [...rawRecords.filter((event) => event.isEffective), ...supplementRecords];
  const punches = effectiveRecords.toSorted((a, b) => String(a.eventTime).localeCompare(String(b.eventTime)));
  const firstPunch = punches[0];
  const lastPunch = punches.at(-1);
  const start = timeInMinutes(options.workStart);
  const end = timeInMinutes(options.workEnd);
  const grace = Number(options.graceMinutes || 0);
  const firstPunchTime = firstPunch ? timeInMinutes(firstPunch.eventTime) : null;
  const lastPunchTime = lastPunch ? timeInMinutes(lastPunch.eventTime) : null;

  return {
    projectId: options.projectId,
    personId: options.personId,
    date,
    status: effectiveRecords.length ? '正常' : '缺勤',
    rawRecords,
    effectiveRecords,
    firstPunchAt: firstPunch?.eventTime || null,
    lastPunchAt: lastPunch?.eventTime || null,
    firstEntryAt: firstPunch?.eventTime || null,
    lastExitAt: lastPunch?.eventTime || null,
    isLate: firstPunchTime !== null && start !== null ? firstPunchTime > start + grace : false,
    isEarlyLeave: lastPunchTime !== null && end !== null ? lastPunchTime < end - grace : false,
  };
```

Remove the now-unused `directionOf` helper. Keep `firstEntryAt` and `lastExitAt` as compatibility aliases for existing report/test consumers; all visible labels use the new punch names.

- [ ] **Step 4: Run the focused tests and verify the green result**

Run:

```bash
corepack pnpm exec vitest run src/domain/attendance.test.js
```

Expected: all attendance-domain tests pass, including exact grace-boundary behavior, leave/rest overrides, supplements, and the new direction-independent calculation.

- [ ] **Step 5: Commit the domain change**

```bash
git add -- src/domain/attendance.js src/domain/attendance.test.js
git commit -m "feat: calculate attendance from chronological punches"
```

### Task 3: Separate attendance display from access-record details

**Files:**
- Modify: `src/pages/AttendancePage.jsx:121-260`
- Modify: `src/pages/ReportsPage.jsx:50-62`
- Modify: `src/pages/AccessRecordsPage.jsx:43-130`
- Modify: `src/attendanceSeparation.test.jsx:54-106`

- [ ] **Step 1: Add failing page-level assertions and pure navigation/filter tests**

In `src/pages/AttendancePage.jsx`, export the pure detail-filter builder before the component:

```js
export function getAccessRecordFilters(row) {
  return { projectId: row.projectId, personId: row.personId, date: row.date };
}
```

Add assertions to `src/attendanceSeparation.test.jsx`:

```jsx
  it('builds access-record filters from an attendance result and keeps gate data there', () => {
    const row = { projectId: 'project-a', personId: 'person-1', date: '2026-08-25' };
    expect(getAccessRecordFilters(row)).toEqual(row);

    const rows = buildAccessRecordRows({
      role: admin,
      rawEvents: mockData.rawEvents,
      projectsRecords: mockData.projects,
      peopleRecords: mockData.people,
      devices: mockData.devices,
      projectId: 'project-a',
      personId: 'person-1',
      date: '2026-08-25',
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((event) => event.projectId === 'project-a' && event.personId === 'person-1')).toBe(true);
    expect(rows.some((event) => event.doorOpened === true)).toBe(true);
  });

  it('labels the attendance table with punch times instead of gate directions', () => {
    const markup = renderToStaticMarkup(
      <ProjectDetailPage role={admin} selectedProjectId="project-a" projectsRecords={mockData.projects} peopleRecords={mockData.people} projectPeople={mockData.projectPeople} leaveRecords={[]} supplements={[]} rawEvents={mockData.rawEvents} />,
    );

    expect(markup).toContain('最早打卡');
    expect(markup).toContain('最晚打卡');
    expect(markup).not.toContain('最早进门');
    expect(markup).not.toContain('最晚出门');
  });
```

Import `getAccessRecordFilters` where the test file needs it; keep the existing access-page tests unchanged.

- [ ] **Step 2: Run the focused page tests and verify they fail**

Run:

```bash
corepack pnpm exec vitest run src/attendanceSeparation.test.jsx
```

Expected: the filter test fails because `buildAccessRecordRows` does not accept `personId`, and the label test fails because the current attendance columns still render the old gate-direction labels.

- [ ] **Step 3: Add person/date initial filters and door-open display to `AccessRecordsPage`**

Add a normalizer and export the display helper:

```js
export function doorOpenedLabel(value) {
  return value === true ? '已开门' : value === false ? '未开门' : '未标记';
}

function normalizeFilters(initialFilters = {}) {
  return {
    deviceId: initialFilters.deviceId || 'all',
    projectId: initialFilters.projectId || 'all',
    personId: initialFilters.personId || 'all',
    date: initialFilters.date || DEFAULT_DATE,
  };
}
```

Extend `buildAccessRecordRows` with `personId` and filter by it after `projectId`. Extend the component props with `initialFilters`, initialize both filter states with `normalizeFilters(initialFilters)`, add the person select, include `personId` in reset, and add this column before device-side permission:

```jsx
{ title: '是否开门', key: 'doorOpened', render: (_, record) => doorOpenedLabel(record.doorOpened) },
```

Pass `personId: appliedFilters.personId === 'all' ? undefined : appliedFilters.personId` into the filtered row builder. Build person options from the unfiltered `allRows` and `peopleRecords`, so an initial person filter remains visible even if that person has no matching event on the selected date.

- [ ] **Step 4: Update attendance table semantics and detail action**

Add `onOpenAccessRecords` to the `AttendancePage` props. Change the result columns to:

```jsx
{ title: '最早打卡', dataIndex: 'firstPunchAt', key: 'firstPunchAt', render: displayDateTime },
{ title: '最晚打卡', dataIndex: 'lastPunchAt', key: 'lastPunchAt', render: displayDateTime },
```

Replace the result-row “详情” action with:

```jsx
<Button type="link" onClick={() => onOpenAccessRecords?.(getAccessRecordFilters(row))}>详情</Button>
```

Keep “补录详情” as the existing platform-result drawer action. Do not add direction-missing anomaly flags. Update the page description and summary wording from “设备原始事件与平台汇总结果”/“有效进出” to distinguish the attendance result from the raw access-record page.

Update `ReportsPage.jsx` labels and values to `最早打卡`/`firstPunchAt` and `最晚打卡`/`lastPunchAt`; retain domain aliases only for compatibility, not visible terminology.

- [ ] **Step 5: Run the focused page tests and verify they pass**

Run:

```bash
corepack pnpm exec vitest run src/attendanceSeparation.test.jsx
```

Expected: all access/attendance separation tests pass, including person filtering, door-open data preservation, and punch-time labels.

- [ ] **Step 6: Commit the page separation change**

```bash
git add -- src/pages/AttendancePage.jsx src/pages/ReportsPage.jsx src/pages/AccessRecordsPage.jsx src/attendanceSeparation.test.jsx
git commit -m "feat: link attendance details to access records"
```

### Task 4: Wire App navigation and project-detail callbacks

**Files:**
- Modify: `src/App.jsx:65-115,225-264`
- Modify: `src/pages/ProjectDetailPage.jsx:15,29,158`

- [ ] **Step 1: Add the callback contract before changing the route wiring**

Use the existing `attendanceSeparation.test.jsx` component coverage and add a source-level integration assertion through a pure helper exported from `App.jsx`:

```js
export function createAccessRecordNavigation(filters) {
  return { view: 'accessRecords', filters: { ...filters } };
}
```

Test it with:

```js
  it('creates a scoped access-record navigation request', () => {
    expect(createAccessRecordNavigation({ projectId: 'project-a', personId: 'person-1', date: '2026-08-25' })).toEqual({
      view: 'accessRecords',
      filters: { projectId: 'project-a', personId: 'person-1', date: '2026-08-25' },
    });
  });
```

- [ ] **Step 2: Run the focused test and verify the callback helper is missing**

Run:

```bash
corepack pnpm exec vitest run src/attendanceSeparation.test.jsx
```

Expected: the new import/assertion fails because `createAccessRecordNavigation` is not exported yet.

- [ ] **Step 3: Wire navigation state through `App.jsx`**

Add state and handlers:

```jsx
  const [accessRecordFilters, setAccessRecordFilters] = useState(null);

  const handleOpenAccessRecords = (filters) => {
    const navigation = createAccessRecordNavigation(filters);
    setAccessRecordFilters(navigation.filters);
    setSelectedProjectId(null);
    setActiveView(navigation.view);
  };
```

When ordinary menu navigation goes to a view other than `accessRecords`, clear the focused filters. Pass `onOpenAccessRecords={handleOpenAccessRecords}` to `ProjectDetailPage`, and render:

```jsx
<AccessRecordsPage
  role={role}
  lifecycleState={lifecycleState}
  rawEvents={attendance}
  projectsRecords={projectsRecords}
  peopleRecords={peopleRecords}
  devices={devices}
  registeredDevices={registeredDevices}
  initialFilters={accessRecordFilters}
/>
```

Pass `onOpenAccessRecords` from `ProjectDetailPage` into its embedded `AttendancePage`. Direct menu access still defaults to the existing date and “全部” filters.

- [ ] **Step 4: Run integration tests and build the route**

Run:

```bash
corepack pnpm exec vitest run src/attendanceSeparation.test.jsx src/task5Review.test.jsx
corepack pnpm build
```

Expected: both test targets pass and Vite exits with code 0.

- [ ] **Step 5: Commit the route wiring**

```bash
git add -- src/App.jsx src/pages/ProjectDetailPage.jsx src/attendanceSeparation.test.jsx
git commit -m "feat: navigate attendance details to scoped access records"
```

### Task 5: Add project-level age threshold and warning configuration

**Files:**
- Modify: `src/data/mockData.js:1-10`
- Modify: `src/pages/pageUtils.js:77-114,244-304,405-472`
- Modify: `src/pages/AlertsPage.jsx:29-47`
- Modify: `src/pages/ProjectListPage.jsx:1-106`
- Modify: `src/pages/ProjectDetailPage.jsx:15-163`
- Modify: `src/App.jsx:225-248,255-264`
- Create: `src/projectAgeConfig.test.jsx`

- [ ] **Step 1: Add failing tests for project-specific age rules and visible configuration**

Create `src/projectAgeConfig.test.jsx`:

```jsx
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
```

- [ ] **Step 2: Run the age tests and verify the expected red result**

Run:

```bash
corepack pnpm exec vitest run src/projectAgeConfig.test.jsx
```

Expected: the first test fails because person/alert calculations currently call `getAgeAccessState` without project threshold/window, and the second fails because project detail has no age configuration fields.

- [ ] **Step 3: Add project defaults and propagate them through all age consumers**

Add to both mock projects:

```js
ageThreshold: 60, ageWarningDays: 30,
```

Add shared helpers in `pageUtils.js`:

```js
export const DEFAULT_AGE_THRESHOLD = 60;
export const DEFAULT_AGE_WARNING_DAYS = 30;

export function getProjectAgeConfig(project = {}) {
  return {
    ageThreshold: Number.isFinite(Number(project.ageThreshold)) ? Number(project.ageThreshold) : DEFAULT_AGE_THRESHOLD,
    ageWarningDays: Number.isFinite(Number(project.ageWarningDays)) ? Number(project.ageWarningDays) : DEFAULT_AGE_WARNING_DAYS,
  };
}
```

Use `getProjectAgeConfig(project)` whenever `makePersonRows`, `makeDeviceRows`, or `buildAgeWarningAlerts` calls `getAgeAccessState`:

```js
const ageConfig = getProjectAgeConfig(project);
const access = getAgeAccessState({
  birthDate: person?.birthDate,
  asOfDate: DEMO_AS_OF_DATE,
  threshold: ageConfig.ageThreshold,
  warningDays: ageConfig.ageWarningDays,
  specialAuthorization: authorization,
});
```

Keep `getAgeAccessState` defaults as a backward-compatible fallback for callers without a project.

- [ ] **Step 4: Add age controls to project list and project detail**

In `ProjectListPage.jsx`, import `InputNumber`, use `getProjectAgeConfig` when opening the form, normalize numeric values in `saveProjectChanges`, and add:

```jsx
<Form.Item label="年龄阈值" name="ageThreshold" rules={[{ required: true, message: '请输入年龄阈值' }]}>
  <InputNumber min={1} max={120} addonAfter="岁" style={{ width: '100%' }} />
</Form.Item>
<Form.Item label="年龄预警天数" name="ageWarningDays" rules={[{ required: true, message: '请输入年龄预警天数' }]}>
  <InputNumber min={0} max={3650} addonAfter="天" style={{ width: '100%' }} />
</Form.Item>
```

In `ProjectDetailPage.jsx`, add `onProjectsRecordsChange` to props, show the effective threshold/window in the overview descriptions, and add an “编辑年龄规则” drawer with the same two `InputNumber` fields. On submit, replace only the selected project record and call `onProjectsRecordsChange(nextProjects)`. Use `canOperate(user, 'editPerson', { projectId: project.id })` for the existing project-scope edit check and show an error without changing state when the callback is absent.

- [ ] **Step 5: Refresh age alerts when project configuration changes**

Change `refreshAgeWarnings` in `App.jsx` to accept `nextProjects = projectsRecords` and pass that list to `buildAgeWarningAlerts`. Add:

```jsx
  const handleProjectsRecordsChange = (next) => {
    setProjectsRecords(next);
    setAlerts((current) => refreshAgeWarnings(current, peopleRecords, projectPeople, authorizations, next));
  };
```

Pass this handler to both `ProjectListPage` and `ProjectDetailPage`. Existing people, relationship, and authorization handlers continue to refresh against the current project list.

- [ ] **Step 6: Run the age tests and verify they pass**

Run:

```bash
corepack pnpm exec vitest run src/projectAgeConfig.test.jsx src/task5Review.test.jsx
```

Expected: the new project-specific warning test, visible detail controls, and existing permission/age tests all pass.

- [ ] **Step 7: Commit the project age configuration change**

```bash
git add -- src/data/mockData.js src/pages/pageUtils.js src/pages/AlertsPage.jsx src/pages/ProjectListPage.jsx src/pages/ProjectDetailPage.jsx src/App.jsx src/projectAgeConfig.test.jsx
git commit -m "feat: support project age access configuration"
```

### Task 6: Synchronize the scheme body and implementation snapshot

**Files:**
- Modify: `workspace/source-materials/系统建设方案.md:64-89,135,328,366-393,432-448,492,611-618,765,809,816,823`
- Modify: `workspace/current-implementation.md:8-16`

- [ ] **Step 1: Replace the scheme’s attendance rules with the confirmed boundary**

Under `#### 考勤管理`, state that the platform aggregates the day’s valid punches by project/person/date, uses the earliest valid punch as the work-start punch and the latest valid punch as the work-end punch, and only uses those times for normal/late/early-leave judgment. State separately that access records retain device, entrance, direction, and door-open result, and that an attendance-detail click navigates to access records filtered by project, person, and date.

Replace the old attendance formula with:

```text
最早有效打卡 > 上班时间 + 迟到宽限时间 → 迟到
最晚有效打卡 < 下班时间 - 早退宽限时间 → 早退
无任何有效打卡记录 → 缺勤
```

- [ ] **Step 2: Align scheme terminology and configurable tool cycle**

Make these exact content changes:

```text
人员未超过年龄限制，或存在有效特殊授权。
检查周期按工器具类型、使用频率和现场风险配置，当前原型默认为每月。
```

Update the scheme’s age section and acceptance checklist to say project-level age threshold and warning days are configurable, with 60/30 as defaults. Update the menu section to distinguish “考勤结果” from “门禁记录”.

- [ ] **Step 3: Remove implementation-document drift**

In `workspace/current-implementation.md`, change the module snapshot from an independent “健康/年龄” module to:

```text
- 人员、项目、设备、考勤、告警、报表。
- 健康报告属于人员资料；年龄权限和特殊授权属于项目详情的项目人员。
- 工器具、基础数据、用户权限、操作日志。
```

Add one sentence that the attendance table judges only punch times and the access-record page shows gate direction/open result.

- [ ] **Step 4: Verify the scheme no longer contains stale active wording**

Run:

```bash
rg -n "特殊审批|三个月|最早进门|最晚出门|缺方向.*异常" workspace/source-materials/系统建设方案.md
git diff --check -- workspace/source-materials/系统建设方案.md workspace/current-implementation.md
```

Expected: the `rg` command returns no matches and `git diff --check` exits with code 0.

- [ ] **Step 5: Commit only the requested documentation files**

```bash
git add -- workspace/source-materials/系统建设方案.md workspace/current-implementation.md
git commit -m "docs: align scheme with attendance and access rules"
```

### Task 7: Full verification and handoff

**Files:**
- Verify: all files changed in Tasks 2–6
- Preserve: `workspace/方案与原型MECE对照表.md`, `src/components/AppShell.test.jsx`, and `src/pages/PeoplePage.jsx` as the user’s existing working-tree changes

- [ ] **Step 1: Run the complete test suite**

```bash
corepack pnpm test:run
```

Expected: Vitest exits with code 0 and reports zero failed tests.

- [ ] **Step 2: Run the production build**

```bash
corepack pnpm build
```

Expected: Vite exits with code 0 and produces the existing `dist` output.

- [ ] **Step 3: Check the final diff and user-change boundary**

```bash
git diff --check
git status --short
git diff --stat
```

Confirm all new source/doc changes are committed, while the existing comparison-table, AppShell test, and PeoplePage changes remain untouched by implementation commits. If the dev server is still running, verify `http://localhost:5173/` returns HTTP 200.

- [ ] **Step 4: Report evidence**

Report the exact test count/result, build exit status, changed files, and the fact that all pre-existing working-tree changes were preserved.
