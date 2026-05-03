import { normalizeProjectPath } from '../compat/rules';
import { isSoftWritablePath } from '../workflow/softFlowPolicy';

type ResolvePreferredWritePathsOptions = {
  userPrompt: string;
  strictWorkflowWrites: string[];
  chatAllowedWrites: string[];
  activeDocumentPath?: string | null;
};

export function resolvePreferredWritePaths({
  userPrompt,
  strictWorkflowWrites,
  chatAllowedWrites,
  activeDocumentPath,
}: ResolvePreferredWritePathsOptions) {
  const normalizedStrictWorkflowWrites = uniqueNormalizedPaths(strictWorkflowWrites);
  const normalizedChatAllowedWrites = uniqueNormalizedPaths(chatAllowedWrites);
  const candidatePaths = uniqueNormalizedPaths([...normalizedChatAllowedWrites, ...normalizedStrictWorkflowWrites]);
  const normalizedMessage = normalizePromptMessage(userPrompt);

  const preferredPaths: string[] = [];

  for (const mentionedPath of findMentionedPaths(normalizedMessage, candidatePaths)) {
    pushUnique(preferredPaths, mentionedPath);
  }

  const normalizedActiveDocumentPath =
    activeDocumentPath === undefined || activeDocumentPath === null
      ? null
      : normalizeProjectPath(activeDocumentPath);

  if (
    normalizedActiveDocumentPath !== null
    && isActiveDocumentTargetIntent(normalizedMessage)
    && (normalizedChatAllowedWrites.includes(normalizedActiveDocumentPath) || isSoftWritablePath(normalizedActiveDocumentPath))
  ) {
    pushUnique(preferredPaths, normalizedActiveDocumentPath);
  }

  const isFinalizationIntent = isChapterFinalizationIntent(normalizedMessage);

  if (preferredPaths.length > 0) {
    if (isFinalizationIntent) {
      preferredPaths.sort((left, right) => finalPathRank(right) - finalPathRank(left));
    }
    return preferredPaths;
  }

  return isFinalizationIntent
    ? [...normalizedStrictWorkflowWrites].sort((left, right) => finalPathRank(right) - finalPathRank(left))
    : normalizedStrictWorkflowWrites;
}

function findMentionedPaths(message: string, candidatePaths: string[]) {
  const mentionedPaths: string[] = [];

  for (const candidatePath of candidatePaths) {
    if (message.includes(candidatePath)) {
      pushUnique(mentionedPaths, candidatePath);
      continue;
    }

    const basename = candidatePath.split('/').at(-1) ?? '';
    if (!basename) {
      continue;
    }

    const basenameWithoutExtension = basename.replace(/\.[^.]+$/u, '');
    if (message.includes(basename) || (basenameWithoutExtension.length >= 4 && message.includes(basenameWithoutExtension))) {
      pushUnique(mentionedPaths, candidatePath);
    }
  }

  for (const extractedPath of extractPathLikeTokens(message)) {
    if (!isSoftWritablePath(extractedPath)) {
      continue;
    }

    pushUnique(mentionedPaths, extractedPath);
  }

  return mentionedPaths;
}

function extractPathLikeTokens(message: string) {
  const matches = message.match(/(?:PROJECT\.md|\.novelkit\/[\w\-/\.]+|[1-5]-[^\s，。！？!]+\/[\w\-\.\u4e00-\u9fa5]+\.(?:md|json))/gu);
  if (!matches) {
    return [];
  }

  return uniqueNormalizedPaths(
    matches.map((token) => token.replace(/[，。！？!]+$/u, '')),
  );
}

function normalizePromptMessage(userPrompt: string) {
  return userPrompt.replace(/^用户消息：/u, '').trim();
}

function isActiveDocumentTargetIntent(message: string) {
  return /(当前打开文档|当前文档|打开的文档|这个文档|这份文档|该文档|此文档)/u.test(message);
}

function isChapterFinalizationIntent(message: string) {
  const compact = message.replace(/\s+/g, '');

  return /(_定稿\.md|定稿)/u.test(compact)
    || /(?:按|根据).{0,12}(审查报告|审查意见).{0,24}(生成|输出|写入|形成|产出|做成).{0,8}定稿/u.test(message)
    || /(?:生成|输出|写入|形成|产出).{0,12}(最终稿|定稿版)/u.test(message);
}

function finalPathRank(path: string) {
  return /4-正文\/第0*\d+章_定稿\.md/u.test(path) ? 1 : 0;
}

function uniqueNormalizedPaths(paths: string[]) {
  const unique: string[] = [];
  const seen = new Set<string>();

  for (const inputPath of paths) {
    const normalizedPath = normalizeProjectPath(inputPath);
    if (seen.has(normalizedPath)) {
      continue;
    }

    seen.add(normalizedPath);
    unique.push(normalizedPath);
  }

  return unique;
}

function pushUnique(paths: string[], path: string) {
  if (!paths.includes(path)) {
    paths.push(path);
  }
}
