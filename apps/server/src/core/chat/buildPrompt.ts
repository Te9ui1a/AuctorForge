import path from 'node:path';

import { readProjectFile } from '../files/fileGateway';
import { VOLUME_CHAPTER_OUTLINE_PATH } from '../paths/projectPaths';
import { assembleMemoryContext } from '../memory/contextAssembler';
import { readStructuredChapters, readStructuredEntities, readStructuredQuality } from '../memory/memoryStore';
import { readSkillPackArchive } from '../vsix/readSkillPackArchive';
import type { WorkflowDoc } from './workflowTemplate';
import type { WorkflowContract, WorkflowResolvedStep } from '../workflow/contracts/types';
import { getCurrentWorkflowStep, type WorkflowState } from '../workflow/stateMachine';

const DEFAULT_PROJECT_FILE_CHAR_BUDGET = 8_000;
const DEFAULT_PROJECT_FILES_TOTAL_CHAR_BUDGET = 20_000;
const DEFAULT_ATTACHMENT_CHAR_BUDGET = 6_000;
const DEFAULT_ATTACHMENTS_TOTAL_CHAR_BUDGET = 12_000;
const MIN_BUDGETED_TEXT_CHARS = 320;
const ATTACHMENT_NAME_CHAR_BUDGET = 120;
const ATTACHMENT_MIME_CHAR_BUDGET = 80;
const PROJECT_PATH_CHAR_BUDGET = 220;

type PromptAttachment = {
  name: string;
  mimeType: string;
  size: number;
  textContent: string;
};

type BuildPromptOptions = {
  projectRoot: string;
  skillPackPath: string;
  contract: WorkflowContract;
  state: WorkflowState;
  userMessage: string;
  strictWorkflowWrites?: string[];
  chatAllowedWrites?: string[];
  manualWritablePaths?: string[];
  activeDocumentPath?: string | null;
  discussionNotes?: string[];
  attachments?: PromptAttachment[];
};

export type BuiltPrompt = {
  systemPrompt: string;
  userPrompt: string;
  step: WorkflowResolvedStep;
  workflowDocs: WorkflowDoc[];
  projectFiles: Array<{
    path: string;
    content: string | null;
  }>;
};

export async function buildPrompt({
  projectRoot,
  skillPackPath,
  contract,
  state,
  userMessage,
  strictWorkflowWrites,
  chatAllowedWrites,
  manualWritablePaths,
  activeDocumentPath,
  discussionNotes = [],
  attachments = [],
}: BuildPromptOptions): Promise<BuiltPrompt> {
  const archive = readSkillPackArchive(skillPackPath);
  const step = getCurrentWorkflowStep(contract, state);
  const workflowDocs = step.requiredSkillAssetPaths.map((entryPath) => ({
    entryPath,
    content: archive.readText(entryPath),
  }));

  const projectFiles = await Promise.all(
    step.requiredProjectReads.map(async (relativePath) => {
      try {
        const content = await readProjectFile(projectRoot, relativePath);
        return { path: relativePath, content };
      } catch (error) {
        if (!isMissingProjectFileError(error, projectRoot, relativePath)) {
          throw error;
        }

        return { path: relativePath, content: null };
      }
    }),
  );

  const strictWrites = strictWorkflowWrites ?? step.allowedWrites;
  const chatWrites = chatAllowedWrites ?? step.allowedWrites;
  const manualWrites = manualWritablePaths ?? step.allowedWrites;
  const projectFileSection = buildProjectFileSection(projectFiles);
  const attachmentSection = buildAttachmentSection(attachments);

  const discussionSection =
    discussionNotes.length > 0
      ? [
          '### 最近讨论记录',
          ...discussionNotes.map((note, index) => `${index + 1}. ${note}`),
        ].join('\n')
      : null;

  const activeDocumentSection = activeDocumentPath ? `### 当前激活文档\n${activeDocumentPath}` : null;
  const memorySection = await buildLongTermMemorySection({
    projectRoot,
    step,
    state,
    userMessage,
    projectFiles,
  });

  return {
    systemPrompt: [
      `你正在执行长篇小说流程的当前模块：${step.moduleTitle}`,
      `当前子步骤：${step.substepTitle}`,
      `当前模块：${step.module}`,
      '请严格遵守以下步骤文档和项目上下文。',
      workflowDocs.map((doc) => `### ${doc.entryPath}\n${doc.content}`).join('\n\n'),
      '### 当前项目文件',
      projectFileSection,
      memorySection,
      attachmentSection,
      activeDocumentSection,
      `### 严格流程写入目标\n${strictWrites.join('\n')}`,
      `### 聊天可写入范围\n${chatWrites.join('\n')}`,
      `### 手动保存可写入范围\n${manualWrites.join('\n')}`,
      `### 当前允许写入\n${step.allowedWrites.join('\n')}`,
    ]
      .filter(Boolean)
      .join('\n\n'),
    userPrompt: [`用户消息：${userMessage}`, discussionSection].filter(Boolean).join('\n\n'),
    step,
    workflowDocs,
    projectFiles,
  };
}

