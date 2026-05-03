import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { ProposedWrite } from '../chat/generateAssistantReply';
import { replaceSubsection } from '../files/markdownSections';
import { ANALYZE_SELECTION_PATH } from '../paths/projectPaths';
import type { WorkflowTransitionTarget } from '../workflow/contracts/types';
import { buildCustomAnalyzeMarkdown } from './customAnalyze';
import { readSampleBookContext } from './sampleBookScan';

type AnalyzeProposal = {
  reply: string;
  proposedWrites: ProposedWrite[];
  sourceReadPaths: string[];
  nextTarget: WorkflowTransitionTarget;
};

type BuildAnalyzeProposalOptions = {
  projectRoot: string;
  projectContent: string;
  currentSubstepId:
    | 'prepare-sample-book'
    | 'choose-summary-mode'
    | 'await-env-confirmation'
    | 'style-analysis'
    | 'trope-analysis'
    | 'framework-analysis'
    | 'micro-analysis'
    | 'custom-analysis';
  userMessage: string;
};

export async function buildAnalyzeProposal({
  projectRoot,
  projectContent,
  currentSubstepId,
  userMessage,
}: BuildAnalyzeProposalOptions): Promise<AnalyzeProposal> {
  const sample = await readSampleBookContext(projectRoot);

  switch (currentSubstepId) {
    case 'prepare-sample-book':
      if (!sample.sampleBookPath) {
        return {
          reply: '未发现样板书文件。请先把样板书 `.txt` 放到项目根目录，再重新触发 Analyze。',
          proposedWrites: [],
          sourceReadPaths: ['PROJECT.md'],
          nextTarget: { stepId: 'analyze-entry', substepId: 'prepare-sample-book', mode: 'analyze' },
        };
      }

      if (sample.sampleBookPaths.length > 1) {
        const explicitChoice = sample.sampleBookPaths.find((candidate) => userMessage.includes(candidate));

        if (!explicitChoice) {
          return {
            reply: [
              '检测到多个样板书文件，请先明确选择其中一个再继续。请选择：',
              ...sample.sampleBookPaths.map((item, index) => `${index + 1}. ${item}`),
              '请回复例如：“使用 样板书B.txt”',
            ].join('\n'),
            proposedWrites: [],
            sourceReadPaths: ['PROJECT.md', ...sample.sampleBookPaths],
            nextTarget: { stepId: 'analyze-entry', substepId: 'prepare-sample-book', mode: 'analyze' },
          };
        }

        return {
          reply: `已选择样板书：${explicitChoice}。请确认后进入梗概生成方式选择。`,
          proposedWrites: [
            {
              path: ANALYZE_SELECTION_PATH,
              content: JSON.stringify({ sampleBookPath: explicitChoice }, null, 2),
            },
          ],
          sourceReadPaths: ['PROJECT.md', ...sample.sampleBookPaths],
          nextTarget: { stepId: 'analyze-entry', substepId: 'choose-summary-mode', mode: 'analyze' },
        };
      }

      return {
        reply: [
          '已进入 Analyze 模式。',
          `检测到样板书：${sample.sampleBookPath ?? '未发现样板书文件'}`,
          '请先确认样板书路径和编码无误；确认后我会进入梗概生成方式选择。',
        ].join('\n'),
        proposedWrites: [],
        sourceReadPaths: ['PROJECT.md', ...(sample.sampleBookPath ? [sample.sampleBookPath] : [])],
        nextTarget: { stepId: 'analyze-entry', substepId: 'choose-summary-mode', mode: 'analyze' },
      };

    case 'choose-summary-mode':
      if (/方式\s*A|\bA\b|脚本/u.test(userMessage)) {
        const envExists = await fileExists(path.join(projectRoot, '.env'));
        if (!envExists) {
          return {
            reply: '你选择了方式 A。我先为你准备 `.env` 模板，填写 API 后回复“已填写”，再继续生成故事梗概。',
            proposedWrites: [
              {
                path: '.env',
                content: ['NOVEL_API_KEY=', 'NOVEL_API_BASE=https://api.openai.com/v1', 'NOVEL_API_MODEL=gpt-4o-mini'].join('\n'),
              },
            ],
            sourceReadPaths: ['PROJECT.md', ...(sample.sampleBookPath ? [sample.sampleBookPath] : [])],
            nextTarget: { stepId: 'analyze-entry', substepId: 'await-env-confirmation', mode: 'analyze' },
          };
        }

        return buildSynopsisProposal(sample, projectContent, '方式 A（已检测到 .env）', 'style-analysis');
      }

      if (!/方式\s*B|\bB\b|agent|开篇/u.test(userMessage)) {
        return {
          reply: '步骤 1 需要你明确选择：方式 A（脚本批量梗概）或 方式 B（Agent 开篇梗概）。请直接回复“方式 A”或“方式 B”。',
          proposedWrites: [],
          sourceReadPaths: ['PROJECT.md', ...(sample.sampleBookPath ? [sample.sampleBookPath] : [])],
          nextTarget: { stepId: 'analyze-entry', substepId: 'choose-summary-mode', mode: 'analyze' },
        };
      }

      return buildSynopsisProposal(sample, projectContent, '方式 B', 'style-analysis');

    case 'await-env-confirmation':
      if (!/已填写|改用方式\s*B|方式\s*B|切换到方式\s*B/u.test(userMessage)) {
        return {
          reply: '请先填写 `.env` 并回复“已填写”；如果不想配置 API，可以直接回复“方式 B”改用 Agent 开篇梗概。',
          proposedWrites: [],
          sourceReadPaths: ['PROJECT.md', ...(sample.sampleBookPath ? [sample.sampleBookPath] : []), '.env'],
          nextTarget: { stepId: 'analyze-entry', substepId: 'await-env-confirmation', mode: 'analyze' },
        };
      }

      if (/方式\s*B/u.test(userMessage)) {
        return buildSynopsisProposal(sample, projectContent, '方式 B', 'style-analysis');
      }

      if (!(await hasConfiguredApiKey(path.join(projectRoot, '.env')))) {
        return {
          reply: '检测到 `.env` 仍未填写有效的 `NOVEL_API_KEY`。请先补全 API Key，或改回“方式 B”。',
          proposedWrites: [],
          sourceReadPaths: ['PROJECT.md', ...(sample.sampleBookPath ? [sample.sampleBookPath] : [])],
          nextTarget: { stepId: 'analyze-entry', substepId: 'await-env-confirmation', mode: 'analyze' },
        };
      }

      return buildSynopsisProposal(sample, projectContent, '方式 A（已填写 .env）', 'style-analysis');

    case 'style-analysis':
      return {
        reply: `我已基于样板书 ${sample.sampleBookPath ?? '（未命名样本）'} 生成 1.2_文风.md 提案。请确认后继续进入套路分析。`,
        proposedWrites: [
          { path: '1-边界/1.2_文风.md', content: buildStyleGuide(sample.sampleText) },
          { path: 'PROJECT.md', content: updateProjectForAnalyze(projectContent, '1.2') },
        ],
        sourceReadPaths: ['PROJECT.md', ...(sample.sampleBookPath ? [sample.sampleBookPath] : [])],
        nextTarget: { stepId: 'analyze-entry', substepId: 'trope-analysis', mode: 'analyze' },
      };

    case 'trope-analysis':
      return {
        reply: `我已基于样板书 ${sample.sampleBookPath ?? '（未命名样本）'} 生成 1.3_套路方向.md 提案。请确认后继续进入全书框架拆解。`,
        proposedWrites: [
          { path: '1-边界/1.3_套路方向.md', content: buildTropeGuide(sample.sampleText) },
          { path: 'PROJECT.md', content: updateProjectForAnalyze(projectContent, '1.3') },
        ],
        sourceReadPaths: ['PROJECT.md', ...(sample.sampleBookPath ? [sample.sampleBookPath] : [])],
        nextTarget: { stepId: 'analyze-entry', substepId: 'framework-analysis', mode: 'analyze' },
      };

    case 'framework-analysis':
      return {
        reply: `我已基于样板书 ${sample.sampleBookPath ?? '（未命名样本）'} 生成 1.4_全书框架.md 提案。请确认后继续进入微观节奏拆解。`,
        proposedWrites: [
          { path: '1-边界/1.4_全书框架.md', content: buildFramework(sample.chapterHeads, sample.sampleText) },
          { path: 'PROJECT.md', content: updateProjectForAnalyze(projectContent, '1.4') },
        ],
        sourceReadPaths: ['PROJECT.md', ...(sample.sampleBookPath ? [sample.sampleBookPath] : [])],
        nextTarget: { stepId: 'analyze-entry', substepId: 'micro-analysis', mode: 'analyze' },
      };

    case 'micro-analysis':
      return {
        reply: `我已基于样板书 ${sample.sampleBookPath ?? '（未命名样本）'} 生成 1.5_微观节奏拆解.md 提案。请确认后决定是否继续自定义拆解。`,
        proposedWrites: [
          { path: '1-边界/1.5_微观节奏拆解.md', content: buildMicroRhythm(sample.chapterHeads, sample.sampleText) },
          { path: 'PROJECT.md', content: updateProjectForAnalyze(projectContent, '1.5') },
        ],
        sourceReadPaths: ['PROJECT.md', ...(sample.sampleBookPath ? [sample.sampleBookPath] : [])],
        nextTarget: { stepId: 'analyze-entry', substepId: 'custom-analysis', mode: 'analyze' },
      };

    case 'custom-analysis':
      if (
        /(不需要|跳过|不用)/u.test(userMessage) ||
        /^\s*(确认|继续)\s*[，。,！!]?$/u.test(userMessage.trim())
      ) {
        return {
          reply: '已跳过自定义拆解。确认后我会进入创意孵化阶段。',
          proposedWrites: [],
          sourceReadPaths: ['PROJECT.md', ...(sample.sampleBookPath ? [sample.sampleBookPath] : [])],
          nextTarget: { stepId: 'ideation-build', substepId: 'setting-draft', mode: 'standard', chapterNumber: 1 },
        };
      }

      return {
        reply: '我已根据你的要求生成自定义拆解提案。确认后将继续进入创意孵化阶段。',
        proposedWrites: [
          {
            path: extractCustomOutputPath(userMessage),
            content: buildCustomAnalyzeMarkdown(userMessage, sample.sampleText),
          },
          { path: 'PROJECT.md', content: updateProjectForAnalyze(projectContent, '自定义拆解') },
        ],
        sourceReadPaths: ['PROJECT.md', ...(sample.sampleBookPath ? [sample.sampleBookPath] : [])],
        nextTarget: { stepId: 'ideation-build', substepId: 'setting-draft', mode: 'standard', chapterNumber: 1 },
      };
  }
}

