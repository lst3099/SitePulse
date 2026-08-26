import React from 'react';
import { LeftOutlined, LoginOutlined, LogoutOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { Alert, Button, Card, Empty, Tag, Typography } from 'antd';
import mockData from '../../data/mockData';
import { getDailyAttendance } from './mobileUtils';

const STATUS_COLORS = { 正常: 'green', 迟到: 'orange', 早退: 'orange', '迟到 / 早退': 'orange', 缺勤: 'red', 请假: 'blue', 无需考勤: 'default' };
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

export function getAttendanceStatusLabel(result) {
  if (!result) return '暂无数据';
  if (result.status !== '正常') return result.status;
  if (result.isLate && result.isEarlyLeave) return '迟到 / 早退';
  if (result.isLate) return '迟到';
  if (result.isEarlyLeave) return '早退';
  return '正常';
}

export function selectAttendanceDate(value) {
  return value?.format?.('YYYY-MM-DD') || '';
}

export function getAttendanceSelectionKey(date, projectId, personId) {
  return `${projectId || ''}:${personId || ''}:${date || ''}`;
}

function getMonthCells(month) {
  const firstDay = dayjs(`${month}-01`);
  const leadingEmptyDays = (firstDay.day() + 6) % 7;
  const dayCount = firstDay.daysInMonth();
  return [
    ...Array.from({ length: leadingEmptyDays }, () => null),
    ...Array.from({ length: dayCount }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`),
  ];
}

function formatEventTime(value) {
  return String(value || '').replace('T', ' ').replace(/([+-]\d{2}:\d{2}|Z)$/, '').slice(0, 16);
}

function getProjectResults({ projects, currentPersonId, attendance, leaveRecords, supplements, date }) {
  return projects.map((project) => ({
    project,
    result: getDailyAttendance({ project, currentPersonId, attendance, leaveRecords, supplements, date }),
  }));
}

function getMarkedDates({ projects, currentPersonId, attendance, leaveRecords, supplements, month }) {
  return new Set(
    getMonthCells(month)
      .filter(Boolean)
      .filter((date) => getProjectResults({ projects, currentPersonId, attendance, leaveRecords, supplements, date })
        .some(({ result }) => result?.effectiveRecords?.length)),
  );
}

function getTimelineRecords(projectResults) {
  return projectResults
    .flatMap(({ project, result }) => (result?.effectiveRecords || []).map((record) => ({
      ...record,
      project,
      status: getAttendanceStatusLabel(result),
    })))
    .sort((left, right) => String(left.eventTime).localeCompare(String(right.eventTime)));
}

export default function MyAttendancePage({ project, projects: providedProjects, currentPersonId, peopleRecords = mockData.people, attendance = mockData.rawEvents, leaveRecords = mockData.leaveRecords, supplements = mockData.supplementRecords, date = '2026-08-25' }) {
  const projects = providedProjects?.length ? providedProjects : project ? [project] : [];
  const [selectedDate, setSelectedDate] = React.useState(date);
  const [selectedMonth, setSelectedMonth] = React.useState(date.slice(0, 7));
  const selectionKey = getAttendanceSelectionKey(date, project?.id, currentPersonId);
  const person = peopleRecords.find((item) => item.id === currentPersonId);

  React.useEffect(() => {
    setSelectedDate(date);
    setSelectedMonth(date.slice(0, 7));
  }, [selectionKey, date]);

  if (!projects.length || !person) return <Empty description="暂无本人项目数据" />;

  const selectedProjects = project ? [project] : [];
  const projectResults = getProjectResults({ projects: selectedProjects, currentPersonId, attendance, leaveRecords, supplements, date: selectedDate });
  const timelineRecords = getTimelineRecords(projectResults);
  const markedDates = getMarkedDates({ projects: selectedProjects, currentPersonId, attendance, leaveRecords, supplements, month: selectedMonth });
  const selectedStatus = getAttendanceStatusLabel(projectResults[0]?.result);
  const selectedDay = dayjs(selectedDate);
  const monthLabel = dayjs(`${selectedMonth}-01`).format('YYYY年M月');

  const chooseDate = (nextDate) => {
    setSelectedDate(nextDate);
    setSelectedMonth(nextDate.slice(0, 7));
  };

  const changeMonth = (offset) => {
    const nextMonth = dayjs(`${selectedMonth}-01`).add(offset, 'month').format('YYYY-MM');
    setSelectedMonth(nextMonth);
    if (selectedDate.slice(0, 7) !== nextMonth) chooseDate(`${nextMonth}-01`);
  };

  return (
    <div className="mobile-page-stack mobile-attendance-page">
      <Card className="mobile-attendance-hero">
        <div className="mobile-attendance-hero-row">
          <div>
            <Typography.Text type="secondary">我的考勤</Typography.Text>
            <Typography.Title level={3}>{person.name}</Typography.Title>
          </div>
          <Tag color="blue">绑定 {projects.length} 个项目</Tag>
        </div>
        <Typography.Text type="secondary">已汇总当前项目的有效打卡记录</Typography.Text>
      </Card>

      <Card className="mobile-attendance-calendar-card">
        <div className="mobile-attendance-calendar-header">
          <Button type="text" aria-label="上个月" icon={<LeftOutlined />} onClick={() => changeMonth(-1)} />
          <Typography.Title level={4}>{monthLabel}</Typography.Title>
          <Button type="text" aria-label="下个月" icon={<RightOutlined />} onClick={() => changeMonth(1)} />
        </div>
        <div className="mobile-attendance-weekdays" aria-hidden="true">
          {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
        </div>
        <div className="mobile-attendance-calendar-grid" aria-label={`${monthLabel}考勤月历`}>
          {getMonthCells(selectedMonth).map((cell, index) => cell ? (
            <button key={cell} type="button" className={`mobile-attendance-day ${cell === selectedDate ? 'selected' : ''}`} onClick={() => chooseDate(cell)} aria-label={cell}>
              <span>{Number(cell.slice(-2))}</span>
              {markedDates.has(cell) && <i className="calendar-dot" aria-label="有打卡记录" />}
            </button>
          ) : <span key={`empty-${index}`} className="mobile-attendance-day empty" aria-hidden="true" />)}
        </div>
      </Card>

      <Card className="mobile-attendance-detail-card">
        <div className="mobile-attendance-detail-header">
          <div>
            <Typography.Title level={4}>{selectedDay.format('YYYY年M月D日')}</Typography.Title>
            <Typography.Text type="secondary">星期{WEEKDAYS[(selectedDay.day() + 6) % 7]}</Typography.Text>
          </div>
          <Tag color={STATUS_COLORS[selectedStatus] || 'default'}>{selectedStatus}</Tag>
        </div>
        {timelineRecords.length ? (
          <div className="mobile-attendance-timeline" aria-label="打卡时间线">
            {timelineRecords.map((record, index) => {
              const isExit = record.direction === 'out' || record.direction === 'exit' || record.direction === '出门';
              return (
                <div className="mobile-attendance-timeline-item" key={`${record.project.id}-${record.id || record.eventTime}-${index}`}>
                  <span className="mobile-attendance-timeline-line" aria-hidden="true" />
                  <span className="mobile-attendance-timeline-dot" aria-hidden="true" />
                  <div className="mobile-attendance-timeline-content">
                    <div className="mobile-attendance-timeline-title">
                      <strong>{isExit ? '下班打卡' : '上班打卡'}</strong>
                      <span>{formatEventTime(record.eventTime).slice(-5)}</span>
                      <Tag color={STATUS_COLORS[record.status] || 'default'}>{record.status}</Tag>
                    </div>
                    <div className="mobile-attendance-timeline-meta">
                      {isExit ? <LogoutOutlined /> : <LoginOutlined />}
                      <span>{record.project.name}</span>
                      <span>{record.project.workStart || '--:--'} - {record.project.workEnd || '--:--'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : <Typography.Text type="secondary">{selectedDate} 暂无有效打卡记录</Typography.Text>}
      </Card>

      <Alert type="info" showIcon message="仅展示当前项目的考勤" description="账号权限受绑定关系控制，页面不会展示未绑定项目或其他人员的打卡信息。" />
    </div>
  );
}
