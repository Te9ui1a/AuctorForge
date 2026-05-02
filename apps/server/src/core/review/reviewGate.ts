export type ReviewGate = 'pass' | 'revise' | 'block';

export function extractReviewGate(reviewContent: string): ReviewGate {
  const explicitGate = reviewContent.match(/审查评级[：:]\s*(PASS|REVISE|BLOCK)/iu)?.[1]?.toLowerCase();
  if (explicitGate === 'pass' || explicitGate === 'revise' || explicitGate === 'block') {
    return explicitGate;
  }

  if (/(整章重写|不能进入下一章|阻断推进|提前结局|超出当前章纲范围)/u.test(reviewContent)) {
    return 'block';
  }

  if (/(局部改写任务|先回修|先修改|微调后再决定)/u.test(reviewContent)) {
    return 'revise';
  }

  return 'pass';
}
