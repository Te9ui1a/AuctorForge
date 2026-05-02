import { X } from 'lucide-react';

import { Button } from '../../components/ui/button';

type EditorTabsProps = {
  paths: string[];
  activePath: string;
  dirtyPaths: string[];
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
};

export function EditorTabs({ paths, activePath, dirtyPaths, onSelect, onClose }: EditorTabsProps) {
  return (
    <div
      className="flex min-h-[40px] items-end gap-1 overflow-x-auto border-b border-[color:var(--ui-editor-tab-strip-divider)] bg-transparent px-2 pb-0 pt-0"
      data-editor-surface="tab-strip"
      data-editor-tone="editorial-strip"
      data-editor-density="quiet"
      data-editor-chrome="contextual-navigation"
      data-editor-tab-treatment="contextual"
      data-editor-edge="attached"
      data-ui-intent-weight="supporting"
    >
      {paths.map((path) => {
        const label = path.split('/').at(-1) ?? path;
        const isActive = path === activePath;
        const isDirty = dirtyPaths.includes(path);
        const context = describeTabContext(path);
        const dirtyDescriptionId = isDirty ? getDirtyDescriptionId(path) : undefined;

        return (
          <div
            key={path}
            className={isActive
              ? 'editor-tab editor-tab--active flex items-stretch gap-0.5'
              : 'editor-tab editor-tab--inactive flex items-stretch gap-0.5'}
            data-editor-surface="tab"
            data-editor-state={isActive ? 'active' : 'inactive'}
            data-editor-tab-role={isActive ? 'current-document' : 'background-context'}
            data-editor-tab-treatment={isActive ? 'contextual-current' : 'contextual-background'}
            data-editor-tab-context={context.value}
            data-editor-tab-save-state={isDirty ? 'dirty' : 'clean'}
          >
            <Button
              type="button"
              variant="ghost"
              className={isActive
                ? 'editor-tab-button editor-tab-button--active h-auto min-h-[34px] rounded-b-none rounded-t-[12px] px-3 py-1.5 text-left'
                : 'editor-tab-button editor-tab-button--inactive h-auto min-h-[34px] rounded-b-none rounded-t-[12px] px-3 py-1.5 text-left'}
              aria-current={isActive ? 'page' : undefined}
              aria-describedby={dirtyDescriptionId}
              data-editor-tab-button-tone="contextual"
              onClick={() => onSelect(path)}
            >
              <span className="editor-tab-copy">
                <span className="editor-tab-context" data-editor-surface="tab-context">{context.label}</span>
                <span className="editor-tab-label" data-editor-surface="tab-label">{label}</span>
              </span>
              {isDirty ? (
                <span
                  aria-hidden="true"
                  data-editor-surface="dirty-marker"
                  className="ml-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full border-0 bg-[color:var(--ui-editor-tab-dirty)] p-0 text-[0px] leading-none text-transparent shadow-none"
                >
                  ●
                </span>
              ) : null}
            </Button>
            {isDirty ? (
              <span id={dirtyDescriptionId} className="sr-only">
                未保存更改
              </span>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="editor-tab-close h-6 w-6 rounded-md text-[color:var(--ui-editor-tab-close-foreground)] hover:bg-[color:var(--ui-editor-tab-close-hover-surface)] hover:text-[color:var(--ui-editor-tab-close-hover-foreground)]"
              aria-label={`关闭 ${path}`}
              data-editor-tab-button-tone="dismiss"
              onClick={() => onClose(path)}
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function describeTabContext(path: string) {
  if (path.startsWith('1-边界/')) return { value: 'boundary', label: '边界' };
  if (path.startsWith('2-设定/')) return { value: 'setting', label: '设定' };
  if (path.startsWith('3-大纲/')) return { value: 'outline', label: '大纲' };
  if (path.startsWith('4-正文/')) return { value: 'manuscript', label: '正文' };
  if (path.startsWith('5-审查/')) return { value: 'review', label: '审查' };
  return { value: 'workspace', label: '文稿' };
}

function getDirtyDescriptionId(path: string) {
  return `editor-tab-dirty-${encodeURIComponent(path)}`;
}
