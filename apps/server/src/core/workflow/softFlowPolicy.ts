import { normalizeProjectPath } from '../compat/rules';
import {
  CHARACTER_MEMORY_PATH,
  CHEAT_SETTING_PATH,
  FORESHADOWING_MEMORY_PATH,
  MASTER_CONSTITUTION_PATH,
  MASTER_OUTLINE_PATH,
  MICRO_RHYTHM_PATH,
  OUTLINE_REVIEW_REPORT_PATH,
  ROLE_TABLE_PATH,
  SETTING_REVIEW_REPORT_PATH,
  SETTING_SUMMARY_PATH,
  CONTROL_PANEL_PATH,
  STYLE_GUIDE_PATH,
  VOLUME_CHAPTER_OUTLINE_PATH,
  VOLUME_OUTLINE_PATH,
  chapterDraftPath,
  chapterReviewPath,
} from '../paths/projectPaths';
import { DEFAULT_VOLUME_NUMBER } from '../paths/volumeContext';

export type SoftFlowPolicy = {
  strictWorkflowWrites: string[];
  chatAllowedWrites: string[];
  manualWritablePaths: string[];
};

type BuildSoftFlowPolicyOptions = {
  strictWorkflowWrites: string[];
  chapterNumber: number;
  activeDocumentPath?: string | null;
};

const SOFT_WRITABLE_PREFIXES = [
  '1-边界/',
  '2-设定/',
  '3-大纲/',
  '4-正文/',
  '5-审查/',
  '.novelkit/constitution/',
  '.novelkit/memory/',
] as const;

export function buildSoftFlowPolicy({
  strictWorkflowWrites,
  chapterNumber,
  activeDocumentPath,
}: BuildSoftFlowPolicyOptions): SoftFlowPolicy {
  const normalizedStrictWorkflowWrites = uniqueNormalizedPaths(strictWorkflowWrites);
  const baseSoftWritablePaths = getBaseSoftWritablePaths(chapterNumber);
  const normalizedActiveDocumentPath = activeDocumentPath ? normalizeProjectPath(activeDocumentPath) : null;

  const expandedSoftWritablePaths =
    normalizedActiveDocumentPath && isSoftWritablePath(normalizedActiveDocumentPath)
      ? [...baseSoftWritablePaths, normalizedActiveDocumentPath]
      : baseSoftWritablePaths;

  const chatAllowedWrites = uniqueNormalizedPaths([...normalizedStrictWorkflowWrites, ...expandedSoftWritablePaths]);
  const manualWritablePaths = uniqueNormalizedPaths([...normalizedStrictWorkflowWrites, ...expandedSoftWritablePaths]);

  return {
    strictWorkflowWrites: normalizedStrictWorkflowWrites,
    chatAllowedWrites,
    manualWritablePaths,
  };
}

export function shouldAutoAdvanceWorkflowAfterApproval({
  strictWorkflowWrites,
  approvedWritePaths,
}: {
  strictWorkflowWrites: string[];
  approvedWritePaths: string[];
}) {
  const strictWorkflowWriteSet = new Set(strictWorkflowWrites.map(normalizeProjectPath));

  return approvedWritePaths.some((path) => strictWorkflowWriteSet.has(normalizeProjectPath(path)));
}

export function isSoftWritablePath(inputPath: string) {
  const normalizedPath = normalizeProjectPath(inputPath);

  if (normalizedPath === CONTROL_PANEL_PATH) {
    return true;
  }

  return SOFT_WRITABLE_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix));
}

function getBaseSoftWritablePaths(chapterNumber: number) {
  return [
    CONTROL_PANEL_PATH,
    '1-边界/1.1_全书故事梗概.md',
    STYLE_GUIDE_PATH,
    '1-边界/1.3_套路方向.md',
    '1-边界/1.4_全书框架.md',
    MICRO_RHYTHM_PATH,
    '1-边界/自定义_样板书拆解.md',
    '2-设定/2.1_创意脑暴.md',
    SETTING_SUMMARY_PATH,
    CHEAT_SETTING_PATH,
    ROLE_TABLE_PATH,
    MASTER_CONSTITUTION_PATH,
    MASTER_OUTLINE_PATH,
    VOLUME_OUTLINE_PATH(DEFAULT_VOLUME_NUMBER),
    VOLUME_CHAPTER_OUTLINE_PATH(DEFAULT_VOLUME_NUMBER),
    chapterDraftPath(chapterNumber),
    chapterReviewPath(chapterNumber),
    SETTING_REVIEW_REPORT_PATH,
    OUTLINE_REVIEW_REPORT_PATH,
    CHARACTER_MEMORY_PATH,
    FORESHADOWING_MEMORY_PATH,
  ];
}

function uniqueNormalizedPaths(paths: string[]) {
  const normalizedPaths: string[] = [];
  const seen = new Set<string>();

  for (const inputPath of paths) {
    const normalizedPath = normalizeProjectPath(inputPath);
    if (seen.has(normalizedPath)) {
      continue;
    }

    seen.add(normalizedPath);
    normalizedPaths.push(normalizedPath);
  }

  return normalizedPaths;
}
