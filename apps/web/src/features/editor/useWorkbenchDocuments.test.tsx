import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useWorkbenchDocuments } from './useWorkbenchDocuments';

describe('useWorkbenchDocuments', () => {
  it('opens documents and keeps draft state refs synchronized', () => {
    const { result } = renderHook(() => useWorkbenchDocuments());

    act(() => {
      result.current.openDocument('1-边界/预期.md', '# 预期', { dirty: true });
    });

    expect(result.current.openPaths).toEqual(['1-边界/预期.md']);
    expect(result.current.documentPath).toBe('1-边界/预期.md');
    expect(result.current.documentContent).toBe('# 预期');
    expect(result.current.draftStateByPath).toEqual({
      '1-边界/预期.md': {
        content: '# 预期',
        dirty: true,
      },
    });
    expect(result.current.documentPathRef.current).toBe('1-边界/预期.md');
    expect(result.current.draftStateByPathRef.current['1-边界/预期.md']?.dirty).toBe(true);
  });

  it('restores and resets document-scoped state', () => {
    const { result } = renderHook(() => useWorkbenchDocuments());

    act(() => {
      result.current.restoreDocuments({
        openPaths: ['4-正文/第001章_草稿.md'],
        draftStateByPath: {
          '4-正文/第001章_草稿.md': {
            content: '# 第001章',
            dirty: false,
          },
        },
        documentPath: '4-正文/第001章_草稿.md',
        documentContent: '# 第001章',
      });
    });

    expect(result.current.openPaths).toEqual(['4-正文/第001章_草稿.md']);
    expect(result.current.documentPathRef.current).toBe('4-正文/第001章_草稿.md');

    act(() => {
      result.current.resetDocuments();
    });

    expect(result.current.openPaths).toEqual([]);
    expect(result.current.documentPath).toBe('');
    expect(result.current.documentContent).toBe('');
    expect(result.current.draftStateByPath).toEqual({});
    expect(result.current.documentPathRef.current).toBe('');
  });
});
