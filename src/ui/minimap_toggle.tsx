import * as React from "react";

export type ReactUiCommand = { readonly type: "open-full-map" };

export interface MinimapToggleProps {
  readonly visible: boolean;
  readonly onCommand: (command: ReactUiCommand) => void;
}

export function MinimapToggle({ visible, onCommand }: MinimapToggleProps): React.ReactElement {
  return (
    <button
      id="btn-minimap-toggle"
      type="button"
      aria-haspopup="dialog"
      aria-controls="full-map-overlay"
      aria-label="全体地図を開く"
      title="全体地図を開く"
      hidden={!visible}
      onClick={() => onCommand({ type: "open-full-map" })}
    />
  );
}
