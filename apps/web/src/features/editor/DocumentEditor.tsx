import { Save } from 'lucide-react';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';

type DocumentEditorProps = {
  path: string;
  content: string;
  canSave: boolean;
  isDirty?: boolean;
  readOnly?: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
};

function countNarrativeCharacters(content: string) {
  return content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^#/.test(line))
    .join('')
    .replace(/\s+/g, '').length;
}

export function DocumentEditor({ path, content, canSave, isDirty = false, readOnly = false, onChange, onSave }: DocumentEditorProps) {
  const hasLoadedDocument = Boolean(path);
  const isEmptyDocument = !readOnly && !hasLoadedDocument;
  const isLockedDocument = !readOnly && hasLoadedDocument && !canSave;
  const editorReadOnly = readOnly || isEmptyDocument || isLockedDocument;
  const saveEnabled = !readOnly && hasLoadedDocument && canSave && isDirty;
  const documentMode = readOnly ? 'proposal-preview' : isEmptyDocument ? 'empty' : isLockedDocument ? 'locked-reference' : 'working-draft';
  const saveState = readOnly ? 'preview' : isEmptyDocument ? 'empty' : isLockedDocument ? 'locked' : isDirty ? 'ready' : 'idle';
  const pathState = path ? 'loaded' : 'empty';
  const stageTone = readOnly ? 'proposal-preview' : isEmptyDocument ? 'empty' : isLockedDocument ? 'locked' : 'draft';
  const activeDocumentLabel = path ? path.split('/').at(-1) ?? path : '等待加载文件';
  const documentModeLabel = readOnly ? '提案预览' : isEmptyDocument ? '等待载入' : isLockedDocument ? '只读参考' : '可编辑草稿';
  const saveStateLabel = readOnly ? '提案预览中' : isEmptyDocument ? '未加载文稿' : isLockedDocument ? '当前阶段不可保存' : isDirty ? '草稿可保存' : '草稿已保存';
  const documentTransitionKey = path || documentMode;
  const narrativeCharacterCount = countNarrativeCharacters(content);
  const narrativeCharacterLabel = `正文 ${narrativeCharacterCount.toLocaleString('en-US')} 字`;

  return (
    <main
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--ui-surface-border)] bg-[color:var(--ui-surface-background)] text-[color:var(--ui-surface-foreground)] shadow-[var(--ui-surface-shadow)]"
      data-ui-layer="document"
      data-ui-surface="document"
      data-editor-surface="document-shell"
      data-editor-tone="editorial"
      data-editor-layout="manuscript"
      data-editor-stage="writing-stage"
      data-editor-frame="direct-manuscript"
      data-editor-state={readOnly ? 'readonly' : isEmptyDocument ? 'empty' : isLockedDocument ? 'locked' : 'editable'}
      data-editor-document-mode={documentMode}
    >
      <div
        className="relative z-10 flex w-full min-w-0 flex-wrap items-center justify-between gap-3 border-b border-[color:var(--ui-document-toolbar-border)] bg-[image:var(--ui-document-toolbar-surface)] px-5 py-2"
        data-editor-surface="toolbar"
        data-editor-chrome="compact-status"
      >
        <div className="min-w-0 flex flex-1 flex-wrap items-center gap-2.5" data-editor-document-identity="current-document">
          <span className="truncate text-[13px] font-medium text-[color:var(--ui-document-heading)]">
            {activeDocumentLabel}
          </span>
          <Badge
            variant="outline"
            className="border-[color:var(--ui-document-status-border)] bg-[color:var(--ui-document-status-surface)] text-[9px] text-[color:var(--ui-document-status-foreground)] shadow-none"
            data-editor-surface="document-mode"
          >
            {documentModeLabel}
          </Badge>
          <span
            className="max-w-full truncate text-[11px] text-[color:var(--ui-document-path)]"
            data-editor-surface="path"
            data-editor-path-state={pathState}
          >
            {path || '等待加载文件'}
          </span>
        </div>
        <div className="flex items-center gap-2" data-editor-surface="document-status" data-editor-save-state={saveState}>
          <span className="text-[11px] text-[color:var(--ui-document-status-foreground)]" data-editor-surface="narrative-count">
            {narrativeCharacterLabel}
          </span>
          <span className="text-[11px] text-[color:var(--ui-document-status-foreground)]">{saveStateLabel}</span>
          <Button
            type="button"
            variant={saveEnabled ? 'default' : 'outline'}
            onClick={onSave}
            disabled={!saveEnabled}
            data-editor-save-state={saveState}
            className={saveEnabled
              ? 'h-9 rounded-[var(--radius-md)] px-3.5 text-xs shadow-none'
              : 'h-9 rounded-[var(--radius-md)] border-[color:var(--ui-document-button-border)] bg-[color:var(--ui-document-button-surface)] px-3.5 text-xs text-[color:var(--ui-document-button-foreground)] shadow-none hover:bg-[color:var(--ui-document-button-hover-surface)] hover:text-[color:var(--ui-document-button-hover-foreground)]'}
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            保存当前文档
          </Button>
        </div>
      </div>
      {readOnly ? (
        <div className="border-b border-[color:var(--ui-document-readonly-border)] bg-[image:var(--ui-document-readonly-note-surface)] px-6 py-3 text-sm text-[color:var(--ui-document-readonly-ink)]" data-editor-surface="readonly-note">
          当前显示的是提案预览。你可以先确认写入，或继续讨论后重新生成。
        </div>
      ) : isEmptyDocument ? (
        <div className="border-b border-[color:var(--ui-document-readonly-border)] bg-[image:var(--ui-document-readonly-note-surface)] px-6 py-3 text-sm text-[color:var(--ui-document-readonly-ink)]" data-editor-surface="empty-note">
          请先从文稿导航中打开一个文件，再开始编辑或保存。
        </div>
      ) : null}
      <div
        className="flex min-h-0 flex-1 flex-col"
        data-editor-surface="manuscript-body"
        data-editor-stage-tone={stageTone}
        data-editor-frame-depth="direct"
      >
        <div className="flex min-h-0 w-full flex-1 flex-col" data-editor-canvas-width="expanded">
          <div
            key={documentTransitionKey}
            className="manuscript-lane flex min-h-0 flex-1 flex-col"
            data-editor-surface="manuscript-lane"
            data-editor-lane="centered-open"
            data-editor-motion="page-in"
            data-editor-transition-key={documentTransitionKey}
            data-editor-transition-state={documentMode}
            data-testid="manuscript-lane"
          >
            <Textarea
              aria-label="当前文档编辑器"
              data-editor-density="compact-writing"
              data-editor-surface="canvas"
              data-editor-canvas="manuscript"
              className={editorReadOnly
                ? 'document-editor is-readonly min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent text-[14px] leading-7 text-[color:var(--ui-document-ink)] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0'
                : 'document-editor min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent text-[14px] leading-7 text-[color:var(--ui-document-ink)] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0'}
              placeholder={isEmptyDocument ? '请先从文稿导航中打开一个文件，再开始编辑。' : undefined}
              value={content}
              readOnly={editorReadOnly}
              onChange={(event) => {
                if (editorReadOnly) {
                  return;
                }

                onChange(event.target.value);
              }}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
