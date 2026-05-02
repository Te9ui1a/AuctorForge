import { AlertTriangle } from 'lucide-react';

import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';

type UnsavedCloseDialogProps = {
  isOpen: boolean;
  path: string | null;
  onCancel: () => void;
  onDiscardAndClose: () => void;
  onSaveAndClose: () => void;
};

export function UnsavedCloseDialog({
  isOpen,
  path,
  onCancel,
  onDiscardAndClose,
  onSaveAndClose,
}: UnsavedCloseDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        onCancel();
      }
    }}>
      <DialogContent
        aria-modal="true"
        className="w-[min(100%-2rem,34rem)] border-[var(--ui-overlay-border)] bg-[var(--ui-overlay-surface)] text-[var(--ui-overlay-foreground)] shadow-[var(--ui-overlay-shadow)]"
        data-overlay-surface="unsaved-close-dialog"
        data-ui-layer="overlay"
      >
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-amber-400/20 bg-amber-500/10 text-amber-100">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </div>
        <DialogHeader>
          <DialogTitle>未保存的更改</DialogTitle>
          <DialogDescription className="leading-6">
            “{path ?? '当前文件'}” 有未保存的更改。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" className="rounded-[var(--radius-md)] px-4 shadow-none" onClick={onCancel}>
            取消
          </Button>
          <Button type="button" variant="secondary" className="rounded-[var(--radius-md)] px-4 shadow-none" onClick={onDiscardAndClose}>
            放弃更改并关闭
          </Button>
          <Button type="button" className="rounded-[var(--radius-md)] px-4 shadow-none" onClick={onSaveAndClose}>
            保存并关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
