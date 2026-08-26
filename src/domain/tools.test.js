import { describe, expect, it } from 'vitest';
import {
  buildToolInspectionAlerts,
  buildToolInspectionRecord,
  generateToolCode,
  getInspectionCycle,
  getToolQrUrl,
  getToolInspectionStatus,
  summarizeToolInspections,
} from './tools';

const policy = { enabled: true, frequency: 'monthly', day: 1, expectedDays: 3 };
const tools = [
  { id: 'tool-1', toolCode: 'TL-000001', projectId: 'project-a', usageStatus: '在用' },
  { id: 'tool-2', toolCode: 'TL-000002', projectId: 'project-a', usageStatus: '在用' },
  { id: 'tool-3', toolCode: 'TL-000003', projectId: 'project-a', usageStatus: '遗失' },
  { id: 'tool-4', toolCode: 'TL-000004', projectId: 'project-b', usageStatus: '报废' },
];

describe('tool management domain rules', () => {
  it('generates the next globally unique tool code without reusing gaps', () => {
    expect(generateToolCode([{ toolCode: 'TL-000001' }, { toolCode: 'TL-000009' }])).toBe('TL-000010');
  });

  it('builds a stable QR route from the tool token', () => {
    expect(getToolQrUrl({ qrToken: 'token-1' })).toBe('/mobile/tools/token-1');
  });

  it('calculates a monthly cycle and its expected completion deadline', () => {
    expect(getInspectionCycle('2026-08-02', policy)).toMatchObject({
      key: '2026-08',
      startDate: '2026-08-01',
      deadline: '2026-08-03',
    });
    expect(getInspectionCycle('2026-07-31', policy).key).toBe('2026-07');
  });

  it('changes an unchecked tool from pending to overdue after the deadline', () => {
    expect(getToolInspectionStatus(tools[0], [], policy, '2026-08-03')).toBe('待检查');
    expect(getToolInspectionStatus(tools[0], [], policy, '2026-08-04')).toBe('已逾期');
  });

  it('uses the latest inspection result for the current cycle', () => {
    const inspections = [
      { ...buildToolInspectionRecord(tools[0], { result: '不合格', inspectedAt: '2026-08-01', inspectorId: 'account-owner-a' }, policy), id: 'inspection-1' },
      { ...buildToolInspectionRecord(tools[0], { result: '合格', inspectedAt: '2026-08-02', inspectorId: 'account-owner-a' }, policy), id: 'inspection-2' },
    ];
    expect(getToolInspectionStatus(tools[0], inspections, policy, '2026-08-03')).toBe('正常');
    expect(getToolInspectionStatus(tools[0], [{ ...inspections[0], inspectedAt: '2026-08-04', cycleKey: '2026-08' }], policy, '2026-08-04')).toBe('不合格');
  });

  it('summarizes only active tools for the current inspection cycle', () => {
    const inspections = [{ ...buildToolInspectionRecord(tools[0], { result: '合格', inspectedAt: '2026-08-01', inspectorId: 'account-owner-a' }, policy), id: 'inspection-1' }];
    expect(summarizeToolInspections(tools, inspections, policy, '2026-08-04')).toMatchObject({
      total: 2,
      completed: 1,
      pending: 0,
      overdue: 1,
      failed: 0,
    });
  });

  it('creates one check-day and one overdue summary alert per recipient and cycle', () => {
    const alerts = buildToolInspectionAlerts({ tools, inspections: [], policy, asOfDate: '2026-08-04', existingAlerts: [] });
    expect(alerts).toHaveLength(4);
    expect(alerts.filter((alert) => alert.type === 'tool-inspection-start')).toHaveLength(2);
    expect(alerts.filter((alert) => alert.type === 'tool-inspection-overdue')).toHaveLength(2);
    expect(alerts.find((alert) => alert.type === 'tool-inspection-overdue' && alert.projectId === undefined)).toMatchObject({ count: 2, receivers: ['systemAdmin'] });
    expect(buildToolInspectionAlerts({ tools, inspections: [], policy, asOfDate: '2026-08-04', existingAlerts: alerts })).toEqual([]);
  });
});
