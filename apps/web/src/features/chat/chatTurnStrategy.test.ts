import { describe, expect, it } from 'vitest';

import { deriveChatTurnStrategy } from './chatTurnStrategy';

const defaultWriteTargetHint = {
  strictWorkflowWrites: ['1-边界/预期.md'],
  chatAllowedWrites: ['1-边界/预期.md'],
  activeDocumentPath: null,
  hasPendingProposal: false,
};

describe('deriveChatTurnStrategy', () => {
  it('leaves ordinary strong write wording in auto mode for backend planning', () => {
    expect(
      deriveChatTurnStrategy({
        message: '给我一版第一章草案',
        session: {
          currentModule: 'define',
          currentStepId: 'define-direction',
          currentSubstepId: undefined,
          waitingForApproval: false,
        },
        writeTargetHint: defaultWriteTargetHint,
      }),
    ).toMatchObject({
      requestMode: 'auto',
      treatAsApproval: false,
      showsWriteTargetHint: false,
      hintText: null,
    });
  });

  it('leaves chapter review wording in auto mode for backend planning', () => {
    expect(
      deriveChatTurnStrategy({
        message: '请审查第3章草稿。',
        session: {
          currentModule: 'review',
          currentStepId: 'review-chapter',
          currentSubstepId: 'chapter-review',
          waitingForApproval: false,
        },
        writeTargetHint: {
          ...defaultWriteTargetHint,
          chatAllowedWrites: ['5-审查/第003章_审查报告.md'],
        },
      }),
    ).toMatchObject({
      requestMode: 'auto',
      treatAsApproval: false,
      showsWriteTargetHint: false,
    });
  });

  it('leaves discussion-first turns in auto mode for backend planning', () => {
    expect(
      deriveChatTurnStrategy({
        message: '先聊聊这个主角动机是不是太弱',
        session: {
          currentModule: 'define',
          currentStepId: 'define-direction',
          currentSubstepId: undefined,
          waitingForApproval: false,
        },
        writeTargetHint: defaultWriteTargetHint,
      }),
    ).toMatchObject({
      requestMode: 'auto',
      treatAsApproval: false,
      showsWriteTargetHint: false,
      hintText: null,
    });
  });

  it('does not classify negated discussion wording on the frontend', () => {
    expect(
      deriveChatTurnStrategy({
        message: '不要继续讨论，直接生成完整新书设定案草案并写入文件。',
        session: {
          currentModule: 'define',
          currentStepId: 'define-direction',
          currentSubstepId: undefined,
          waitingForApproval: false,
        },
        writeTargetHint: defaultWriteTargetHint,
      }),
    ).toMatchObject({
      requestMode: 'auto',
      treatAsApproval: false,
      showsWriteTargetHint: false,
    });
  });

  it('leaves delegated ideation requests in auto mode for backend planning', () => {
    expect(
      deriveChatTurnStrategy({
        message: '你帮我构思一个',
        session: {
          currentModule: 'define',
          currentStepId: 'define-direction',
          currentSubstepId: 'direction-define',
          waitingForApproval: false,
        },
        writeTargetHint: defaultWriteTargetHint,
      }),
    ).toMatchObject({
      requestMode: 'auto',
      treatAsApproval: false,
      showsWriteTargetHint: false,
    });
  });

  it('leaves plain chapter-writing shortcuts in auto mode for backend planning', () => {
    for (const message of ['写第29章。', '直接写第29章正文。', '写下一章']) {
      expect(
        deriveChatTurnStrategy({
          message,
          session: {
            currentModule: 'write',
            currentStepId: 'write-chapter',
            currentSubstepId: 'chapter-draft',
            waitingForApproval: false,
          },
          writeTargetHint: {
            ...defaultWriteTargetHint,
            strictWorkflowWrites: ['4-正文/第029章_草稿.md'],
            chatAllowedWrites: ['4-正文/第029章_草稿.md'],
          },
        }),
      ).toMatchObject({
        requestMode: 'auto',
        treatAsApproval: false,
        showsWriteTargetHint: false,
      });
    }
  });

  it('returns a structured approval strategy for explicit proposal approval', () => {
    expect(
      deriveChatTurnStrategy({
        message: '确认',
        session: {
          currentModule: 'define',
          currentStepId: 'define-direction',
          currentSubstepId: undefined,
          waitingForApproval: true,
        },
        writeTargetHint: {
          ...defaultWriteTargetHint,
          hasPendingProposal: true,
        },
      }),
    ).toMatchObject({
      requestMode: 'write',
      treatAsApproval: true,
      showsWriteTargetHint: true,
      hintText: '将确认当前写入提案',
    });
  });

  it('treats natural approval wording as proposal approval when a proposal is pending', () => {
    expect(
      deriveChatTurnStrategy({
        message: '满意，确认',
        session: {
          currentModule: 'define',
          currentStepId: 'define-direction',
          currentSubstepId: undefined,
          waitingForApproval: true,
        },
        writeTargetHint: {
          ...defaultWriteTargetHint,
          hasPendingProposal: true,
        },
      }),
    ).toMatchObject({
      requestMode: 'write',
      treatAsApproval: true,
      showsWriteTargetHint: true,
      hintText: '将确认当前写入提案',
    });
  });
});
