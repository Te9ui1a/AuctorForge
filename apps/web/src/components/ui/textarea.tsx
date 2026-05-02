import * as React from 'react';

import { cn } from '../../lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      'flex min-h-[96px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground shadow-none transition-colors outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring',
      className,
    )}
    ref={ref}
    {...props}
  />
));

Textarea.displayName = 'Textarea';

export { Textarea };
