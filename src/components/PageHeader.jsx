import React from 'react';
import { Breadcrumb, Space, Typography } from 'antd';

export default function PageHeader({ title, description, breadcrumb = [], extra, children }) {
  const items = breadcrumb.map((item) => ({ title: item }));

  return (
    <div className="page-header">
      {items.length > 0 && <Breadcrumb items={items} />}
      <div className="page-header-main">
        <div>
          <Typography.Title level={2}>{title}</Typography.Title>
          {description && <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>}
        </div>
        {(extra || children) && <Space>{extra}{children}</Space>}
      </div>
    </div>
  );
}

