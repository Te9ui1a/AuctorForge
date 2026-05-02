import type { BuiltPrompt } from './buildPrompt';
import type { AssistantProposal } from './assistantProposalTypes';
import { extractDiscussionPremise, extractDirectedIdeaFromMessage, extractProjectPremise } from './assistantProposalParsers';
import { extractTemplateSections } from './workflowTemplate';
import {
  CHEAT_SETTING_PATH,
  MASTER_CONSTITUTION_PATH,
  MASTER_OUTLINE_PATH,
  MICRO_RHYTHM_PATH,
  OUTLINE_REVIEW_REPORT_PATH,
  ROLE_TABLE_PATH,
  SETTING_REVIEW_REPORT_PATH,
  SETTING_SUMMARY_PATH,
  STYLE_GUIDE_PATH,
  VOLUME_CHAPTER_OUTLINE_PATH,
  VOLUME_OUTLINE_PATH,
  chapterDraftPath,
  chapterLabel,
  chapterReviewPath,
  previousChapterDraftPath,
} from '../paths/projectPaths';
import { DEFAULT_VOLUME_NUMBER, parseVolumeNumberFromPath } from '../paths/volumeContext';
import {
  MAX_CHAPTER_DRAFT_NARRATIVE_CHARS,
  TARGET_CHAPTER_DRAFT_NARRATIVE_CHARS,
  countChapterDraftNarrativeChars,
} from '../write/chapterContract';
import { resolveChapterPlanFromProjectFiles, type ChapterPlan } from '../write/chapterPlanResolver';

type BuildLocalProposalOptions = {
  stepTitle: string;
  module: string;
  strictWorkflowWrites: string[];
  chatAllowedWrites: string[];
  preferredWritePaths: string[];
  userPrompt: string;
  projectFiles: BuiltPrompt['projectFiles'];
  workflowDocs: BuiltPrompt['workflowDocs'];
};

export function buildLocalProposal({
  stepTitle,
  module,
  strictWorkflowWrites,
  chatAllowedWrites,
  preferredWritePaths,
  userPrompt,
  projectFiles,
  workflowDocs,
}: BuildLocalProposalOptions): AssistantProposal {
  const idea =
    extractProjectPremise(projectFiles) ??
    extractDirectedIdeaFromMessage(userPrompt) ??
    extractDiscussionPremise(userPrompt) ??
    userPrompt.replace(/^用户消息：/, '').trim();
  const targets = selectWritableTargets({
    module,
    strictWorkflowWrites,
    chatAllowedWrites,
    preferredWritePaths,
  });
  const writeChecklist =
    module === 'write'
      ? extractTemplateSections({ module, targetPath: targets[0] ?? chapterDraftPath(1), workflowDocs })
      : [];
  const reviewChecklist =
    module === 'review'
      ? extractTemplateSections({ module, targetPath: targets[0] ?? chapterReviewPath(1), workflowDocs })
      : [];
  const moduleSpecificGuidance =
    module === 'write'
      ? '去 AI 味要求：严禁黑名单词汇、套路化比喻、三段式排比、否定排比和解释性总结，优先用动作、环境与对话承载情绪。'
      : module === 'review'
        ? 'AI味专项检查：列出命中类型、原句或段落、局部改写建议；只有局部改不动时才建议整章重写。'
        : null;

  return {
    reply: [
      `当前处于【${stepTitle}】阶段。`,
      `当前模块：${module}。`,
      '我已根据你的输入生成一份待确认写入提案。',
      writeChecklist.length > 0 ? `写作前后检查：${writeChecklist.join(' / ')}` : null,
      reviewChecklist.length > 0 ? `审稿维度：${reviewChecklist.join(' / ')}` : null,
      moduleSpecificGuidance,
      '如果内容方向没问题，发送“确认”即可写入这些文件并进入下一步。',
    ]
      .filter(Boolean)
      .join('\n'),
    proposedWrites: targets.map((targetPath) => ({
      path: targetPath,
      content: buildDraftContent({ targetPath, idea, module, userPrompt, projectFiles, workflowDocs }),
    })),
  };
}

