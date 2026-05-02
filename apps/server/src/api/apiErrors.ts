import type { FastifyReply } from 'fastify';

import { ProjectLifecycleError } from '../core/projects/projectLifecycle';
import { FolderPickerError } from '../core/system/folderPicker';

function lifecycleErrorStatusCode(code: ProjectLifecycleError['code']) {
  if (code === 'not-found') {
    return 404;
  }

  if (code === 'missing-path' || code === 'unhealthy' || code === 'manifest-conflict') {
    return 409;
  }

  return 500;
}

export function sendLifecycleError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof ProjectLifecycleError)) {
    throw error;
  }

  return reply.code(lifecycleErrorStatusCode(error.code)).send({
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
    },
  });
}

export function sendFolderPickerError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof FolderPickerError)) {
    throw error;
  }

  return reply.code(error.code === 'unsupported' ? 501 : 500).send({
    error: {
      code: error.code,
      message: error.message,
    },
  });
}
