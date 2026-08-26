import React, { useState } from 'react';
import { Button, Card, Input, Table, Tag, message } from 'antd';
import PageHeader from '../components/PageHeader';
import StatusTag from '../components/StatusTag';
import { projectName } from './pageUtils';

const initialTools = [
  { id: 'tool-1', name: '塔吊安全绳', code: 'TL-001', projectId: 'project-a', checkOn: '2026-08-01', status: '正常' },
  { id: 'tool-2', name: '绝缘手套', code: 'TL-002', projectId: 'project-a', checkOn: '2026-06-01', status: '待检查' },
  { id: 'tool-3', name: '扭力扳手', code: 'TL-003', projectId: 'project-b', checkOn: '2026-07-12', status: '正常' },
];

export default function ToolsPage() {
  const [tools, setTools] = useState(initialTools);
  const [keyword, setKeyword] = useState('');
  const columns = [{ title: '工器具名称', dataIndex: 'name', key: 'name' }, { title: '二维码标签', dataIndex: 'code', key: 'code', render: (value) => <Tag color="blue">{value}</Tag> }, { title: '所属项目', dataIndex: 'projectId', key: 'projectId', render: (value) => projectName(value) }, { title: '上次检查', dataIndex: 'checkOn', key: 'checkOn' }, { title: '三个月检查', dataIndex: 'status', key: 'status', render: (value) => <StatusTag status={value === '正常' ? 'success' : 'warning'} label={value} /> }, { title: '操作', key: 'action', render: (_, tool) => <div className="table-actions"><Button type="link" onClick={() => message.info(`${tool.code} 二维码标签已生成（演示）`)}>生成二维码</Button><Button type="link" onClick={() => { setTools((items) => items.map((item) => item.id === tool.id ? { ...item, status: '正常', checkOn: '2026-08-25' } : item)); message.success('检查状态已更新'); }}>完成检查</Button></div> }];
  return <div className="business-page"><PageHeader title="工器具" description="维护项目工器具档案与二维码标签，按每三个月周期检查。" breadcrumb={['首页', '工器具']} extra={<Tag>借还功能暂未实现</Tag>} /><Card className="tool-toolbar"><Input placeholder="搜索工器具名称或二维码" value={keyword} onChange={(event) => setKeyword(event.target.value)} allowClear /></Card><Card className="table-card"><Table rowKey="id" columns={columns} dataSource={tools.filter((tool) => !keyword || `${tool.name}${tool.code}`.includes(keyword))} pagination={false} /></Card></div>;
}
