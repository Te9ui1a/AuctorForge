import type { WorkflowResolvedStep } from '../workflow/contracts/types';

type DiscussionStep = Pick<WorkflowResolvedStep, 'id' | 'substepId' | 'module'>;
type StandardDiscussionMemoryModule = Extract<WorkflowResolvedStep['module'], 'define' | 'ideation' | 'outline'>;
export type DiscussionMemoryModule = StandardDiscussionMemoryModule | 'guide';
export type DiscussionNoteSnapshotEntry = {
  stepId: string;
  substepId: string;
  module: DiscussionMemoryModule;
  notes: string[];
};
type BufferedDiscussionStep = Omit<DiscussionStep, 'module'> & { module: DiscussionMemoryModule };

const DISCUSSION_MEMORY_MODULES = new Set<WorkflowResolvedStep['module']>(['define', 'ideation', 'outline']);
const GUIDE_DISCUSSION_SUBSTEP_IDS = new Set(['character-first', 'idea-first', 'draft-first']);
const DEFAULT_MAX_NOTES_PER_STEP = 8;

export function isGuideDiscussionSubstepId(substepId: string) {
  return GUIDE_DISCUSSION_SUBSTEP_IDS.has(substepId);
}

export function createDiscussionBuffer(maxNotesPerStep = DEFAULT_MAX_NOTES_PER_STEP) {
  const notesByStep = new Map<string, string[]>();
  const stepByKey = new Map<string, BufferedDiscussionStep>();

  return {
    remember(step: DiscussionStep, note: string) {
      if (!isDiscussionMemoryStep(step)) {
        return;
      }

      const normalized = normalizeNote(note);
      if (!normalized) {
        return;
      }

      const key = toStepKey(step);
      const existing = notesByStep.get(key) ?? [];

      if (existing.at(-1) === normalized) {
        return;
      }

      stepByKey.set(key, {
        id: step.id,
        substepId: step.substepId,
        module: step.module,
      });
      notesByStep.set(key, [...existing, normalized].slice(-maxNotesPerStep));
    },

    getNotes(step: DiscussionStep) {
      if (!isDiscussionMemoryStep(step)) {
        return [];
      }

      return [...(notesByStep.get(toStepKey(step)) ?? [])];
    },

    snapshot(): DiscussionNoteSnapshotEntry[] {
      return Array.from(stepByKey.entries()).flatMap(([key, step]) => {
        const notes = notesByStep.get(key) ?? [];
        if (notes.length === 0) {
          return [];
        }

        return [
          {
            stepId: step.id,
            substepId: step.substepId,
            module: step.module,
            notes: [...notes],
          },
        ];
      });
    },

    restore(snapshot: DiscussionNoteSnapshotEntry[]) {
      notesByStep.clear();
      stepByKey.clear();

      for (const entry of snapshot) {
        const step: DiscussionStep = {
          id: entry.stepId,
          substepId: entry.substepId,
          module: entry.module,
        };

        for (const note of entry.notes) {
          this.remember(step, note);
        }
      }
    },

    clear() {
      notesByStep.clear();
      stepByKey.clear();
    },
  };
}

function toStepKey(step: DiscussionStep) {
  return `${step.id}:${step.substepId}`;
}

function isStandardDiscussionMemoryModule(module: DiscussionStep['module']): module is StandardDiscussionMemoryModule {
  return DISCUSSION_MEMORY_MODULES.has(module);
}

function isGuideDiscussionStep(step: DiscussionStep): step is Omit<DiscussionStep, 'module'> & { module: 'guide' } {
  return step.module === 'guide' && isGuideDiscussionSubstepId(step.substepId);
}

function isDiscussionMemoryStep(step: DiscussionStep): step is BufferedDiscussionStep {
  return isStandardDiscussionMemoryModule(step.module) || isGuideDiscussionStep(step);
}

function normalizeNote(note: string) {
  return note.replace(/\s+/g, ' ').trim();
}
