export type ProposedWrite = {
  path: string;
  content: string;
};

export type AssistantProposal = {
  reply: string;
  proposedWrites: ProposedWrite[];
};
