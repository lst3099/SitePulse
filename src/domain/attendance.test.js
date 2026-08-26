import { describe, expect, it } from 'vitest';
import {
  applyLeaveAndSupplement,
  calculateDailyAttendance,
  classifyRawEvent,
  deduplicateRawEvents,
  isEffectiveAttendanceEvent,
} from './attendance';

const baseEvent = {
  projectId: 'project-a',
  personId: 'person-1',
  personRegistered: true,
  faceRecognition: 'success',
  direction: 'in',
  eventTime: '2026-08-25T09:00:00+08:00',
  eventSerial: 'event-1',
  deviceId: 'device-a',
  source: 'realtime',
  doorOpened: false,
};

describe('attendance rules', () => {
  it('deduplicates realtime and history copies by device event identity, ignoring source', () => {
    const events = [
      baseEvent,
      { ...baseEvent, source: 'history-replay' },
      { ...baseEvent, deviceId: 'device-b' },
    ];

    expect(deduplicateRawEvents(events)).toHaveLength(2);
    expect(deduplicateRawEvents(events)[0].source).toBe('realtime');
  });

  it('does not deduplicate events for different people', () => {
    expect(deduplicateRawEvents([baseEvent, { ...baseEvent, personId: 'person-2' }])).toHaveLength(2);
  });

  it('keeps supplement records even when their device event identity matches', () => {
    const supplement = { ...baseEvent, recordType: 'supplement', source: 'manual' };

    expect(deduplicateRawEvents([baseEvent, supplement])).toHaveLength(2);
  });

  it('accepts only registered people with successful face recognition regardless of door state', () => {
    expect(isEffectiveAttendanceEvent(baseEvent)).toBe(true);
    expect(
      isEffectiveAttendanceEvent({ ...baseEvent, faceRecognition: 'failure', doorOpened: true }),
    ).toBe(false);
    expect(isEffectiveAttendanceEvent({ ...baseEvent, personRegistered: false })).toBe(false);
  });

  it('keeps failed face events as security logs and excludes them from attendance', () => {
    const classified = classifyRawEvent({ ...baseEvent, faceRecognition: 'failure', doorOpened: true });

    expect(classified.securityLog).toBe(true);
    expect(classified.isEffective).toBe(false);
  });

  it('rejects first authorization failures and explicit device permission denials', () => {
    expect(classifyRawEvent({ ...baseEvent, authorizationState: 'first-sync-failed', deviceAllowed: true }).isEffective).toBe(false);
    expect(classifyRawEvent({ ...baseEvent, deviceAllowed: false }).isEffective).toBe(false);
    expect(classifyRawEvent({ ...baseEvent, effectivePermission: false }).isEffective).toBe(false);
  });

  it('keeps expired device-allowed events effective and marks permission mismatch', () => {
    const classified = classifyRawEvent({
      ...baseEvent,
      permissionStatus: 'expired',
      deviceAllowed: true,
    });

    expect(classified.isEffective).toBe(true);
    expect(classified.expiredPermission).toBe(true);
    expect(classified.permissionMismatch).toBe(true);
  });

  it('keeps platform-denied events when a failed sync leaves the device allowed', () => {
    const classified = classifyRawEvent({
      ...baseEvent,
      platformPermission: 'deny',
      deviceAllowed: true,
      syncStatus: 'failed',
    });

    expect(classified.isEffective).toBe(true);
    expect(classified.permissionMismatch).toBe(true);
  });

  it('aggregates effective entry or exit records and recalculates when a late history event arrives', () => {
    const initial = calculateDailyAttendance(
      [{ ...baseEvent, direction: 'out', eventTime: '2026-08-25T18:00:00+08:00' }],
      { projectId: 'project-a', personId: 'person-1', date: '2026-08-25', workStart: '09:00', workEnd: '18:00', graceMinutes: 15 },
    );
    const recalculated = calculateDailyAttendance(
      [
        { ...baseEvent, direction: 'out', eventTime: '2026-08-25T18:00:00+08:00' },
        { ...baseEvent, eventSerial: 'event-2', eventTime: '2026-08-25T09:20:00+08:00' },
      ],
      { projectId: 'project-a', personId: 'person-1', date: '2026-08-25', workStart: '09:00', workEnd: '18:00', graceMinutes: 15 },
    );

    expect(initial.status).toBe('正常');
    expect(initial.firstPunchAt).toContain('18:00');
    expect(initial.lastPunchAt).toContain('18:00');
    expect(recalculated.firstEntryAt).toContain('09:20');
    expect(recalculated.isLate).toBe(true);
  });

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

  it('marks only a direction that has evidence and never invents late or early-leave results', () => {
    const result = calculateDailyAttendance(
      [
        { ...baseEvent, eventTime: '2026-08-25T09:20:00+08:00' },
        { ...baseEvent, eventSerial: 'event-3', direction: 'out', eventTime: '2026-08-25T17:30:00+08:00' },
      ],
      { projectId: 'project-a', personId: 'person-1', date: '2026-08-25', workStart: '09:00', workEnd: '18:00', graceMinutes: 15 },
    );

    expect(result.status).toBe('正常');
    expect(result.isLate).toBe(true);
    expect(result.isEarlyLeave).toBe(true);
  });

  it('uses the earliest entry, latest exit, and exact grace boundaries with seconds', () => {
    const boundary = calculateDailyAttendance(
      [
        { ...baseEvent, eventSerial: 'entry-boundary', eventTime: '2026-08-25T09:15:00+08:00' },
        { ...baseEvent, eventSerial: 'exit-boundary', direction: 'out', eventTime: '2026-08-25T17:45:00+08:00' },
      ],
      { projectId: 'project-a', personId: 'person-1', date: '2026-08-25', workStart: '09:00:00', workEnd: '18:00:00', graceMinutes: 15 },
    );
    const outsideBoundary = calculateDailyAttendance(
      [
        { ...baseEvent, eventSerial: 'entry-late', eventTime: '2026-08-25T09:15:01+08:00' },
        { ...baseEvent, eventSerial: 'exit-early', direction: 'out', eventTime: '2026-08-25T17:44:59+08:00' },
      ],
      { projectId: 'project-a', personId: 'person-1', date: '2026-08-25', workStart: '09:00:00', workEnd: '18:00:00', graceMinutes: 15 },
    );

    expect(boundary.isLate).toBe(false);
    expect(boundary.isEarlyLeave).toBe(false);
    expect(outsideBoundary.isLate).toBe(true);
    expect(outsideBoundary.isEarlyLeave).toBe(true);
  });

  it('returns absence with no direction timestamps when there are no records', () => {
    const result = calculateDailyAttendance([], {
      projectId: 'project-a', personId: 'person-1', date: '2026-08-25', workStart: '09:00', workEnd: '18:00',
    });

    expect(result.status).toBe('缺勤');
    expect(result.firstEntryAt).toBeNull();
    expect(result.lastExitAt).toBeNull();
    expect(result.effectiveRecords).toEqual([]);
  });

  it('aggregates multiple entrances while isolating project and person scope', () => {
    const result = calculateDailyAttendance(
      [
        { ...baseEvent, deviceId: 'entrance-a-in', eventSerial: 'entry-early', eventTime: '2026-08-25T08:40:00+08:00' },
        { ...baseEvent, deviceId: 'entrance-a-in', eventSerial: 'entry-late', eventTime: '2026-08-25T09:05:00+08:00' },
        { ...baseEvent, deviceId: 'entrance-a-out', eventSerial: 'exit-early', direction: 'out', eventTime: '2026-08-25T17:00:00+08:00' },
        { ...baseEvent, deviceId: 'entrance-a-out', eventSerial: 'exit-late', direction: 'out', eventTime: '2026-08-25T18:30:00+08:00' },
        { ...baseEvent, projectId: 'project-b', deviceId: 'entrance-b', eventSerial: 'other-project' },
        { ...baseEvent, personId: 'person-2', deviceId: 'entrance-a-in', eventSerial: 'other-person' },
      ],
      { projectId: 'project-a', personId: 'person-1', date: '2026-08-25', workStart: '09:00', workEnd: '18:00', graceMinutes: 15 },
    );

    expect(result.effectiveRecords).toHaveLength(4);
    expect(result.firstEntryAt).toContain('08:40');
    expect(result.lastExitAt).toContain('18:30');
    expect(result.rawRecords.every((event) => event.projectId === 'project-a' && event.personId === 'person-1')).toBe(true);
  });

  it('returns no-attendance-required on holidays and rest days while preserving raw events', () => {
    const result = calculateDailyAttendance([baseEvent], {
      projectId: 'project-a',
      personId: 'person-1',
      date: '2026-08-25',
      holidayDates: ['2026-08-25'],
    });

    expect(result.status).toBe('无需考勤');
    expect(result.rawRecords).toHaveLength(1);
    expect(result.effectiveRecords).toHaveLength(0);
  });

  it('treats rest dates and rest day status as no-attendance-required', () => {
    const byDate = calculateDailyAttendance([baseEvent], {
      projectId: 'project-a', personId: 'person-1', date: '2026-08-25', restDates: ['2026-08-25'],
    });
    const byStatus = calculateDailyAttendance([baseEvent], {
      projectId: 'project-a', personId: 'person-1', date: '2026-08-25', dayStatus: 'rest',
    });

    expect(byDate.status).toBe('无需考勤');
    expect(byStatus.status).toBe('无需考勤');
  });

  it('lets approved leave override a supplement for the attendance result', () => {
    const result = applyLeaveAndSupplement([], {
      projectId: 'project-a',
      personId: 'person-1',
      date: '2026-08-25',
      workStart: '09:00',
      workEnd: '18:00',
      leaves: [{ projectId: 'project-a', personId: 'person-1', date: '2026-08-25', status: 'approved' }],
      supplements: [{
        projectId: 'project-a',
        personId: 'person-1',
        date: '2026-08-25',
        direction: 'in',
        eventTime: '2026-08-25T09:00:00+08:00',
        recordType: 'supplement',
      }],
    });

    expect(result.status).toBe('请假');
    expect(result.supplementIgnored).toBe(true);
    expect(result.supplemented).toBe(false);
  });

  it('only applies supplements in scope, on date, and not voided or cancelled', () => {
    const supplements = [
      { projectId: 'project-a', personId: 'person-1', date: '2026-08-25', direction: 'in', eventTime: '2026-08-25T09:00:00+08:00', recordType: 'supplement', approved: true },
      { projectId: 'project-b', personId: 'person-1', date: '2026-08-25', direction: 'in', eventTime: '2026-08-25T09:01:00+08:00', recordType: 'supplement', approved: true },
      { projectId: 'project-a', personId: 'person-2', date: '2026-08-25', direction: 'in', eventTime: '2026-08-25T09:02:00+08:00', recordType: 'supplement', approved: true },
      { projectId: 'project-a', personId: 'person-1', date: '2026-08-26', direction: 'in', eventTime: '2026-08-26T09:03:00+08:00', recordType: 'supplement', approved: true },
      { projectId: 'project-a', personId: 'person-1', date: '2026-08-25', direction: 'in', eventTime: '2026-08-25T09:04:00+08:00', recordType: 'supplement', approved: false },
      { projectId: 'project-a', personId: 'person-1', date: '2026-08-25', direction: 'in', eventTime: '2026-08-25T09:05:00+08:00', recordType: 'supplement', approved: true, voided: true },
      { projectId: 'project-a', personId: 'person-1', date: '2026-08-25', direction: 'in', eventTime: '2026-08-25T09:06:00+08:00', recordType: 'supplement', approved: true, cancelled: true },
    ];

    const result = applyLeaveAndSupplement([], {
      projectId: 'project-a', personId: 'person-1', date: '2026-08-25', supplements,
    });

    expect(result.supplemented).toBe(true);
    expect(result.effectiveRecords).toHaveLength(1);
    expect(result.effectiveRecords[0].eventTime).toContain('09:00');

    const invalidOnly = applyLeaveAndSupplement([], {
      projectId: 'project-a', personId: 'person-1', date: '2026-08-25', supplements: supplements.slice(1),
    });

    expect(invalidOnly.supplemented).toBe(false);
    expect(invalidOnly.effectiveRecords).toEqual([]);
  });

  it('ignores a matching valid supplement when approved leave exists', () => {
    const result = applyLeaveAndSupplement([], {
      projectId: 'project-a', personId: 'person-1', date: '2026-08-25',
      leaves: [{ projectId: 'project-a', personId: 'person-1', date: '2026-08-25', status: 'approved' }],
      supplements: [{ projectId: 'project-a', personId: 'person-1', date: '2026-08-25', direction: 'in', eventTime: '2026-08-25T09:00:00+08:00', recordType: 'supplement', approved: true }],
    });

    expect(result.status).toBe('请假');
    expect(result.supplementIgnored).toBe(true);
    expect(result.supplemented).toBe(false);
    expect(result.effectiveRecords).toEqual([]);
  });

  it('does not modify event or supplement inputs', () => {
    const events = [{ ...baseEvent }];
    const supplements = [{ projectId: 'project-a', personId: 'person-1', date: '2026-08-25', direction: 'in', eventTime: '2026-08-25T09:00:00+08:00', recordType: 'supplement', approved: true }];
    const beforeEvents = JSON.stringify(events);
    const beforeSupplements = JSON.stringify(supplements);

    applyLeaveAndSupplement(events, {
      projectId: 'project-a', personId: 'person-1', date: '2026-08-25', supplements,
    });

    expect(JSON.stringify(events)).toBe(beforeEvents);
    expect(JSON.stringify(supplements)).toBe(beforeSupplements);
  });
});
