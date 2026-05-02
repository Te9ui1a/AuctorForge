import type { ProposedWrite } from '../chat/generateAssistantReply';
import { replaceSubsection } from '../files/markdownSections';
import type { WorkflowTransitionTarget } from '../workflow/contracts/types';
import type { WorkflowReturnTarget } from '../workflow/stateMachine';
import { classifyAssets, scanWorkspace } from './fileClassifier';
import { parseGuideEntryMode, parseGuideInspirationBranch } from './entryModes';
import {
  buildCharacterFirstProposal,
  buildDraftFirstProposal,
  buildIdeaFirstProposal,
} from './nonlinearStart';

type GuideProposal = {
  reply: string;
  proposedWrites: ProposedWrite[];
  sourceReadPaths: string[];
  nextTarget: WorkflowTransitionTarget | null;
};

type BuildGuideProposalOptions = {
  projectRoot: string;
  projectContent: string;
  currentSubstepId:
    | 'choose-guide-mode'
    | 'scan-assets'
    | 'choose-entry-focus'
    | 'character-first'
    | 'idea-first'
    | 'draft-first';
  userMessage: string;
  returnTarget?: WorkflowReturnTarget | null;
};

export async function buildGuideProposal({
  projectRoot,
  projectContent,
  currentSubstepId,
  userMessage,
  returnTarget,
}: BuildGuideProposalOptions): Promise<GuideProposal> {
  switch (currentSubstepId) {
    case 'choose-guide-mode': {
      const mode = parseGuideEntryMode(userMessage);
      if (!mode) {
        return {
          reply: [
            '请先告诉我当前状态：',
            '1. 带资进组（存量整合）',
            '2. 灵感切入（非线性启动）',
            '3. 常规流程（返回标准模式）',
          ].join('\n'),
          proposedWrites: [],
          sourceReadPaths: ['PROJECT.md'],
          nextTarget: null,
        };
      }

      if (mode === 'standard') {
        return {
          reply: '已切回常规流程。',
          proposedWrites: [],
          sourceReadPaths: ['PROJECT.md'],
          nextTarget: returnTarget
            ? {
                stepId: returnTarget.stepId,
                substepId: returnTarget.substepId,
                mode: returnTarget.mode,
                chapterNumber: returnTarget.chapterNumber,
              }
            : { stepId: 'define-direction', substepId: 'direction-define', mode: 'standard', chapterNumber: 1 },
        };
      }

      if (mode === 'inspiration-first') {
        return {
          reply: '已进入灵感切入模式。',
          proposedWrites: [],
          sourceReadPaths: ['PROJECT.md'],
          nextTarget: { stepId: 'guide-entry', substepId: 'choose-entry-focus', mode: 'guide' },
        };
      }

      return {
        reply: '已进入带资进组模式。',
        proposedWrites: [],
        sourceReadPaths: ['PROJECT.md'],
        nextTarget: { stepId: 'guide-entry', substepId: 'scan-assets', mode: 'guide' },
      };
    }

    case 'choose-entry-focus': {
      const branch = parseGuideInspirationBranch(userMessage);
      if (!branch) {
        return {
          reply: [
            '已进入灵感切入模式。你想从哪一块先开始？',
            '1. 先写人设',
            '2. 先写核心梗 / 金手指',
            '3. 先写试读样章',
          ].join('\n'),
          proposedWrites: [],
          sourceReadPaths: ['PROJECT.md'],
          nextTarget: null,
        };
      }

      return {
        reply: '已切入所选灵感入口。',
        proposedWrites: [],
        sourceReadPaths: ['PROJECT.md'],
        nextTarget: {
          stepId: 'guide-entry',
          substepId:
            branch === 'character-first'
              ? 'character-first'
              : branch === 'idea-first'
                ? 'idea-first'
                : 'draft-first',
          mode: 'guide',
        },
      };
    }

    case 'scan-assets':
      return buildAssetImportProposal(projectRoot, projectContent, userMessage);

    case 'character-first': {
      const proposal = buildCharacterFirstProposal(projectContent);
      return { ...proposal, sourceReadPaths: ['PROJECT.md'] };
    }

    case 'idea-first': {
      const proposal = buildIdeaFirstProposal(projectContent, userMessage);
      return { ...proposal, sourceReadPaths: ['PROJECT.md'] };
    }

    case 'draft-first': {
      const proposal = buildDraftFirstProposal(projectContent, userMessage);
      return { ...proposal, sourceReadPaths: ['PROJECT.md'] };
    }
  }
}