function isMissingProjectFileError(error: unknown, projectRoot: string, relativePath: string) {
  const fileError = error as NodeJS.ErrnoException;
  if (fileError.code !== 'ENOENT' || typeof fileError.path !== 'string') {
    return false;
  }

  return path.resolve(fileError.path) === path.resolve(projectRoot, relativePath);
}

function formatBudgetedText(
  content: string,
  options: {
    kind: 'content' | 'attachment';
    maxChars: number;
    reason?: string;
  },
) {
  if (content.length <= options.maxChars) {
    return content;
  }

  const label = options.kind === 'attachment' ? 'attachment truncated' : 'content truncated';
  const marker = `[${label}: original ${content.length} chars, retained ${options.maxChars} chars${
    options.reason ? `, ${options.reason}` : ''
  }]`;

  if (options.maxChars <= marker.length) {
    return marker;
  }

  const markerWrapperLength = marker.length + 4;
  const sourceBudget = Math.max(0, options.maxChars - markerWrapperLength);

  const headBudget = Math.floor(sourceBudget * 0.7);
  const tailBudget = sourceBudget - headBudget;

  return [
    takeCodeUnitSafePrefix(content, headBudget),
    '',
    marker,
    '',
    takeCodeUnitSafeSuffix(content, tailBudget),
  ].join('\n');
}

function takeCodeUnitSafePrefix(content: string, maxCodeUnits: number) {
  if (maxCodeUnits <= 0) {
    return '';
  }

  let output = '';
  for (const char of content) {
    if (output.length + char.length > maxCodeUnits) {
      break;
    }
    output += char;
  }

  return output;
}

function takeCodeUnitSafeSuffix(content: string, maxCodeUnits: number) {
  if (maxCodeUnits <= 0) {
    return '';
  }

  let output = '';
  for (const char of Array.from(content).reverse()) {
    if (output.length + char.length > maxCodeUnits) {
      break;
    }
    output = `${char}${output}`;
  }

  return output;
}

function buildAttachmentSection(attachments: PromptAttachment[]) {
  if (attachments.length === 0) {
    return null;
  }

  const heading = '### 当前消息附件';
  const lines = [heading];
  let omitted = 0;

  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index];
    const header = `- ${formatMetadata(attachment.name, ATTACHMENT_NAME_CHAR_BUDGET)} (${formatMetadata(
      attachment.mimeType,
      ATTACHMENT_MIME_CHAR_BUDGET,
    )}, ${attachment.size} bytes)`;
    const fairItemBudget = Math.floor(DEFAULT_ATTACHMENTS_TOTAL_CHAR_BUDGET / attachments.length);
    const fairTextBudget = Math.max(MIN_BUDGETED_TEXT_CHARS, fairItemBudget - header.length - 2);
    const maxTextByRemaining = DEFAULT_ATTACHMENTS_TOTAL_CHAR_BUDGET - lines.join('\n').length - header.length - 2;
    const maxChars = Math.min(DEFAULT_ATTACHMENT_CHAR_BUDGET, fairTextBudget, maxTextByRemaining);

    if (maxChars < MIN_BUDGETED_TEXT_CHARS) {
      omitted = attachments.length - index;
      break;
    }

    const reason = maxChars < DEFAULT_ATTACHMENT_CHAR_BUDGET ? 'aggregate attachment budget' : undefined;
    lines.push(`${header}\n${formatBudgetedText(attachment.textContent, { kind: 'attachment', maxChars, reason })}`);
  }

  return appendOmissionSummary({
    lines,
    omitted,
    totalBudget: DEFAULT_ATTACHMENTS_TOTAL_CHAR_BUDGET,
    label: 'attachments',
    reason: 'aggregate attachment budget exhausted',
  }).join('\n');
}

