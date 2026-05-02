import { Archive, BookOpen, PanelsTopLeft, Sparkles, Trash2, Upload, Wrench } from 'lucide-react';

type StartupGlyphName = 'spark' | 'upload' | 'sample' | 'panels' | 'repair' | 'archive' | 'remove';

type StartupGlyphProps = {
  name: StartupGlyphName;
};

export function StartupGlyph({ name }: StartupGlyphProps) {
  const Glyph =
    name === 'spark'
      ? Sparkles
        : name === 'upload'
          ? Upload
          : name === 'sample'
            ? BookOpen
            : name === 'panels'
              ? PanelsTopLeft
              : name === 'repair'
                ? Wrench
                : name === 'archive'
                  ? Archive
                  : Trash2;

  return (
    <span className="startup-action-icon" data-startup-icon={name} data-icon-system="lucide" aria-hidden="true">
      <Glyph className="startup-action-icon-svg" strokeWidth={1.8} />
    </span>
  );
}
