export function createActionCard({
  name,
  description = "",
  cost = "",
  costClassName = "",
  className = "",
  selected = false,
  disabled = false,
  onClick,
  ariaPressed,
  dataset = {}
}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `btn btn-block menu-action-card${className ? ` ${className}` : ""}${selected ? " is-selected" : ""}`;
  button.disabled = disabled;
  Object.entries(dataset).forEach(([key, value]) => {
    button.dataset[key] = String(value);
  });
  if (ariaPressed !== undefined) button.setAttribute("aria-pressed", String(ariaPressed));

  const title = document.createElement("strong");
  title.className = "menu-action-card-name";
  title.textContent = name;
  button.appendChild(title);

  if (description) {
    const detail = document.createElement("span");
    detail.className = "menu-action-card-description";
    detail.textContent = description;
    button.appendChild(detail);
  }

  if (cost) {
    const costLine = document.createElement("span");
    costLine.className = `menu-action-card-cost${costClassName ? ` ${costClassName}` : ""}`;
    costLine.textContent = cost;
    button.appendChild(costLine);
  }

  if (onClick) button.addEventListener("click", onClick);
  return button;
}
