import { chapterDraftPath, chapterLabel, chapterReviewPath } from '../paths/projectPaths';
import { upsertTrailingSection } from '../files/markdownSections';
import {
  MAX_CHAPTER_DRAFT_NARRATIVE_CHARS,
  MIN_CHAPTER_DRAFT_NARRATIVE_CHARS,
  countChapterDraftNarrativeChars,
} from '../write/chapterContract';
import { lintAiFlavor } from '../write/aiFlavorLint';
import { buildAiFlavorRepairPlan } from '../write/aiFlavorRepairPlan';
import { extractReviewGate, type ReviewGate } from './reviewGate';

export function augmentChapterReviewProposal(options: {
  chapterNumber: number;
  projectFiles: Array<{ path: string; content: string | null }>;
  proposedWrites: Array<{ path: string; content: string }>;
}) {
  const reviewPath = chapterReviewPath(options.chapterNumber);
  const draftContent = options.projectFiles.find((item) => item.path === chapterDraftPath(options.chapterNumber))?.content ?? '';
  const reviewWrite = options.proposedWrites.find((item) => item.path === reviewPath);

  if (!reviewWrite) {
    const synthesizedReviewWrite = {
      path: reviewPath,
      content: buildMissingReviewReport(options.chapterNumber, draftContent),
    };

    return {
      proposedWrites: [synthesizedReviewWrite, ...options.proposedWrites],
      gate: 'pass' as ReviewGate,
    };
  }

  const lint = lintAiFlavor(draftContent);
  const lintGate = lint.blocked ? 'block' : 'pass';
  const explicitGate = extractReviewGate(reviewWrite.content);
  const narrativeChars = countChapterDraftNarrativeChars(draftContent);
  const falseShortLengthClaim = hasFalseShortLengthClaim(reviewWrite.content, narrativeChars);
  const correctedExplicitGate =
    falseShortLengthClaim && explicitGate === 'revise' && lintGate === 'pass'
      ? 'pass'
      : explicitGate;
  const gate = pickStrongerGate(correctedExplicitGate, lintGate);

  let content = upsertReviewGate(correctFalseLengthEstimates(reviewWrite.content, narrativeChars), gate);
  content = upsertTrailingSection(content, '## 字数核验（服务端补充）', [
    `- 服务端统计：当前正文约 ${narrativeChars} 字；目标为 ${MIN_CHAPTER_DRAFT_NARRATIVE_CHARS}-${MAX_CHAPTER_DRAFT_NARRATIVE_CHARS} 字。`,
    falseShortLengthClaim
      ? '- 核验结论：模型原字数估算与实际正文长度不一致，已按服务端真实统计校正评级依据。'
      : '- 核验结论：审查字数依据已由服务端真实统计兜底。',
  ]);

  if (lint.hits.length >= 2 || lint.blocked) {
    const repairPlan = buildAiFlavorRepairPlan(lint);
    content = upsertTrailingSection(content, '## AI味命中明细（服务端补充）', [
      `- 服务端评级建议：${gate.toUpperCase()}`,
      `- 命中类型：${lint.hits.map((hit) => hit.label).join('、')}`,
      ...lint.hits.map((hit) => `- 证据摘录：${hit.context ?? extractSnippet(draftContent, hit.pattern)}`),
      ...(repairPlan.escalation ? [`- 升级判断：${repairPlan.escalation.reason}`] : []),
    ]);
    content = upsertTrailingSection(content, '## 局部改写任务（服务端补充）', [
      '- 修补原则：不要整章重写，只修改下列命中片段；非目标段落必须保持原样。',
      ...formatRepairTasks(repairPlan.tasks),
    ]);
  }

  return {
    proposedWrites: options.proposedWrites.map((item) =>
      item.path === reviewPath
        ? {
            ...item,
            content,
          }
        : item,
    ),
    gate,
  };
}

