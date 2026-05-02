export type GuideEntryMode = 'asset-import' | 'inspiration-first' | 'standard';
export type GuideInspirationBranch = 'character-first' | 'idea-first' | 'draft-first';

export function parseGuideEntryMode(message: string): GuideEntryMode | null {
  const input = message.trim();

  if (/(带资进组|存量整合|导入旧稿|整理项目)/u.test(input)) {
    return 'asset-import';
  }

  if (/(常规流程|标准模式|返回标准)/u.test(input)) {
    return 'standard';
  }

  if (/(灵感切入|非线性启动|先写|先从)/u.test(input)) {
    return 'inspiration-first';
  }

  return null;
}

export function parseGuideInspirationBranch(message: string): GuideInspirationBranch | null {
  const input = message.trim();

  if (/(人设|角色)/u.test(input)) {
    return 'character-first';
  }

  if (/(核心梗|金手指|脑洞|卖点)/u.test(input)) {
    return 'idea-first';
  }

  if (/(开头|试读|样章|直接写)/u.test(input)) {
    return 'draft-first';
  }

  return null;
}
