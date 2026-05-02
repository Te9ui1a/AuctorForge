import type { ContinuityAssessment } from './continuityGate';

export function buildScaleQualityReport(options: {
  startChapter: number;
  endChapter: number;
  continuityVerdict: ContinuityAssessment['verdict'];
  unresolvedHooks: string[];
  entityDrift: string[];
  aiFlavorHits: string[];
  revisionChapters: number[];
}) {
  const label = `第${String(options.startChapter).padStart(3, '0')}-${String(options.endChapter).padStart(3, '0')}章_体检报告`;
  const lines = [
    `# ${label}`,
    '',
    `- 连续性结论：${options.continuityVerdict.toUpperCase()}`,
    `- 复修章节：${options.revisionChapters.length > 0 ? options.revisionChapters.map((item) => `第${String(item).padStart(3, '0')}章`).join('、') : '无'}`,
    '',
    '## 连续性结论',
    ...formatSectionLines(options.unresolvedHooks, '未回收钩子'),
    ...formatSectionLines(options.entityDrift, '实体漂移'),
    ...formatSectionLines(options.aiFlavorHits, 'AI味命中'),
  ];

  return lines.join('\n');
}

function formatSectionLines(items: string[], title: string) {
  if (items.length === 0) {
    return [`- ${title}：无`];
  }

  return [`- ${title}：`, ...items.map((item) => `  - ${item}`)];
}

