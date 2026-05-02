type WriteTargetSelectionOptions = {
  proposalTarget?: string;
  strictTargets: string[];
  flexibleTargets: string[];
};

export function selectNextWriteTarget({ proposalTarget, strictTargets, flexibleTargets }: WriteTargetSelectionOptions) {
  return proposalTarget || strictTargets[0] || flexibleTargets[0] || '';
}

export function formatWriteTargetLabel(path: string) {
  return path.split('/').at(-1) ?? path;
}
