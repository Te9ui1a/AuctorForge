import { chapterDraftPath, chapterLabel, chapterReviewPath } from '../paths/projectPaths';
import { upsertTrailingSection } from '../files/markdownSections';
import {
  MIN_CHAPTER_DRAFT_NARRATIVE_CHARS,
  countChapterDraftNarrativeChars,
} from '../write/chapterContract';
import { lintAiFlavor } from '../write/aiFlavorLint';
import { buildAiFlavorRepairPlan } from '../write/aiFlavorRepairPlan';
import { assessChapterContinuity } from '../write/chapterContinuityGate';
import { resolveChapterPlanFromProjectFiles } from '../write/chapterPlanResolver';
import { extractReviewGate, type ReviewGate } from './reviewGate';

export function augmentChapterReviewProposal(options: {
  chapterNumber: number;
  projectFiles: Array<{ path: string; content: string | null }>;
  proposedWrites: Array<{ path: string; content: string }>;
}) {
  const reviewPath = chapterReviewPath(options.chapterNumber);
  const draftContent = options.projectFiles.find((item) => item.path === chapterDraftPath(options.chapterNumber))?.content ?? '';
  const reviewWrite = options.proposedWrites.find((item) => item.path === reviewPath);
  const effectiveReviewWrite = reviewWrite ?? {
    path: reviewPath,
    content: buildMissingReviewReport(options.chapterNumber, draftContent),
  };
  const baseProposedWrites = reviewWrite ? options.proposedWrites : [effectiveReviewWrite, ...options.proposedWrites];

  const lint = lintAiFlavor(draftContent);
  const lintGate = lint.blocked ? 'revise' : 'pass';
  const continuity = assessReviewContinuity({
    chapterNumber: options.chapterNumber,
    draftContent,
    projectFiles: options.projectFiles,
  });
  const continuityGate = continuity?.verdict === 'revise' ? 'revise' : 'pass';
  const explicitGate = extractReviewGate(effectiveReviewWrite.content);
  const narrativeChars = countChapterDraftNarrativeChars(draftContent);
  const falseShortLengthClaim = hasFalseShortLengthClaim(effectiveReviewWrite.content, narrativeChars);
  const correctedExplicitGate =
    falseShortLengthClaim && explicitGate === 'revise' && lintGate === 'pass'
      ? 'pass'
      : explicitGate;
  const gate = pickStrongerGate(pickStrongerGate(correctedExplicitGate, lintGate), continuityGate);

  let content = upsertReviewGate(correctFalseLengthEstimates(effectiveReviewWrite.content, narrativeChars), gate);
  content = upsertTrailingSection(content, '## 字数核验（服务端补充）', [
    `- 服务端统计：当前正文约 ${narrativeChars} 字；最低要求为 ${MIN_CHAPTER_DRAFT_NARRATIVE_CHARS} 字。`,
    falseShortLengthClaim
      ? '- 核验结论：模型原字数估算与实际正文长度不一致，已按服务端真实统计校正评级依据。'
      : '- 核验结论：审查字数依据已由服务端真实统计兜底。',
  ]);

  if (lint.hits.length > 0) {
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

  if (continuity && continuity.findings.length > 0) {
    content = upsertTrailingSection(content, '## 连续性硬校验（服务端补充）', [
      `- 服务端评级建议：${continuityGate.toUpperCase()}`,
      `- 命中类型：${continuity.findings.map((finding) => finding.kind).join('、')}`,
      ...continuity.findings.map((finding) => `- 证据摘录：${finding.evidence}`),
      ...continuity.findings.map((finding) => `- 修补建议：${finding.message}`),
    ]);
  }

  return {
    proposedWrites: baseProposedWrites.map((item) =>
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

function assessReviewContinuity({
  chapterNumber,
  draftContent,
  projectFiles,
}: {
  chapterNumber: number;
  draftContent: string;
  projectFiles: Array<{ path: string; content: string | null }>;
}) {
  const resolution = resolveChapterPlanFromProjectFiles(projectFiles, chapterNumber);
  if (!resolution.ok) {
    return null;
  }

  return assessChapterContinuity({
    currentChapterNumber: chapterNumber,
    draftContent,
    previousChapterSummary: projectFiles.find((file) => file.path === chapterDraftPath(chapterNumber - 1))?.content ?? '',
    currentPlan: resolution.chapter,
    futurePlans: resolution.chapters.filter((chapter) => chapter.number > chapterNumber),
  });
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

  return content
    .split('\n')
    .some((line) => FALSE_SHORT_LENGTH_PATTERNS.some((pattern) => pattern.test(line)));
}

function correctFalseLengthEstimates(content: string, narrativeChars: number) {
  if (!hasFalseShortLengthClaim(content, narrativeChars)) {
    return content;
  }

  return content
    .split('\n')
    .map((line) => correctFalseLengthLine(line, narrativeChars))
    .join('\n');
}

function correctFalseLengthLine(line: string, narrativeChars: number) {
  if (!FALSE_SHORT_LENGTH_PATTERNS.some((pattern) => pattern.test(line))) {
    return line;
  }

  if (looksLikeLengthBullet(line) || containsLengthRewriteAdvice(line)) {
    return buildLengthVerificationLine(narrativeChars);
  }

  let corrected = line
    .replace(
      /(?:当前草稿字数|当前正文字数|当前字数|当前草稿|当前正文)?\s*当前正文约\s*[12]\d{3}\s*字(?:左右)?/gu,
      `当前正文约 ${narrativeChars} 字`,
    )
    .replace(
      /(?:当前草稿字数|当前正文字数|当前字数|当前草稿|当前正文)?\s*约(?:为|在)?\s*[12]\d{3}\s*字(?:左右)?/gu,
      `当前正文约 ${narrativeChars} 字`,
    )
    .replace(/仅\s*[12]\d{3}\s*字(?:左右)?/gu, `当前正文约 ${narrativeChars} 字`)
    .replace(
      /(?:未达到|未达标|不达标|(?<!不)低于)\s*(?:不低于\s*)?(?:2800|3000)\s*字(?:的(?:最低|硬性)?要求)?(?:[。.]|，|,)?/gu,
      `已达到单章至少${MIN_CHAPTER_DRAFT_NARRATIVE_CHARS}字的长度要求。`,
    )
    .replace(
      /距离\s*(?:2800|3000)\s*字(?:的)?(?:最低要求|标准)\s*(?:略有不足|相差甚远)(?:[。.]|，|,)?/gu,
      `已达到单章至少${MIN_CHAPTER_DRAFT_NARRATIVE_CHARS}字的长度要求。`,
    )
    .replace(
      /(?:\*\*)?字数(?:不足|严重不足|未达标|不达标)(?:\*\*)?\s*(?:，|,|和|、)\s*/gu,
      '',
    )
    .replace(
      /(?:\*\*)?字数(?:不足|严重不足|未达标|不达标)(?:\*\*)?/gu,
      '字数已达标',
    )
    .replace(/略有不足/gu, `已达到单章至少${MIN_CHAPTER_DRAFT_NARRATIVE_CHARS}字的长度要求`)
    .replace(/当前草稿字数当前正文约\s*([12]\d{3})\s*字/gu, `当前正文约 ${narrativeChars} 字`)
    .replace(/当前字数当前正文约\s*([12]\d{3})\s*字/gu, `当前正文约 ${narrativeChars} 字`)
    .replace(/当前正文字数当前正文约\s*([12]\d{3})\s*字/gu, `当前正文约 ${narrativeChars} 字`)
    .replace(/当前草稿字数约在\s*[12]\d{3}\s*字左右/gu, `当前正文约 ${narrativeChars} 字`)
    .replace(/当前草稿字数约为\s*[12]\d{3}\s*字/gu, `当前正文约 ${narrativeChars} 字`)
    .replace(/当前字数约在\s*[12]\d{3}\s*字左右/gu, `当前正文约 ${narrativeChars} 字`)
    .replace(/当前字数约为\s*[12]\d{3}\s*字/gu, `当前正文约 ${narrativeChars} 字`)
    .replace(/当前正文约\s*[12]\d{3}\s*字/gu, `当前正文约 ${narrativeChars} 字`);

  if (/^\s*[-*]\s*(?:\*\*)?字数[^：:\n]{0,12}[：:]\s*$/u.test(corrected.trim())) {
    return buildLengthVerificationLine(narrativeChars);
  }

  return corrected;
}

function looksLikeLengthBullet(line: string) {
  return /^\s*[-*]\s*(?:\*\*)?字数[^：:\n]{0,12}[：:]/u.test(line);
}

function containsLengthRewriteAdvice(line: string) {
  return /(需要通过|建议|扩充|增加|补充|请|应当|应在|需在).{0,40}(?:字数|2800|3000|篇幅|字量|字)/u.test(line);
}

function buildLengthVerificationLine(narrativeChars: number) {
  return `- **字数核验**：服务端统计当前正文约 ${narrativeChars} 字，已达到单章至少${MIN_CHAPTER_DRAFT_NARRATIVE_CHARS}字的长度要求。`;
}

const FALSE_SHORT_LENGTH_PATTERNS = [
  /字数.{0,20}(?:不足|严重不足|未达标|不达标)/u,
  /(?:未达到|(?<!不)低于)\s*(?:不低于\s*)?(?:2800|3000)\s*字/u,
  /距离\s*(?:2800|3000)\s*字(?:的)?(?:最低要求|标准).{0,20}(?:略有不足|相差甚远)/u,
  /仅\s*[12]\d{3}\s*字/u,
  /约\s*[12]\d{3}\s*字/u,
  /略有不足/u,
] as const;

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
