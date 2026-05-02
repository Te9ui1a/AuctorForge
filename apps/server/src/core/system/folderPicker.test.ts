import { describe, expect, it } from 'vitest';

import { buildChooseFolderArgs } from './folderPicker';

describe('folderPicker', () => {
  it('builds osascript arguments with -e for each AppleScript line', () => {
    expect(buildChooseFolderArgs({ prompt: '选择项目文件夹' })).toEqual([
      '-e',
      'set pickerPrompt to "选择项目文件夹"',
      '-e',
      'set chosenFolder to choose folder with prompt pickerPrompt',
      '-e',
      'POSIX path of chosenFolder',
    ]);
  });

  it('includes default location when provided', () => {
    expect(buildChooseFolderArgs({ prompt: '选择项目文件夹', defaultPath: '/tmp/demo' })).toEqual([
      '-e',
      'set pickerPrompt to "选择项目文件夹"',
      '-e',
      'set chosenFolder to choose folder with prompt pickerPrompt default location POSIX file "/tmp/demo"',
      '-e',
      'POSIX path of chosenFolder',
    ]);
  });
});