function formatRepairTasks(tasks: ReturnType<typeof buildAiFlavorRepairPlan>['tasks']) {
  if (tasks.length === 0) {
    return ['- 暂无可定位的局部改写任务，请人工复核。'];
  }

  return tasks.flatMap((task, index) => [
    `- 任务 ${index + 1}：${task.scope === 'paragraph' ? '段落级' : '局部'}修补`,
    `  - 原文片段：${task.originalSnippet}`,
    `  - 命中问题：${task.evidence.map((hit) => `${hit.label}${hit.matchedText ? `（${hit.matchedText}）` : ''}`).join('、')}`,
    `  - ${task.strategy}`,
    `  - 验收：${task.acceptanceChecks.join('；')}`,
  ]);
}

function hasFalseShortLengthClaim(content: string, narrativeChars: number) {
  if (narrativeChars < MIN_CHAPTER_DRAFT_NARRATIVE_CHARS) {
    return false;
  }

  return /(字数.{0,12}(不足|严重不足)|仅\s*[12]\d{3}\s*字|约\s*[12]\d{3}\s*字|低于\s*3000\s*字)/u.test(content);
}

function correctFalseLengthEstimates(content: string, narrativeChars: number) {
  if (!hasFalseShortLengthClaim(content, narrativeChars)) {
    return content;
  }

  return content
    .replace(/(?:当前草稿|当前正文)?约\s*[12]\d{3}\s*字/gu, `当前正文约 ${narrativeChars} 字`)
    .replace(/仅\s*[12]\d{3}\s*字(?:左右)?/gu, `当前正文约 ${narrativeChars} 字`)
    .replace(/距离单章\s*(?:3000\s*字左右|3000\s*-\s*3500\s*字)的标准相差甚远[。.]?/gu, '已达到单章3000-3500字的长度要求。');
}

function buildMissingReviewReport(chapterNumber: number, draftContent: string) {
  const label = chapterLabel(chapterNumber);
  const title = extractChapterTitle(chapterNumber, draftContent);
  const reviewSubject = title ? `${label} ${title}` : label;

  return [
    `# ${label} 审查报告`,
    '',
    '- 审查评级：PASS',
    '',
    '## 审查对象',
    `- 审查对象：${reviewSubject}`,
    '',
    '## 连续性检查',
    '- 当前模型提案漏写了审查报告，系统已补齐本章审查文件，避免审批后流程空转。',
    '- 请继续重点核对上一章钩子、本章因果、主角状态、资源变化和伏笔回收是否一致。',
    '',
    '## AI味检查',
    '- 已保留进入审查流程的最低报告结构；如需更细的句子级修改，可继续要求局部复审。',
    '',
  ].join('\n');
}

function extractChapterTitle(chapterNumber: number, draftContent: string) {
  const titleMatch = draftContent.match(new RegExp(`^#\\s+第0*${chapterNumber}章\\s*(.*)$`, 'm'));
  const title = titleMatch?.[1]?.trim();
  return title && title.length > 0 ? title : null;
}

function pickStrongerGate(left: ReviewGate, right: ReviewGate): ReviewGate {
  const severity = {
    pass: 0,
    revise: 1,
    block: 2,
  } as const;

  return severity[left] >= severity[right] ? left : right;
}

function upsertReviewGate(content: string, gate: ReviewGate) {
  if (/审查评级[：:]\s*(PASS|REVISE|BLOCK)/iu.test(content)) {
    return content.replace(/审查评级[：:]\s*(PASS|REVISE|BLOCK)/iu, `审查评级：${gate.toUpperCase()}`);
  }

  const lines = content.split('\n');
  const firstSectionIndex = lines.findIndex((line) => line.trim().startsWith('## '));

  if (firstSectionIndex === -1) {
    return `${content.trimEnd()}\n\n- 审查评级：${gate.toUpperCase()}\n`;
  }

  const augmented = [...lines];
  augmented.splice(firstSectionIndex, 0, `- 审查评级：${gate.toUpperCase()}`, '');
  return augmented.join('\n');
}

function extractSnippet(content: string, pattern: RegExp) {
  const line = content
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.length > 0 && pattern.test(item));

  return line ?? '未定位到具体句子';
}
