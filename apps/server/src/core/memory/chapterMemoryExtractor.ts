import { createHash } from 'node:crypto';

import { chapterDraftPath, chapterReviewPath } from '../paths/projectPaths';
import { extractReviewGate } from '../review/reviewGate';
import type { ChapterMemoryEntry, EntityMemory, MemoryEvidence, QualityMemoryEntry } from './types';

type ChapterMemoryExtractionInput = {
  chapterNumber: number;
  draftContent: string;
  reviewContent?: string | null;
  characterStateContent?: string | null;
  foreshadowingContent?: string | null;
  chapterOutlineContent?: string | null;
  projectRoot?: string;
};

type ChapterMemoryExtractionResult = {
  chapter: ChapterMemoryEntry;
  entities: EntityMemory[];
  quality: QualityMemoryEntry | null;
};

export function extractChapterMemory(options: ChapterMemoryExtractionInput): ChapterMemoryExtractionResult {
  const titleMatch = options.draftContent.match(/^#\s*第\s*0*(\d+)\s*章\s*(.*)$/m);
  const title = titleMatch?.[2]?.trim() || null;
  const summary = extractSummary(options.draftContent);
  const activeCharacters = extractCharacters(options.draftContent, options.characterStateContent);
  const objects = extractObjects(options.draftContent);
  const hooks = extractHooks(options.foreshadowingContent ?? '');
  const facts = extractFacts(options.draftContent, options.chapterOutlineContent);
  const reviewGate = options.reviewContent ? extractReviewGate(options.reviewContent) : 'pass';
  const contentHash = createHash('sha256').update(options.draftContent).digest('hex');
  const now = new Date().toISOString();

  const chapter: ChapterMemoryEntry = {
    chapterNumber: options.chapterNumber,
    title,
    summary,
    time: extractTime(options.draftContent),
    location: extractLocation(options.draftContent),
    activeCharacters,
    objects,
    hooksOpened: hooks.opened,
    hooksResolved: hooks.resolved,
    facts,
    evidence: buildEvidence(options.chapterNumber, options.draftContent),
    contentHash,
    updatedAt: now,
  };

  const entities = buildEntities(options.chapterNumber, activeCharacters, objects, options.characterStateContent, now);

  const quality = options.reviewContent
    ? {
        chapterNumber: options.chapterNumber,
        reviewGate,
        narrativeChars: countNarrativeChars(options.draftContent),
        aiFlavorHits: extractAiFlavorHits(options.reviewContent),
        continuityWarnings: extractContinuityWarnings(options.reviewContent),
        evidence: buildEvidence(options.chapterNumber, options.reviewContent, chapterReviewPath(options.chapterNumber)),
        updatedAt: now,
      }
    : null;

  return { chapter, entities, quality };
}

function extractSummary(content: string) {
  const narrative = content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('|'))
    .join('');

  return narrative.slice(0, 420) || '暂无摘要';
}

function extractTime(content: string) {
  const match = content.match(/(?:时间|时分|时点)[：:]\s*([^\n]+)/u);
  return match?.[1]?.trim() ?? null;
}

function extractLocation(content: string) {
  const match = content.match(/(?:地点|位置|场景)[：:]\s*([^\n]+)/u);
  return match?.[1]?.trim() ?? null;
}

function extractCharacters(content: string, characterStateContent?: string | null) {
  const names = new Set<string>();
  for (const match of content.matchAll(/(?:^|[\s，。、“”])([\u4e00-\u9fa5]{2,4})(?=[\s，。、“”])/gu)) {
    if (match[1]) {
      const name = match[1].trim();
      if (isLikelyCharacterName(name)) {
        names.add(name);
      }
    }
  }

  for (const match of content.matchAll(/([\u4e00-\u9fa5]{2,4})与([\u4e00-\u9fa5]{2,4})(?:对|和|并肩|同行|交谈|碰面)/gu)) {
    for (const name of [match[1], match[2]]) {
      if (name && isLikelyCharacterName(name)) {
        names.add(name);
      }
    }
  }

  for (const match of content.matchAll(/(?:^|[，。、“”\s])([\u4e00-\u9fa5]{2,4})(?:对|把|与|和|在|去|到|看|说|问|道|笑|起身|伸手|握住|收起)/gu)) {
    const name = match[1]?.trim();
    if (name && isLikelyCharacterName(name)) {
      names.add(name);
    }
  }

  if (characterStateContent) {
    for (const match of characterStateContent.matchAll(/^\s*[-*]\s*(?:\*\*)?(.+?)(?:\*\*)?：/gmu)) {
      if (match[1]) {
        names.add(match[1].trim());
      }
    }

    for (const match of characterStateContent.matchAll(/^\s*[-*]\s*(?:\*\*)?([\u4e00-\u9fa5]{2,4})(?:\*\*)?\s*$/gmu)) {
      if (match[1]) {
        names.add(match[1].trim());
      }
    }

    for (const match of characterStateContent.matchAll(/\*\*([^*\n]+)\*\*/gmu)) {
      if (match[1]) {
        names.add(match[1].trim());
      }
    }
  }

  return [...names].slice(0, 12);
}

