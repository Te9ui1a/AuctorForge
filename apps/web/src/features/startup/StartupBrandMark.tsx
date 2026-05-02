import { BrandMark } from '../layout/BrandMark';

type StartupBrandMarkProps = {
  compact?: boolean;
};

export function StartupBrandMark({ compact = false }: StartupBrandMarkProps) {
  return (
    <div data-startup-brand="startup">
      <BrandMark compact={compact} />
    </div>
  );
}
