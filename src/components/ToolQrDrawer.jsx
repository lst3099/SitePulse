import React from 'react';
import { Button, Drawer, QRCode, Space, Tag, Typography, message } from 'antd';
import { getToolQrUrl } from '../domain/tools';

export default function ToolQrDrawer({ open, tool, onClose, onOpenMobile }) {
  if (!tool) return null;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://construction-personnel.example.com';
  const qrUrl = getToolQrUrl(tool, origin);
  const print = () => {
    if (typeof window !== 'undefined') window.print();
    message.success('已打开打印操作（本地演示）');
  };
  return (
    <Drawer title="工具二维码" open={open} onClose={onClose} width={360}>
      <div className="tool-qr-card">
        <Typography.Title level={4}>{tool.name}</Typography.Title>
        <Typography.Text type="secondary">{tool.model}</Typography.Text>
        <div className="tool-qr-code"><QRCode value={qrUrl} size={220} /></div>
        <Tag color="blue">{tool.toolCode}</Tag>
        <Typography.Paragraph copyable={{ text: qrUrl }} className="tool-qr-url">{qrUrl}</Typography.Paragraph>
        <Space wrap>
          <Button type="primary" onClick={print}>打印二维码</Button>
          <Button onClick={() => onOpenMobile?.(tool)}>打开移动端查看</Button>
        </Space>
      </div>
    </Drawer>
  );
}
