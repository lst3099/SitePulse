import React from 'react';
import { DesktopOutlined, MobileOutlined } from '@ant-design/icons';
import { Card, Col, Progress, Row, Space, Statistic, Tag, Typography } from 'antd';
import PageHeader from '../components/PageHeader';
import StatusTag from '../components/StatusTag';
import mockData from '../data/mockData';
import { getTodayAttendance, makeDeviceRows, scopedProjects } from './pageUtils';
import { getVisibleAlerts } from './AlertsPage';

const statCards = [
  ['projectCount', '项目数', 'projectOverview'],
  ['present', '今日出勤', 'attendance'],
  ['late', '迟到', 'attendance'],
  ['earlyLeave', '早退', 'attendance'],
  ['absent', '缺勤', 'attendance'],
  ['online', '设备在线', 'deviceAccess'],
  ['offline', '设备离线', 'deviceAccess'],
  ['syncFailed', '同步失败', 'deviceAccess'],
  ['alertCount', '待处理告警', 'alerts'],
];

export default function WorkbenchPage({ role, lifecycleState, projectsRecords = mockData.projects, peopleRecords = mockData.people, projectPeople = mockData.projectPeople, registeredDevices = [], leaveRecords, alerts = mockData.alerts, onNavigate, mobilePreview, onToggleMobile }) {
  const projects = scopedProjects(role, lifecycleState, projectsRecords);
  const attendance = getTodayAttendance(role, lifecycleState, leaveRecords, projectPeople, projectsRecords);
  const devices = makeDeviceRows(role, lifecycleState, undefined, registeredDevices, projectPeople, peopleRecords, projectsRecords);
  const visibleAlerts = getVisibleAlerts(role, alerts);
  const values = {
    projectCount: projects.filter((project) => project.status === 'active').length,
    present: attendance.present,
    late: attendance.late,
    earlyLeave: attendance.earlyLeave,
    absent: attendance.absent,
    online: devices.filter((device) => device.online).length,
    offline: devices.filter((device) => !device.online).length,
    syncFailed: devices.filter((device) => device.permissionSync === 'failed').length,
    alertCount: visibleAlerts.filter((alert) => (alert.status || 'open') === 'open').length,
  };

  return (
    <div className="business-page">
      <PageHeader title="工作台" description="查看项目、人员、设备与考勤运行概况。" breadcrumb={['首页', '工作台']} />
      <div className="workday-note"><StatusTag status="success" label="工作日统计" /> 今日统计已排除节假日、休息日与请假人员，共排除 {attendance.excluded} 条。</div>
      <Row gutter={[16, 16]} className="stat-grid">
        {statCards.map(([key, label, target]) => (
          <Col xs={12} sm={8} lg={6} xl={Math.max(4, Math.floor(24 / statCards.length))} key={key}>
            <Card className="stat-card" hoverable onClick={() => onNavigate?.(target)}>
              <Statistic title={label} value={values[key]} />
              <Typography.Text type="secondary">点击查看明细</Typography.Text>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} className="content-grid">
        <Col xs={24} lg={14}>
          <Card title="出勤趋势" extra={<Tag color="blue">近 7 个工作日</Tag>}>
            <div className="trend-list">
              {['08-19', '08-20', '08-21', '08-22', '08-25'].map((date, index) => {
                const value = Math.max(1, attendance.present - (index % 2));
                return <div className="trend-row" key={date}><span>{date}</span><Progress percent={Math.round((value / Math.max(attendance.present + 1, 2)) * 100)} format={() => `${value} 人`} /></div>;
              })}
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="设备分布" extra={<Typography.Text type="secondary">按项目</Typography.Text>}>
            {projects.map((project) => {
              const count = devices.filter((device) => device.projectId === project.id).length;
              return <div className="distribution-row" key={project.id}><span>{project.name}</span><Progress percent={Math.round((count / Math.max(devices.length, 1)) * 100)} format={() => `${count} 台`} /></div>;
            })}
            <div className="distribution-summary"><StatusTag status="success" label={`${values.online} 台在线`} /><StatusTag status="offline" label={`${values.offline} 台离线`} /></div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} className="content-grid">
        <Col xs={24} lg={14}><Card title="待处理告警"><Space direction="vertical" className="full-width">{visibleAlerts.filter((alert) => (alert.status || 'open') !== 'closed').map((alert) => <div className="alert-line" data-alert-id={alert.id} key={alert.id}><StatusTag status="warning" label={alert.type === 'expired-permission-allowed' ? '过期权限仍允许通行' : alert.type === 'device-offline' ? '设备离线' : alert.type === 'tool-inspection-start' ? `工具检查提醒 · ${alert.count || 0} 个待检查` : alert.type === 'tool-inspection-overdue' ? `工具检查逾期 · ${alert.count || 0} 个未完成` : '同步失败'} /><Typography.Link onClick={() => onNavigate?.('alerts')}>查看详情</Typography.Link></div>)}</Space></Card></Col>
        <Col xs={24} lg={10}><Card title="快捷入口"><Space wrap><Typography.Link onClick={() => onNavigate?.('projectOverview')}>项目管理</Typography.Link><Typography.Link onClick={() => onNavigate?.('attendance')}>今日考勤</Typography.Link><Typography.Link onClick={() => onNavigate?.('deviceAccess')}>设备状态</Typography.Link><Typography.Link onClick={() => onNavigate?.('alerts')}>告警中心</Typography.Link></Space><Typography.Paragraph type="secondary" className="compact-paragraph">项目人员规模基线：{projects.map((project) => `${project.name} ${projectPeople.filter((item) => item.projectId === project.id).length} 人`).join('；') || '暂无项目'}</Typography.Paragraph></Card></Col>
      </Row>

      <div className="preview-grid">
        <Card className="preview-card" hoverable><Space direction="vertical" align="center"><DesktopOutlined className="preview-icon" /><Typography.Title level={4}>PC 端预览</Typography.Title><Typography.Text type="secondary">当前工作台已接入</Typography.Text></Space></Card>
        <Card className="preview-card" hoverable onClick={onToggleMobile}><Space direction="vertical" align="center"><MobileOutlined className="preview-icon" /><Typography.Title level={4}>APP 端预览</Typography.Title><Typography.Text type="secondary">{mobilePreview ? 'APP 预览已选中' : '点击打开移动端预览入口'}</Typography.Text></Space></Card>
      </div>
    </div>
  );
}
