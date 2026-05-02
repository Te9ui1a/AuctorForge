export type WorkflowDoc = {
  entryPath: string;
  content: string;
};

type ExtractTemplateSectionsOptions = {
  module: string;
  targetPath: string;
  workflowDocs: WorkflowDoc[];
};

export function extractTemplateSections({
  module,
  targetPath,
  workflowDocs,
}: ExtractTemplateSectionsOptions) {
  const content = workflowDocs.map((doc) => doc.content).join('\n\n');

  if (module === 'ideation') {
    if (targetPath === '2-设定/2.2_新书设定案.md') {
      return extractBoldLabels(
        sliceBetween(content, '展示草拟内容，并按以下顺序逐一与用户确认或修改：', '### 输出'),
      );
    }

    if (targetPath === '2-设定/2.3_金手指设定.md') {
      return extractMarkdownHeadings(
        sliceBetween(content, '## ⚡ 步骤 3: 金手指深度设计', '### 输出'),
      );
    }

    if (targetPath === '2-设定/2.4_主要角色设定表.md') {
      return extractMarkdownHeadings(
        sliceBetween(content, '## 👥 步骤 4: 角色人设细化', '### 输出'),
      );
    }
  }

  if (module === 'outline') {
    if (targetPath === '3-大纲/3.1_全书结构总纲.md') {
      return extractNumberedBoldLabels(
        sliceBetween(
          sliceBetween(content, '## 📚 步骤 1: 全书总纲规划 (Master Outline)', '## 📖 步骤 2: 单卷完整卷纲规划 (Volume Outline)'),
          '#### 输出格式要求',
          '> **CRITICAL**',
        ),
      );
    }

    if (targetPath.endsWith('_完整卷纲.md')) {
      return extractRoundTitles(
        sliceBetween(
          sliceBetween(content, '## 📖 步骤 2: 单卷完整卷纲规划 (Volume Outline)', '## 🔨 步骤 3: 标准化章纲细化 (Chapter Specify)'),
          '### 动作流程',
          '**用户确认（最终产出）**',
        ),
      );
    }

    if (targetPath.endsWith('_章纲.md')) {
      const chapterBlock = sliceBetween(
        content,
        '## 🔨 步骤 3: 标准化章纲细化 (Chapter Specify)',
        '## 📌 步骤 4：书名与简介生成',
      );

      return extractBoldLabels(sliceBetween(chapterBlock, '```markdown', '```'));
    }
  }

  if (module === 'write' && targetPath.startsWith('4-正文/')) {
    const preCheckSection = sliceBetween(
      content,
      '### 步骤 1：写作前置检查 (Pre-Writing Check)',
      '### 步骤 2：正文撰写与AI辅助 (Writing with AI)',
    );
    const postCheckSection = sliceBetween(
      sliceBetween(content, '### 步骤 3：完稿后校准 (Post-Writing Calibration)', '### 步骤 4：伏笔、状态与进度更新 (Foreshadowing, State & Progress Update)'),
      '1.  **严格审查（五项检查）**：',
      '2.  **显式输出【完稿自检卡】**',
    );

    return [...extractNumberedBoldLabels(preCheckSection), ...extractBulletBoldLabels(postCheckSection)];
  }

  if (module === 'review' && targetPath.startsWith('5-审查/')) {
    if (targetPath === '5-审查/设定审查报告.md') {
      return extractNumberedBoldLabels(
        sliceBetween(
          content,
          '## 🛠️ 模块 1: 设定质检 (Setting Review)',
          '## 📋 模块 2: 大纲质检 (Outline Review)',
        ),
      );
    }

    if (targetPath === '5-审查/大纲审查报告.md') {
      return extractNumberedBoldLabels(
        sliceBetween(
          content,
          '## 📋 模块 2: 大纲质检 (Outline Review)',
          '## ✍️ 模块 3: 正文质检 (Draft Review)',
        ),
      );
    }

    return extractNumberedBoldLabels(
      sliceBetween(
        content,
        '## ✍️ 模块 3: 正文质检 (Draft Review)',
        '## 🔄 模块 4: 设定回溯 (Feedback Loop)',
      ),
    );
  }

  return [];
}

function sliceBetween(content: string, startMarker: string, endMarker: string) {
  const startIndex = content.indexOf(startMarker);
  if (startIndex === -1) {
    return '';
  }

  const sliced = content.slice(startIndex + startMarker.length);
  const endIndex = sliced.indexOf(endMarker);
  if (endIndex === -1) {
    return sliced;
  }

  return sliced.slice(0, endIndex);
}

function extractBoldLabels(content: string) {
  return [...content.matchAll(/\*\*([^*]+)\*\*/g)].map((match) => match[1].trim());
}

function extractMarkdownHeadings(content: string) {
  return [...content.matchAll(/^####\s+(.+)$/gm)].map((match) => match[1].trim());
}

function extractNumberedBoldLabels(content: string) {
  return [...content.matchAll(/\d+\.\s+\*\*([^*]+)\*\*/g)].map((match) => match[1].trim());
}

function extractRoundTitles(content: string) {
  return [...content.matchAll(/####\s+第\d+轮：(.+)$/gm)]
    .map((match) => match[1].trim())
    .slice(0, 4);
}

function extractBulletBoldLabels(content: string) {
  return [...content.matchAll(/\*\s+\*\*([^*]+)\*\*[:：]/g)].map((match) => match[1].trim());
}
