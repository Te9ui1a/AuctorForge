import type { ChapterPlan } from './chapterPlanResolver';

export type ChapterContinuityFindingKind =
  | 'missing-current-beat'
  | 'future-beat-leak'
  | 'previous-state-conflict'
  | 'unauthorized-resource-escalation';

export type ChapterContinuityFinding = {
  kind: ChapterContinuityFindingKind;
  severity: 'warn' | 'revise';
  chapterNumber?: number;
  evidence: string;
  message: string;
};

export type ChapterContinuityAssessment = {
  verdict: 'pass' | 'warn' | 'revise';
  findings: ChapterContinuityFinding[];
};

type AssessChapterContinuityOptions = {
  currentChapterNumber: number;
  draftContent: string;
  previousChapterSummary?: string;
  currentPlan: ChapterPlan;
  futurePlans: ChapterPlan[];
};

type PlanSignal = {
  term: string;
  category: 'continuity' | 'resource';
};

const SIGNAL_LABELS = [
  '连续性信号',
  '关键信号',
  '当前信号',
  '后续揭示',
  '关键揭示',
  '伏笔信号',
  '线索信号',
  '状态信号',
  '人物信号',
  '地点信号',
  '道具信号',
  '物件信号',
  '资源信号',
  '关键资源',
  '资源变化',
] as const;

const RESOURCE_SIGNAL_LABELS = new Set(['资源信号', '关键资源', '资源变化']);
const SIGNAL_LABEL_PATTERN = new RegExp(
  `(?:^|[\\n。；;])\\s*(?:[-*]\\s*)?(?:\\*\\*)?(${SIGNAL_LABELS.join('|')})(?:\\*\\*)?\\s*[：:]\\s*([^\\n]+)`,
  'gu',
);

export function assessChapterContinuity({
  draftContent,
  previousChapterSummary = '',
  currentPlan,
  futurePlans,
}: AssessChapterContinuityOptions): ChapterContinuityAssessment {
  const findings: ChapterContinuityFinding[] = [];
  const normalizedDraft = normalizeText(draftContent);
  const allowedContext = normalizeText([
    previousChapterSummary,
    planToText(currentPlan),
  ].join(' '));

  for (const futurePlan of futurePlans) {
    const futureSignals = extractPlanSignals(futurePlan);
    const leakedSignals = futureSignals
      .map((signal) => signal.term)
      .filter((term) => normalizedDraft.includes(term) && !allowedContext.includes(term));
    const leakedResourceSignals = futureSignals
      .filter((signal) => signal.category === 'resource')
      .map((signal) => signal.term)
      .filter((term) => normalizedDraft.includes(term) && !allowedContext.includes(term));

    if (leakedResourceSignals.length > 0) {
      findings.push({
        kind: 'unauthorized-resource-escalation',
        severity: 'revise',
        chapterNumber: futurePlan.number,
        evidence: leakedResourceSignals.slice(0, 4).join('、'),
        message: `当前章提前获得后续章纲标记的资源信号：${leakedResourceSignals.slice(0, 4).join('、')}。`,
      });
    }

    if (leakedSignals.length >= 2) {
      findings.push({
        kind: 'future-beat-leak',
        severity: 'revise',
        chapterNumber: futurePlan.number,
        evidence: leakedSignals.slice(0, 4).join('、'),
        message: `当前章提前消费后续章纲：命中第${String(futurePlan.number).padStart(3, '0')}章信号 ${leakedSignals.slice(0, 4).join('、')}。`,
      });
    }
  }

  const requiredCurrentSignals = extractPlanSignals(currentPlan).map((signal) => signal.term);
  const missingSignals = requiredCurrentSignals.filter((term) => !normalizedDraft.includes(term));
  if (missingSignals.length > 0) {
    findings.push({
      kind: 'missing-current-beat',
      severity: missingSignals.length >= 2 ? 'revise' : 'warn',
      evidence: missingSignals.slice(0, 4).join('、'),
      message: `当前章可能遗漏章纲关键节点：${missingSignals.slice(0, 4).join('、')}。`,
    });
  }

  const verdict = findings.some((finding) => finding.severity === 'revise')
    ? 'revise'
    : findings.length > 0
      ? 'warn'
      : 'pass';

  return { verdict, findings };
}

export function formatChapterContinuityFindings(findings: ChapterContinuityFinding[]) {
  return findings.map((finding) => finding.message).join('；');
}

function extractPlanSignals(plan: ChapterPlan) {
  return uniqueSignals([
    ...extractLabeledSignals(planToText(plan)),
    ...extractMarkedSignals(planToText(plan)),
  ]);
}

function extractLabeledSignals(text: string): PlanSignal[] {
  const signals: PlanSignal[] = [];

  for (const match of text.matchAll(SIGNAL_LABEL_PATTERN)) {
    const label = match[1] ?? '';
    const value = match[2] ?? '';
    const category = RESOURCE_SIGNAL_LABELS.has(label) ? 'resource' : 'continuity';

    for (const term of splitSignalList(value)) {
      signals.push({ term, category });
    }
  }

  return signals;
}

function extractMarkedSignals(text: string): PlanSignal[] {
  return [...text.matchAll(/[【“"]([^】”"\n]{2,30})[】”"]/gu)]
    .map((match) => normalizeSignalTerm(match[1] ?? ''))
    .filter(isUsefulSignalTerm)
    .map((term) => ({ term, category: 'continuity' as const }));
}

function splitSignalList(value: string) {
  return value
    .replace(/\*\*/gu, '')
    .replace(/[。！？!?].*$/u, '')
    .split(/(?:、|,|，|;|；|\/|\||\s+|和|及|与)+/u)
    .map(normalizeSignalTerm)
    .filter(isUsefulSignalTerm);
}

function planToText(plan: ChapterPlan) {
  return [
    plan.title,
    plan.summary,
    ...(plan.signals ?? []),
    ...plan.scenes,
    plan.hook,
  ].join('\n');
}

function normalizeSignalTerm(term: string) {
  return normalizeText(
    term
      .replace(/^[：:\-—\s]+/u, '')
      .replace(/[：:\-—\s]+$/u, ''),
  );
}

function normalizeText(text: string) {
  return text.replace(/\s+/gu, '');
}

function isUsefulSignalTerm(term: string) {
  return term.length >= 2 && term.length <= 30;
}

function uniqueSignals(signals: PlanSignal[]) {
  const seen = new Set<string>();
  const unique: PlanSignal[] = [];

  for (const signal of signals) {
    if (seen.has(signal.term)) {
      continue;
    }

    seen.add(signal.term);
    unique.push(signal);
  }

  return unique;
}