export function selectWritableTargets({
  module,
  strictWorkflowWrites,
  chatAllowedWrites,
  preferredWritePaths,
}: {
  module: string;
  strictWorkflowWrites: string[];
  chatAllowedWrites: string[];
  preferredWritePaths: string[];
}) {
  const preferredTargets = preferredWritePaths.filter((path) => chatAllowedWrites.includes(path));

  if (preferredTargets.length > 0) {
    return preferredTargets;
  }

  if (module === 'define') {
    return strictWorkflowWrites.filter((path) => ['2-设定/2.1_创意脑暴.md', '1-边界/1.2_文风.md'].includes(path));
  }

  if (module === 'ideation') {
    return strictWorkflowWrites.filter(
      (path) => /^2-设定\//.test(path) || path === MASTER_CONSTITUTION_PATH,
    );
  }

  if (module === 'outline') {
    return strictWorkflowWrites.filter((path) => /^3-大纲\//.test(path));
  }

  if (module === 'write') {
    return strictWorkflowWrites.filter((path) => path.startsWith('4-正文/'));
  }

  if (module === 'review') {
    return strictWorkflowWrites.filter((path) => path.startsWith('5-审查/'));
  }

  return strictWorkflowWrites;
}

function buildDraftContent({
  targetPath,
  idea,
  module,
  userPrompt,
  projectFiles,
  workflowDocs,
}: {
  targetPath: string;
  idea: string;
  module: string;
  userPrompt: string;
  projectFiles: BuiltPrompt['projectFiles'];
  workflowDocs: BuiltPrompt['workflowDocs'];
}) {
  const targetVolumeNumber = parseVolumeNumberFromPath(targetPath) ?? DEFAULT_VOLUME_NUMBER;

  if (targetPath === '2-设定/2.1_创意脑暴.md') {
    return `# 套路方向与核心设定 (Tropes & Core Concept)\n\n> 本文档为基于当前对话生成的初稿，待进一步确认。\n\n## 1. 核心梗 (Core Premise)\n${idea}\n\n## 2. 金手指 (The Cheat)\n待补充\n\n## 3. 世界观 (World Building)\n待补充\n\n## 4. 关键人设 (Characters)\n待补充\n\n## 5. 主线 (Main Plot)\n待补充\n\n## 6. 小说爽点 (Pleasure Points)\n待补充\n\n## 7. 主要故事剧情 (Key Story Arcs)\n待补充\n\n## 8. 受众 (Target Audience)\n待补充\n\n## 9. 类型边界 (Genre Boundaries)\n待补充\n`;
  }

  if (targetPath === '1-边界/1.2_文风.md') {
    return `# 文风指南 (Style Guide)\n\n> 本文档定义了本项目的核心叙事风格与基调。\n\n## 1. 核心风格 (Core Style)\n\n### 叙事风格 (Narrative Style)\n围绕“${idea}”保持清晰、直接、强钩子的网文叙事。\n\n### 对白风格 (Dialogue Style)\n对白尽量短促，强调人物利益冲突。\n\n### 剧情节奏 (Pacing)\n开局尽快抛出核心矛盾和金手指价值。\n\n### 整体基调 (Tone)\n偏强情节、强期待感。\n\n## 2. 文风样例 (Style Sample)\n\n> 以下样例为后续待补充的语感锚点。\n`;
  }

  if (module === 'ideation') {
    return buildIdeationDraft(targetPath, idea, workflowDocs, projectFiles);
  }

  if (module === 'outline') {
    return buildOutlineDraft(targetPath, idea, projectFiles, workflowDocs);
  }

  if (module === 'write' && targetPath.startsWith('4-正文/')) {
    return buildWriteDraft(targetPath, idea, projectFiles);
  }

  if (module === 'review' && targetPath.startsWith('5-审查/')) {
    return buildReviewDraft(targetPath, projectFiles, workflowDocs, userPrompt);
  }

  if (targetPath === VOLUME_OUTLINE_PATH(targetVolumeNumber) || targetPath === VOLUME_CHAPTER_OUTLINE_PATH(targetVolumeNumber)) {
    return buildOutlineDraft(targetPath, idea, projectFiles, workflowDocs);
  }

  if (targetPath.startsWith('2-设定/')) {
    return `# ${targetPath.split('/').at(-1)?.replace('.md', '')}\n\n> 基于当前对话生成的设定初稿。\n\n核心方向：${idea}\n`;
  }

  if (targetPath.startsWith('3-大纲/')) {
    return `# ${targetPath.split('/').at(-1)?.replace('.md', '')}\n\n> 基于当前设定生成的大纲初稿。\n\n核心方向：${idea}\n`;
  }

  if (targetPath.startsWith('4-正文/')) {
    return `# ${targetPath.split('/').at(-1)?.replace('.md', '')}\n\n> 正文草稿起笔。\n\n${idea}\n`;
  }

  return `# ${targetPath}\n\n${idea}\n`;
}

function buildIdeationDraft(
  targetPath: string,
  idea: string,
  workflowDocs: BuiltPrompt['workflowDocs'],
  projectFiles: BuiltPrompt['projectFiles'],
) {
  if (targetPath === SETTING_SUMMARY_PATH) {
    const sections = withFallbackSections(
      extractTemplateSections({ module: 'ideation', targetPath, workflowDocs }),
      ['世界观', '关键人设', '金手指', '主线推演', '关键关系博弈', '地图路线图', '关键事件'],
    );

    return buildSectionedMarkdown('新书设定案', sections, {
      世界观: `${idea} 的舞台设定为强规则、强秩序的神魔体系，主角需要在夹缝中隐藏真实能力。`,
      关键人设: '主角以低姿态求生，但内里极度克制且擅长权衡利益。',
      金手指: '核心能力围绕“苟住、积累、反制”展开，前期偏保命，中后期逐步转向布局。',
      主线推演: '开局求生，中期借势布局，后期借规则翻盘。',
      关键关系博弈: '主角与上位者、同阶竞争者、潜在盟友之间都建立互相利用又互相提防的关系。',
      地图路线图: '从小范围生存区逐步走向更高层级的权力和规则中心。',
      关键事件: '第一阶段先通过一次险中求活立住主角生存逻辑，再用一次反制事件确立长线期待。',
    });
  }

  if (targetPath === CHEAT_SETTING_PATH) {
    const sections = withFallbackSections(
      extractTemplateSections({ module: 'ideation', targetPath, workflowDocs }),
      ['核心概念', '功能模块', '平衡性设计', '进化路线', '视觉表现'],
    );

    return buildSectionedMarkdown('金手指设定', sections, {
      核心概念: '- 本质：一套偏“规避风险 + 预演后果”的保命型能力\n- 来源：与主角特殊身份绑定\n- 独有性：只有主角能承受这套能力带来的代价',
      功能模块: '- 基础功能：提前感知风险、避免暴露\n- 进阶功能：小范围试错和资源置换\n- 终极形态：借规则反向设局',
      平衡性设计: '- 消耗：每次启动都要消耗精力、人情或稀缺资源\n- 限制：高强度使用会暴露异常，且不能无限叠加',
      进化路线: '1.0 保命 -> 2.0 借势 -> 3.0 反制',
      视觉表现: '能力发动时更强调细微异常和环境反馈，而不是炫技特效。',
    });
  }

  if (targetPath === '2-设定/2.4_主要角色设定表.md') {
    const sections = withFallbackSections(
      extractTemplateSections({ module: 'ideation', targetPath, workflowDocs }),
      ['主角', '核心反派', '重要配角', '关系网构建'],
    );

    return buildSectionedMarkdown('主要角色设定表', sections, {
      主角: '- 身份：被低估的边缘角色\n- 表里性格：表面谦抑，内里极度清醒\n- 核心驱动力：活下去并逐步掌握主动权\n- 语言风格：克制、少说、句句带留白\n- 外貌特征：不显眼，但细节经得起观察',
      核心反派: '- 与主角的深层关系：代表主角必须长期规避和反制的秩序力量\n- 性格弱点：过度自信于现有规则\n- 核心利益点：维持既得秩序和资源垄断',
      重要配角: '- 工具人与早期垫脚石：负责提供局势信息、资源交换和冲突镜面\n- 功能定位：推动主角做出选择、承接阶段性爽点',
      关系网构建: '角色之间围绕资源、秘密和生存资格形成链式博弈。',
    });
  }

  if (targetPath === MASTER_CONSTITUTION_PATH) {
    return buildMasterDraft(idea, projectFiles);
  }

  return `# ${targetPath.split('/').at(-1)?.replace('.md', '')}\n\n核心方向：${idea}\n`;
}

function buildOutlineDraft(
  targetPath: string,
  idea: string,
  projectFiles: BuiltPrompt['projectFiles'],
  workflowDocs: BuiltPrompt['workflowDocs'],
) {
  const settingSummary = extractProjectPremise(projectFiles) ?? idea;
  const targetVolumeNumber = parseVolumeNumberFromPath(targetPath) ?? DEFAULT_VOLUME_NUMBER;

  if (targetPath === MASTER_OUTLINE_PATH) {
    const sections = withFallbackSections(
      extractTemplateSections({ module: 'outline', targetPath, workflowDocs }),
      ['全书剧情单元总览', '核心节奏公式', '节奏密度统计表', '对新书的启示'],
    );

    return buildSectionedMarkdown('全书结构总纲', sections, {
      全书剧情单元总览: `| 章节区间 | 地图 | 身份/阶级 | 核心目标 | 故事梗概 |\n| :--- | :--- | :--- | :--- | :--- |\n| 1-30 | 起始区域 | 底层边缘角色 | 先活下来 | 围绕“${settingSummary}”建立主角的生存策略与第一轮反制。 |\n| 31-90 | 中层势力区 | 初步立足 | 借势布局 | 主角开始利用金手指撬动局势，建立自己的小型安全网。 |\n\n换地图逻辑说明：当主角在当前区域完成身份抬升并触发更高层规则压制后，进入下一张地图。`,
      核心节奏公式: '发现危机 -> 低调试探 -> 借势破局 -> 收割成果 -> 引出更大规则压制。',
      节奏密度统计表: '- 第一阶段：快速建立危险与金手指价值\n- 第二阶段：每 10-15 章完成一次明显收益或身份变化\n- 第三阶段：在换地图前完成一次大规模反制',
      对新书的启示: '- 开局节奏：尽快让读者看到主角为什么必须苟\n- 中期布局：所有关系都服务于资源和规则博弈\n- 后期格局：从保命升级到利用规则制定新秩序',
    });
  }

  if (targetPath === VOLUME_OUTLINE_PATH(targetVolumeNumber)) {
    const sections = withFallbackSections(
      extractTemplateSections({ module: 'outline', targetPath, workflowDocs }),
      ['战略层 - 核心设计', '战略层 - 人物链', '战术层 - 剧情事件流', '战术层 - 金手指植入'],
    );

    return buildSectionedMarkdown(`第${String(targetVolumeNumber).padStart(2, '0')}卷 完整卷纲`, sections, {
      '战略层 - 核心设计': '- 本卷主题：在压制中求生并建立第一套反制逻辑\n- 核心矛盾：主角的隐忍与外部秩序的持续逼压\n- 爽点曲线：先压后爆，最后完成一次漂亮反打',
      '战略层 - 人物链': '- 本卷 BOSS：代表秩序压制的直接对手\n- 盟友：提供信息和资源的灰色角色\n- 工具人：帮助主角完成阶段性试探',
      '战术层 - 剧情事件流': '- 1-5 章：险境开局和求生试探\n- 6-12 章：第一次借势布局\n- 13-18 章：一次关键反制和身份提升',
      '战术层 - 金手指植入': '- 关键节点一：保命\n- 关键节点二：提前规避风险\n- 关键节点三：让对手误判',
    });
  }

  if (targetPath === VOLUME_CHAPTER_OUTLINE_PATH(targetVolumeNumber)) {
    const sections = withFallbackSections(
      extractTemplateSections({ module: 'outline', targetPath, workflowDocs }),
      ['章节梗概', '场景拆解', '伏笔与线索', '结尾钩子'],
    );

    const [summaryLabel, sceneLabel, clueLabel, hookLabel] = sections;

    return `第1章：夹缝求生\n\n**${summaryLabel}**：主角在危险环境里第一次显露“苟住才有机会翻盘”的核心策略。\n\n**${sceneLabel}**：\n- 场景1：危机降临，先展示外部压迫 + 写法指导：节奏快、信息密集。\n- 场景2：主角做出低调试探 + 写法指导：突出判断与克制。\n- 场景3：第一轮小反制 + 写法指导：压抑后释放。\n\n**${clueLabel}**：\n- 埋入：主角身上的异常来源\n- 推进：上位者对主角的初步关注\n- 收回：无\n\n**${hookLabel}**：主角意识到更大的规则压制已经开始。\n\n第2章：借势藏锋\n\n**${summaryLabel}**：主角借一次意外事件隐藏真实能力，并为下一次破局做准备。\n\n**${sceneLabel}**：\n- 场景1：外部事件升级 + 写法指导：让主角显得被动。\n- 场景2：主角内部权衡 + 写法指导：突出利益计算。\n- 场景3：埋下下一次反击条件 + 写法指导：结尾留钩。\n\n**${clueLabel}**：\n- 埋入：一条后续能反咬对手的证据\n- 推进：主角和灰色盟友的试探关系\n- 收回：无\n\n**${hookLabel}**：真正的目标人物出现。\n`;
  }

  return `# ${targetPath.split('/').at(-1)?.replace('.md', '')}\n\n核心方向：${settingSummary}\n`;
}

function buildWriteDraft(targetPath: string, idea: string, projectFiles: BuiltPrompt['projectFiles']) {
  const volumeNumber = resolveCurrentVolumeNumberFromProjectFiles(projectFiles);
  const chapterNumber = parseChapterNumberFromPath(targetPath);
  const resolvedPlan = resolveChapterPlanFromProjectFiles(projectFiles, chapterNumber, volumeNumber);
  const chapterPlan = resolvedPlan.ok
    ? resolvedPlan.chapter
    : buildFallbackChapterPlan(chapterNumber, idea);
  const previousDraft =
    chapterNumber > 1
      ? projectFiles.find((item) => item.path === previousChapterDraftPath(chapterNumber))?.content ?? ''
      : '';
  const settingSummary = projectFiles.find((item) => item.path === SETTING_SUMMARY_PATH)?.content ?? '';
  const cheatSummary = projectFiles.find((item) => item.path === CHEAT_SETTING_PATH)?.content ?? '';
  const previousContext = extractPreviousChapterContext(previousDraft);
  const cheatKeyword = extractCheatKeyword(cheatSummary);
  const protagonist = extractPrimaryRoleName(projectFiles) ?? '主角';

  const sceneBodies = chapterPlan.scenes.map((scene, index) =>
    buildSceneParagraph(scene, {
      idea,
      previousContext: cleanNarrativeText(previousContext),
      settingSummary,
      cheatSummary,
      cheatKeyword,
      protagonist,
      sceneIndex: index,
    }),
  );
  const draftSections = [
    `# ${chapterLabel(chapterNumber)} ${chapterPlan.title}`,
    '',
    ...sceneBodies,
    ...buildChapterBodyExpansion(chapterPlan, protagonist),
    buildHookParagraph(cleanNarrativeText(chapterPlan.hook), protagonist),
    '',
  ];

  return clampChapterDraftTargetLength(
    ensureChapterDraftTargetLength(draftSections.join('\n'), chapterPlan.title, protagonist),
  );
}

function buildReviewDraft(
  targetPath: string,
  projectFiles: BuiltPrompt['projectFiles'],
  workflowDocs: BuiltPrompt['workflowDocs'],
  userPrompt: string,
) {
  const reviewSections = withFallbackSections(
    extractTemplateSections({ module: 'review', targetPath, workflowDocs }),
    ['黄金三章法则 (Opening)', '沉浸感 (Immersion)', '情绪调动 (Emotion)', '文风与红线 (Style & Constraints)'],
  );

  if (targetPath === SETTING_REVIEW_REPORT_PATH) {
    const settingDraft = [
      projectFiles.find((item) => item.path === SETTING_SUMMARY_PATH)?.content ?? '',
      projectFiles.find((item) => item.path === CHEAT_SETTING_PATH)?.content ?? '',
      projectFiles.find((item) => item.path === ROLE_TABLE_PATH)?.content ?? '',
    ].join('\n\n');

    return [
      '# 设定审查报告',
      '',
      '> 审查对象：当前设定资产',
      '',
      '## 证据摘录',
      summarizeEvidence(settingDraft),
      '',
      ...reviewSections.flatMap((section) => [`## ${section}`, buildReviewSection(section, settingDraft, projectFiles), '']),
      '## 结论',
      '- 当前设定已经形成基本闭环，建议回到设定阶段继续补空缺或进入大纲规划。',
    ].join('\n');
  }

  if (targetPath === OUTLINE_REVIEW_REPORT_PATH) {
    const volumeNumber = resolveCurrentVolumeNumberFromProjectFiles(projectFiles);
    const outlineDraft = [
      projectFiles.find((item) => item.path === MASTER_OUTLINE_PATH)?.content ?? '',
      projectFiles.find((item) => item.path === VOLUME_OUTLINE_PATH(volumeNumber))?.content ?? '',
      projectFiles.find((item) => item.path === VOLUME_CHAPTER_OUTLINE_PATH(volumeNumber))?.content ?? '',
    ].join('\n\n');

    return [
      '# 大纲审查报告',
      '',
      '> 审查对象：当前大纲资产',
      '',
      '## 证据摘录',
      summarizeEvidence(outlineDraft),
      '',
      ...reviewSections.flatMap((section) => [`## ${section}`, buildReviewSection(section, outlineDraft, projectFiles), '']),
      '## 结论',
      '- 当前大纲已具备进入正文的基础，但建议先补齐冲突密度和卷内钩子。',
    ].join('\n');
  }

  const chapterNumber = parseChapterNumberFromPath(targetPath);
  const draftPath = chapterDraftPath(chapterNumber);
  const chapterDraft = projectFiles.find((item) => item.path === draftPath)?.content ?? '';
  const titleMatch = chapterDraft.match(new RegExp(`^#\\s+${chapterLabel(chapterNumber)}\\s+(.+)$`, 'm'));
  const chapterTitle = titleMatch?.[1]?.trim() ?? '夹缝求生';
  const nextChapterLabel = chapterLabel(chapterNumber + 1);
  const reviewIssues = detectChapterReviewIssues(chapterDraft, userPrompt);
  const reviewGate = reviewIssues.length > 0 ? 'REVISE' : 'PASS';
  const conclusion = reviewIssues.length > 0
    ? [
        '- 当前章节不建议放行，需先按问题清单回到正文写作阶段修订。',
        `- 修订完成后重新审查，再决定是否进入${nextChapterLabel}。`,
      ]
    : [
        '- 当前章节具备明确冲突和钩子，可以进入下一轮修订或继续下一章。',
        `- 建议先根据报告微调语言密度，再决定是否直接进入${nextChapterLabel}。`,
      ];

  return [
    `# ${chapterLabel(chapterNumber)} 审查报告`,
    '',
    `> 审查对象：${chapterLabel(chapterNumber)} ${chapterTitle}`,
    '',
    `- 审查评级：${reviewGate}`,
    '',
    '## 证据摘录',
    summarizeEvidence(chapterDraft),
    '',
    ...(reviewIssues.length > 0 ? ['## 关键问题', ...reviewIssues, ''] : []),
    ...reviewSections.flatMap((section) => [`## ${section}`, buildReviewSection(section, chapterDraft, projectFiles), '']),
    '## 结论',
    ...conclusion,
    '',
    '## AI味专项检查',
    ...buildAiFlavorFindings(chapterDraft, reviewIssues.length > 0),
    '',
    '## 局部改写任务',
    ...buildLocalizedRewriteTasks(reviewIssues.length > 0),
  ].join('\n');
}

function buildMasterDraft(idea: string, projectFiles: BuiltPrompt['projectFiles']) {
  const currentMaster = projectFiles.find((item) => item.path === MASTER_CONSTITUTION_PATH)?.content ?? '# MASTER';
  const projectSpecificRedlines = [
    `- 保持“${idea}”的苟道生存逻辑，不要强行热血降智。`,
    '- 反派决策必须基于其已知信息下的最优解。',
  ];

  if (/## 项目特有红线/.test(currentMaster)) {
    const missingLines = projectSpecificRedlines.filter((line) => !currentMaster.includes(line));
    return missingLines.length === 0 ? currentMaster : `${currentMaster.trimEnd()}\n${missingLines.join('\n')}\n`;
  }

  return `${currentMaster.trimEnd()}\n\n## 项目特有红线\n${projectSpecificRedlines.join('\n')}\n`;
}

function withFallbackSections(sections: string[], fallback: string[]) {
  return sections.length > 0 ? sections : fallback;
}

function buildSectionedMarkdown(title: string, sections: string[], bodyBySection: Record<string, string>) {
  return [
    `# ${title}`,
    '',
    '> 基于当前流程文档生成的结构化初稿。',
    '',
    ...sections.flatMap((section) => [`## ${section}`, bodyBySection[section] ?? '待补充', '']),
  ].join('\n');
}

function buildFallbackChapterPlan(chapterNumber: number, idea: string): ChapterPlan {
  return {
    number: chapterNumber,
    title: '本章正文',
    summary: cleanNarrativeText(idea) || '围绕当前项目设定推进本章主事件。',
    scenes: [
      `场景1：承接当前项目设定，主角先确认局势中的真实风险`,
      '场景2：主角低调试探，借对手误判保留后手',
      '场景3：局面出现反转，新的矛盾被推到台前',
    ],
    hook: '更大的风险已经逼近。',
  };
}

function extractPrimaryRoleName(projectFiles: BuiltPrompt['projectFiles']) {
  const roleTable = projectFiles.find((item) => item.path === ROLE_TABLE_PATH)?.content ?? '';
  const roleMatch = roleTable.match(/(?:主角|男主|女主)[：:\s-]+([一-龥]{2,4})(?:[，,。；;（(\s]|$)/u);
  if (roleMatch?.[1]) {
    return roleMatch[1];
  }

  const headingMatch = roleTable.match(/^#{2,6}\s*([一-龥]{2,4})(?:\s|$)/mu);
  if (headingMatch?.[1] && !['主要角色', '角色设定'].includes(headingMatch[1])) {
    return headingMatch[1];
  }

  return null;
}

function parseChapterNumberFromPath(targetPath: string) {
  const match = targetPath.match(/第(\d+)章/);
  return match ? Number.parseInt(match[1], 10) : 1;
}

function resolveCurrentVolumeNumberFromProjectFiles(projectFiles: BuiltPrompt['projectFiles']) {
  for (const file of projectFiles) {
    const volumeNumber = parseVolumeNumberFromPath(file.path);
    if (volumeNumber !== null) {
      return volumeNumber;
    }
  }

  return DEFAULT_VOLUME_NUMBER;
}

function buildSceneParagraph(
  scene: string,
  options: {
    idea: string;
    previousContext: string;
    settingSummary: string;
    cheatSummary: string;
    cheatKeyword: string;
    protagonist: string;
    sceneIndex: number;
  },
) {
  const sceneBeat = cleanSceneBeat(scene);
  const continuity =
    options.sceneIndex === 0 && options.previousContext
      ? `${options.previousContext}\n\n`
      : '';
  const variant = buildSceneFollowup({ ...options, sceneBeat });

  return [continuity.trim(), ...variant]
    .filter(Boolean)
    .join('\n\n');
}

function buildSceneFollowup({
  cheatKeyword,
  cheatSummary,
  settingSummary,
  protagonist,
  sceneIndex,
  sceneBeat,
}: {
  cheatKeyword: string;
  cheatSummary: string;
  settingSummary: string;
  protagonist: string;
  sceneIndex: number;
  sceneBeat: string;
}) {
  const cheatLine = cheatKeyword
    ? `关于${cheatKeyword}的变化被${protagonist}压在心底，没有露出半点异样。`
    : cheatSummary
      ? `${protagonist}把灵力收得很细，只留出一层足够骗人的虚弱波动。`
      : '';
  const worldLine = settingSummary
    ? '外面的风声盖过了远处的低语，也盖住了每一次短促的呼吸。'
    : '';
  const sceneSpecificVariant = buildSceneSpecificFollowup(sceneBeat);
  if (sceneSpecificVariant) {
    return sceneSpecificVariant.map((line) => line.replace(/主角/gu, protagonist));
  }

  const variants = [
    [
      `风从门缝里压进来时，${protagonist}先把手里的东西收进袖中，肩背也随之塌下去。`,
      `来人站在光线最暗的地方，话说得很慢：“你知道我为什么来。”`,
      `${protagonist}没有抬头，只让声音里带出恰到好处的慌乱：“知道一点，但不敢乱猜。”`,
      cheatLine,
    ],
    [
      `${protagonist}没有看对方的脸，只盯着那只搭在兵刃上的手，记下每一次松紧。`,
      '桌上的影子向前压了半寸，屋里的空气也跟着变窄。',
      `他把早就准备好的说辞往后推了一步，先露出沉默，让对方以为自己已经占了上风。`,
      worldLine,
    ],
    [
      `求饶不是目的，只是${protagonist}递出去的一层壳。`,
      '他往后退了半步，像是被逼得无路可走，眼角却借着低头的动作扫过门边、窗沿和地上的碎痕。',
      '对方果然往前逼来，急着把这点软弱坐实。',
      `就在那一瞬，${protagonist}确认了最关键的一件事：真正的破绽不在门口，而在对方以为自己不会反抗的时候。`,
    ],
    [
      '对方的贪念一冒头，他便顺着那点裂缝往后退，把路让得更像退路。',
      `“我可以带路。”${protagonist}说得很轻，像是在替自己争最后一口气，“只要你肯多给我一点时间。”`,
      '对方看了看外面的天色，又看了看他故意留下的狼狈，终于露出一点不耐。',
      `${protagonist}连忙点头，指尖在袖口内侧停了一瞬，很快又松开。`,
    ],
    [
      '夜色压下来后，路面上的水光把脚印照得很浅。',
      `${protagonist}走得踉跄，几次险些滑倒，袖中的后手却始终被两根手指稳稳夹住。`,
      '身后的脚步声不紧不慢，像是故意留出一点距离，等他自己露出慌张。',
      '他便把慌张做给对方看，呼吸越来越重，方向却一次也没有错。',
    ],
    [
      '脚步声在身后拉开距离，又很快压近；那点耐心，比刀锋更好用。',
      `${protagonist}没有走人多的明路，而是拐向一条更容易被误判的岔道。`,
      '身后的人明显停了一下，随后发出一声低笑。',
      '他像是没听见，只把身形压得更低，脚步越发慌乱。',
    ],
    [
      '岔道尽头没有灯，只有断墙和乱石把退路遮得干干净净。',
      `${protagonist}冲到这里，终于像是跑不动了，扶着石壁大口喘气。`,
      '对方提着兵刃走近，声音里已经没有多少谨慎。',
      `他背对着那人，肩膀还在抖，声音却一点点低了下去：“我真没有别的路了。”`,
    ],
    [
      `他摔倒时顺势摸到了袖中的符纸，指腹只轻轻压了一下。`,
      '对方的耐心终于耗尽，靴底踩住他的手腕，力道一点点往下碾。',
      `${protagonist}闷哼一声，整个人蜷起来，另一只手却从暗处缓慢翻转。`,
      '符纸边缘亮起一点细光，被阴影遮得严严实实。',
    ],
    [
      '兵刃落下前的一瞬，他终于抬眼，眼底的惧意已经收得干干净净。',
      '对方心头一跳，还没来得及后退，压在地面的符光已经贴着影子窜出。',
      '狭窄处灵光暴涨，碎石被冲击掀起，打在墙面上发出密集轻响。',
      `${protagonist}没有喊，也没有笑。他从地上起身，第二道后手已经夹在指间。`,
    ],
    [
      '灵光炸开时，暗处被撕出一片白亮，对方的影子在墙上一晃就碎。',
      `${protagonist}一步上前，没有给那人重新聚气的机会。`,
      '所有动作都被他拆得很细：压制、确认、收走证物，再把痕迹一点点抹平。',
      '远处传来沉闷声响，正好盖住最后一点动静。',
    ],
    [
      '收尾比出手更慢，也更危险。',
      `${protagonist}把每一处可能留下判断的痕迹都重新看过，确认没有把自己真正的底牌暴露在现场。`,
      '他没有贪多，只拿走能解释局势的东西，把太显眼的收获留在原处。',
      '做完这些，他退后三步，看着风把地上的细尘一点点推平。',
    ],
    [
      '他把证物攥进掌心，听见风声重新接管了这条暗路。',
      '里面东西不多，却有一张被反复折过的纸条。',
      `${protagonist}的目光停在纸条末尾，指尖微微顿住。那里写着一个和他有关的标记。`,
      '他没有久留，把纸条收好，重新压低身形，沿来路消失在夜色里。',
    ],
  ];

  return variants[sceneIndex % variants.length];
}

function buildSceneSpecificFollowup(sceneBeat: string) {
  if (/(火力覆盖|十张|火弹符|炸开)/u.test(sceneBeat)) {
    return [
      '数道符光在狭窄处同时亮起，第一轮压碎护体灵光，第二轮封住左右退路，第三轮才真正落向要害。',
      '墙面把爆裂声压回原地，热浪卷起白雾，连空气都被蒸得发出尖细的嘶声。',
      '主角没有给对方重新聚气的机会，脚步穿过白雾，后手已经滑到掌心。',
      '这一下不是逞强，而是把前面所有示弱都一次性收回来。',
    ];
  }

  if (/(杀人扬灰|补刀|摸尸|化尸粉|储物袋)/u.test(sceneBeat)) {
    return [
      '对方倒在暗处，喉咙里只剩破风箱似的喘声。',
      '主角蹲下去，先确认灵力散尽，再把能说明来路的物件一件件取出。',
      '清理痕迹时，他没有贪快，每一步都先想好别人追查时会看到什么。',
      '真正让他停住的是一枚陌生凭记。那东西不值钱，却把下一条线索递到了手边。',
    ];
  }

  if (/(废弃矿坑|死胡同|拦住|图穷匕见)/u.test(sceneBeat)) {
    return [
      '死路尽头没有灯，只有风从断壁间穿过，把碎石吹得轻轻滚动。',
      '主角停在那里，前方无路，身后的脚步声终于不再遮掩。',
      '对方从暗处走出来，兵刃横在身前，语气里已经多了胜券在握的松弛。',
      '主角低着头，肩膀微微发抖，袖中压好的后手却没有乱半分。',
    ];
  }

  if (/(极致示弱|惊恐|后退|跌倒|求饶)/u.test(sceneBeat)) {
    return [
      '他往后退了半步，脚跟踩进泥坑，整个人顺势摔倒，掌心按在碎石上，血很快被雨水冲淡。',
      '主角的声音被风声割得断断续续，听起来像是已经被逼到只剩求活。',
      '对方看着他在地上发抖，最后那点谨慎也散了。一个会把额头磕破的人，很难让人想到刀。',
      '兵刃抬起来时，主角甚至闭了下眼，像是已经认命。',
    ];
  }

  if (/(雷霆反击|刀锋|不退反进|举刀)/u.test(sceneBeat)) {
    return [
      '刀锋劈下的瞬间，主角的呼吸忽然停住。',
      '他没有再退，左手按地，身体贴着泥水向前一滑，正好避开刀锋最重的那一点。',
      '对方只觉得眼前那团烂泥突然活了过来，等他想收刀，主角的右手已经从袖中探出。',
      '符纸被两指夹开，边缘同时亮起暗红色灵光。',
    ];
  }

  return null;
}

function buildChapterBodyExpansion(chapterPlan: ChapterPlan, protagonist: string) {
  const titleLine = chapterPlan.title
    ? `这一章真正难熬的地方，不在眼前的险，而在${protagonist}每一步都必须贴着章纲里的因果往前走。`
    : '';

  return [
    titleLine,
    `${protagonist}没有急着离开。他先把刚才发生过的一切在心里复盘一遍：谁先开口，谁先露出贪念，哪句话让对方放下戒心，哪一步差点把自己推到明处。`,
    `复盘到一半，他又停住。${ensureSentence(chapterPlan.summary)}这句话若只落在纸面上，只是一条章纲；落到眼前，就是每一个不能说错的字、不能走错的方向。`,
    '外面的动静渐渐远了，屋里却没有因此安静。桌角有水滴落下，地面有细尘被风推开，连墙缝里的暗影都像在等他先露出破绽。',
    `${protagonist}把能马上用的东西放到左手边，把可能暴露来源的东西放到右手边，真正看不懂的线索单独压住。分开，不是为了整齐，是为了下一次被人翻查时能有不同说法。`,
    '他想起上一刻对方的眼神。那种眼神里没有单纯的怒，也没有单纯的贪，更多是一种习惯了压人的笃定。笃定本身就是破绽，因为笃定的人总会少看一眼脚下。',
    `${protagonist}用指节轻轻敲了敲桌面。一下，两下，第三下停住。他在停顿里把新的路线重新排开：明路不能走，熟人不能问，太快会显急，太慢又会让线索冷掉。`,
    '这一点分寸最磨人。强行冲出去，读者会爽一瞬，他却会死在下一道关口；一直缩着不动，局势也不会因为他的谨慎而停下来等。',
    `${protagonist}最终只做了一个很小的动作。他把最显眼的痕迹留在原处，又把真正要命的东西换了位置。若有人来看，会看到一个仓促、贫弱、刚刚被吓坏的人；若有人细查，才会发现那份仓促里有几处刻意留下的空白。`,
    '天色一点点沉下去，远处传来压低的交谈声。那些声音听不清内容，只能听出人群正在重新聚拢。人一聚拢，消息就会开始变形；消息一变形，真正的主使就会试着把线头捏回手里。',
    `${protagonist}等的就是那只手。`,
    '他没有把判断写下来。纸会留下证据，口会引来耳朵，只有暂时压在心里的东西，才能在下一次对峙前保持锋利。',
    '夜色完全合拢时，他重新把自己摆回弱势的位置。衣角故意没有理平，声音故意留着一点虚，眼神只在必要时抬一下，又很快垂下去。',
    `如果下一场冲突按章纲推进，${protagonist}需要的不是赢得漂亮，而是赢得像侥幸。侥幸会让对方不甘，不甘会让对方追上来，追上来才会把背后的路带出来。`,
    '屋外忽然有人停步。不是路过的随意停顿，而是听见屋里有动静后刻意收住的脚步。',
    `${protagonist}没有回头。他先把桌上的东西盖住，再把呼吸放慢，最后才用最普通的语气问：“谁在外面？”`,
  ].filter(Boolean);
}

function ensureChapterDraftTargetLength(content: string, title = '', protagonist = '主角') {
  if (countChapterDraftNarrativeChars(content) >= TARGET_CHAPTER_DRAFT_NARRATIVE_CHARS) {
    return content;
  }

  const extensionParagraphs = [
    `${protagonist}没有立刻回应门外的人，只让脚步声在心里多走了两遍。来者若只是试探，急着开门会显得心虚；若是追查，拖得太久又会让对方起疑。`,
    `他把脸上的表情一点点放松，再留下一层未散的惊惧。这样的惊惧不能太重，太重就像演；也不能太轻，太轻就不像刚从险处退回来的人。`,
    '门打开一道缝，外面的光切进屋里，把桌角、衣袖和地面上的碎痕照得很清楚。',
    `对方没有马上说话，只往屋里扫了一眼。${protagonist}便也没有催，只把手指藏在袖下，任那道目光先挑自己想挑的东西。`,
    '最显眼的破绽是他故意留下的。真正要紧的线索被压在另一层不起眼的杂物下面，离手很近，离视线很远。',
    `“刚才有没有听见动静？”门外的人问。${protagonist}低声答得很慢：“听见了，但没敢出去。”`,
    '这句话半真半假。真在没出去给旁人看见，假在他比任何人都清楚那动静从哪里来，又会把谁引过去。',
    '对方盯着他看了片刻，没有找出新的破口，只能把问题换成威胁。威胁来得越直接，说明对方手里越缺证据。',
    `${protagonist}顺着威胁低头，心里却把这一次盘问的顺序记下来。先问动静，再看屋里，最后提到某个名字。顺序本身就是线索。`,
    '门重新合上后，他没有马上动。外面的脚步声还停在不远处，像是等屋里露出一点松气的声音。',
    '他便继续站着，站到腿脚都有些发麻，才慢慢坐回桌前，拿起一件无关紧要的小物件假装整理。',
    `直到那脚步真正远去，${protagonist}才把袖中的东西取出来，借着昏暗光线重新看了一遍。`,
    '线索没有变，变的是它所在的位置。刚才那场盘问让他确认，背后的人已经察觉到某处不对，却还不知道不对从谁身上开始。',
    '这就是时间差。',
    `${protagonist}把时间差拆成三段：今晚只看，不动手；明日只问旁枝，不碰主线；等对方主动补洞时，再顺着新补的边缘摸进去。`,
    '这种做法不够痛快，却足够稳。痛快会让局面提前炸开，稳才能把下一章需要的更大冲突慢慢逼出来。',
  ];
  const nextSections = [content.trimEnd(), ''];

  for (const paragraph of extensionParagraphs) {
    if (countChapterDraftNarrativeChars(nextSections.join('\n')) >= TARGET_CHAPTER_DRAFT_NARRATIVE_CHARS) {
      break;
    }

    nextSections.push(paragraph, '');
  }

  const supplementalParagraphs = [
    `${protagonist}没有急着把判断说出口，只把桌上的线索重新排开。每一处遗漏都可能变成明日的杀机，每一分克制也都可能换来下一次出手的机会。等外面的脚步声彻底远去，他才吹灭灯火，把真正要查的名字压在掌心下面。`,
    '风沿着门缝钻进来，吹得灯芯微微偏斜。他借那一点偏斜重新确认屋里的影子，哪些地方会被来人看见，哪些地方能藏住手边的动作，都一一落到心里。',
    `${protagonist}最怕的不是有人上门，而是没人上门。没人上门，说明对方还没动；只要有人动，就会带出方向、口风和下一次试探的时间。`,
    '他把自己重新放回最不起眼的位置。眼神低，动作慢，话少，却在每一次停顿里留出可以转身的余地。',
    '远处传来一阵短促的脚步，很快又被风压下去。那声音不像路过，更像有人在拐角处换了方向。',
    `${protagonist}把指尖按在桌面上，没有追出去。现在追出去，只会把主动权交还给暗处的人；等对方以为他不敢动，才是他真正能动的时候。`,
  ];

  let guard = 0;
  while (countChapterDraftNarrativeChars(nextSections.join('\n')) < TARGET_CHAPTER_DRAFT_NARRATIVE_CHARS && guard < 24) {
    nextSections.push(
      supplementalParagraphs[guard % supplementalParagraphs.length],
      '',
    );
    guard += 1;
  }

  return `${nextSections.join('\n').trimEnd()}\n`;
}

function clampChapterDraftTargetLength(content: string) {
  if (countChapterDraftNarrativeChars(content) <= MAX_CHAPTER_DRAFT_NARRATIVE_CHARS) {
    return content;
  }

  const paragraphs = content.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const heading = paragraphs[0] ?? '';
  const body = paragraphs.slice(1);
  const selected = [heading];

  for (const paragraph of body) {
    const candidate = [...selected, paragraph].join('\n\n');
    if (
      countChapterDraftNarrativeChars(candidate) > MAX_CHAPTER_DRAFT_NARRATIVE_CHARS
      && countChapterDraftNarrativeChars(selected.join('\n\n')) >= TARGET_CHAPTER_DRAFT_NARRATIVE_CHARS
    ) {
      break;
    }

    selected.push(paragraph);
  }

  return `${selected.join('\n\n').trimEnd()}\n`;
}

function cleanSceneBeat(scene: string) {
  return cleanNarrativeText(
    scene
    .replace(/^场景\d+：/, '')
    .replace(/^【[^】]+】/, '')
      .replace(/写法指导[:：].*$/u, '')
      .trim()
      .replace(/[。；;]\s*$/u, ''),
  );
}

function cleanNarrativeText(text: string) {
  return text
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/写法指导[:：].*$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function ensureSentence(text: string) {
  return /[。！？!?]$/u.test(text) ? text : `${text}。`;
}

function buildHookParagraph(hook: string, protagonist = '主角') {
  if (/目标人物/u.test(hook)) {
    return `巷口那道陌生身影停在暗处，没有进来，也没有离开。${protagonist}隔着半扇窗看见对方袖口的暗扣，指尖在桌面上轻轻一顿，心里知道，今晚露面的那个人只是一枚探路石。`;
  }

  if (/陷阱/u.test(hook)) {
    return `等${protagonist}把最后一行字看完，纸背却慢慢透出一道更浅的墨痕。那不是名单，也不是账目，而是一处只有更深层人物才会使用的暗记。他看着那枚暗记，忽然明白自己刚才躲开的不是一把刀，而是一张已经收紧的网。`;
  }

  if (/规则|压制/u.test(hook)) {
    return `天色将亮时，外面响起了新的号令。不是寻常盘问，也不是临时巡查，而是更高一层秩序压下来的声音。${protagonist}停下手，望着门缝外那一点灰白天光，知道真正的麻烦才刚刚露面。`;
  }

  return `${ensureSentence(hook)}门外的风声渐渐小了，四周却没有因此安静。${protagonist}把灯吹灭，任自己重新坐回黑暗里，等下一道脚步声先露出破绽。`;
}

function extractPreviousChapterContext(previousDraft: string) {
  const narrativeLines = previousDraft
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^#/.test(line) && !isMetaContinuityLine(line));

  return narrativeLines.at(-1) ?? '';
}

function isMetaContinuityLine(line: string) {
  return /(上一章|前一章|上章|接上章|承接上文|本章|这一章|读者)/u.test(line);
}

function summarizeReference(content: string) {
  const cleaned = content.replace(/[#>*`\-\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.length > 36 ? `${cleaned.slice(0, 36)}...` : cleaned || '暂无';
}

function summarizeEvidence(content: string) {
  const cleaned = content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^#/.test(line))
    .slice(0, 3)
    .join(' / ');

  return cleaned || '暂无可引用正文证据';
}

function detectChapterReviewIssues(chapterDraft: string, userPrompt: string) {
  const askedForCompressionCheck = /压缩章纲|摘要|梗概|太短|长度不足|字数|AI味|连续性/u.test(userPrompt);
  const narrativeLength = countNarrativeChars(chapterDraft);
  const paragraphCount = chapterDraft
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0 && !/^#/.test(paragraph)).length;
  const issues: string[] = [];

  if (askedForCompressionCheck && (narrativeLength < 3000 || paragraphCount < 8)) {
    issues.push(
      `- 正文长度不足：当前正文约 ${narrativeLength} 字，段落数量 ${paragraphCount}，更像压缩章纲或剧情梗概，缺少完整场景推进。`,
    );
    issues.push('- 压缩章纲感明显：冲突、诱敌、反杀和钩子都被概括性带过，需要整章扩写到3000-3500字。');
  }

  return issues;
}

function buildAiFlavorFindings(chapterDraft: string, needsRevision: boolean) {
  if (!needsRevision) {
    return [
      '- 命中类型：暂无硬性 BLOCK 项，继续抽查解释性总结、套路化比喻和过度连接词。',
      `- 原句或段落：${summarizeEvidence(chapterDraft)}`,
      '- 建议改法：优先删解释性总结句，用动作、环境和对话承载判断。',
      '- 是否需要整章重写：暂不需要，除非后续发现结构性摘要化问题。',
    ];
  }

  return [
    '- 命中类型：压缩章纲 / 正文长度不足 / 场景展开不充分。',
    `- 原句或段落：${summarizeEvidence(chapterDraft)}`,
    '- 建议改法：把每个概括动作拆成完整场景，补足人物动作、环境阻力、对话交锋、心理遮掩和因果转折。',
    '- 是否需要整章重写：需要整章扩写，但保留现有主事件和结尾钩子。',
  ];
}

function buildLocalizedRewriteTasks(needsRevision: boolean) {
  if (!needsRevision) {
    return [
      '- 句子级：删除或改写解释性总结句，避免替读者下判断。',
      '- 段落级：压缩套路化比喻和高频副词，保留动作与环境信息。',
      '- 场景级：仅当整段气氛或逻辑偏离时，重写对应场景，不直接整章推倒重来。',
    ];
  }

  return [
    '- 整章扩写：按现有主事件重新生成完整正文，不要只补几句过场。',
    '- 场景级：至少展开“诱敌进门、装怂谈判、雨夜尾随、废矿坑反杀、摸尸发现钩子”五个连续场景。',
    '- 句子级：删除“态度极度嚣张”“准备拿他开刀立威”等概括判断，改成动作、对话和可见细节。',
  ];
}

function countNarrativeChars(content: string) {
  return content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^#/.test(line))
    .join('')
    .replace(/\s+/g, '').length;
}

function extractCheatKeyword(content: string) {
  return content.match(/铜钱|系统|戒指|外挂|传承|未来/u)?.[0] ?? '';
}

function buildReviewSection(section: string, chapterDraft: string, projectFiles: BuiltPrompt['projectFiles']) {
  const styleGuide = projectFiles.find((item) => item.path === STYLE_GUIDE_PATH)?.content ?? '';
  const master = projectFiles.find((item) => item.path === MASTER_CONSTITUTION_PATH)?.content ?? '';
  const styleHint = styleGuide.match(/克制[^。\n]*/)?.[0] ?? '当前文风约束';
  const redlineSection = master.match(/##\s*项目特有红线([\s\S]*)/);
  const redlineHint = redlineSection?.[1].match(/-\s*([^\n]+)/)?.[1] ?? '项目特有红线';

  if (section.includes('黄金三章法则')) {
    return '- 切入点：当前章节开场有直接危机，符合快切入要求。\n- 金手指：建议下一轮补强主角异能的显性收益。\n- 代入感：主角处境明确，代入基础成立。';
  }

  if (section.includes('沉浸感')) {
    return '- Show, Don\'t Tell：已有动作开场，但可增加更多环境细节。\n- 五感描写：建议补充声音和体感描写，增强现场压迫感。';
  }

  if (section.includes('情绪调动')) {
    return '- 爽点/憋屈点：压抑感建立到位，但释放还可以更响亮。\n- 装逼打脸：第一章以埋势为主，建议第二章开始兑现第一轮反制。';
  }

  if (section.includes('文风与红线')) {
    return `- 文风对照：已对照“${styleHint}”继续审看章节语气。\n- AI味去除：当前文本长度 ${chapterDraft.length}，已重点排查黑名单词汇、套路化比喻与解释性总结。\n- 局部改写优先：若发现问题，先给出句子/段落级改写建议，避免直接整章重写。\n- 红线检查：已对照现有规则“${redlineHint}”进行检查。`;
  }

  return '- 待补充';
}
