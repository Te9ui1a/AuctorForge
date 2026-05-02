import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  CHARACTER_MEMORY_PATH,
  CHEAT_SETTING_PATH,
  FORESHADOWING_MEMORY_PATH,
  MASTER_CONSTITUTION_PATH,
  MASTER_OUTLINE_PATH,
  ROLE_TABLE_PATH,
  SETTING_SUMMARY_PATH,
  CONTROL_PANEL_PATH,
  STYLE_GUIDE_PATH,
  VOLUME_CHAPTER_OUTLINE_PATH,
  VOLUME_OUTLINE_PATH,
  chapterDraftPath,
  chapterLabel,
  chapterReviewPath,
} from '../paths/projectPaths';
import { DEFAULT_VOLUME_NUMBER } from '../paths/volumeContext';
import { isFinalOutlinedChapter } from '../write/chapterContract';
import { readProjectFileIfExists } from './fileGateway';
import { rebuildStructuredMemory } from '../memory/rebuildStructuredMemory';
import { replaceSubsection, replaceTopLevelSection, upsertTrailingSection } from './markdownSections';

type SyncWorkflowFilesOptions = {
  projectRoot: string;
  stepId: string;
  substepId?: string;
  volumeNumber: number;
  chapterNumber: number;
  revisionMode?: boolean;
};

