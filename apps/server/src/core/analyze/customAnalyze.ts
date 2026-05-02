export function buildCustomAnalyzeMarkdown(userMessage: string, sampleText: string) {
  const summary = sampleText.split(/\n+/).filter(Boolean).slice(0, 6).join(' ');

  return [
    '# 自定义样板书拆解',
    '',
    `## 用户需求`,
    userMessage,
    '',
    '## 样板书相关片段',
    summary || '未找到可用样板书文本。',
    '',
    '## 初步分析',
    '请基于用户指定的范围、维度和关注点继续补充这份拆解。',
  ].join('\n');
}
