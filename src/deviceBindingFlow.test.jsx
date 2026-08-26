import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DeviceBindingDrawer, { DeviceBindingForm, getDeviceBindingFormValues } from './components/DeviceBindingDrawer';
import ProjectDetailPage from './pages/ProjectDetailPage';
import { beginDeviceBindingSync } from './pages/pageUtils';

describe('门禁设备登记与项目绑定流程', () => {
  it('绑定后进入待同步状态，不能直接视为设备已生效', () => {
    const next = beginDeviceBindingSync(
      { id: 'device-unbound-1', registered: true },
      { projectId: 'project-a', entranceId: 'entrance-a-in', direction: 'in' },
    );

    expect(next).toMatchObject({
      projectId: 'project-a',
      bindingStatus: '待同步',
      personnelSync: 'syncing',
      faceSync: 'syncing',
      permissionSync: 'syncing',
      syncStatus: 'syncing',
      effectivePermission: false,
      devicePermission: 'deny',
    });
  });

  it('项目侧绑定只展示已登记设备，并明确绑定后同步项目人员', () => {
    const markup = renderToStaticMarkup(
      <DeviceBindingForm
        role={{ role: 'systemAdmin' }}
        projectId="project-a"
        fixedProject
        device={{ projectId: 'project-a', registered: false, bindingMode: 'create' }}
        projects={[{ id: 'project-a', name: '项目 A' }]}
        entrances={[{ id: 'entrance-a-in', projectId: 'project-a', name: '东门入口' }]}
        availableDevices={[{ id: 'device-unbound-1', registered: true, platformId: 'PLAT-004', hikvisionSerial: 'HIK-004' }]}
        onSubmit={() => {}}
      />,
    );

    expect(markup).toContain('已登记设备');
    expect(markup).toContain('绑定后将自动同步当前项目人员');
    expect(markup).not.toContain('绑定状态');

    const readyMarkup = renderToStaticMarkup(
      <DeviceBindingForm
        role={{ role: 'systemAdmin' }}
        projectId="project-a"
        fixedProject
        device={{ id: 'device-unbound-1', registered: true, platformId: 'PLAT-004' }}
        projects={[{ id: 'project-a', name: '项目 A' }]}
        entrances={[{ id: 'entrance-a-in', projectId: 'project-a', name: '东门入口' }]}
        onSubmit={() => {}}
      />,
    );
    expect(readyMarkup).toContain('绑定并同步人员');
  });

  it('项目详情直接进入设备绑定，并在绑定设置中选择出入口', () => {
    const markup = renderToStaticMarkup(<ProjectDetailPage role={{ role: 'systemAdmin' }} selectedProjectId="project-a" onDeviceChange={() => {}} />);

    expect(markup).toContain('出入口与设备');
    expect(markup).toContain('绑定设备时选择出入口');
    expect(markup).not.toContain('新建出入口');
  });

  it('项目详情保留项目人员业务入口', () => {
    const markup = renderToStaticMarkup(<ProjectDetailPage role={{ role: 'systemAdmin' }} selectedProjectId="project-a" defaultTab="people" />);

    expect(markup).toContain('项目人员');
    expect(markup).toContain('特殊授权');
    expect(markup).toContain('特殊授权记录');
  });

  it('绑定编辑表单保留物理设备 ID，避免把项目当成设备身份', () => {
    expect(getDeviceBindingFormValues({ id: 'device-unbound-1' })).toMatchObject({ deviceId: 'device-unbound-1' });
    expect(renderToStaticMarkup(<DeviceBindingDrawer open={false} role={{ role: 'systemAdmin' }} />)).not.toContain('Invalid Date');
  });
});
