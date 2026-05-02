import { SlidersHorizontal } from 'lucide-react';

export function SettingsGlyph() {
  return (
    <span className="startup-action-icon settings-action-icon" data-startup-icon="settings" data-icon-system="lucide" aria-hidden="true">
      <SlidersHorizontal className="startup-action-icon-svg settings-glyph" strokeWidth={1.8} />
    </span>
  );
}
