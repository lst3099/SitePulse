import React, { useEffect } from 'react';
import { Button, Divider, Drawer, Form, Modal, Select, Typography } from 'antd';
import { getAccountRoleLabel } from '../domain/accounts';

function getAccessSummary(person) {
  const hasRevokedAccess = person?.projectRelationships?.some((item) => item.accessStatus === 'revoked');
  return hasRevokedAccess ? '门禁已撤销' : '正常';
}

function getProjectSummary(person) {
  return person?.projectRelationships?.map((item) => item.projectName).filter(Boolean).join('、') || '暂无有效项目';
}

export default function AccountBindingDrawer({ open, onClose, person = {}, account, bindableAccounts = [], projects = [], canManage = false, onBind, onUnbind, onOpenPermissions }) {
  const [form] = Form.useForm();
  const bound = Boolean(account);
  const accessSummary = getAccessSummary(person);
  const accountProjects = account?.projectIds?.map((projectId) => projects.find((project) => project.id === projectId)?.name || projectId).join('、') || '未配置项目范围';

  useEffect(() => {
    form.resetFields();
  }, [form, open, person.id]);

  return (
    <Drawer
      title={`账号关系 · ${person.name || '人员'}`}
      open={open}
      onClose={onClose}
      width={480}
      destroyOnClose
    >
      <div className="account-binding-drawer">
        <section className="account-binding-section">
          <Typography.Title level={5}>人员身份</Typography.Title>
          <div className="account-detail-row"><span>姓名</span><strong>{person.name || '—'}</strong></div>
          <div className="account-detail-row"><span>人员编号</span><strong>{person.personId || person.id || '—'}</strong></div>
          <div className="account-detail-row"><span>项目摘要</span><strong>{getProjectSummary(person)}</strong></div>
        </section>

        <Divider />

        <section className="account-binding-section">
          <Typography.Title level={5}>登录账号</Typography.Title>
          {bound ? (
            <>
              <div className="account-detail-row"><span>账号名称</span><strong>{account.name || '—'}</strong></div>
              <div className="account-detail-row"><span>账号 ID</span><strong>{account.accountId}</strong></div>
              <div className="account-detail-row"><span>账号角色</span><strong>{getAccountRoleLabel(account.role)}</strong></div>
              <div className="account-detail-row"><span>账号状态</span><strong className={account.status === 'inactive' ? 'account-status-warning' : 'account-status-success'}>{account.status === 'inactive' ? '账号已停用' : '启用'}</strong></div>
              <div className="account-detail-row"><span>账号项目范围</span><strong>{accountProjects}</strong></div>
            </>
          ) : (
            <div className="account-empty-state">
              <Typography.Text type="secondary">未关联系统账号</Typography.Text>
              <Typography.Paragraph type="secondary">人员可以没有移动端账号，不影响项目人员关系和设备通行权限。</Typography.Paragraph>
            </div>
          )}
        </section>

        <Divider />

        <section className="account-binding-section">
          <Typography.Title level={5}>权限关系</Typography.Title>
          <div className="account-detail-row"><span>当前门禁状态</span><strong className={accessSummary === '正常' ? 'account-status-success' : 'account-status-warning'}>{accessSummary}</strong></div>
          <Typography.Paragraph className="account-permission-note" type="secondary">登录账号与设备门禁权限独立管理。账号停用或解绑不会自动撤销门禁权限。</Typography.Paragraph>
          <div className="account-detail-row"><span>移动端可见范围</span><strong>{bound ? '本人信息、本人考勤、进出记录、抓拍和关联项目' : '绑定后可查看本人相关信息'}</strong></div>
        </section>

        {!bound && canManage && (
          <>
            <Divider />
            <Form form={form} layout="vertical" onFinish={(values) => onBind?.(values.accountId)}>
              <Form.Item label="选择已有施工人员账号" name="accountId" rules={[{ required: true, message: '请选择要绑定的账号' }]}>
                <Select placeholder={bindableAccounts.length ? '请选择账号' : '暂无可绑定的施工人员账号'} disabled={!bindableAccounts.length} options={bindableAccounts.map((item) => ({ value: item.accountId, label: `${item.name}（${item.accountId}）` }))} />
              </Form.Item>
              <Button type="primary" htmlType="submit" disabled={!bindableAccounts.length}>绑定已有账号</Button>
            </Form>
          </>
        )}

        <div className="account-binding-actions">
          {bound && onOpenPermissions && <Button onClick={onOpenPermissions}>查看用户权限</Button>}
          {bound && canManage && <Button danger onClick={() => Modal.confirm({ title: '确认解绑系统账号？', content: '解绑不会删除账号、人员档案、历史考勤或门禁权限。', okText: '确认解绑', cancelText: '取消', onOk: onUnbind })}>解绑账号</Button>}
        </div>
      </div>
    </Drawer>
  );
}
