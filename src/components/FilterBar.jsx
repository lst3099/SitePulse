import React from 'react';
import { Button, Space } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';

export default function FilterBar({ children, onReset, onSearch }) {
  return (
    <div className="filter-bar">
      <Space wrap>{children}</Space>
      <Space>
        <Button icon={<ReloadOutlined />} onClick={onReset}>重置</Button>
        <Button type="primary" icon={<SearchOutlined />} onClick={onSearch}>查询</Button>
      </Space>
    </div>
  );
}

