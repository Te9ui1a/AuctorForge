import { 
  CHARACTER_MEMORY_PATH,
  CHEAT_SETTING_PATH,
  FORESHADOWING_MEMORY_PATH,
  MASTER_CONSTITUTION_PATH,
  MASTER_OUTLINE_PATH,
  MICRO_RHYTHM_PATH,
  OUTLINE_REVIEW_REPORT_PATH,
  PREVIOUS_CHAPTER_TOKEN,
  ROLE_TABLE_PATH,
  SETTING_REVIEW_REPORT_PATH,
  SETTING_SUMMARY_PATH,
  CONTROL_PANEL_PATH,
  STYLE_GUIDE_PATH,
  VOLUME_CHAPTER_OUTLINE_PATH,
  VOLUME_OUTLINE_PATH,
  chapterDraftPath,
  chapterFinalPath,
  chapterReviewPath,
} from '../../paths/projectPaths';
import { DEFAULT_VOLUME_NUMBER } from '../../paths/volumeContext';
import type { PendingDecisionType, WorkflowContract, WorkflowModule, WorkflowStep, WorkflowSubstep, WorkflowTransitionTarget } from '../contracts/types';

export type WorkflowModuleReference = {
  module: WorkflowModule;
  entryPath: string;
  requiredAnchors: string[];
};

type ModuleFactoryContext = {
  entryPath: string;
};

type ModuleFactory = (context: ModuleFactoryContext) => WorkflowStep;

function substep(
  id: string,
  title: string,
  requiredProjectReads: string[],
  allowedWrites: string[],
  needsApproval: boolean,
  pendingDecisionType: PendingDecisionType | null,
  next: WorkflowTransitionTarget | null,
): WorkflowSubstep {
  return { id, title, requiredProjectReads, allowedWrites, needsApproval, pendingDecisionType, next };
}

function step(
  id: string,
  module: WorkflowModule,
  title: string,
  entryPath: string,
  entrySubstepId: string,
  substeps: WorkflowSubstep[],
): WorkflowStep {
  return {
    id,
    module,
    title,
    requiredSkillAssetPaths: [entryPath],
    entrySubstepId,
    substeps,
  };
}

export const moduleReferences: WorkflowModuleReference[] = [
  {
    module: 'define',
    entryPath: 'extension/assets/longformnovel/define.md',
    requiredAnchors: ['## 🧩 步骤 1: 套路方向推演 (Trope Definition)', '## 🎨 步骤 2: 文风定义 (Style Definition)', '## ✅ 结束检查'],
  },
  {
    module: 'guide',
    entryPath: 'extension/assets/longformnovel/guide.md',
    requiredAnchors: ['## 🧭 模式选择', '## 📂 模式 A: 带资进组', '## 🎨 模式 B: 灵感切入'],
  },
  {
    module: 'analyze',
    entryPath: 'extension/assets/longformnovel/analyze.md',
    requiredAnchors: ['## 📖 步骤 0：准备工作', '## 📊 步骤 1：故事梗概提取', '## 🔍 步骤 5：微观节奏与剧情单元拆解'],
  },
  {
    module: 'ideation',
    entryPath: 'extension/assets/longformnovel/ideation.md',
    requiredAnchors: ['## 💡 步骤 1: 创意脑暴与核心梗确立', '## 📖 步骤 2: 新书设定案与大纲构建', '## 👥 步骤 4: 角色人设细化'],
  },
  {
    module: 'outline',
    entryPath: 'extension/assets/longformnovel/outline.md',
    requiredAnchors: ['## 📚 步骤 1: 全书总纲规划 (Master Outline)', '## 📖 步骤 2: 单卷完整卷纲规划 (Volume Outline)', '## 🔨 步骤 3: 标准化章纲细化 (Chapter Specify)'],
  },
  {
    module: 'write',
    entryPath: 'extension/assets/longformnovel/write.md',
    requiredAnchors: ['### 步骤 1：写作前置检查 (Pre-Writing Check)', '### 步骤 3：完稿后校准 (Post-Writing Calibration)', '## 🚫 循环阻断 (Loop Break)'],
  },
  {
    module: 'review',
    entryPath: 'extension/assets/longformnovel/review.md',
    requiredAnchors: ['## 🛠️ 模块 1: 设定质检 (Setting Review)', '## 📋 模块 2: 大纲质检 (Outline Review)', '## ✍️ 模块 3: 正文质检 (Draft Review)'],
  },
];

