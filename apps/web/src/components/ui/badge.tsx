import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/utils';

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;
type BadgeEmphasis = 'dominant' | 'supporting';

const badgeEmphasisByVariant: Record<BadgeVariant, BadgeEmphasis> = {
  default: 'dominant',
  secondary: 'supporting',
  outline: 'supporting',
  muted: 'supporting',
};

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] transition-colors',
  {
    variants: {
      variant: {
        default:
          'border-[var(--ui-badge-dominant-border)] bg-[var(--ui-badge-dominant-surface)] text-[var(--ui-badge-dominant-foreground)]',
        secondary:
          'border-[var(--ui-badge-supporting-border)] bg-[var(--ui-badge-supporting-surface)] text-[var(--ui-badge-supporting-foreground)]',
        outline:
          'border-[var(--ui-badge-outline-border)] bg-transparent text-[var(--ui-badge-outline-foreground)]',
        muted:
          'border-[var(--ui-badge-muted-border)] bg-[var(--ui-badge-muted-surface)] text-[var(--ui-badge-muted-foreground)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

type BadgeProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>;

function Badge({ className, variant, ...props }: BadgeProps) {
  const resolvedVariant: BadgeVariant = variant ?? 'default';

  return (
    <div
      {...props}
      className={cn(badgeVariants({ variant }), className)}
      data-ui-emphasis={badgeEmphasisByVariant[resolvedVariant]}
    />
  );
}

export { Badge, badgeVariants };