export async function syncWorkflowFiles({
  projectRoot,
  stepId,
  substepId,
  volumeNumber,
  chapterNumber,
  revisionMode = false,
}: SyncWorkflowFilesOptions) {
  const projectPath = path.join(projectRoot, CONTROL_PANEL_PATH);
  let project = await readFile(projectPath, 'utf8');

  if (stepId === 'define-direction') {
    const styleGuide = await readProjectFileIfExists(projectRoot, STYLE_GUIDE_PATH);
    if (styleGuide !== null) {
      project = replaceTopLevelSection(project, '## 5. 风格指南（文风参考）', ['-> ' + STYLE_GUIDE_PATH]);
    }
  }

  if (stepId === 'ideation-build') {
    const settingFile = await readProjectFileIfExists(projectRoot, SETTING_SUMMARY_PATH);
    const cheatFile = await readProjectFileIfExists(projectRoot, CHEAT_SETTING_PATH);
    const roleFile = await readProjectFileIfExists(projectRoot, ROLE_TABLE_PATH);
    const styleGuide = await readProjectFileIfExists(projectRoot, STYLE_GUIDE_PATH);
    const constitution = await readProjectFileIfExists(projectRoot, MASTER_CONSTITUTION_PATH);

    const worldIndexLines: string[] = [];
    if (settingFile !== null) {
      worldIndexLines.push('- [新书设定] -> `' + SETTING_SUMMARY_PATH + '`');
    }
    if (cheatFile !== null) {
      worldIndexLines.push('- [金手指] -> `' + CHEAT_SETTING_PATH + '`');
    }
    if (worldIndexLines.length > 0) {
      project = replaceSubsection(project, '### 2.2 世界索引（文件指针）', worldIndexLines);
    }

    if (roleFile !== null) {
      project = replaceSubsection(project, '### 3.1 角色索引（简明）', [
        '- [角色总表] -> `' + ROLE_TABLE_PATH + '`',
      ]);
    }

    if (styleGuide !== null) {
      project = replaceTopLevelSection(project, '## 5. 风格指南（文风参考）', ['-> ' + STYLE_GUIDE_PATH]);
    }

    if (constitution !== null) {
      project = replaceTopLevelSection(project, '## 6. 重要备注与软性约束', ['-> ' + MASTER_CONSTITUTION_PATH]);
    }
  }

  if (stepId === 'outline-plan') {
    const masterOutline = await readProjectFileIfExists(projectRoot, MASTER_OUTLINE_PATH);
    const volumeOutline = await readProjectFileIfExists(projectRoot, VOLUME_OUTLINE_PATH(volumeNumber));
    const chapterOutline = await readProjectFileIfExists(projectRoot, VOLUME_CHAPTER_OUTLINE_PATH(volumeNumber));

    const outlineIndexLines: string[] = [];
    if (masterOutline !== null) {
      outlineIndexLines.push('- [总纲] -> `' + MASTER_OUTLINE_PATH + '`');
    }
    if (volumeOutline !== null) {
      outlineIndexLines.push('- [第' + String(volumeNumber).padStart(2, '0') + '卷卷纲] -> `' + VOLUME_OUTLINE_PATH(volumeNumber) + '`');
    }
    if (chapterOutline !== null) {
      outlineIndexLines.push('- [第' + String(volumeNumber).padStart(2, '0') + '卷章纲] -> `' + VOLUME_CHAPTER_OUTLINE_PATH(volumeNumber) + '`');
    }
    if (outlineIndexLines.length > 0) {
      project = replaceSubsection(project, '### 4.2 大纲索引（文件指针）', outlineIndexLines);
    }
  }

  if (stepId === 'write-chapter') {
    const currentDraftPath = chapterDraftPath(chapterNumber);
    const currentReviewPath = chapterReviewPath(chapterNumber);
    const currentChapterLabel = chapterLabel(chapterNumber);
    const nextChapterLabel = chapterLabel(chapterNumber + 1);
    const chapterOutline = await readProjectFileIfExists(projectRoot, VOLUME_CHAPTER_OUTLINE_PATH(volumeNumber));
    const reachedFinalOutlinedChapter = chapterOutline !== null && isFinalOutlinedChapter(chapterOutline, chapterNumber);
    const chapterDraft = await readProjectFileIfExists(projectRoot, currentDraftPath);
    const characterState = await readProjectFileIfExists(projectRoot, CHARACTER_MEMORY_PATH);
    const foreshadowing = await readProjectFileIfExists(projectRoot, FORESHADOWING_MEMORY_PATH);
    const reviewReport = await readProjectFileIfExists(projectRoot, currentReviewPath);

    if (characterState !== null) {
      project = replaceSubsection(project, '### 7.2 角色快照', ['-> ' + CHARACTER_MEMORY_PATH]);
    }
    if (foreshadowing !== null) {
      project = replaceSubsection(project, '### 7.4 待处理线索', ['-> ' + FORESHADOWING_MEMORY_PATH]);
    }

    if (substepId === 'chapter-pause') {
      if (reachedFinalOutlinedChapter) {
        await updateMemoryFile(path.join(projectRoot, CHARACTER_MEMORY_PATH), [
          '- 最近完成章节：' + currentChapterLabel,
          '- 章节状态：当前卷章稿已完成，等待终章修订或总体验收。',
        ]);
        await updateMemoryFile(path.join(projectRoot, FORESHADOWING_MEMORY_PATH), [
          '- ' + currentChapterLabel + '审查已完成，当前卷章稿已完成，等待终章修订或总体验收。',
        ]);

        project = replaceSubsection(project, '### 8.1 当前重点与后续步骤', [
          '- **阶段**：章节收束',
          '- **核心任务**：当前卷章稿已完成，进入终章修订或总体验收',
          '- **待办事项**：',
          '  - [x] ' + currentChapterLabel + '草稿',
          '  - [' + (reviewReport ? 'x' : ' ') + '] ' + currentChapterLabel + '审查报告',
          '  - [ ] 终章修订',
          '  - [ ] 总体验收',
          '  - [ ] 结束本卷',
        ]);
      } else {
        await updateMemoryFile(path.join(projectRoot, CHARACTER_MEMORY_PATH), [
          '- 最近完成章节：' + currentChapterLabel,
          '- 章节状态：' + currentChapterLabel + '已收束，等待后续决策。',
        ]);
        await updateMemoryFile(path.join(projectRoot, FORESHADOWING_MEMORY_PATH), [
          '- ' + currentChapterLabel + '审查已完成，等待决定是否进入' + nextChapterLabel + '。',
        ]);

        project = replaceSubsection(project, '### 8.1 当前重点与后续步骤', [
          '- **阶段**：章节收束',
          '- **核心任务**：决定是继续修订' + currentChapterLabel + '，还是进入下一章',
          '- **待办事项**：',
          '  - [x] ' + currentChapterLabel + '草稿',
          '  - [' + (reviewReport ? 'x' : ' ') + '] ' + currentChapterLabel + '审查报告',
          '  - [ ] ' + nextChapterLabel + '草稿',
        ]);
      }
    } else if (chapterDraft !== null) {
      if (revisionMode) {
        await updateMemoryFile(path.join(projectRoot, CHARACTER_MEMORY_PATH), [
          '- 最近完成章节：' + currentChapterLabel,
          '- 章节状态：' + currentChapterLabel + '进入修订中。',
        ]);
        await updateMemoryFile(path.join(projectRoot, FORESHADOWING_MEMORY_PATH), [
          '- 正在回修' + currentChapterLabel + '，暂不推进下一章。',
        ]);

        project = replaceSubsection(project, '### 8.1 当前重点与后续步骤', [
          '- **阶段**：正文写作',
          '- **核心任务**：继续修订' + currentChapterLabel + '草稿',
          '- **待办事项**：',
          '  - [ ] ' + currentChapterLabel + '修订',
        ]);
      } else {
        await updateMemoryFile(path.join(projectRoot, CHARACTER_MEMORY_PATH), [
          '- 最近完成章节：' + currentChapterLabel,
        ]);
        await updateMemoryFile(path.join(projectRoot, FORESHADOWING_MEMORY_PATH), [
          '- ' + currentChapterLabel + '草稿已完成，待后续补录伏笔。',
        ]);

        project = replaceSubsection(project, '### 8.1 当前重点与后续步骤', [
          '- **阶段**：正文写作',
          '- **核心任务**：完成' + currentChapterLabel + '草稿并准备下一章',
          '- **待办事项**：',
          '  - [x] ' + currentChapterLabel + '草稿',
          '  - [ ] ' + nextChapterLabel + '草稿',
        ]);
      }
    } else {
      const carryOverLines = chapterNumber > 1 ? ['  - [x] ' + chapterLabel(chapterNumber - 1) + '审查报告'] : [];

      project = replaceSubsection(project, '### 8.1 当前重点与后续步骤', [
        '- **阶段**：正文写作',
        '- **核心任务**：开始撰写' + currentChapterLabel + '草稿',
        '- **待办事项**：',
        ...carryOverLines,
        '  - [ ] ' + currentChapterLabel + '草稿',
      ]);
    }
  }

  if (stepId === 'review-chapter') {
    const currentReviewPath = chapterReviewPath(chapterNumber);
    const currentChapterLabel = chapterLabel(chapterNumber);
    const nextChapterLabel = chapterLabel(chapterNumber + 1);
    const reviewReport = await readProjectFileIfExists(projectRoot, currentReviewPath);

    if (reviewReport !== null) {
      project = replaceSubsection(project, '### 7.5 执行复盘', ['-> ' + currentReviewPath]);
      project = replaceSubsection(project, '### 8.1 当前重点与后续步骤', [
        '- **阶段**：正文审查',
        '- **核心任务**：消化' + currentChapterLabel + '审查意见并决定是否修稿',
        '- **待办事项**：',
        '  - [x] ' + currentChapterLabel + '草稿',
        '  - [x] ' + currentChapterLabel + '审查报告',
        '  - [ ] ' + nextChapterLabel + '草稿',
      ]);
    } else {
      project = replaceSubsection(project, '### 8.1 当前重点与后续步骤', [
        '- **阶段**：正文审查',
        '- **核心任务**：完成' + currentChapterLabel + '审查报告',
        '- **待办事项**：',
        '  - [x] ' + currentChapterLabel + '草稿',
        '  - [ ] ' + currentChapterLabel + '审查报告',
      ]);
    }
  }

  await writeFile(projectPath, project, 'utf8');
  await rebuildStructuredMemory(projectRoot);
}

async function updateMemoryFile(filePath: string, bodyLines: string[]) {
  const content = await readFile(filePath, 'utf8');
  const updated = upsertTrailingSection(content, '## 自动同步记录', bodyLines);
  await writeFile(filePath, updated, 'utf8');
}