function buildSynopsisProposal(
  sample: Awaited<ReturnType<typeof readSampleBookContext>>,
  projectContent: string,
  modeLabel: string,
  nextSubstepId: 'style-analysis',
): AnalyzeProposal {
  return {
    reply: `你选择了${modeLabel}。我已生成 1.1_全书故事梗概.md 提案，请确认后继续进入文风分析。`,
    proposedWrites: [
      { path: '1-边界/1.1_全书故事梗概.md', content: buildSynopsis(sample.sampleBookPath, sample.previewLines) },
      { path: 'PROJECT.md', content: updateProjectForAnalyze(projectContent, '1.1') },
    ],
    sourceReadPaths: ['PROJECT.md', ...(sample.sampleBookPath ? [sample.sampleBookPath] : []), ...(modeLabel.includes('.env') ? ['.env'] : [])],
    nextTarget: { stepId: 'analyze-entry', substepId: nextSubstepId, mode: 'analyze' },
  };
}

function buildSynopsis(sampleBookPath: string | null, previewLines: string[]) {
  return [
    '# 全书故事梗概',
    '',
    `> 来源：${sampleBookPath ?? '未提供样板书'}`,
    '',
    '## 开篇梗概',
    previewLines.join(' '),
    '',
    '## 核心冲突',
    previewLines.slice(0, 4).join(' '),
    '',
    '## 关键卖点',
    previewLines.slice(0, 6).join(' '),
  ].join('\n');
}

