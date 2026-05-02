import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { CONTROL_PANEL_PATH } from './projectPaths';

export const DEFAULT_VOLUME_NUMBER = 1;

export type VolumeContext = {
  volumeNumber: number;
};

export function normalizeVolumeNumber(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : DEFAULT_VOLUME_NUMBER;
}

export function parseVolumeNumberFromText(content: string) {
  const explicit = content.match(/当前卷(?:册|号)?[：:]?\s*第?\s*0*(\d+)\s*卷/u);
  if (explicit) {
    return Number.parseInt(explicit[1] ?? '1', 10);
  }

  const status = content.match(/\*\*当前卷\*\*[：:]\s*第?\s*0*(\d+)\s*卷/u);
  if (status) {
    return Number.parseInt(status[1] ?? '1', 10);
  }

  return null;
}

export function parseVolumeNumberFromPath(relativePath: string) {
  const match = relativePath.match(/第\s*0*(\d+)\s*卷/u);
  return match ? Number.parseInt(match[1] ?? '1', 10) : null;
}

export async function resolveProjectVolumeNumber(projectRoot: string, fallback = DEFAULT_VOLUME_NUMBER) {
  const projectVolumeNumber = await readVolumeNumberFromProject(projectRoot);
  if (projectVolumeNumber !== null) {
    return projectVolumeNumber;
  }

  const outlineVolumeNumber = await readLatestVolumeNumberFromOutlines(projectRoot);
  return outlineVolumeNumber ?? normalizeVolumeNumber(fallback);
}

async function readVolumeNumberFromProject(projectRoot: string) {
  try {
    const content = await readFile(path.join(projectRoot, CONTROL_PANEL_PATH), 'utf8');
    return parseVolumeNumberFromText(content);
  } catch {
    return null;
  }
}

async function readLatestVolumeNumberFromOutlines(projectRoot: string) {
  try {
    const entries = await readdir(path.join(projectRoot, '3-大纲'), { withFileTypes: true });
    const volumeNumbers = entries
      .filter((entry) => entry.isFile())
      .map((entry) => parseVolumeNumberFromPath(entry.name))
      .filter((volumeNumber): volumeNumber is number => volumeNumber !== null);

    if (volumeNumbers.length === 0) {
      return null;
    }

    return Math.max(...volumeNumbers);
  } catch {
    return null;
  }
}
