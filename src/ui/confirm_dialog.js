// In-app replacement for window.confirm(). Native dialogs break the game's
// presentation and are suppressed or auto-cancelled in embedded browsers,
// which makes destructive actions look unresponsive.

const DIALOG_ID = "confirm-dialog";

let activeRequest = null;
let presenterOverride = null;

function isDomAvailable() {
  return typeof document !== "undefined" && typeof document.createElement === "function" && !!document.body;
}

function setBackgroundInert(dialogRoot, inert) {
  Array.from(document.body.children).forEach(element => {
    if (element === dialogRoot) return;
    if (inert) {
      if (element.inert) return;
      element.inert = true;
      element.dataset.confirmDialogInert = "true";
    } else if (element.dataset.confirmDialogInert === "true") {
      element.inert = false;
      delete element.dataset.confirmDialogInert;
    }
  });
}

function presentDialog({ title, message, confirmLabel, cancelLabel, tone }) {
  return new Promise(resolve => {
    const origin = document.activeElement;

    const root = document.createElement("div");
    root.id = DIALOG_ID;
    root.className = "confirm-dialog-backdrop";

    const panel = document.createElement("div");
    panel.className = `confirm-dialog confirm-dialog--${tone}`;
    panel.setAttribute("role", "alertdialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", `${DIALOG_ID}-title`);
    panel.setAttribute("aria-describedby", `${DIALOG_ID}-message`);

    const heading = document.createElement("h2");
    heading.id = `${DIALOG_ID}-title`;
    heading.className = "confirm-dialog-title";
    heading.textContent = title;

    const body = document.createElement("p");
    body.id = `${DIALOG_ID}-message`;
    body.className = "confirm-dialog-message";
    body.textContent = message;

    const actions = document.createElement("div");
    actions.className = "confirm-dialog-actions";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.id = "btn-confirm-dialog-cancel";
    cancelButton.className = "btn btn-neon btn-block";
    cancelButton.textContent = cancelLabel;

    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.id = "btn-confirm-dialog-accept";
    confirmButton.className = `btn btn-block ${tone === "danger" ? "btn-danger" : "btn-neon"}`;
    confirmButton.textContent = confirmLabel;

    actions.append(cancelButton, confirmButton);
    panel.append(heading, body, actions);
    root.appendChild(panel);

    let settled = false;
    const finish = accepted => {
      if (settled) return;
      settled = true;
      window.removeEventListener("keydown", onKeyDown, true);
      setBackgroundInert(root, false);
      root.remove();
      activeRequest = null;
      if (origin && origin.isConnected && typeof origin.focus === "function") {
        origin.focus({ preventScroll: true });
      }
      resolve(accepted);
    };

    // Window capture runs before the game's keyboard shortcuts and the
    // focus manager's document-level Tab trap, so the dialog owns input.
    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      } else if (event.key === "Tab") {
        event.preventDefault();
        const next = document.activeElement === cancelButton ? confirmButton : cancelButton;
        next.focus({ preventScroll: true });
      } else if (event.key === "Enter" && !panel.contains(document.activeElement)) {
        event.preventDefault();
        cancelButton.focus({ preventScroll: true });
      }
      event.stopPropagation();
    }

    cancelButton.addEventListener("click", () => finish(false));
    confirmButton.addEventListener("click", () => finish(true));
    root.addEventListener("click", event => {
      if (event.target === root) finish(false);
    });

    document.body.appendChild(root);
    setBackgroundInert(root, true);
    window.addEventListener("keydown", onKeyDown, true);
    cancelButton.focus({ preventScroll: true });
    activeRequest = { finish };
  });
}

/**
 * Ask the player to confirm an action with an in-app alertdialog.
 * Resolves true only when the player explicitly accepts; closing, Escape,
 * or an environment without a DOM resolves false (fail closed).
 */
export function requestConfirmation({
  title = "確認",
  message,
  confirmLabel = "実行する",
  cancelLabel = "キャンセル",
  tone = "danger"
} = {}) {
  const request = { title, message: String(message ?? ""), confirmLabel, cancelLabel, tone };
  if (presenterOverride) return Promise.resolve(presenterOverride(request)).then(Boolean);
  if (!isDomAvailable()) return Promise.resolve(false);
  // A second request while one is open cancels the first rather than stacking.
  if (activeRequest) activeRequest.finish(false);
  return presentDialog(request);
}

export function __setConfirmationPresenterForTests(presenter) {
  presenterOverride = typeof presenter === "function" ? presenter : null;
}
