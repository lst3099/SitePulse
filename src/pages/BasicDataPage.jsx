import React, { useState } from 'react';
import { Button, Card, Form, Input, Modal, Table, Tabs, message } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import PageHeader from '../components/PageHeader';

const initialTeams = [{ id: 'team-1', name: '土建一队', leader: '赵师傅', phone: '13600000000', status: '启用' }, { id: 'team-2', name: '钢筋一队', leader: '王师傅', phone: '13500000000', status: '启用' }];
const initialProfessions = [{ id: 'profession-1', name: '钢筋工', category: '结构施工', status: '启用' }, { id: 'profession-2', name: '电工', category: '机电安装', status: '启用' }];

export default function BasicDataPage() {
  const [teams, setTeams] = useState(initialTeams);
  const [professions, setProfessions] = useState(initialProfessions);
  const [activeType, setActiveType] = useState('teams');
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const openModal = (type, record) => { setActiveType(type); setEditing(record || null); form.setFieldsValue(record || {}); setModalOpen(true); };
  const save = (values) => { const setter = activeType === 'teams' ? setTeams : setProfessions; setter((items) => editing ? items.map((item) => item.id === editing.id ? { ...item, ...values } : item) : [...items, { ...values, id: `${activeType}-${Date.now()}`, status: '启用' }]); setModalOpen(false); message.success('基础资料已保存（本地演示）'); };
  const teamColumns = [{ title: '施工队伍', dataIndex: 'name', key: 'name' }, { title: '负责人', dataIndex: 'leader', key: 'leader' }, { title: '联系电话', dataIndex: 'phone', key: 'phone' }, { title: '状态', dataIndex: 'status', key: 'status' }, { title: '操作', key: 'action', render: (_, record) => <Button type="link" icon={<EditOutlined />} onClick={() => openModal('teams', record)}>编辑</Button> }];
  const professionColumns = [{ title: '专业 / 工种', dataIndex: 'name', key: 'name' }, { title: '专业类别', dataIndex: 'category', key: 'category' }, { title: '状态', dataIndex: 'status', key: 'status' }, { title: '操作', key: 'action', render: (_, record) => <Button type="link" icon={<EditOutlined />} onClick={() => openModal('professions', record)}>编辑</Button> }];
  return <div className="business-page"><PageHeader title="基础资料" description="维护施工队伍、专业与工种等项目基础字典。" breadcrumb={['首页', '基础资料']} extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openModal(activeType)}>新增{activeType === 'teams' ? '队伍' : '专业/工种'}</Button>} /><Tabs activeKey={activeType} onChange={setActiveType} items={[{ key: 'teams', label: '施工队伍', children: <Card className="table-card"><Table rowKey="id" columns={teamColumns} dataSource={teams} pagination={false} /></Card> }, { key: 'professions', label: '专业 / 工种', children: <Card className="table-card"><Table rowKey="id" columns={professionColumns} dataSource={professions} pagination={false} /></Card> }]} /><Modal title={editing ? '编辑基础资料' : '新增基础资料'} open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} destroyOnHidden><Form form={form} layout="vertical" onFinish={save}>{activeType === 'teams' ? <><Form.Item label="施工队伍名称" name="name" rules={[{ required: true, message: '请输入队伍名称' }]}><Input /></Form.Item><Form.Item label="负责人" name="leader"><Input /></Form.Item><Form.Item label="联系电话" name="phone"><Input /></Form.Item></> : <><Form.Item label="专业 / 工种" name="name" rules={[{ required: true, message: '请输入专业或工种' }]}><Input /></Form.Item><Form.Item label="专业类别" name="category"><Input /></Form.Item></>}<Button type="primary" htmlType="submit">保存</Button></Form></Modal></div>;
}
