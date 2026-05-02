import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

import { Button } from '../../components/ui/button';
import { DialogFooter, DialogHeader } from '../../components/ui/dialog';

type ProjectSwitchDialogProps = {
  isOpen: boolean;
  dirtyCount: number;
  onSaveAndSwitch: () => void;
  onDiscardAndSwitch: () => void;
  onCancel: () => void;
};

export function ProjectSwitchDialog({
  isOpen,
  dirtyCount,
  onSaveAndSwitch,
  onDiscardAndSwitch,
  onCancel,
}: ProjectSwitchDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    } else if (!isOpen && dialog.open) {
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    }
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--ui-overlay-border)] bg-[var(--ui-overlay-surface)] p-0 text-[var(--ui-overlay-foreground)] shadow-[var(--ui-overlay-shadow)]"
      data-ui-layer="overlay"
      data-overlay-surface="switch-dialog"
      data-dialog-state={isOpen ? 'open' : 'closed'}
      aria-labelledby="project-switch-dialog-title"
      aria-describedby="project-switch-dialog-description"
      onClose={onCancel}
    >
      <div className="flex flex-col gap-5 p-6" data-overlay-surface="dialog-content">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-amber-400/20 bg-amber-500/10 text-amber-100">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </div>
        <DialogHeader className="grid gap-2">
          <h3 id="project-switch-dialog-title" className="text-lg font-semibold tracking-tight text-foreground">未保存的更改</h3>
          <p id="project-switch-dialog-description" className="text-sm leading-6 text-muted-foreground">
            当前项目有 {dirtyCount} 个未保存的文件。切换项目将丢失这些更改。
          </p>
        </DialogHeader>
        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end" data-overlay-surface="dialog-actions">
          <Button type="button" variant="secondary" className="rounded-[var(--radius-md)] px-4 shadow-none" onClick={onCancel}>
            取消
          </Button>
          <Button type="button" variant="secondary" className="rounded-[var(--radius-md)] px-4 shadow-none" onClick={onDiscardAndSwitch}>
            放弃更改并切换
          </Button>
          <Button type="button" className="rounded-[var(--radius-md)] px-4 shadow-none" onClick={onSaveAndSwitch}>
            保存并切换
          </Button>
        </DialogFooter>
      </div>
    </dialog>
  );
}
