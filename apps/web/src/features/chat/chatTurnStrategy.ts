import type { ChatMode, SessionResponse, WriteTargetHint } from '../workflow/types';

type ChatTurnStrategyInput = {
  forceDiscussion?: boolean;
  message: string;
  session: Pick<SessionResponse, 'currentModule' | 'currentStepId' | 'currentSubstepId' | 'waitingForApproval'> | null;
  writeTargetHint: WriteTargetHint;
};

export type ChatTurnStrategy = {
  hintText: string | null;
  requestMode: ChatMode;
  showsWriteTargetHint: boolean;
  treatAsApproval: boolean;
};

const APPROVAL_PATTERN = /^\s*(确认|同意|批准|写入)(?=$|[\s，。,！!])/u;

export function deriveChatTurnStrategy({ forceDiscussion = false, message, session, writeTargetHint }: ChatTurnStrategyInput): ChatTurnStrategy {
  const trimmedMessage = message.trim();

  if (forceDiscussion) {
    return {
      hintText: '当前更像讨论',
      requestMode: 'plan',
      showsWriteTargetHint: false,
      treatAsApproval: false,
    };
  }

  if (isExplicitApproval(trimmedMessage)) {
    return {
      hintText: session?.waitingForApproval || writeTargetHint.hasPendingProposal
        ? '将确认当前写入提案'
        : '本轮可能生成写入提案',
      requestMode: 'write',
      showsWriteTargetHint: true,
      treatAsApproval: true,
    };
  }

  return {
    hintText: null,
    requestMode: 'auto',
    showsWriteTargetHint: false,
    treatAsApproval: false,
  };
}

function isExplicitApproval(message: string) {
  return APPROVAL_PATTERN.test(message);
}
