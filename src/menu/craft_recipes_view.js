export function renderCraftRecipesView(optGrid, recipes) {
  recipes.forEach((recipe) => {
    const container = document.createElement("div");
    container.style.gridColumn = "span 2";
    container.style.border = "1px solid #333";
    container.style.padding = "6px 8px";
    container.style.borderRadius = "4px";
    container.style.display = "flex";
    container.style.justifyContent = "space-between";
    container.style.alignItems = "center";
    container.style.background = "rgba(0,0,0,0.2)";
    container.style.marginBottom = "4px";

    const info = document.createElement("div");
    info.style.fontFamily = "var(--font-mono)";
    info.style.fontSize = "11px";

    const matsReq = recipe.materials.map(({ name, current, required, affordable }) => {
      const color = affordable ? "var(--neon-green)" : "var(--neon-red)";
      return `<span style="color:${color}">${name} ${current}/${required}</span>`;
    }).join(", ");
    const goldColor = recipe.goldAffordable ? "#fff" : "var(--neon-red)";

    info.innerHTML = `<strong style="color:#fff">${recipe.name}</strong><br>
      <span style="color:var(--text-muted)">必要: ${matsReq} / <span style="color:${goldColor}">${recipe.gold}G</span></span>`;
    container.appendChild(info);

    const btn = document.createElement("button");
    btn.className = "btn btn-neon";
    btn.textContent = "製作";
    btn.style.minHeight = "var(--tap-min)";
    btn.style.width = "80px";
    btn.disabled = !recipe.canCraft;
    if (!recipe.canCraft) btn.classList.add("disabled");
    btn.addEventListener("click", recipe.onCraft);

    container.appendChild(btn);
    optGrid.appendChild(container);
  });
}
