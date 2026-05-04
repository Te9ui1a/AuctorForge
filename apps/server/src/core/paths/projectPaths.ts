export const CONTROL_PANEL_PATH = 'PROJECT.md';

export const STYLE_GUIDE_PATH = '1-边界/1.2_文风.md';
export const MICRO_RHYTHM_PATH = '1-边界/1.5_微观节奏拆解.md';

export const SETTING_SUMMARY_PATH = '2-设定/2.2_新书设定案.md';
export const CHEAT_SETTING_PATH = '2-设定/2.3_金手指设定.md';
export const ROLE_TABLE_PATH = '2-设定/2.4_主要角色设定表.md';

export const MASTER_CONSTITUTION_PATH = '.novelkit/constitution/MASTER.md';
export const CHARACTER_MEMORY_PATH = '.novelkit/memory/character_state.md';
export const FORESHADOWING_MEMORY_PATH = '.novelkit/memory/foreshadowing.md';
export const ANALYZE_SELECTION_PATH = '.novelkit/memory/analyze_selection.json';

export const MASTER_OUTLINE_PATH = '3-大纲/3.1_全书结构总纲.md';
export const PREVIOUS_CHAPTER_TOKEN = '__PREV_CHAPTER__';

export const SETTING_REVIEW_REPORT_PATH = '5-审查/设定审查报告.md';
export const OUTLINE_REVIEW_REPORT_PATH = '5-审查/大纲审查报告.md';

export function chapterNumberText(chapterNumber: number) {
  return String(chapterNumber).padStart(3, '0');
}

export function chapterLabel(chapterNumber: number) {
  return `第${chapterNumberText(chapterNumber)}章`;
}

export function chapterDraftPath(chapterNumber: number) {
  return `4-正文/${chapterLabel(chapterNumber)}_草稿.md`;
}

export function chapterFinalPath(chapterNumber: number) {
  return `4-正文/${chapterLabel(chapterNumber)}_定稿.md`;
}

export function chapterReviewPath(chapterNumber: number) {
  return `5-审查/${chapterLabel(chapterNumber)}_审查报告.md`;
}

export function previousChapterDraftPath(chapterNumber: number) {
  if (chapterNumber <= 1) {
    return null;
  }

  return chapterDraftPath(chapterNumber - 1);
}

export function volumeNumberText(volumeNumber: number) {
  return String(volumeNumber).padStart(2, '0');
}

export function volumeLabel(volumeNumber: number) {
  return `第${volumeNumberText(volumeNumber)}卷`;
}

export function VOLUME_OUTLINE_PATH(volumeNumber: number) {
  return `3-大纲/${volumeLabel(volumeNumber)}_完整卷纲.md`;
}

export function VOLUME_CHAPTER_OUTLINE_PATH(volumeNumber: number) {
  return `3-大纲/${volumeLabel(volumeNumber)}_章纲.md`;
}
