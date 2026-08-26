import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('Vitest smoke test', () => {
  it('renders the app shell and navigation entry', () => {
    const markup = renderToStaticMarkup(React.createElement(App));

    expect(markup).toContain('工作台');
    expect(markup).toContain('PC 端预览');
    expect(markup).toContain('收起侧边栏');
  });
});
