import React from 'react';
import { CalendarOutlined, ClockCircleOutlined, LoginOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { Alert, Card, DatePicker, Descriptions, Empty, List, Space, Tag, Typography } from 'antd';
import mockData from '../../data/mockData';
import { getDailyAttendance } from './mobileUtils';

const STATUS_COLORS = { 正常: 'green', 迟到: 'orange', 早退: 'orange', 缺勤: 'red', 请假: 'blue', 无需考勤: 'default' };

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

export default function MyAttendancePage({ project, currentPersonId, peopleRecords = mockData.people, attendance = mockData.rawEvents, leaveRecords = mockData.leaveRecords, supplements = mockData.supplementRecords, date = '2026-08-25' }) {
  const [selectedDate, setSelectedDate] = React.useState(date);
  const selectionKey = getAttendanceSelectionKey(date, project?.id, currentPersonId);
  React.useEffect(() => setSelectedDate(date), [selectionKey, date]);
  const result = getDailyAttendance({ project, currentPersonId, attendance, leaveRecords, supplements, date: selectedDate });
  const person = peopleRecords.find((item) => item.id === currentPersonId);
  const status = getAttendanceStatusLabel(result);

  if (!project || !person) return <Empty description="暂无本人项目数据" />;

  return (
    <div className="mobile-page-stack">
      <Card className="mobile-hero-card">
        <Typography.Text type="secondary">当前项目</Typography.Text>
        <Typography.Title level={3}>{project.name}</Typography.Title>
        <Space wrap><Tag color="blue">施工人员：{person.name}</Tag><Tag color={STATUS_COLORS[result?.status] || 'default'}>{status}</Tag></Space>
      </Card>
      <Card title={`${selectedDate} 考勤`} extra={<Space><Typography.Text type="secondary">选择日期</Typography.Text><DatePicker aria-label="选择日期" value={dayjs(selectedDate)} allowClear={false} format="YYYY-MM-DD" onChange={(value) => setSelectedDate(selectAttendanceDate(value))} /></Space>}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label={`${selectedDate} 出勤状态`}><Tag color={STATUS_COLORS[result?.status] || 'default'}>{status}</Tag></Descriptions.Item>
          <Descriptions.Item label="迟到 / 早退">{result?.isLate ? '迟到' : '无'} / {result?.isEarlyLeave ? '早退' : '无'}</Descriptions.Item>
        </Descriptions>
      </Card>
      <Card title="有效进出记录">
        {result?.effectiveRecords?.length ? (
          <List
            dataSource={result.effectiveRecords}
            renderItem={(record) => <List.Item><List.Item.Meta avatar={<LoginOutlined />} title={record.direction === 'out' ? '出门' : '进门'} description={record.eventTime?.replace('T', ' ').replace('+08:00', '')} /><Tag color="green">有效</Tag></List.Item>}
          />
        ) : <Typography.Text type="secondary">{selectedDate} 暂无有效进出记录</Typography.Text>}
      </Card>
      <Alert type="info" showIcon icon={<ClockCircleOutlined />} message="平台考勤结果由当前项目所有出入口的有效设备事件汇总。" description="原始设备记录保持只读，页面仅展示平台结果与可追溯的有效记录。" />
    </div>
  );
}
