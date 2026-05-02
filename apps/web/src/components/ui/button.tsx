import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/utils';

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
type ButtonControlTier = 'primary' | 'supporting' | 'quiet' | 'destructive';
type ButtonVariantProps = VariantProps<typeof buttonVariants>;
type ButtonAsChildRef = React.ComponentRef<typeof Slot>;
type ButtonAsButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  ButtonVariantProps & {
    asChild?: false;
  };
type ButtonAsChildProps = React.ComponentPropsWithoutRef<typeof Slot> &
  ButtonVariantProps & {
    asChild: true;
  };
type ButtonProps = ButtonAsButtonProps | ButtonAsChildProps;
type ButtonComponent = {
  (props: ButtonAsButtonProps & React.RefAttributes<HTMLButtonElement>): React.ReactElement | null;
  (props: ButtonAsChildProps & React.RefAttributes<ButtonAsChildRef>): React.ReactElement | null;
};

const buttonControlTiers: Record<ButtonVariant, ButtonControlTier> = {
  default: 'primary',
  secondary: 'supporting',
  outline: 'supporting',
  ghost: 'quiet',
  link: 'quiet',
  destructive: 'destructive',
};

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border text-sm font-medium tracking-[0.01em] transition-[background-color,border-color,color,box-shadow] outline-none disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  {
    variants: {
      variant: {
        default:
          'border-[var(--ui-control-primary-border)] bg-[var(--ui-control-primary-surface)] text-[var(--ui-control-primary-foreground)] hover:bg-[var(--ui-control-primary-hover-surface)]',
        destructive:
          'border-[var(--ui-control-destructive-border)] bg-[var(--ui-control-destructive-surface)] text-[var(--ui-control-destructive-foreground)] hover:bg-[var(--ui-control-destructive-hover-surface)]',
        outline:
          'border-[var(--ui-control-supporting-border)] bg-transparent text-[var(--ui-control-supporting-foreground)] hover:border-[var(--ui-control-supporting-hover-border)] hover:bg-[var(--ui-control-supporting-hover-surface)] hover:text-[var(--ui-control-supporting-hover-foreground)]',
        secondary:
          'border-[var(--ui-control-supporting-border)] bg-[var(--ui-control-supporting-surface)] text-[var(--ui-control-supporting-foreground)] hover:border-[var(--ui-control-supporting-hover-border)] hover:bg-[var(--ui-control-supporting-hover-surface)] hover:text-[var(--ui-control-supporting-hover-foreground)]',
        ghost:
          'border-transparent bg-transparent text-[var(--ui-control-quiet-foreground)] hover:bg-[var(--ui-control-quiet-hover-surface)] hover:text-[var(--ui-control-quiet-hover-foreground)]',
        link:
          'border-transparent bg-transparent text-[var(--ui-control-link-foreground)] underline-offset-4 hover:text-[var(--ui-control-link-hover-foreground)] hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3',
        lg: 'h-11 px-6',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

const Button = React.forwardRef<HTMLButtonElement | ButtonAsChildRef, ButtonProps>(
  (props, ref) => {
    const resolvedVariant: ButtonVariant = props.variant ?? 'default';

    if (props.asChild) {
      const { asChild: _asChild, className, variant, size, ...slotProps } = props;

      return (
        <Slot
          {...slotProps}
          className={cn(buttonVariants({ variant, size }), className)}
          data-ui-control-tier={buttonControlTiers[resolvedVariant]}
          ref={ref as React.ForwardedRef<ButtonAsChildRef>}
        />
      );
    }

    const { asChild: _asChild, className, variant, size, type = 'button', ...buttonProps } = props;

    return (
      <button
        {...buttonProps}
        className={cn(buttonVariants({ variant, size }), className)}
        data-ui-control-tier={buttonControlTiers[resolvedVariant]}
        ref={ref as React.ForwardedRef<HTMLButtonElement>}
        type={type}
      />
    );
  },
) as ButtonComponent & { displayName?: string };

Button.displayName = 'Button';

export { Button, buttonVariants };
