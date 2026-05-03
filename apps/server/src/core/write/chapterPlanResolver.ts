import { normalizeProjectPath } from '../compat/rules';
import { MASTER_OUTLINE_PATH, VOLUME_CHAPTER_OUTLINE_PATH } from '../paths/projectPaths';
import { DEFAULT_VOLUME_NUMBER } from '../paths/volumeContext';

export type ChapterPlan = {
  number: number;
  title: string;
  summary: string;
  scenes: string[];
  hook: string;
  signals?: string[];
};

export type ChapterPlanResolution =
  | {
      ok: true;
      sourcePath: string;
      chapter: ChapterPlan;
      chapters: ChapterPlan[];
    }
  | {
      ok: false;
      reason: 'missing' | 'unparsable';
      message: string;
    };

export function resolveChapterPlanFromProjectFiles(
  projectFiles: Array<{ path: string; content: string | null }>,
  chapterNumber: number,
  volumeNumber = DEFAULT_VOLUME_NUMBER,
): ChapterPlanResolution {
  const candidates = [
    VOLUME_CHAPTER_OUTLINE_PATH(volumeNumber),
    MASTER_OUTLINE_PATH,
  ];

  let sawPlanFile = false;

  for (const sourcePath of candidates) {
    const content = projectFiles.find((file) => normalizeProjectPath(file.path) === sourcePath)?.content;
    if (!content?.trim()) {
      continue;
    }

    sawPlanFile = true;
    const parsed = parseChapterPlans(content);
    if (parsed.length === 0) {
      continue;
    }

    const chapter = parsed.find((item) => item.number === chapterNumber);
    if (chapter) {
      return {
        ok: true,
        sourcePath,
        chapter,
        chapters: parsed,
      };
    }
  }

  return sawPlanFile
    ? {
        ok: false,
        reason: 'unparsable',
        message: `未能从章纲或全书大纲解析到第${chapterNumber}章计划。`,
      }
    : {
        ok: false,
        reason: 'missing',
        message: `缺少章纲或全书大纲，无法校验第${chapterNumber}章草稿。`,
      };
}

export function parseChapterPlans(content: string): ChapterPlan[] {
  const headingMatches = [...content.matchAll(CHAPTER_HEADING_PATTERN)];
  const plans: ChapterPlan[] = [];

  for (let index = 0; index < headingMatches.length; index += 1) {
    const match = headingMatches[index];
    const nextMatch = headingMatches[index + 1];
    if (match.index === undefined) {
      continue;
    }

    const number = Number.parseInt(match[1] ?? '0', 10);
    const title = normalizeTitle(match[2] ?? '');
    const blockStart = match.index + match[0].length;
    const blockEnd = nextMatch?.index ?? content.length;
    const block = content.slice(blockStart, blockEnd);

    if (!Number.isFinite(number) || number <= 0) {
      continue;
    }

    plans.push({
      number,
      title,
      summary: extractChapterSummary(block),
      scenes: extractChapterScenes(block),
      hook: extractChapterHook(block),
      signals: extractChapterSignals(block),
    });
  }

  return dedupeChapterPlans(plans);
}

export function parseChapterNumberFromDraftPath(path: string) {
  const match = normalizeProjectPath(path).match(/^4-正文\/第0*(\d+)章_草稿\.md$/u);
  if (!match) {
    return null;
  }

  const chapterNumber = Number.parseInt(match[1] ?? '0', 10);
  return Number.isFinite(chapterNumber) && chapterNumber > 0 ? chapterNumber : null;
}

const CHAPTER_HEADING_PATTERN =
  /(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?第\s*0*(\d+)\s*章(?:[：:\s]+([^*\n\r]+?))?(?:\*\*)?\s*(?=\n|$)/gu;

function extractChapterSummary(block: string) {
  const labeled = block.match(/(?:\*\*)?(?:章节梗概|本章梗概|剧情梗概|摘要|开端|冲突|转折)(?:\*\*)?[：:]\s*([^\n\r]+)/u)?.[1];
  if (labeled?.trim()) {
    return cleanPlanText(labeled);
  }

  const firstBullet = block.match(/^\s*[-*]\s*(?:\*\*)?[^：:\n]{1,12}(?:\*\*)?[：:]\s*([^\n\r]+)/mu)?.[1];
  if (firstBullet?.trim()) {
    return cleanPlanText(firstBullet);
  }

  const firstLine = block
    .split(/\n+/)
    .map((line) => cleanPlanText(line))
    .find((line) => line.length > 0 && !line.startsWith('|'));

  return firstLine ?? '围绕既定章纲推进本章主事件。';
}

function extractChapterScenes(block: string) {
  const scenes = [...block.matchAll(/^\s*[-*]\s*(场景\s*\d+[：:][^\n\r]+)/gmu)]
    .map((match) => cleanPlanText(match[1] ?? ''))
    .filter((scene) => scene.length > 0);

  if (scenes.length > 0) {
    return scenes;
  }

  const structuralBeats = [...block.matchAll(/^\s*[-*]\s*(?:\*\*)?(开端|冲突|转折|高潮|收束|章末钩子|结尾钩子)(?:\*\*)?[：:]\s*([^\n\r]+)/gmu)]
    .map((match, index) => `场景${index + 1}：${match[1]}：${cleanPlanText(match[2] ?? '')}`)
    .filter((scene) => scene.length > 0);

  if (structuralBeats.length > 0) {
    return structuralBeats;
  }

  return ['场景1：承接上一章局势', '场景2：推进本章冲突', '场景3：以新钩子收束'];
}

function extractChapterHook(block: string) {
  const hook = block.match(/(?:\*\*)?(?:章末钩子|结尾钩子|悬念|钩子)(?:\*\*)?[：:]\s*([^\n\r]+)/u)?.[1];
  if (hook?.trim()) {
    return cleanPlanText(hook);
  }

  const lastScene = extractChapterScenes(block).at(-1);
  return lastScene ? cleanPlanText(lastScene) : '更大的风险已经逼近。';
}

function extractChapterSignals(block: string) {
  return [...block.matchAll(/^\s*[-*]\s*(?:\*\*)?([^\n：:]{1,12}信号|关键资源|资源变化|后续揭示|关键揭示)(?:\*\*)?[：:]\s*([^\n\r]+)/gmu)]
    .map((match) => `${cleanPlanText(match[1] ?? '')}：${cleanPlanText(match[2] ?? '')}`)
    .filter((line) => line.length > 0);
}

function normalizeTitle(title: string) {
  return title
    .replace(/\s*\*\*\s*$/u, '')
    .replace(/\s+#*$/u, '')
    .trim();
}

function cleanPlanText(text: string) {
  return text
    .replace(/^\s*[-*]\s*/u, '')
    .replace(/\*\*/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function dedupeChapterPlans(plans: ChapterPlan[]) {
  const seen = new Set<number>();
  const deduped: ChapterPlan[] = [];

  for (const plan of plans) {
    if (seen.has(plan.number)) {
      continue;
    }

    seen.add(plan.number);
    deduped.push(plan);
  }

  return deduped;
}
