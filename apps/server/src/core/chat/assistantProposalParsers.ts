import type { BuiltPrompt } from './buildPrompt';
import type { AssistantProposal, ProposedWrite } from './assistantProposalTypes';

export function tryParseAssistantProposal(content: string): AssistantProposal | null {
  for (const candidate of extractProposalCandidates(content)) {
    const parsed = tryParseProposalCandidate(candidate);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function extractProposalCandidates(content: string) {
  const trimmed = content.trim();
  const candidates = new Set<string>();

  if (trimmed.length > 0) {
    candidates.add(trimmed);
    candidates.add(stripOuterFence(trimmed));
  }

  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const fenced = match[1]?.trim();
    if (fenced) {
      candidates.add(fenced);
    }
  }

  const firstBraceIndex = trimmed.indexOf('{');
  const lastBraceIndex = trimmed.lastIndexOf('}');
  if (firstBraceIndex !== -1 && lastBraceIndex > firstBraceIndex) {
    candidates.add(trimmed.slice(firstBraceIndex, lastBraceIndex + 1).trim());
  }

  return [...candidates].filter((candidate) => candidate.length > 0);
}

function stripOuterFence(content: string) {
  return content.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
}

function tryParseProposalCandidate(candidate: string): AssistantProposal | null {
  try {
    const parsed = JSON.parse(candidate) as Partial<AssistantProposal>;
    if (typeof parsed.reply !== 'string' || !Array.isArray(parsed.proposedWrites)) {
      return null;
    }

    return {
      reply: parsed.reply,
      proposedWrites: parsed.proposedWrites
        .filter(
          (item): item is ProposedWrite =>
            typeof item?.path === 'string' && item.path.trim().length > 0 && typeof item.content === 'string',
        )
        .map((item) => ({ path: item.path, content: item.content })),
    };
  } catch {
    return null;
  }
}

export function extractProjectPremise(projectFiles: BuiltPrompt['projectFiles']) {
  for (const projectFile of projectFiles) {
    if (!projectFile.content) {
      continue;
    }

    const corePremiseMatch = projectFile.content.match(/## 1\. 核心梗 \(Core Premise\)\n([^\n]+)/);
    if (corePremiseMatch) {
      return corePremiseMatch[1].trim();
    }

    const directionMatch = projectFile.content.match(/核心方向：([^\n]+)/);
    if (directionMatch) {
      return directionMatch[1].trim();
    }
  }

  return null;
}

export function extractDiscussionPremise(userPrompt: string) {
  if (!userPrompt.includes('### 最近讨论记录')) {
    return null;
  }

  const notes = Array.from(userPrompt.matchAll(/\n\d+\.\s+([^\n]+)/g), (match) => match[1]?.trim()).filter(Boolean);
  return notes.at(-1) ?? null;
}

export function extractDirectedIdeaFromMessage(userPrompt: string) {
  const currentMessage = userPrompt.split('\n\n### 最近讨论记录')[0]?.replace(/^用户消息：/, '').trim();
  if (!currentMessage) {
    return null;
  }

  const separatedDetail = currentMessage.match(
    /^(?:重新生成(?:一版)?|重生成(?:一版)?|重来一版|再来一版|重新起草|重新产出|重新输出|重做一版|生成(?:一版)?|给我一版|给我一份|输出(?:一版)?|起草(?:一版)?)[，,:：]\s*(.+)$/u,
  );

  return separatedDetail?.[1]?.trim() || null;
}