function buildProjectFileSection(projectFiles: Array<{ path: string; content: string | null }>) {
  const lines: string[] = [];
  let omitted = 0;

  for (let index = 0; index < projectFiles.length; index += 1) {
    const file = projectFiles[index];
    const header = `### ${formatMetadata(file.path, PROJECT_PATH_CHAR_BUDGET)}`;
    const textContent = file.content ?? '<missing>';
    const fairItemBudget = Math.floor(DEFAULT_PROJECT_FILES_TOTAL_CHAR_BUDGET / Math.max(projectFiles.length, 1));
    const fairTextBudget = Math.max(MIN_BUDGETED_TEXT_CHARS, fairItemBudget - header.length - 2);
    const usedChars = lines.join('\n\n').length;
    const maxTextByRemaining = DEFAULT_PROJECT_FILES_TOTAL_CHAR_BUDGET - usedChars - header.length - 4;
    const maxChars = file.content === null
      ? textContent.length
      : Math.min(DEFAULT_PROJECT_FILE_CHAR_BUDGET, fairTextBudget, maxTextByRemaining);

    if (maxChars < MIN_BUDGETED_TEXT_CHARS && file.content !== null) {
      omitted = projectFiles.length - index;
      break;
    }

    const reason = maxChars < DEFAULT_PROJECT_FILE_CHAR_BUDGET ? 'aggregate project file budget' : undefined;
    const body = file.content === null
      ? textContent
      : formatBudgetedText(file.content, { kind: 'content', maxChars, reason });
    lines.push(`${header}\n${body}`);
  }

  return appendOmissionSummary({
    lines,
    omitted,
    totalBudget: DEFAULT_PROJECT_FILES_TOTAL_CHAR_BUDGET,
    label: 'project files',
    reason: 'aggregate project file budget exhausted',
    separator: '\n\n',
  }).join('\n\n');
}

function appendOmissionSummary(options: {
  lines: string[];
  omitted: number;
  totalBudget: number;
  label: 'attachments' | 'project files';
  reason: string;
  separator?: string;
}) {
  const separator = options.separator ?? '\n';
  let omitted = options.omitted;

  if (omitted === 0) {
    return options.lines;
  }

  let lines = options.lines;
  let summary = buildOmissionSummary(omitted, options.label, options.reason);

  while ([...lines, summary].join(separator).length > options.totalBudget && lines.length > 1) {
    lines = lines.slice(0, -1);
    omitted += 1;
    summary = buildOmissionSummary(omitted, options.label, options.reason);
  }

  return [...lines, summary];
}

function buildOmissionSummary(count: number, label: 'attachments' | 'project files', reason: string) {
  return `- [${count} ${label} omitted: ${reason}]`;
}

function formatMetadata(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return value;
  }

  const marker = `[metadata truncated: original ${value.length} chars]`;
  const prefixBudget = Math.max(0, maxChars - marker.length - 1);
  return `${takeCodeUnitSafePrefix(value, prefixBudget)} ${marker}`;
}

async function buildLongTermMemorySection(options: {
  projectRoot: string;
  step: WorkflowResolvedStep;
  state: WorkflowState;
  userMessage: string;
  projectFiles: Array<{ path: string; content: string | null }>;
}) {
  const memoryMode = resolveMemoryMode(options.step.module);
  if (memoryMode === null) {
    return null;
  }

  const [{ rows: chapters }, entities, { rows: quality }] = await Promise.all([
    readStructuredChapters(options.projectRoot),
    readStructuredEntities(options.projectRoot),
    readStructuredQuality(options.projectRoot),
  ]);
  const currentOutlinePath = VOLUME_CHAPTER_OUTLINE_PATH(options.state.volumeNumber);
  const currentOutlineContent = options.projectFiles.find((file) => file.path === currentOutlinePath)?.content ?? null;

  const excerpt = assembleMemoryContext({
    chapterNumber: options.state.chapterNumber,
    mode: memoryMode,
    userMessage: options.userMessage,
    currentOutlineContent,
    chapters,
    entities,
    quality,
  });

  return `### 长期记忆摘录\n${excerpt || '<empty>'}`;
}

function resolveMemoryMode(module: WorkflowResolvedStep['module']) {
  if (module === 'write' || module === 'review' || module === 'outline') {
    return module;
  }

  return null;
}
