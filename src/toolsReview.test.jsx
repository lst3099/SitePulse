import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from './App';
import MobileToolsPage from './pages/mobile/MobileToolsPage';
import ToolDetailPage from './pages/mobile/ToolDetailPage';
import mockData from './data/mockData';

describe('工具管理原型', () => {
  it('keeps the tool filter toolbar wide enough for all search controls', () => {
    const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.tool-toolbar\s*\{[^}]*max-width:\s*none;/s);
    expect(css).toMatch(/\.tool-filter-row\s*\{[^}]*width:\s*100%;/s);
  });

  it('keeps the unified inspection note below the filter toolbar', () => {
    const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.tool-rule-note\s*\{[^}]*margin:\s*12px\s+0\s+18px;/s);
  });

  it('renders the global tool list, unified rule and derived inspection states', () => {
    const markup = renderToStaticMarkup(<App initialRole="systemAdmin" initialView="tools" />);
    expect(markup).toContain('工具管理');
    expect(markup).toContain('统一检查规则');
    expect(markup).toContain('TL-000001');
    expect(markup).toContain('已逾期');
    expect(markup).toContain('不合格');
  });

  it('keeps mobile QR details read-only for workers', () => {
    const markup = renderToStaticMarkup(<ToolDetailPage role={mockData.accounts.find((account) => account.role === 'worker')} tool={mockData.tools[0]} inspections={mockData.toolInspections} policy={mockData.toolInspectionPolicy} projectsRecords={mockData.projects} asOfDate="2026-08-25" />);
    expect(markup).toContain('工具详情');
    expect(markup).toContain('塔吊安全绳');
    expect(markup).not.toContain('开始检查');
  });

  it('mobile tools page starts directly with the project tool list', () => {
    const markup = renderToStaticMarkup(<MobileToolsPage project={mockData.projects[0]} tools={mockData.tools} />);

    expect(markup).not.toContain('查看工器具状态和基础信息。');
    expect(markup).not.toContain('当前项目');
    expect(markup).toContain('工具清单（3）');
  });
});
