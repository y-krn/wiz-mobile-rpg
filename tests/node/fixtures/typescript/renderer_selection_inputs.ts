import * as facade from "../../../../src/renderer_selection.js";
import * as owner from "../../../../src/renderer_selection";

export function exerciseRendererSelectionInputs(
  search: unknown,
  state: unknown,
  reason: unknown,
  phase: unknown,
  scope: unknown
) {
  const facadeState = facade.createRendererSelectionState(search);
  const ownerState = owner.createRendererSelectionState(search);
  return {
    facadeState: facade.selectRenderer(facadeState),
    ownerState: owner.selectRenderer(ownerState),
    facadeFailure: facade.selectRendererFailure(state, { reason, phase }),
    ownerFailure: owner.selectRendererFailure(state, { reason, phase }),
    facadePhase: facade.getInjectedFailurePhase(scope),
    ownerPhase: owner.getInjectedFailurePhase(scope)
  };
}
