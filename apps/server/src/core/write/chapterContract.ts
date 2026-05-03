import { normalizeProjectPath } from '../compat/rules';
import type { ProposedWrite } from '../chat/assistantProposalTypes';
import { ROLE_TABLE_PATH, chapterDraftPath, chapterLabel } from '../paths/projectPaths';
import { DEFAULT_VOLUME_NUMBER } from '../paths/volumeContext';
import { assessChapterContinuity, formatChapterContinuityFindings } from './chapterContinuityGate';
import { parseChapterNumberFromDraftPath, resolveChapterPlanFromProjectFiles } from './chapterPlanResolver';

type OutlineChapter = {
  number: number;
  title: string;
};

export type ChapterDraftValidationCode =
  | 'chapter-draft-wrong-path'
  | 'chapter-draft-missing'
  | 'chapter-plan-missing'
  | 'chapter-draft-heading-missing'
  | 'chapter-draft-heading-mismatch'
  | 'chapter-draft-title-mismatch'
  | 'chapter-draft-too-short'
  | 'chapter-draft-early-finale'
  | 'chapter-draft-context-drift'
  | 'chapter-draft-continuity-revise';

const EARLY_FINALE_PATTERN = /(大结局|终章|完结章|最终章|全书完|故事完结)/u;
export const TARGET_CHAPTER_DRAFT_NARRATIVE_CHARS = 3200;
export const MIN_CHAPTER_DRAFT_NARRATIVE_CHARS = 2800;

export function parseOutlineChapters(chapterOutline: string): OutlineChapter[] {
  return chapterOutline
    .split(/\n+/)
    .map((line) => line.trim())
    .map((line) => line.replace(/^\*+\s*/u, '').replace(/\s*\*+$/u, ''))
    .map((line) => line.match(/^#{0,6}\s*第\s*0*(\d+)\s*章(?:[：:\s]+([^\n]+?))?\s*$/u))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      number: Number.parseInt(match[1] ?? '0', 10),
      title: (match[2] ?? '').trim(),
    }));
}

export function getMaxOutlinedChapterNumber(chapterOutline: string) {
  const chapters = parseOutlineChapters(chapterOutline);

  if (chapters.length === 0) {
    return null;
  }

  return Math.max(...chapters.map((chapter) => chapter.number));
}

export function isFinalOutlinedChapter(chapterOutline: string, chapterNumber: number) {
  const maxChapterNumber = getMaxOutlinedChapterNumber(chapterOutline);
  return maxChapterNumber !== null && chapterNumber >= maxChapterNumber;
}