const moduleFactories: Record<WorkflowModuleReference['module'], ModuleFactory> = {
  define: ({ entryPath }) =>
    step('define-direction', 'define', '新书方向定义', entryPath, 'direction-define', [
      substep('direction-define', '方向定义', ['1-边界/预期.md'], ['2-设定/2.1_创意脑暴.md', STYLE_GUIDE_PATH, CONTROL_PANEL_PATH], true, 'proposal_approval', {
        stepId: 'ideation-build',
        substepId: 'setting-draft',
        mode: 'standard',
      }),
    ]),
  guide: ({ entryPath }) =>
    step('guide-entry', 'guide', '存量整合与灵活启动', entryPath, 'choose-guide-mode', [
      substep('choose-guide-mode', '模式选择', [CONTROL_PANEL_PATH], [], true, 'substep_confirmation', null),
      substep('scan-assets', '存量资产整合', [CONTROL_PANEL_PATH], ['2-设定/2.1_创意脑暴.md', SETTING_SUMMARY_PATH, ROLE_TABLE_PATH, VOLUME_CHAPTER_OUTLINE_PATH(DEFAULT_VOLUME_NUMBER), chapterDraftPath(1), CONTROL_PANEL_PATH], true, 'proposal_approval', null),
      substep('choose-entry-focus', '灵感切入入口选择', [CONTROL_PANEL_PATH], [], true, 'substep_confirmation', null),
      substep('character-first', '人设优先', [CONTROL_PANEL_PATH], [ROLE_TABLE_PATH, CONTROL_PANEL_PATH], true, 'proposal_approval', null),
      substep('idea-first', '核心梗与金手指优先', [CONTROL_PANEL_PATH], ['2-设定/2.1_创意脑暴.md', CHEAT_SETTING_PATH, CONTROL_PANEL_PATH], true, 'proposal_approval', null),
      substep('draft-first', '试读样章优先', [CONTROL_PANEL_PATH], ['4-正文/试读样章.md', CONTROL_PANEL_PATH], true, 'proposal_approval', null),
    ]),
  analyze: ({ entryPath }) =>
    step('analyze-entry', 'analyze', '样板书分析', entryPath, 'prepare-sample-book', [
      substep('prepare-sample-book', '样板书准备', [CONTROL_PANEL_PATH], [], true, 'substep_confirmation', { stepId: 'analyze-entry', substepId: 'choose-summary-mode', mode: 'analyze' }),
      substep('choose-summary-mode', '梗概方式选择', [CONTROL_PANEL_PATH], ['1-边界/1.1_全书故事梗概.md', '.env', CONTROL_PANEL_PATH], true, 'substep_confirmation', null),
      substep('await-env-confirmation', '等待 API 配置确认', [CONTROL_PANEL_PATH], ['1-边界/1.1_全书故事梗概.md', CONTROL_PANEL_PATH], true, 'substep_confirmation', null),
      substep('style-analysis', '文风分析', ['1-边界/1.1_全书故事梗概.md', CONTROL_PANEL_PATH], [STYLE_GUIDE_PATH, CONTROL_PANEL_PATH], true, 'proposal_approval', null),
      substep('trope-analysis', '套路方向分析', ['1-边界/1.1_全书故事梗概.md', STYLE_GUIDE_PATH, CONTROL_PANEL_PATH], ['1-边界/1.3_套路方向.md', CONTROL_PANEL_PATH], true, 'proposal_approval', null),
      substep('framework-analysis', '全书框架分析', ['1-边界/1.1_全书故事梗概.md', '1-边界/1.3_套路方向.md', CONTROL_PANEL_PATH], ['1-边界/1.4_全书框架.md', CONTROL_PANEL_PATH], true, 'proposal_approval', null),
      substep('micro-analysis', '微观节奏拆解', ['1-边界/1.1_全书故事梗概.md', '1-边界/1.4_全书框架.md', CONTROL_PANEL_PATH], [MICRO_RHYTHM_PATH, CONTROL_PANEL_PATH], true, 'proposal_approval', null),
      substep('custom-analysis', '自定义拆解决策', [MICRO_RHYTHM_PATH, CONTROL_PANEL_PATH], ['1-边界/自定义_样板书拆解.md', CONTROL_PANEL_PATH], true, 'substep_confirmation', null),
    ]),
  ideation: ({ entryPath }) =>
    step('ideation-build', 'ideation', '创意孵化与设定构建', entryPath, 'setting-draft', [
      substep('setting-draft', '新书设定案', ['2-设定/2.1_创意脑暴.md', STYLE_GUIDE_PATH, MASTER_CONSTITUTION_PATH], [SETTING_SUMMARY_PATH, CONTROL_PANEL_PATH], true, 'proposal_approval', { stepId: 'ideation-build', substepId: 'cheat-draft', mode: 'standard' }),
      substep('cheat-draft', '金手指设定', ['2-设定/2.1_创意脑暴.md', SETTING_SUMMARY_PATH, MASTER_CONSTITUTION_PATH], [CHEAT_SETTING_PATH, CONTROL_PANEL_PATH], true, 'proposal_approval', { stepId: 'ideation-build', substepId: 'character-draft', mode: 'standard' }),
      substep('character-draft', '角色设定与宪法约束', [SETTING_SUMMARY_PATH, CHEAT_SETTING_PATH, MASTER_CONSTITUTION_PATH], [ROLE_TABLE_PATH, MASTER_CONSTITUTION_PATH, CONTROL_PANEL_PATH], true, 'proposal_approval', { stepId: 'outline-plan', substepId: 'master-outline', mode: 'standard' }),
    ]),
  outline: ({ entryPath }) =>
    step('outline-plan', 'outline', '全书大纲规划', entryPath, 'master-outline', [
      substep('master-outline', '全书总纲', [SETTING_SUMMARY_PATH, CONTROL_PANEL_PATH], [MASTER_OUTLINE_PATH, CONTROL_PANEL_PATH], true, 'proposal_approval', { stepId: 'outline-plan', substepId: 'volume-outline', mode: 'standard' }),
      substep('volume-outline', '单卷卷纲', [SETTING_SUMMARY_PATH, MASTER_OUTLINE_PATH, CONTROL_PANEL_PATH], [VOLUME_OUTLINE_PATH(DEFAULT_VOLUME_NUMBER), CONTROL_PANEL_PATH], true, 'proposal_approval', { stepId: 'outline-plan', substepId: 'chapter-outline', mode: 'standard' }),
      substep('chapter-outline', '批次章纲', [SETTING_SUMMARY_PATH, MASTER_OUTLINE_PATH, VOLUME_OUTLINE_PATH(DEFAULT_VOLUME_NUMBER), CONTROL_PANEL_PATH], [VOLUME_CHAPTER_OUTLINE_PATH(DEFAULT_VOLUME_NUMBER), CONTROL_PANEL_PATH], true, 'proposal_approval', { stepId: 'write-chapter', substepId: 'chapter-draft', mode: 'standard' }),
    ]),
  write: ({ entryPath }) =>
    step('write-chapter', 'write', '单章正文写作', entryPath, 'chapter-draft', [
      substep('chapter-draft', '章节草稿', [STYLE_GUIDE_PATH, MICRO_RHYTHM_PATH, SETTING_SUMMARY_PATH, CHEAT_SETTING_PATH, MASTER_CONSTITUTION_PATH, MASTER_OUTLINE_PATH, VOLUME_OUTLINE_PATH(DEFAULT_VOLUME_NUMBER), VOLUME_CHAPTER_OUTLINE_PATH(DEFAULT_VOLUME_NUMBER), CHARACTER_MEMORY_PATH, FORESHADOWING_MEMORY_PATH, `4-正文/${PREVIOUS_CHAPTER_TOKEN}草稿.md`, chapterReviewPath(1), CONTROL_PANEL_PATH], [chapterDraftPath(1), CHARACTER_MEMORY_PATH, FORESHADOWING_MEMORY_PATH, CONTROL_PANEL_PATH], true, 'proposal_approval', { stepId: 'review-chapter', substepId: 'chapter-review', mode: 'standard' }),
      substep('chapter-finalize', '章节定稿', [CONTROL_PANEL_PATH, chapterDraftPath(1), chapterReviewPath(1), STYLE_GUIDE_PATH, MASTER_CONSTITUTION_PATH], [chapterDraftPath(1), chapterFinalPath(1), CONTROL_PANEL_PATH], true, 'proposal_approval', { stepId: 'write-chapter', substepId: 'chapter-pause', mode: 'standard' }),
      substep('chapter-pause', '单章收束', [CONTROL_PANEL_PATH, chapterDraftPath(1), chapterReviewPath(1)], [CONTROL_PANEL_PATH], false, null, null),
    ]),
  review: ({ entryPath }) =>
    step('review-chapter', 'review', '正文质检', entryPath, 'chapter-review', [
      substep('setting-review', '设定质检', [SETTING_SUMMARY_PATH, CHEAT_SETTING_PATH, ROLE_TABLE_PATH, STYLE_GUIDE_PATH, MASTER_CONSTITUTION_PATH, CONTROL_PANEL_PATH], [SETTING_REVIEW_REPORT_PATH, CONTROL_PANEL_PATH], true, 'proposal_approval', null),
      substep('outline-review', '大纲质检', [MASTER_OUTLINE_PATH, VOLUME_OUTLINE_PATH(DEFAULT_VOLUME_NUMBER), VOLUME_CHAPTER_OUTLINE_PATH(DEFAULT_VOLUME_NUMBER), STYLE_GUIDE_PATH, MASTER_CONSTITUTION_PATH, CONTROL_PANEL_PATH], [OUTLINE_REVIEW_REPORT_PATH, CONTROL_PANEL_PATH], true, 'proposal_approval', null),
      substep('chapter-review', '章节审查', [chapterDraftPath(1), STYLE_GUIDE_PATH, MASTER_CONSTITUTION_PATH, CONTROL_PANEL_PATH], [chapterReviewPath(1), CONTROL_PANEL_PATH], true, 'proposal_approval', { stepId: 'write-chapter', substepId: 'chapter-pause', mode: 'standard' }),
    ]),
};

export function buildWorkflowContractFromPatterns(): Pick<WorkflowContract, 'mode' | 'entryStepId'> & { references: WorkflowModuleReference[] } {
  return {
    mode: 'standard',
    entryStepId: 'define-direction',
    references: moduleReferences,
  };
}

export function buildWorkflowStepFromReference(module: WorkflowModuleReference): WorkflowStep {
  return moduleFactories[module.module]({ entryPath: module.entryPath });
}
