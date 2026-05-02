import { describe, expect, it } from 'vitest';

import {
  CHARACTER_MEMORY_PATH,
  CHEAT_SETTING_PATH,
  FORESHADOWING_MEMORY_PATH,
  MASTER_CONSTITUTION_PATH,
  MASTER_OUTLINE_PATH,
  MICRO_RHYTHM_PATH,
  PREVIOUS_CHAPTER_TOKEN,
  ROLE_TABLE_PATH,
  SETTING_REVIEW_REPORT_PATH,
  SETTING_SUMMARY_PATH,
  CONTROL_PANEL_PATH,
  STYLE_GUIDE_PATH,
  VOLUME_CHAPTER_OUTLINE_PATH,
  VOLUME_OUTLINE_PATH,
  chapterDraftPath,
  chapterLabel,
  chapterNumberText,
  chapterReviewPath,
  previousChapterDraftPath,
} from './projectPaths';

describe('projectPaths', () => {
  it('formats chapter numbers and chapter-scoped file paths consistently', () => {
    expect(chapterNumberText(1)).toBe('001');
    expect(chapterLabel(12)).toBe('第012章');
    expect(chapterDraftPath(3)).toBe('4-正文/第003章_草稿.md');
    expect(chapterReviewPath(3)).toBe('5-审查/第003章_审查报告.md');
    expect(previousChapterDraftPath(1)).toBeNull();
    expect(previousChapterDraftPath(3)).toBe('4-正文/第002章_草稿.md');
  });

  it('exposes canonical fixed project paths in one place', () => {
    expect(CONTROL_PANEL_PATH).toBe('PROJECT.md');
    expect(STYLE_GUIDE_PATH).toBe('1-边界/1.2_文风.md');
    expect(MICRO_RHYTHM_PATH).toBe('1-边界/1.5_微观节奏拆解.md');
    expect(SETTING_SUMMARY_PATH).toBe('2-设定/2.2_新书设定案.md');
    expect(CHEAT_SETTING_PATH).toBe('2-设定/2.3_金手指设定.md');
    expect(ROLE_TABLE_PATH).toBe('2-设定/2.4_主要角色设定表.md');
    expect(MASTER_CONSTITUTION_PATH).toBe('.novelkit/constitution/MASTER.md');
    expect(CHARACTER_MEMORY_PATH).toBe('.novelkit/memory/character_state.md');
    expect(FORESHADOWING_MEMORY_PATH).toBe('.novelkit/memory/foreshadowing.md');
    expect(MASTER_OUTLINE_PATH).toBe('3-大纲/3.1_全书结构总纲.md');
    expect(VOLUME_OUTLINE_PATH(1)).toBe('3-大纲/第01卷_完整卷纲.md');
    expect(VOLUME_CHAPTER_OUTLINE_PATH(1)).toBe('3-大纲/第01卷_章纲.md');
    expect(SETTING_REVIEW_REPORT_PATH).toBe('5-审查/设定审查报告.md');
    expect(PREVIOUS_CHAPTER_TOKEN).toBe('__PREV_CHAPTER__');
  });
});
