import type { AiFlavorHit, AiFlavorLintResult } from './aiFlavorLint';
import { lintAiFlavor } from './aiFlavorLint';

export type AiFlavorRepairTask = {
  scope: 'sentence' | 'paragraph' | 'scene-fragment';
  originalSnippet: string;
  strategy: string;
  evidence: AiFlavorHit[];
  acceptanceChecks: string[];
};

export type AiFlavorRepairPlan = {
  tasks: AiFlavorRepairTask[];
  escalation: { reason: string } | null;
};

const MAX_LOCAL_TASKS = 5;

const STRATEGIES: Record<string, string> = {
  'action-or-object-reaction': '改写策略：删掉套话反应，改用人物动作、手部细节、物件受力或对话停顿承载情绪。',
  'physical-detail-or-delete': '改写策略：删除泛化比喻，改用物理细节、声音、气味、光线或直接推进动作。',
  'event-bridge': '改写策略：用事件或动作衔接转折，避免对称排比和旁白式转场。',
  'consequence-or-action': '改写策略：删掉解释性判断，改写为角色马上采取的动作、具体后果或对话潜台词。',
  'embodied-emotion': '改写策略：把抽象情绪落到身体反应、环境压力、物件互动或说话节奏上。',
  'specific-detail': '改写策略：删掉泛化程度副词，补一个可观察的具体细节来表达程度。',
  'spoken-dialogue': '改写策略：把书面表达改成短句、身份化口吻和动作标签，让对白像角色本人说出口。',
  'chinese-expression': '改写策略：将不必要英文口癖改成符合人物身份的中文表达。',
};

export function buildAiFlavorRepairPlan(lint: AiFlavorLintResult): AiFlavorRepairPlan {
  const groups = groupHitsByContext(lint.hits);
  const escalation = shouldEscalate(groups, lint)
    ? { reason: 'AI味阻断问题分布在多处段落或场景，局部修补可能无法保留章节整体质感。' }
    : null;

  return {
    escalation,
    tasks: groups.slice(0, MAX_LOCAL_TASKS).map((group) => ({
      scope: 'paragraph',
      originalSnippet: group.context,
      strategy: buildStrategy(group.hits),
      evidence: group.hits,
      acceptanceChecks: [
        '只改这个局部片段，保留非目标段落。',
        '不要用同义套话替换禁用词，要换成动作、具体后果或可观察细节。',
        '改完后不得再触发同类 AI 味规则。',
      ],
    })),
  };
}

export function verifyAiFlavorRepair(content: string) {
  const lint = lintAiFlavor(content);

  return {
    passed: !lint.blocked,
    remainingHits: lint.hits,
    blockingReasons: lint.blockingReasons,
  };
}

function groupHitsByContext(hits: AiFlavorHit[]) {
  const grouped = new Map<string, AiFlavorHit[]>();

  for (const hit of hits) {
    const context = hit.context ?? hit.matchedText ?? hit.label;
    grouped.set(context, [...(grouped.get(context) ?? []), hit]);
  }

  return [...grouped.entries()].map(([context, groupHits]) => ({
    context,
    hits: groupHits,
  }));
}

function buildStrategy(hits: AiFlavorHit[]) {
  const strategyIds = [...new Set(hits.map((hit) => hit.replacementStrategyId).filter(Boolean))] as string[];
  return strategyIds.map((id) => STRATEGIES[id] ?? '改写策略：用具体动作和细节替换泛化表达。').join(' ');
}

function shouldEscalate(groups: Array<{ hits: AiFlavorHit[] }>, lint: AiFlavorLintResult) {
  const blockingGroupCount = groups.filter((group) => group.hits.some((hit) => hit.severity === 'block')).length;
  return blockingGroupCount >= 2 || (groups.length >= 4 && lint.blocked);
}
