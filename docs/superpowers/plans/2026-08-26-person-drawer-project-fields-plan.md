# 人员档案项目关系字段移除 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在人员档案新增/编辑抽屉中移除项目关系字段，同时保留查看模式的只读关系信息和既有关系数据。

**Architecture:** 以 `PersonDrawerContent` 的 `mode` 区分编辑表单与查看信息：编辑模式不注册项目关系字段，查看模式保留现有只读区块。保存仍通过 `PeoplePage` 的 `buildPersonRecord`，但编辑权限校验使用抽屉已推导出的作用域项目，不再依赖被移除的 `projectId` 表单字段。

**Tech Stack:** React 19, Ant Design 5, Vite, Vitest, pnpm

---

### Task 1: 为新增/编辑表单添加失败回归测试

**Files:**
- Modify: `src/components/AppShell.test.jsx:8,72-145`
- Test target: `src/components/AppShell.test.jsx`

- [ ] **Step 1: Add the behavior assertions before changing production code**

在现有组件测试导入后、`exposes required drawer sections and protects restricted operations` 测试附近增加：

```jsx
  it('hides project relationship fields from add and edit forms while keeping them in view mode', () => {
    const edit = render(
      <PersonDrawerContent
        mode="edit"
        role={{ role: 'systemAdmin' }}
        person={{
          id: 'person-1',
          projectId: 'project-a',
          relationStatus: 'active',
          status: '在场',
          projectOptions: [{ value: 'project-a', label: '项目 A' }],
        }}
        onSubmit={() => {}}
      />,
    );
    const add = render(
      <PersonDrawerContent
        mode="edit"
        role={{ role: 'systemAdmin' }}
        person={{ registered: false, projectOptions: [{ value: 'project-a', label: '项目 A' }] }}
        onSubmit={() => {}}
      />,
    );
    const view = render(
      <PersonDrawerContent
        mode="view"
        role={{ role: 'systemAdmin' }}
        person={{
          projectId: 'project-a',
          relationStatus: 'active',
          status: '在场',
          projectOptions: [{ value: 'project-a', label: '项目 A' }],
        }}
      />,
    );

    for (const markup of [edit, add]) {
      expect(markup).not.toContain('项目关系');
      expect(markup).not.toContain('所属项目');
      expect(markup).not.toContain('关系类型');
      expect(markup).not.toContain('人员状态');
    }
    expect(view).toContain('项目关系');
  });
```

在现有 `filters person project options...` 测试中补充无 `projectId` 表单字段时使用作用域项目完成权限校验的断言：

```jsx
    expect(submitPersonEdit(owner, {}, () => { submitted = true; }, 'project-a')).toBe(true);
    expect(submitted).toBe(true);
```

- [ ] **Step 2: Run the focused test and verify it fails for the missing behavior**

Run:

```bash
pnpm exec vitest run src/components/AppShell.test.jsx
```

Expected: the new visibility assertion fails because the current edit markup still contains `项目关系`, and the scope-only submission assertion returns `false` because `submitPersonEdit` currently reads only `values.projectId`.

### Task 2: 移除新增/编辑表单中的项目关系字段并修正提交作用域

**Files:**
- Modify: `src/components/PersonDrawer.jsx:13-18,62-82`

- [ ] **Step 1: Make permission submission accept the derived scope project**

将提交辅助函数改为使用显式作用域项目作为优先校验值，同时兼容仍带有 `values.projectId` 的旧调用：

```jsx
export function submitPersonEdit(user, values, onSubmit, scopeProjectId) {
  const projectId = scopeProjectId || values?.projectId;
  if (!canOperate(user, 'editPerson', { projectId })) return false;
  if (typeof onSubmit !== 'function') return false;
  onSubmit(values);
  return true;
}
```

- [ ] **Step 2: Keep project relationship fields only in view mode**

把当前 `Divider`、`项目关系` 标题和三个 `Form.Item` 包在 `mode === 'view'` 条件中，保留其现有内容：

```jsx
        {mode === 'view' && (
          <>
            <Divider />
            <Typography.Title level={5}>项目关系</Typography.Title>
            {canView('projectId') && <Form.Item label="所属项目" name="projectId"><Select allowClear placeholder="暂不绑定项目" options={editableProjectOptions} /></Form.Item>}
            {canView('status') && <Form.Item label="关系类型" name="relationStatus"><Select allowClear placeholder="暂不设置关系类型" options={[{ value: 'active', label: '主项目' }, { value: 'temporary', label: '临时项目' }]} /></Form.Item>}
            {canView('status') && <Form.Item label="人员状态" name="status"><Input /></Form.Item>}
          </>
        )}
```

- [ ] **Step 3: Prevent hidden relationship values from becoming edit-form initial values**

在计算 `initialValues` 前，对编辑模式剔除项目关系字段与派生项目字段；查看模式继续使用完整人员对象：

```jsx
  const editFormPerson = mode === 'edit'
    ? (({ projectId, relationStatus, status, projectOptions, projectIds, projectCount, projectRelationships, ...values }) => values)(person)
    : person;
  const initialValues = {
    ...editFormPerson,
    ...(mode === 'view' ? { relationStatus: person.relationStatus || person.projectRelationships?.[0]?.status || 'active' } : {}),
    faceImage: normalizeFileList(person.faceImage || (person.registered ? '已登记人脸照片' : ''), '已登记人脸照片'),
    healthReport: normalizeFileList(person.healthReport, '健康报告'),
    qualifications: normalizeFileList(person.qualifications || person.qualification, '资质证书'),
  };
```

- [ ] **Step 4: Pass the already-derived scope project into the submit helper**

将表单 `onFinish` 从：

```jsx
onFinish={(values) => submitPersonEdit(user, values, onSubmit)}
```

改为：

```jsx
onFinish={(values) => submitPersonEdit(user, values, onSubmit, scopeProjectId)}
```

不要修改 `PeoplePage.jsx` 的 `buildPersonRecord`、`projectPeople` 或列表筛选逻辑；编辑提交没有项目字段时，现有 builder 会从传入的关系集合重建已有人员的关系，新增人员仍按当前规则保持未绑定。

- [ ] **Step 5: Run the focused tests and verify they pass**

Run:

```bash
pnpm exec vitest run src/components/AppShell.test.jsx
```

Expected: all tests in `src/components/AppShell.test.jsx` pass, including the new add/edit visibility regression and the existing view/permission assertions.

### Task 3: 全量验证并检查改动范围

**Files:**
- Verify: `src/components/PersonDrawer.jsx`
- Verify: `src/components/AppShell.test.jsx`
- Verify: `src/task5Review.test.jsx`

- [ ] **Step 1: Run the complete test suite**

Run:

```bash
pnpm test:run
```

Expected: Vitest exits with code 0 and reports zero failed tests.

- [ ] **Step 2: Run the production build**

Run:

```bash
pnpm build
```

Expected: Vite exits with code 0 and produces the existing `dist` build output.

- [ ] **Step 3: Check the diff and commit only feature files**

Run:

```bash
git diff --check
git status --short
git diff -- src/components/PersonDrawer.jsx src/components/AppShell.test.jsx
```

确认 `workspace/方案与原型MECE对照表.md` 的用户修改不被加入，然后提交：

```bash
git add -- src/components/PersonDrawer.jsx src/components/AppShell.test.jsx
git commit -m "feat: remove project fields from person editor"
```