export function validateChapterDraftProposal(options: {
  currentChapterNumber: number;
  projectFiles: Array<{ path: string; content: string | null }>;
  proposedWrites: ProposedWrite[];
}) {
  const offChapterDraftWrite = options.proposedWrites.find((write) => {
    const writeChapterNumber = parseChapterNumberFromDraftPath(write.path);
    return writeChapterNumber !== null && writeChapterNumber !== options.currentChapterNumber;
  });

  if (offChapterDraftWrite) {
    return {
      ok: false,
      code: 'chapter-draft-wrong-path',
      message: `${chapterLabel(options.currentChapterNumber)}草稿写入路径不一致：当前流程只能写入${chapterDraftPath(options.currentChapterNumber)}，不能写入${offChapterDraftWrite.path}。`,
    } as const;
  }

  const chapterPlanResolution = resolveChapterPlanFromProjectFiles(
    options.projectFiles,
    options.currentChapterNumber,
    DEFAULT_VOLUME_NUMBER,
  );

  if (!chapterPlanResolution.ok) {
    return {
      ok: false,
      code: 'chapter-plan-missing',
      message: `${chapterLabel(options.currentChapterNumber)}草稿缺少章节计划：${chapterPlanResolution.message}`,
    } as const;
  }

  const draftWrite = options.proposedWrites.find(
    (write) => normalizeProjectPath(write.path) === normalizeProjectPath(chapterDraftPath(options.currentChapterNumber)),
  );
  if (!draftWrite) {
    return {
      ok: false,
      code: 'chapter-draft-missing',
      message: `${chapterLabel(options.currentChapterNumber)}草稿缺少正文写入：当前流程必须写入${chapterDraftPath(options.currentChapterNumber)}。`,
    } as const;
  }

  const expectedChapter = chapterPlanResolution.chapter;
  const headingMatch = draftWrite.content.match(/^#\s*第\s*0*(\d+)\s*章(?:[：: \t]+([^\n\r]+))?$/mu);
  if (!headingMatch) {
    return {
      ok: false,
      code: 'chapter-draft-heading-missing',
      message: `${chapterLabel(options.currentChapterNumber)}草稿超出当前章纲范围：缺少规范章节标题，请重新生成本章草稿。`,
    } as const;
  }

  const actualChapterNumber = Number.parseInt(headingMatch[1] ?? '0', 10);
  const actualTitle = (headingMatch[2] ?? '').trim();

  if (actualChapterNumber !== options.currentChapterNumber) {
    return {
      ok: false,
      code: 'chapter-draft-heading-mismatch',
      message: `${chapterLabel(options.currentChapterNumber)}草稿超出当前章纲范围：标题章号与当前流程不一致，请重新生成本章草稿。`,
    } as const;
  }

  if (
    normalizeChapterTitle(actualTitle).length > 0
    && normalizeChapterTitle(expectedChapter.title).length > 0
    && normalizeChapterTitle(actualTitle) !== normalizeChapterTitle(expectedChapter.title)
  ) {
    return {
      ok: false,
      code: 'chapter-draft-title-mismatch',
      message: `${chapterLabel(options.currentChapterNumber)}草稿超出当前章纲范围：本章标题应为“${expectedChapter.title}”，请重新生成本章草稿。`,
    } as const;
  }

  const narrativeChars = countChapterDraftNarrativeChars(draftWrite.content);
  if (narrativeChars < MIN_CHAPTER_DRAFT_NARRATIVE_CHARS) {
    return {
      ok: false,
      code: 'chapter-draft-too-short',
      message: `${chapterLabel(options.currentChapterNumber)}草稿字数不足：当前正文约 ${narrativeChars} 字，必须至少${MIN_CHAPTER_DRAFT_NARRATIVE_CHARS}字，请扩写为完整正文。`,
    } as const;
  }

  const maxChapterNumber = Math.max(...chapterPlanResolution.chapters.map((chapter) => chapter.number));
  if (options.currentChapterNumber < maxChapterNumber && EARLY_FINALE_PATTERN.test(draftWrite.content)) {
    return {
      ok: false,
      code: 'chapter-draft-early-finale',
      message: `${chapterLabel(options.currentChapterNumber)}草稿超出当前章纲范围：当前还不是终章，不能提前写成大结局，请重新生成本章草稿。`,
    } as const;
  }

  const contextDrift = validateProjectContextConsistency({
    projectFiles: options.projectFiles,
    draftContent: draftWrite.content,
  });
  if (contextDrift !== null) {
    return {
      ok: false,
      code: 'chapter-draft-context-drift',
      message: `${chapterLabel(options.currentChapterNumber)}草稿与项目设定不一致：${contextDrift}，请重新生成本章草稿。`,
    } as const;
  }

  const continuity = assessChapterContinuity({
    currentChapterNumber: options.currentChapterNumber,
    draftContent: draftWrite.content,
    previousChapterSummary: findPreviousChapterContent(options.projectFiles, options.currentChapterNumber),
    currentPlan: expectedChapter,
    futurePlans: chapterPlanResolution.chapters.filter((chapter) => chapter.number > options.currentChapterNumber),
  });
  if (continuity.verdict === 'revise') {
    const findingText = formatChapterContinuityFindings(continuity.findings);
    return {
      ok: false,
      code: 'chapter-draft-continuity-revise',
      message: `${chapterLabel(options.currentChapterNumber)}草稿连续性未通过：提前消费后续章纲或资源升级异常。${findingText}，请回到本章章纲范围内重写。`,
    } as const;
  }

  return { ok: true } as const;
}

export function countChapterDraftNarrativeChars(content: string) {
  return content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^#/.test(line))
    .join('')
    .replace(/\s+/g, '').length;
}

function normalizeChapterTitle(title: string) {
  return title.replace(/[《》〈〉「」『』【】（）()、，。！？!?:：\-\s]/gu, '');
}

function validateProjectContextConsistency({
  projectFiles,
  draftContent,
}: {
  projectFiles: Array<{ path: string; content: string | null }>;
  draftContent: string;
}) {
  const contextText = projectFiles
    .filter((file) => !normalizeProjectPath(file.path).startsWith('4-正文/'))
    .map((file) => file.content ?? '')
    .join('\n');
  const roleTable = projectFiles.find((file) => file.path === ROLE_TABLE_PATH)?.content ?? '';
  const roleNames = extractRoleNames(roleTable);

  if (roleNames.length === 0) {
    return null;
  }

  if (!roleNames.some((name) => draftContent.includes(name))) {
    return `正文没有使用角色表中的核心角色：${roleNames.slice(0, 3).join('、')}`;
  }

  return null;
}

function findPreviousChapterContent(projectFiles: Array<{ path: string; content: string | null }>, currentChapterNumber: number) {
  if (currentChapterNumber <= 1) {
    return '';
  }

  return projectFiles.find((file) => normalizeProjectPath(file.path) === chapterDraftPath(currentChapterNumber - 1))?.content ?? '';
}

function extractRoleNames(roleTable: string) {
  const names = new Set<string>();
  const excluded = new Set([
    '主要角色',
    '核心反派',
    '重要配角',
    '关系网',
    '角色设定',
  ]);

  for (const line of roleTable.split(/\n+/)) {
    const trimmed = line.trim();
    const roleMatch = trimmed.match(/^(?:主角|男主|女主|核心反派|重要配角)[：:\s-]+([一-龥]{2,4})(?:[，,。；;（(\s]|$)/u);
    const headingMatch = trimmed.match(/^#{2,6}\s*([一-龥]{2,4})(?:\s|$)/u);
    const listMatch = trimmed.match(/^[-*]\s*([一-龥]{2,4})[：:，,（(]/u);
    const name = roleMatch?.[1] ?? headingMatch?.[1] ?? listMatch?.[1];

    if (name && !excluded.has(name)) {
      names.add(name);
    }
  }

  return [...names];
}
