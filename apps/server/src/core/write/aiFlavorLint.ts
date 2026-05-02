export type AiFlavorHit = {
  id?: string;
  label: string;
  category?:
    | 'cliche_phrase'
    | 'empty_emotion'
    | 'explanatory_narration'
    | 'mechanical_transition'
    | 'overused_simile'
    | 'bookish_dialogue'
    | 'low_density_paragraph'
    | 'english_mixing'
    | 'generic_intensifier';
  pattern: RegExp;
  severity?: 'block' | 'warn';
  matchedText?: string;
  context?: string;
  explanation?: string;
  replacementStrategyId?: string;
};

export type AiFlavorThresholdHit = {
  category: NonNullable<AiFlavorHit['category']>;
  count: number;
  threshold: number;
  label: string;
};

export type AiFlavorLintResult = {
  blocked: boolean;
  hits: AiFlavorHit[];
  thresholdHits: AiFlavorThresholdHit[];
  blockingReasons: string[];
};

type AiFlavorRule = Required<Pick<AiFlavorHit, 'id' | 'label' | 'category' | 'pattern' | 'explanation' | 'replacementStrategyId'>>
  & Pick<AiFlavorHit, 'severity'>;

const AI_FLAVOR_RULES: AiFlavorRule[] = [
  {
    id: 'stock-breath-reaction',
    label: '禁用套话',
    category: 'cliche_phrase',
    pattern: /(倒吸一口凉气|倒吸一口冷气|深吸一口气|深深吸了一口气|浑身一震|浑身一颤|脊背发凉|冷汗直流)/u,
    severity: 'block',
    explanation: '用惯性身体反应替代具体动作，会让文本显得模板化。',
    replacementStrategyId: 'action-or-object-reaction',
  },
  {
    id: 'stock-face-reaction',
    label: '禁用套话',
    category: 'cliche_phrase',
    pattern: /(眼中精芒|嘴角冷笑|嘴角勾起|嘴角微微上扬|嘴角勾起一抹|瞳孔收缩|瞳孔微缩|瞳孔骤缩|眼神微变|眉头微皱)/u,
    severity: 'block',
    explanation: '高频面部微表情容易形成网文 AI 套路感。',
    replacementStrategyId: 'action-or-object-reaction',
  },
  {
    id: 'overused-simile',
    label: '高频比喻',
    category: 'overused_simile',
    pattern: /(仿佛|宛如|像[^。！？\n]{0,24}一样|空气仿佛凝固|仿佛时间凝固)/u,
    severity: 'warn',
    explanation: '泛化比喻会稀释画面感。',
    replacementStrategyId: 'physical-detail-or-delete',
  },
  {
    id: 'negative-parallelism',
    label: '否定排比',
    category: 'mechanical_transition',
    pattern: /不是[^。！？\n]{1,60}而是/u,
    severity: 'warn',
    explanation: '对称排比容易产生机械总结感。',
    replacementStrategyId: 'event-bridge',
  },
  {
    id: 'explanatory-narration',
    label: '解释性旁白',
    category: 'explanatory_narration',
    pattern: /(他知道这意味着|她知道这意味着|这意味着|这说明|这让[他她]明白|显然已经)/u,
    severity: 'warn',
    explanation: '替读者解释结论会削弱沉浸感。',
    replacementStrategyId: 'consequence-or-action',
  },
  {
    id: 'empty-fate-word',
    label: '空泛命运词',
    category: 'empty_emotion',
    pattern: /(命运|宿命|审判)/u,
    severity: 'warn',
    explanation: '抽象拔高词容易显得空泛。',
    replacementStrategyId: 'embodied-emotion',
  },
  {
    id: 'generic-intensifier',
    label: '泛化程度副词',
    category: 'generic_intensifier',
    pattern: /(非常|极其|十分|格外|异常|无比|相当|颇为|甚是)/u,
    severity: 'warn',
    explanation: '程度副词常替代具体描写。',
    replacementStrategyId: 'specific-detail',
  },
  {
    id: 'mechanical-transition',
    label: '机械转场',
    category: 'mechanical_transition',
    pattern: /(与此同时|就在这时|话音未落|说时迟那时快)/u,
    severity: 'warn',
    explanation: '旁白式转场会显得生硬。',
    replacementStrategyId: 'event-bridge',
  },
  {
    id: 'bookish-dialogue',
    label: '书面化对白',
    category: 'bookish_dialogue',
    pattern: /[“"][^”"]{0,40}(因此|然而|换言之|从某种程度上)[^”"]{0,40}[”"]/u,
    severity: 'warn',
    explanation: '角色对白过度书面，会削弱口语感。',
    replacementStrategyId: 'spoken-dialogue',
  },
  {
    id: 'english-mixing',
    label: '不当英文混入',
    category: 'english_mixing',
    pattern: /\b(probably|okay|whatever|sorry|awesome|actually|basically|literally|obviously|suddenly|nice|cool|fine|well|sure|wow)\b/iu,
    severity: 'warn',
    explanation: '中文正文中混入泛化英文口癖，容易暴露模型痕迹。',
    replacementStrategyId: 'chinese-expression',
  },
];

