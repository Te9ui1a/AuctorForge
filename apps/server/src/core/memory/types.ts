export type MemoryEvidence = {
  path: string;
  chapterNumber?: number;
  quote?: string;
};

export type ChapterMemoryEntry = {
  chapterNumber: number;
  title: string | null;
  summary: string;
  time: string | null;
  location: string | null;
  activeCharacters: string[];
  objects: Array<{ name: string; owner: string | null; state: string | null }>;
  hooksOpened: string[];
  hooksResolved: string[];
  facts: string[];
  evidence: MemoryEvidence[];
  contentHash: string;
  updatedAt: string;
};

export type EntityMemory = {
  id: string;
  kind: 'character' | 'object' | 'location' | 'organization';
  name: string;
  aliases: string[];
  status: string;
  firstSeenChapter: number | null;
  lastSeenChapter: number | null;
  evidence: MemoryEvidence[];
  updatedAt: string;
};

export type QualityMemoryEntry = {
  chapterNumber: number;
  reviewGate: 'pass' | 'revise' | 'block';
  narrativeChars: number;
  aiFlavorHits: string[];
  continuityWarnings: string[];
  evidence: MemoryEvidence[];
  updatedAt: string;
};

export type StructuredMemoryDiagnostics = {
  path: string;
  line?: number;
  message: string;
};

export type MemorySummary = {
  chapterCount: number;
  latestChapter: number | null;
  activeEntityCount: number;
  unresolvedHookCount: number;
  latestWarningCount: number;
  lastRebuildAt: string | null;
};

