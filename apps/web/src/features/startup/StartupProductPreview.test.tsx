import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StartupProductPreview } from './StartupProductPreview';

afterEach(() => {
  cleanup();
});

describe('StartupProductPreview', () => {
  it('renders a quiet writing desk preview without becoming a dashboard', () => {
    render(<StartupProductPreview />);

    const preview = screen.getByRole('region', { name: '创作现场预览' });

    expect(preview).toHaveAttribute('data-entry-surface', 'product-preview');
    expect(screen.getByText('正在写')).toBeInTheDocument();
    expect(screen.getByText('第 001 章')).toBeInTheDocument();
    expect(screen.getByText('下一段，从这里继续。')).toBeInTheDocument();
    expect(screen.queryByText(/设定、章节和参考资料/)).not.toBeInTheDocument();
    expect(screen.queryByText(/人物动机/)).not.toBeInTheDocument();
    expect(screen.queryByText(/统计/)).not.toBeInTheDocument();
    expect(screen.queryByText(/仪表盘/)).not.toBeInTheDocument();
  });
});