function isLikelyCharacterName(name: string) {
  return !/第\d+章|随后|然后|于是|接着|角色表/u.test(name);
}

function extractObjects(content: string) {
  const objects: Array<{ name: string; owner: string | null; state: string | null }> = [];
  const transfer = content.match(/把([\u4e00-\u9fa5A-Za-z0-9_《》\-]{1,20})交到([\u4e00-\u9fa5A-Za-z0-9_《》\-]+)手里/u)
    ?? content.match(/([\u4e00-\u9fa5A-Za-z0-9_《》\-]{1,20})交到([\u4e00-\u9fa5A-Za-z0-9_《》\-]+)手里/u);
  if (transfer) {
    objects.push({ name: transfer[1] ?? '未知物件', owner: transfer[2] ?? null, state: '转移中' });
  }

  return objects;
}

function extractHooks(content: string) {
  const opened: string[] = [];
  const resolved: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (/待收回|待处理|悬念|伏笔/u.test(line)) {
      opened.push(line.trim());
    }
    if (/已收回|回收|解决|揭晓/u.test(line)) {
      resolved.push(line.trim());
    }
  }

  return { opened: dedupe(opened), resolved: dedupe(resolved) };
}

function extractFacts(content: string, outlineContent?: string | null) {
  const facts = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^[-*]/.test(trimmed) || /[：:]/.test(trimmed)) {
      facts.add(trimmed.replace(/^[-*]\s*/, ''));
    }
  }

  if (outlineContent) {
    for (const line of outlineContent.split(/\r?\n/)) {
      if (/^第\d+章/u.test(line.trim())) {
        facts.add(line.trim());
      }
    }
  }

  return [...facts].slice(0, 24);
}

function buildEvidence(chapterNumber: number, content: string, path = chapterDraftPath(chapterNumber)): MemoryEvidence[] {
  const quote = content.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
  return [{ path, chapterNumber, quote: quote.slice(0, 180) }];
}

function buildEntities(
  chapterNumber: number,
  activeCharacters: string[],
  objects: Array<{ name: string; owner: string | null; state: string | null }>,
  characterStateContent: string | null | undefined,
  now: string,
) {
  const entities: EntityMemory[] = [];
  for (const name of activeCharacters) {
    entities.push({
      id: `character:${name}`,
      kind: 'character',
      name,
      aliases: [],
      status: characterStateContent?.includes(name) ? 'active' : 'mentioned',
      firstSeenChapter: chapterNumber,
      lastSeenChapter: chapterNumber,
      evidence: [{ path: chapterDraftPath(chapterNumber), chapterNumber, quote: name }],
      updatedAt: now,
    });
  }

  for (const object of objects) {
    entities.push({
      id: `object:${object.name}`,
      kind: 'object',
      name: object.name,
      aliases: [],
      status: object.state ?? 'active',
      firstSeenChapter: chapterNumber,
      lastSeenChapter: chapterNumber,
      evidence: [{ path: chapterDraftPath(chapterNumber), chapterNumber, quote: `${object.name} -> ${object.owner ?? '无主'}` }],
      updatedAt: now,
    });
  }

  return entities;
}

function extractAiFlavorHits(content: string) {
  const hits: string[] = [];
  if (/(像|仿佛).+(刀|火|雷|潮)/u.test(content)) {
    hits.push('高频比喻');
  }
  if (/命运|宿命|黑暗刚刚开始/u.test(content)) {
    hits.push('结论式抒情');
  }
  return dedupe(hits);
}

function extractContinuityWarnings(content: string) {
  const warnings: string[] = [];
  if (/提前结局|大结局|全书完/u.test(content)) {
    warnings.push('早期终局措辞');
  }
  for (const match of content.matchAll(/命中类型[：:]\s*([^\n\r]+)/gu)) {
    warnings.push(...(match[1] ?? '').split(/[、,，\s]+/u));
  }
  if (/提前消费后续章纲/u.test(content)) {
    warnings.push('提前消费后续章纲');
  }
  return warnings;
}

function countNarrativeChars(content: string) {
  return content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('|'))
    .join('')
    .replace(/\s+/g, '').length;
}

function dedupe(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