function buildStyleGuide(sampleText: string) {
  const sampleExcerpt = sampleText.split(/\n+/).filter(Boolean).slice(0, 4).join('\n');

  return [
    '# 文风指南',
    '',
    '## 叙事风格 (Narrative Style)',
    '偏快节奏开局，信息抛出直接，以冲突先行。',
    '',
    '## 对白风格 (Dialogue Style)',
    '对白简短，主要承担推进冲突和压缩信息的作用。',
    '',
    '## 剧情节奏 (Pacing)',
    '前三章快速建立危机、项目能力或差异化资源，以及第一轮阶段性变化。',
    '',
    '## 整体基调 (Tone)',
    '悬压感强，强调先压后扬。',
    '',
    '## 文风样例 (Style Sample)',
    `- **原文摘录**：\n${sampleExcerpt}`,
  ].join('\n');
}

function buildTropeGuide(sampleText: string) {
  const coreSignal = extractCoreSignalFromSample(sampleText);

  return [
    '# 套路方向与核心设定 (Tropes & Core Concept)',
    '',
    '## 1. 核心梗 (Core Premise)',
    `样板书开篇围绕“${coreSignal}”建立核心吸引力，并通过连续压力推动主角进入主线。`,
    '',
    '## 2. 金手指 (The Cheat)',
    `若样板书存在能力、资源或秘密线索，应从“${coreSignal}”继续拆解其出现时机、代价、限制和升级节奏。`,
    '',
    '## 3. 世界观 (World Building)',
    '外部秩序强压，逼迫主角快速成长。',
    '',
    '## 4. 关键人设 (Characters)',
    '主角状态变化清晰，对手或阻力来源带有明确压迫性。',
    '',
    '## 5. 主线 (Main Plot)',
    '从开局压力起步，逐步转向主动选择与阶段跃迁。',
    '',
    '## 6. 小说爽点 (Pleasure Points)',
    '压力兑现、信息差、资源变化与阶段性反转。',
    '',
    '## 7. 主要故事剧情 (Key Story Arcs)',
    '开局危机 -> 获得依仗 -> 首次主动选择 -> 状态变化。',
    '',
    '## 8. 受众 (Target Audience)',
    '偏爱强钩子、强节奏和明显爽点的网文读者。',
    '',
    '## 9. 类型边界 (Genre Boundaries)',
    '保持强情节与商业爽感，不走纯抒情慢热路线。',
  ].join('\n');
}

