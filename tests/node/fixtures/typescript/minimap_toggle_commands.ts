import type { ReactUiCommand } from "../../../../src/ui/minimap_toggle.js";

export function exerciseMinimapToggleCommand(command: ReactUiCommand): "open-full-map" {
  const commandType: "open-full-map" = command.type;
  return commandType;
}

// @ts-expect-error unknown UI commands must fail the typecheck.
const invalidCommand: ReactUiCommand = { type: "mutate-game-state" };
void invalidCommand;
