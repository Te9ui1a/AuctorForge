export type ProjectProgressSummary = {
  phase: string;
  coreTask: string;
  todoItems: Array<{
    text: string;
    done: boolean;
  }>;
  nextSuggestion: string;
  callableModules: string[];
  assetPointers: Array<{
    section: string;
    label: string;
    path: string;
  }>;
};

export function parseProjectProgress(projectContent: string): ProjectProgressSummary {
  const section = extractSection(projectContent, '### 8.1 当前重点与后续步骤');
  const phase = extractField(section, '阶段') ?? '未定义';
  const coreTask = extractField(section, '核心任务') ?? '请先查看当前阶段产物';
  const todoItems = [...section.matchAll(/^\s*- \[(x| )\]\s+(.+)$/gim)].map((match) => ({
    done: match[1].toLowerCase() === 'x',
    text: match[2].trim(),
  }));
  const nextSuggestion = todoItems.find((item) => !item.done)?.text ?? coreTask;

  return {
    phase,
    coreTask,
    todoItems,
    nextSuggestion,
    callableModules: inferCallableModules(phase, nextSuggestion),
    assetPointers: [
      ...extractAssetPointers(projectContent, '### 2.2 世界索引（文件指针）', '世界索引'),
      ...extractAssetPointers(projectContent, '### 3.1 角色索引（简明）', '角色索引'),
      ...extractAssetPointers(projectContent, '### 4.2 大纲索引（文件指针）', '大纲索引'),
      ...extractArrowPointers(projectContent, '### 7.2 角色快照', '角色快照'),
      ...extractArrowPointers(projectContent, '### 7.4 待处理线索', '待处理线索'),
      ...extractArrowPointers(projectContent, '### 7.5 执行复盘', '执行复盘'),
    ],
  };
}

function extractSection(markdown: string, heading: string) {
  const lines = markdown.split('\n');
  const startIndex = lines.findIndex((line) => line.trim() === heading);

  if (startIndex === -1) {
    return '';
  }

  let endIndex = startIndex + 1;
  while (endIndex < lines.length && !/^###\s+/.test(lines[endIndex].trim())) {
    endIndex += 1;
  }

  return lines.slice(startIndex + 1, endIndex).join('\n');
}

function extractField(section: string, field: string) {
  return section.match(new RegExp(`- \\*\\*${field}\\*\\*：(.+)`))?.[1]?.trim() ?? null;
}

function inferCallableModules(phase: string, nextSuggestion: string) {
  if (/章节收束|正文写作|正文审查/u.test(phase) || /章草稿|审查报告/u.test(nextSuggestion)) {
    return ['write', 'review'];
  }

  if (/设定/u.test(phase) || /设定|角色|金手指/u.test(nextSuggestion)) {
    return ['ideation', 'review'];
  }

  if (/大纲/u.test(phase) || /总纲|卷纲|章纲/u.test(nextSuggestion)) {
    return ['outline', 'review'];
  }

  if (/参考模式/u.test(phase) || /1\.1|1\.2|1\.3|1\.4|1\.5/u.test(nextSuggestion)) {
    return ['analyze', 'ideation'];
  }

  if (/灵感切入|带资进组/u.test(phase)) {
    return ['guide', 'ideation', 'outline'];
  }

  return ['define', 'ideation', 'outline', 'write', 'review'];
}

function extractAssetPointers(markdown: string, heading: string, section: string) {
  const body = extractSection(markdown, heading);
  return [...body.matchAll(/- \[([^\]]+)\] -> `([^`]+)`/g)].map((match) => ({
    section,
    label: match[1].trim(),
    path: match[2].trim(),
  }));
}

function extractArrowPointers(markdown: string, heading: string, section: string) {
  const body = extractSection(markdown, heading);
  return [...body.matchAll(/->\s+([^\n]+)/g)].map((match) => ({
    section,
    label: section,
    path: match[1].trim().replace(/`/g, ''),
  }));
}
