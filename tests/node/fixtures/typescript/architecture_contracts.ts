import {
  getScreenViewState,
  type GameState,
  type RawViewState,
} from "../../../../src/state/view_state.js";
import {
  getRendererInput,
  type RendererInput,
} from "../../../../src/state/renderer_view.js";
import type { ExploreHudFocusInput } from "../../../../src/ui/explore_hud_focus.js";

const rawViewState: RawViewState = { gameState: "combat" };
const screenState = getScreenViewState(rawViewState, null);
const gameState: GameState = screenState.gameState;
const rendererInput: RendererInput = getRendererInput(rawViewState, null);
const focusInput: ExploreHudFocusInput = {
  logSignature: "log",
  goalSignature: "goal",
  poseSignature: "pose",
  floor: 1,
};

// @ts-expect-error invalid screen states must fail the typecheck.
const invalidGameState: GameState = "loading";
// @ts-expect-error renderer floors are numeric.
const invalidRendererInput: RendererInput = { ...rendererInput, floor: "1" };
// @ts-expect-error the HUD focus boundary requires a numeric floor.
const invalidFocusInput: ExploreHudFocusInput = { ...focusInput, floor: "1" };

void [gameState, rendererInput, focusInput];
void [invalidGameState, invalidRendererInput, invalidFocusInput];
