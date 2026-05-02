export function replaceTopLevelSection(markdown: string, heading: string, bodyLines: string[]) {
  return replaceSection(markdown, heading, bodyLines, 'top');
}

export function replaceSubsection(markdown: string, heading: string, bodyLines: string[]) {
  return replaceSection(markdown, heading, bodyLines, 'sub');
}

function replaceSection(markdown: string, heading: string, bodyLines: string[], level: 'top' | 'sub') {
  const lines = markdown.split('\n');
  const startIndex = lines.findIndex((line) => line.trim() === heading);

  if (startIndex === -1) {
    return markdown;
  }

  let endIndex = startIndex + 1;
  while (endIndex < lines.length) {
    const trimmed = lines[endIndex].trim();
    if (level === 'top' && trimmed.startsWith('## ')) {
      break;
    }
    if (level === 'sub' && (trimmed.startsWith('## ') || trimmed.startsWith('### '))) {
      break;
    }
    endIndex += 1;
  }

  const replacement = [lines[startIndex], '', ...bodyLines, ''];
  if (level === 'top') {
    replacement.push('---', '');
  }

  return [...lines.slice(0, startIndex), ...replacement, ...lines.slice(endIndex)]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

export function upsertTrailingSection(markdown: string, heading: string, bodyLines: string[]) {
  const lines = markdown.split('\n');
  const startIndex = lines.findIndex((line) => line.trim() === heading);

  const replacement = [heading, '', ...bodyLines, ''];
  if (startIndex === -1) {
    return markdown.trimEnd() + '\n\n' + replacement.join('\n');
  }

  return [...lines.slice(0, startIndex), ...replacement].join('\n');
}
