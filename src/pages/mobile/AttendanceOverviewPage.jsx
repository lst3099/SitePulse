import React, { useMemo } from 'react';
import { Card, Col, Empty, List, Row, Statistic, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { DatePicker } from 'antd';
import mockData from '../../data/mockData';
import { buildMonthlyAttendance, summarizeMonthlyAttendance } from './mobileUtils';

export { buildMonthlyAttendance, summarizeMonthlyAttendance };

export function selectAttendanceMonth(value) {
  return value?.format?.('YYYY-MM') || '';
}

export default function AttendanceOverviewPage({ project, currentPersonId, attendance = mockData.rawEvents, leaveRecords = mockData.leaveRecords, supplements = mockData.supplementRecords, month = '2026-08', asOfDate = '2026-08-25' }) {
  const [selectedMonth, setSelectedMonth] = React.useState(month);
  const selectionKey = `${project?.id || ''}:${currentPersonId || ''}:${month}`;
  React.useEffect(() => setSelectedMonth(month), [selectionKey, month]);
  const records = useMemo(() => buildMonthlyAttendance({ project, currentPersonId, attendance, leaveRecords, supplements, month: selectedMonth, asOfDate }), [asOfDate, attendance, currentPersonId, leaveRecords, project, selectedMonth, supplements]);
  const summary = summarizeMonthlyAttendance(records);

  if (!project || !currentPersonId) return <Empty description="暂无项目考勤数据" />;

  return (
    <div className="mobile-page-stack">
      <Card className="mobile-hero-card" extra={<DatePicker aria-label="选择月份" picker="month" value={dayjs(`${selectedMonth}-01`)} allowClear={false} format="YYYY-MM" onChange={(value) => setSelectedMonth(selectAttendanceMonth(value))} />}><Typography.Text type="secondary">当前项目 · 月度概览</Typography.Text><Typography.Title level={3}>{project.name}</Typography.Title><Typography.Text>{selectedMonth}</Typography.Text></Card>
      <Row gutter={[8, 8]}>
        <Col span={12}><Card><Statistic title="出勤" value={summary.present} /></Card></Col>
        <Col span={12}><Card><Statistic title="迟到" value={summary.late} /></Card></Col>
        <Col span={12}><Card><Statistic title="早退" value={summary.earlyLeave} /></Card></Col>
        <Col span={12}><Card><Statistic title="缺勤" value={summary.absent} /></Card></Col>
        <Col span={12}><Card><Statistic title="请假" value={summary.leave} /></Card></Col>
      </Row>
      <Card title="按日考勤">
        <List
          size="small"
          dataSource={records}
          renderItem={(record) => <List.Item><span>{record.date}</span><Tag color={record.status === '正常' ? 'green' : record.status === '缺勤' ? 'red' : 'blue'}>{record.status}{record.isLate ? ' · 迟到' : ''}{record.isEarlyLeave ? ' · 早退' : ''}</Tag></List.Item>}
        />
      </Card>
    </div>
  );
}
