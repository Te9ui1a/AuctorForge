import { describe, expect, it } from 'vitest';
import type { FastifyReply } from 'fastify';

import { ProjectLifecycleError } from '../core/projects/projectLifecycle';
import { FolderPickerError } from '../core/system/folderPicker';
import { sendFolderPickerError, sendLifecycleError } from './apiErrors';

function createReplyRecorder() {
  const recorder = {
    statusCode: 200,
    payload: null as unknown,
    code(statusCode: number) {
      recorder.statusCode = statusCode;
      return recorder;
    },
    send(payload: unknown) {
      recorder.payload = payload;
      return recorder;
    },
  };

  return recorder as typeof recorder & FastifyReply;
}

describe('apiErrors', () => {
  it('serializes project lifecycle errors with the route status mapping', () => {
    const reply = createReplyRecorder();

    sendLifecycleError(
      reply,
      new ProjectLifecycleError('missing-path', 'Project path is missing.', {
        details: { projectId: 'proj_1', rootPath: '/missing' },
      }),
    );

    expect(reply.statusCode).toBe(409);
    expect(reply.payload).toEqual({
      error: {
        code: 'missing-path',
        message: 'Project path is missing.',
        details: { projectId: 'proj_1', rootPath: '/missing' },
      },
    });
  });

  it('serializes folder picker errors and preserves unsupported as not implemented', () => {
    const reply = createReplyRecorder();

    sendFolderPickerError(reply, new FolderPickerError('unsupported', '当前平台暂不支持原生文件夹选择器。'));

    expect(reply.statusCode).toBe(501);
    expect(reply.payload).toEqual({
      error: {
        code: 'unsupported',
        message: '当前平台暂不支持原生文件夹选择器。',
      },
    });
  });

  it('rethrows unknown errors so Fastify can handle unexpected failures', () => {
    const reply = createReplyRecorder();
    const error = new Error('boom');

    expect(() => sendLifecycleError(reply, error)).toThrow(error);
    expect(() => sendFolderPickerError(reply, error)).toThrow(error);
  });
});