function extractCoreSignalFromSample(sampleText: string) {
  const cleanedLines = sampleText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^第\s*[一二三四五六七八九十百千万\d]+\s*章/u.test(line));
  const firstNarrativeLine = cleanedLines[0] ?? '';
  const sentence = firstNarrativeLine.split(/[。！？!?]/u).find((part) => part.trim().length > 0)?.trim();

  if (!sentence) {
    return '样板书开篇钩子';
  }

  return sentence.length > 28 ? `${sentence.slice(0, 28)}...` : sentence;
}

function buildFramework(chapterHeads: string[], sampleText: string) {
  const firstUnit = chapterHeads.slice(0, 3).join(' / ') || '前三章开篇危机';
  const densityHint = `样板书当前共识别 ${chapterHeads.length} 个章节标题，用于参考开局信息密度和事件推进速度。`;

  return [
    '# 全书框架',
    '',
    '## 全书剧情单元总览',
    `- 开篇单元：${firstUnit}`,
    '',
    '## 核心节奏公式',
    '压力出现 -> 获得依仗 -> 试探边界 -> 形成阶段变化。',
    '',
    '## 换地图逻辑分析',
    '当主角在当前舞台完成阶段目标后，故事会自然转向更高层级或新功能舞台。',
    '',
    '## 对新书的启示',
    `- 开局要像样板书一样，尽快把“${sampleText.slice(0, 18)}”式的危机压到主角面前。`,
    '',
    '<!-- 节奏密度参考：' + densityHint + ' -->',
  ].join('\n');
}

function buildMicroRhythm(chapterHeads: string[], sampleText: string) {
  const firstThree = chapterHeads.slice(0, 3);
  const excerpt = sampleText.split(/\n+/).filter(Boolean).slice(0, 8).join(' / ');

  return [
    '# 微观节奏拆解',
    '',
    '## 单剧情单元拆解',
    `- 样本章节：${firstThree.join(' / ') || '前 3 章'}`,
    '- 起：先给主角明确压力。',
    '- 承：连续压制并逼主角作出选择。',
    '- 转：借能力、资源或信息差完成阶段反转。',
    '- 合：收获阶段性成果并引出更大麻烦。',
    '',
    '## 黄金三章显微镜',
    `- 切入点：${sampleText.split(/\n+/).find(Boolean) ?? '以危机切入'}`,
    '- 信息密度：前几章快速抛出设定和卖点。',
    '- 断章钩子：每章结尾都留下新的危险或收益期待。',
    '',
    '## 场景结构分析',
    '- 场景数量：观察章节内常见的场景拆分数量。',
    '- 场景切换：判断作者如何在动作、对话、内心戏之间切镜。',
    '- 参考摘录：' + excerpt,
  ].join('\n');
}

function extractCustomOutputPath(userMessage: string) {
  const match = userMessage.match(/输出到\s+([^\s]+\.md)/u);
  return match?.[1] ?? '1-边界/自定义_样板书拆解.md';
}

function updateProjectForAnalyze(projectContent: string, completedStep: string) {
  return replaceSubsection(projectContent, '### 8.1 当前重点与后续步骤', [
    '- **阶段**：参考模式分析',
    `- **核心任务**：完成 ${completedStep} 并继续拆解样板书`,
    '- **待办事项**：',
    `  - [x] ${completedStep}`,
  ]);
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function hasConfiguredApiKey(filePath: string) {
  if (!(await fileExists(filePath))) {
    return false;
  }

  const content = await readFile(filePath, 'utf8');
  return /^NOVEL_API_KEY\s*=\s*.+$/m.test(content);
}
