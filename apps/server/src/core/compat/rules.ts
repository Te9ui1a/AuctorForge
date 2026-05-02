const exactPathAliases = new Map<string, string>([
  ['docs/MASTER.md', '.novelkit/constitution/MASTER.md'],
  ['.novelkit/constitution/MASTER.md', '.novelkit/constitution/MASTER.md'],
  ['1.3_套路方向.md', '1-边界/1.3_套路方向.md'],
  ['2.2 新书设定案.md', '2-设定/2.2_新书设定案.md'],
]);

export function normalizeProjectPath(inputPath: string): string {
  const trimmed = inputPath.trim();
  return exactPathAliases.get(trimmed) ?? trimmed;
}
