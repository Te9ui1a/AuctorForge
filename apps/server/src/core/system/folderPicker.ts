import { promisify } from 'node:util';
import { execFile as execFileCallback } from 'node:child_process';

const execFile = promisify(execFileCallback);

export type FolderPickerOptions = {
  prompt?: string;
  defaultPath?: string;
};

export type FolderPicker = {
  pickFolder: (options?: FolderPickerOptions) => Promise<string | null>;
};

export class FolderPickerError extends Error {
  code: 'unsupported' | 'failed';

  constructor(code: 'unsupported' | 'failed', message: string) {
    super(message);
    this.code = code;
    this.name = 'FolderPickerError';
  }
}

function escapeAppleScriptString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function buildChooseFolderArgs(options?: FolderPickerOptions) {
  const prompt = escapeAppleScriptString(options?.prompt ?? '选择文件夹');
  const lines = [
    `set pickerPrompt to "${prompt}"`,
  ];

  if (options?.defaultPath) {
    const defaultPath = escapeAppleScriptString(options.defaultPath);
    lines.push(`set chosenFolder to choose folder with prompt pickerPrompt default location POSIX file "${defaultPath}"`);
  } else {
    lines.push('set chosenFolder to choose folder with prompt pickerPrompt');
  }

  lines.push('POSIX path of chosenFolder');
  return lines.flatMap((line) => ['-e', line]);
}

export function createNativeFolderPicker(platform = process.platform): FolderPicker {
  return {
    async pickFolder(options?: FolderPickerOptions) {
      if (platform !== 'darwin') {
        throw new FolderPickerError('unsupported', '当前平台暂不支持原生文件夹选择器。');
      }

      try {
        const { stdout } = await execFile('osascript', buildChooseFolderArgs(options));
        const trimmed = stdout.trim();
        return trimmed ? trimmed.replace(/\/$/, '') : null;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/user canceled|cancelled|canceled/i.test(message)) {
          return null;
        }

        throw new FolderPickerError('failed', '打开系统文件夹选择器失败。');
      }
    },
  };
}
