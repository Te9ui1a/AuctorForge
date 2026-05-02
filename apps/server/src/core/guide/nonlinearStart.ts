import type { ProposedWrite } from '../chat/generateAssistantReply';
import type { WorkflowTransitionTarget } from '../workflow/contracts/types';

type NonlinearGuideProposal = {
  reply: string;
  proposedWrites: ProposedWrite[];
  nextTarget: WorkflowTransitionTarget;
};

export function buildCharacterFirstProposal(projectContent: string): NonlinearGuideProposal {
  return {
    reply: '已按“先写人设”准备角色设定表提案。确认后我会回流到设定阶段，继续补世界观和核心梗。',
    proposedWrites: [
      {
        path: '2-设定/2.4_主要角色设定表.md',
        content: [
          '# 主要角色设定表',
          '',
          '## 主角',
          '- 身份：待用户继续补充',
          '- 核心驱动力：待用户继续补充',
          '',
          '## 核心反派',
          '- 与主角的冲突：待用户继续补充',
          '',
          '## 重要配角',
          '- 功能定位：待用户继续补充',
        ].join('\n'),
      },
      {
        path: 'PROJECT.md',
        content: replaceSubsection(projectContent, '### 8.1 当前重点与后续步骤', [
          '- **阶段**：灵感切入 / 人设优先',
          '- **核心任务**：先立角色，再回流补设定',
          '- **待办事项**：',
          '  - [x] 角色设定表初稿',
          '  - [ ] 回流补世界观或核心梗',
        ]),
      },
    ],
    nextTarget: { stepId: 'ideation-build', substepId: 'setting-draft', mode: 'standard' },
  };
}

export function buildIdeaFirstProposal(projectContent: string, userMessage: string): NonlinearGuideProposal {
  const isCheatFirst = /金手指/u.test(userMessage);

  return {
    reply: isCheatFirst
      ? '已按“先写金手指”准备提案。确认后我会回流到设定阶段，继续补设定案和角色。'
      : '已按“先写核心梗”准备脑暴提案。确认后我会回流到设定阶段继续扩展。',
    proposedWrites: [
      {
        path: isCheatFirst ? '2-设定/2.3_金手指设定.md' : '2-设定/2.1_创意脑暴.md',
        content: isCheatFirst
          ? ['# 金手指设定', '', '## 核心概念', userMessage, '', '## 功能模块', '待后续补充'].join('\n')
          : ['# 创意脑暴', '', '## 核心梗', userMessage, '', '## 预期爽点', '待后续补充'].join('\n'),
      },
      {
        path: 'PROJECT.md',
        content: replaceSubsection(projectContent, '### 8.1 当前重点与后续步骤', [
          '- **阶段**：灵感切入 / 核心梗优先',
          '- **核心任务**：锁定核心卖点后回流补全设定',
          '- **待办事项**：',
          `  - [x] ${isCheatFirst ? '金手指' : '核心梗'}初稿`,
          '  - [ ] 回流补全角色与世界观',
        ]),
      },
    ],
    nextTarget: { stepId: 'ideation-build', substepId: 'setting-draft', mode: 'standard' },
  };
}

export function buildDraftFirstProposal(projectContent: string, userMessage: string): NonlinearGuideProposal {
  return {
    reply: '已按“先写试读样章”准备样章提案。确认后我会引导你回到大纲阶段，把样章反推成可持续的长篇结构。',
    proposedWrites: [
      {
        path: '4-正文/试读样章.md',
        content: ['# 试读样章', '', userMessage, '', '这一版只用于捕捉灵感，后续需回补正式大纲和设定。'].join('\n'),
      },
      {
        path: 'PROJECT.md',
        content: replaceSubsection(projectContent, '### 8.1 当前重点与后续步骤', [
          '- **阶段**：灵感切入 / 试读样章',
          '- **核心任务**：把试读样章回流成标准大纲',
          '- **待办事项**：',
          '  - [x] 试读样章',
          '  - [ ] 全书总纲',
        ]),
      },
    ],
    nextTarget: { stepId: 'outline-plan', substepId: 'master-outline', mode: 'standard' },
  };
}

function replaceSubsection(markdown: string, heading: string, bodyLines: string[]) {
  const lines = markdown.split('\n');
  const startIndex = lines.findIndex((line) => line.trim() === heading);

  if (startIndex === -1) {
    return markdown;
  }

  let endIndex = startIndex + 1;
  while (endIndex < lines.length) {
    const trimmed = lines[endIndex].trim();
    if (trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
      break;
    }
    endIndex += 1;
  }

  return [...lines.slice(0, startIndex), lines[startIndex], '', ...bodyLines, '', ...lines.slice(endIndex)]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}
