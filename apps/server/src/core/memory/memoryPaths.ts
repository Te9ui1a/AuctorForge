export const STRUCTURED_MEMORY_DIR = '.novelkit/memory/structured';
export const STRUCTURED_CHAPTERS_PATH = `${STRUCTURED_MEMORY_DIR}/chapters.jsonl`;
export const STRUCTURED_ENTITIES_PATH = `${STRUCTURED_MEMORY_DIR}/entities.json`;
export const STRUCTURED_QUALITY_PATH = `${STRUCTURED_MEMORY_DIR}/quality.jsonl`;
export const STRUCTURED_SUMMARY_PATH = `${STRUCTURED_MEMORY_DIR}/summary.json`;

export function structuredChapterMemoryPath() {
  return STRUCTURED_CHAPTERS_PATH;
}

export function structuredEntityMemoryPath() {
  return STRUCTURED_ENTITIES_PATH;
}

export function structuredQualityMemoryPath() {
  return STRUCTURED_QUALITY_PATH;
}

export function structuredMemorySummaryPath() {
  return STRUCTURED_SUMMARY_PATH;
}

