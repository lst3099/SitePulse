const NON_WORKING_STATUSES = new Set(['holiday', 'rest', '休息日', '节假日']);

function dateKey(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? '').slice(0, 10);
}

function isSupplement(record) {
  return record.recordType === 'supplement' || record.type === 'supplement';
}

function matchesScope(record, options) {
  return (
    (!options.projectId || record.projectId === options.projectId) &&
    (!options.personId || record.personId === options.personId) &&
    (!options.date || dateKey(record.eventTime || record.date) === options.date)
  );
}

function isUsableSupplement(record, options) {
  return (
    isSupplement(record) &&
    record.projectId === options.projectId &&
    record.personId === options.personId &&
    dateKey(record.eventTime || record.date) === options.date &&
    record.approved !== false &&
    record.voided !== true &&
    record.cancelled !== true
  );
}

function hasSuccessfulFace(record) {
  return (
    record.faceRecognition === 'success' ||
    record.faceRecognitionStatus === 'success' ||
    record.recognitionStatus === 'success' ||
    record.faceStatus === 'success' ||
    record.faceVerified === true
  );
}

function isRegisteredPerson(record) {
  return record.personRegistered === true || record.registered === true || record.personStatus === 'registered';
}

function isDeviceAllowed(record) {
  return record.deviceAllowed === true || record.devicePermission === 'allow';
}

function hasDeniedDevicePermission(record) {
  return (
    record.deviceAllowed === false ||
    record.devicePermission === 'deny' ||
    record.effectivePermission === false
  );
}

function isFirstAuthorizationFailure(record) {
  return (
    record.authorizationState === 'first-sync-failed' ||
    (record.firstAuthorization === true && record.syncStatus === 'failed')
  );
}

function isExpiredPermission(record) {
  return record.permissionStatus === 'expired' || record.permissionExpired === true;
}

function isFaceFailure(record) {
  return (
    record.faceRecognition === 'failure' ||
    record.faceRecognitionStatus === 'failure' ||
    record.recognitionStatus === 'failure' ||
    record.faceStatus === 'failure' ||
    record.faceVerified === false
  );
}

function directionOf(record) {
  if (record.direction === 'in' || record.direction === 'entry' || record.direction === '进门') return 'in';
  if (record.direction === 'out' || record.direction === 'exit' || record.direction === '出门') return 'out';
  return null;
}

function timeInMinutes(value) {
  const text = String(value ?? '');
  const match = text.match(/(?:T|\s)?(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return match
    ? Number(match[1]) * 60 + Number(match[2]) + Number(match[3] || 0) / 60
    : null;
}

function isApprovedLeave(leave, options) {
  return (
    leave.status === 'approved' &&
    leave.projectId === options.projectId &&
    leave.personId === options.personId &&
    dateKey(leave.date || leave.startDate) <= options.date &&
    (!leave.endDate || options.date <= dateKey(leave.endDate))
  );
}

function isNonWorkingDate(date, options) {
  const dates = [
    ...(options.holidayDates || []),
    ...(options.restDates || options.restDays || []),
    ...(options.nonWorkingDates || []),
  ];
  return dates.map(dateKey).includes(date) || NON_WORKING_STATUSES.has(options.dayStatus);
}

export function deduplicateRawEvents(events) {
  const seen = new Set();
  return events.filter((event) => {
    if (isSupplement(event)) return true;

    const fields = [event.deviceId, event.eventSerial, event.eventTime, event.personId];
    if (fields.some((field) => field === undefined || field === null)) return true;

    const key = fields.join('\u001f');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function classifyRawEvent(event) {
  const deviceAllowed = isDeviceAllowed(event);
  const expiredPermission = isExpiredPermission(event);
  const permissionMismatch =
    (expiredPermission && deviceAllowed) ||
    ((event.platformPermission === 'deny' || event.platformAllowed === false) && deviceAllowed);
  const isEffective =
    !isSupplement(event) &&
    isRegisteredPerson(event) &&
    hasSuccessfulFace(event) &&
    !isFirstAuthorizationFailure(event) &&
    !hasDeniedDevicePermission(event);

  return {
    ...event,
    securityLog: event.securityLog === true || isFaceFailure(event),
    expiredPermission,
    permissionMismatch,
    isEffective,
  };
}

export function isEffectiveAttendanceEvent(event) {
  return classifyRawEvent(event).isEffective;
}

export function calculateDailyAttendance(events, options = {}) {
  const date = dateKey(options.date);
  const deviceEvents = (events || []).filter((event) => !isSupplement(event));
  const rawRecords = deduplicateRawEvents(deviceEvents)
    .filter((event) => matchesScope(event, { ...options, date }))
    .map(classifyRawEvent);
  const supplementRecords = (options.supplements || [])
    .filter((record) => isUsableSupplement(record, { ...options, date }))
    .map(classifyRawEvent);
  const leave = (options.leaves || []).find((item) => isApprovedLeave(item, { ...options, date }));
  const nonWorking = isNonWorkingDate(date, options);

  if (leave) {
    return {
      projectId: options.projectId,
      personId: options.personId,
      date,
      status: '请假',
      leave,
      rawRecords,
      effectiveRecords: [],
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
      firstEntryAt: null,
      lastExitAt: null,
      isLate: false,
      isEarlyLeave: false,
    };
  }

  const effectiveRecords = [...rawRecords.filter((event) => event.isEffective), ...supplementRecords];
  const entries = effectiveRecords.filter((event) => directionOf(event) === 'in');
  const exits = effectiveRecords.filter((event) => directionOf(event) === 'out');
  const firstEntry = entries.toSorted((a, b) => String(a.eventTime).localeCompare(String(b.eventTime)))[0];
  const lastExit = exits.toSorted((a, b) => String(b.eventTime).localeCompare(String(a.eventTime)))[0];
  const start = timeInMinutes(options.workStart);
  const end = timeInMinutes(options.workEnd);
  const grace = Number(options.graceMinutes || 0);
  const entryTime = firstEntry ? timeInMinutes(firstEntry.eventTime) : null;
  const exitTime = lastExit ? timeInMinutes(lastExit.eventTime) : null;

  return {
    projectId: options.projectId,
    personId: options.personId,
    date,
    status: effectiveRecords.length ? '正常' : '缺勤',
    rawRecords,
    effectiveRecords,
    firstEntryAt: firstEntry?.eventTime || null,
    lastExitAt: lastExit?.eventTime || null,
    isLate: entryTime !== null && start !== null ? entryTime > start + grace : false,
    isEarlyLeave: exitTime !== null && end !== null ? exitTime < end - grace : false,
  };
}

export function applyLeaveAndSupplement(events, options = {}) {
  const date = dateKey(options.date);
  const leave = (options.leaves || []).find((item) => isApprovedLeave(item, { ...options, date }));
  const supplements = (options.supplements || []).filter((item) => isUsableSupplement(item, { ...options, date }));
  const result = calculateDailyAttendance(events, { ...options, date, leaves: leave ? [leave] : [], supplements: leave ? [] : supplements });

  return {
    ...result,
    supplementIgnored: Boolean(leave && supplements.length),
    supplemented: !leave && supplements.length > 0,
  };
}