async function buildAssetImportProposal(projectRoot: string, projectContent: string, userMessage: string): Promise<GuideProposal> {
  const discoveredPaths = await scanWorkspace(projectRoot);
  const assets = await classifyAssets(projectRoot, discoveredPaths);
  const duplicateKindCandidates = ['brainstorm', 'setting', 'character', 'outline', 'draft'] as const;

  for (const kind of duplicateKindCandidates) {
    const candidates = assets.filter((asset) => asset.kind === kind);
    if (candidates.length > 1) {
      const explicitChoice = candidates.find((asset) => new RegExp(asset.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(userMessage));

      if (!explicitChoice) {
        return {
          reply: [
            '发现多个可映射到同一资产类型的文件，请先明确选择后再继续：',
            ...candidates.map((asset, index) => `${index + 1}. ${asset.path}`),
            `请回复例如：“使用 ${candidates[0].path} 作为${kind}文件”`,
          ].join('\n'),
          proposedWrites: [],
          sourceReadPaths: ['PROJECT.md', ...assets.map((asset) => asset.path)],
          nextTarget: null,
        };
      }

      const filteredAssets = assets.filter((asset) => asset.kind !== kind || asset.path === explicitChoice.path);
      return buildAssetImportProposalFromAssets(filteredAssets, projectContent);
    }
  }

  return buildAssetImportProposalFromAssets(assets, projectContent);
}

function buildAssetImportProposalFromAssets(assets: Awaited<ReturnType<typeof classifyAssets>>, projectContent: string): GuideProposal {
  const proposedWrites: ProposedWrite[] = [];
  const sourceReadPaths = ['PROJECT.md', ...assets.map((asset) => asset.path)];

  const settingAsset = assets.find((asset) => asset.kind === 'setting');
  if (settingAsset) {
    proposedWrites.push({ path: '2-设定/2.2_新书设定案.md', content: settingAsset.content });
  }

  const brainstormAsset = assets.find((asset) => asset.kind === 'brainstorm');
  if (brainstormAsset) {
    proposedWrites.push({ path: '2-设定/2.1_创意脑暴.md', content: brainstormAsset.content });
  }

  const characterAsset = assets.find((asset) => asset.kind === 'character');
  if (characterAsset) {
    proposedWrites.push({ path: '2-设定/2.4_主要角色设定表.md', content: characterAsset.content });
  }

  const outlineAsset = assets.find((asset) => asset.kind === 'outline');
  if (outlineAsset) {
    proposedWrites.push({ path: '3-大纲/第01卷_章纲.md', content: outlineAsset.content });
  }

  const draftAsset = assets.find((asset) => asset.kind === 'draft');
  if (draftAsset) {
    proposedWrites.push({ path: '4-正文/第001章_草稿.md', content: draftAsset.content });
  }

  proposedWrites.push({
    path: 'PROJECT.md',
    content: updateProjectForGuide(projectContent, {
      hasSetting: Boolean(settingAsset),
      hasCharacter: Boolean(characterAsset),
      hasOutline: Boolean(outlineAsset),
      hasDraft: Boolean(draftAsset),
    }),
  });

  const nextTarget: WorkflowTransitionTarget = draftAsset
    ? { stepId: 'review-chapter', substepId: 'chapter-review', mode: 'standard', chapterNumber: 1 }
    : outlineAsset
      ? { stepId: 'write-chapter', substepId: 'chapter-draft', mode: 'standard', chapterNumber: 1 }
      : settingAsset || characterAsset
        ? { stepId: 'outline-plan', substepId: 'master-outline', mode: 'standard' }
        : brainstormAsset
          ? { stepId: 'ideation-build', substepId: 'setting-draft', mode: 'standard' }
          : { stepId: 'define-direction', substepId: 'direction-define', mode: 'standard' };

  return {
    reply: [
      '已进入带资进组模式。',
      `发现资产：${assets.map((asset) => asset.path).join('、') || '未发现可迁移文件'}`,
      `推荐下一步：${nextTarget.stepId.replace('-chapter', '').replace('-plan', '').replace('-build', '')}`,
      '确认后我会把识别到的旧稿迁移到标准路径，并更新 PROJECT.md。',
    ].join('\n'),
    proposedWrites,
    sourceReadPaths,
    nextTarget,
  };
}

function updateProjectForGuide(
  projectContent: string,
  options: { hasSetting: boolean; hasCharacter: boolean; hasOutline: boolean; hasDraft: boolean },
) {
  let updated = projectContent;

  if (options.hasSetting) {
    updated = replaceSubsection(updated, '### 2.2 世界索引（文件指针）', ['- [导入设定] -> `2-设定/2.2_新书设定案.md`']);
  }

  if (options.hasCharacter) {
    updated = replaceSubsection(updated, '### 3.1 角色索引（简明）', ['- [导入角色] -> `2-设定/2.4_主要角色设定表.md`']);
  }

  if (options.hasOutline) {
    updated = replaceSubsection(updated, '### 4.2 大纲索引（文件指针）', ['- [导入章纲] -> `3-大纲/第01卷_章纲.md`']);
  }

  if (options.hasDraft) {
    updated = replaceSubsection(updated, '### 7.5 执行复盘', ['-> 4-正文/第001章_草稿.md']);
    updated = replaceSubsection(updated, '### 8.1 当前重点与后续步骤', [
      '- **阶段**：正文审查',
      '- **核心任务**：审查导入的第001章草稿',
      '- **待办事项**：',
      '  - [x] 第001章草稿',
      '  - [ ] 第001章审查报告',
    ]);
  } else if (options.hasOutline) {
    updated = replaceSubsection(updated, '### 8.1 当前重点与后续步骤', [
      '- **阶段**：正文写作',
      '- **核心任务**：基于导入章纲开始写第001章',
      '- **待办事项**：',
      '  - [ ] 第001章草稿',
    ]);
  }

  return updated;
}