const CATEGORY_THRESHOLDS: Partial<Record<NonNullable<AiFlavorHit['category']>, number>> = {
  generic_intensifier: 2,
  overused_simile: 2,
};

export function lintAiFlavor(content: string): AiFlavorLintResult {
  const hits = AI_FLAVOR_RULES.flatMap((rule) => collectRuleHits(content, rule));
  const thresholdHits = collectThresholdHits(hits, content.length);
  const blockingHits = hits.filter((hit) => hit.severity === 'block');
  const warningCategoryCount = new Set(
    hits
      .filter((hit) => hit.severity !== 'block' && hit.category)
      .map((hit) => hit.category),
  ).size;
  const blockingReasons = [
    ...blockingHits.map((hit) => hit.label),
    ...thresholdHits.map((hit) => `${hit.label}过密`),
  ];

  return {
    blocked: blockingHits.length > 0 || (warningCategoryCount >= 3 && content.length < 1000) || thresholdHits.length > 0,
    hits,
    thresholdHits,
    blockingReasons,
  };
}

function collectRuleHits(content: string, rule: AiFlavorRule): AiFlavorHit[] {
  const flags = rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`;
  const pattern = new RegExp(rule.pattern.source, flags);
  const hits: AiFlavorHit[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    hits.push({
      ...rule,
      pattern: rule.pattern,
      matchedText: match[0],
      context: extractLocalContext(content, match.index),
    });

    if (match[0].length === 0) {
      pattern.lastIndex += 1;
    }
  }

  return hits;
}

function collectThresholdHits(hits: AiFlavorHit[], contentLength: number): AiFlavorThresholdHit[] {
  const categoryCounts = new Map<NonNullable<AiFlavorHit['category']>, number>();
  const categoryLabels = new Map<NonNullable<AiFlavorHit['category']>, string>();

  for (const hit of hits) {
    if (!hit.category || hit.severity === 'block') {
      continue;
    }

    categoryCounts.set(hit.category, (categoryCounts.get(hit.category) ?? 0) + 1);
    categoryLabels.set(hit.category, hit.label);
  }

  return [...categoryCounts.entries()]
    .filter(([category, count]) => {
      const threshold = CATEGORY_THRESHOLDS[category] ?? Number.POSITIVE_INFINITY;
      const denseLongTextThreshold = threshold === Number.POSITIVE_INFINITY ? threshold : Math.max(threshold * 3, 5);
      return contentLength < 1000 ? count >= threshold : count >= denseLongTextThreshold;
    })
    .map(([category, count]) => ({
      category,
      count,
      threshold: CATEGORY_THRESHOLDS[category] ?? count,
      label: categoryLabels.get(category) ?? category,
    }));
}

function extractLocalContext(content: string, index: number) {
  const paragraphs = content.split(/\n{2,}/u);
  let offset = 0;

  for (const paragraph of paragraphs) {
    const start = offset;
    const end = start + paragraph.length;
    if (index >= start && index <= end) {
      return paragraph.trim();
    }
    offset = end + 2;
  }

  return content.slice(Math.max(0, index - 40), index + 80).trim();
}
