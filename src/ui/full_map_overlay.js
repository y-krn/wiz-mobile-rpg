import { drawFullMap, drawFullMapIcon, getFullMapModel, FULL_MAP_LEGEND } from "./full_map.js";
import { getRendererInput } from "../state/renderer_view.js";
import { releaseFocusSurface, syncFocusSurface } from "./focus_manager.js";

// Full-screen floor map opened from the explore minimap (#1833).
// Pinch/drag/wheel and the +/- buttons change a CSS transform on one
// pre-rendered canvas; the map itself only redraws when the overlay opens.

const SURFACE_ID = "full-map-overlay";
const CELL_SIZE = 24;
const PADDING = 12;
const MAX_BACKING_EDGE = 4096;
const MAX_CELL_PX = 64;
const FIT_MARGIN_CELLS = 1.5;
const BUTTON_ZOOM_STEP = 1.5;

let isOpen = false;
let view = { scale: 1, x: 0, y: 0 };
let limits = { min: 0.25, max: 2 };
let content = { width: 0, height: 0 };
let fitRect = null;
let pointers = new Map();
let gesture = null;
let bound = false;

/** Clamp a view so some of the content always stays inside the viewport. */
export function clampFullMapView(next, contentSize, viewportSize, zoomLimits) {
  const scale = Math.min(zoomLimits.max, Math.max(zoomLimits.min, next.scale));
  const scaledW = contentSize.width * scale;
  const scaledH = contentSize.height * scale;
  const clampAxis = (value, scaled, viewportEdge) => {
    if (scaled <= viewportEdge) return (viewportEdge - scaled) / 2;
    return Math.min(0, Math.max(viewportEdge - scaled, value));
  };
  return {
    scale,
    x: clampAxis(next.x, scaledW, viewportSize.width),
    y: clampAxis(next.y, scaledH, viewportSize.height)
  };
}

/** Zoom by `factor` around a viewport-space anchor point. */
export function zoomFullMapView(current, factor, anchor, contentSize, viewportSize, zoomLimits) {
  const scale = Math.min(zoomLimits.max, Math.max(zoomLimits.min, current.scale * factor));
  const ratio = scale / current.scale;
  return clampFullMapView({
    scale,
    x: anchor.x - (anchor.x - current.x) * ratio,
    y: anchor.y - (anchor.y - current.y) * ratio
  }, contentSize, viewportSize, zoomLimits);
}

/**
 * Zoom limits and the opening view: fit the known part of the floor (plus a
 * margin) without magnifying a tiny explored area past `MAX_CELL_PX` per cell.
 */
export function getFullMapInitialView(model, viewportSize, cellSize = CELL_SIZE, padding = PADDING) {
  const contentSize = {
    width: model.width * cellSize + padding * 2,
    height: model.height * cellSize + padding * 2
  };
  const fitAll = Math.min(viewportSize.width / contentSize.width, viewportSize.height / contentSize.height);
  const zoomLimits = { min: fitAll, max: Math.max(fitAll, MAX_CELL_PX / cellSize) };
  const { minX, minY, maxX, maxY } = model.bounds;
  const box = {
    x: padding + (minX - FIT_MARGIN_CELLS) * cellSize,
    y: padding + (minY - FIT_MARGIN_CELLS) * cellSize,
    width: (maxX - minX + 1 + FIT_MARGIN_CELLS * 2) * cellSize,
    height: (maxY - minY + 1 + FIT_MARGIN_CELLS * 2) * cellSize
  };
  const fitKnown = Math.min(viewportSize.width / box.width, viewportSize.height / box.height, 2);
  const scale = Math.min(zoomLimits.max, Math.max(zoomLimits.min, fitKnown));
  const centreX = box.x + box.width / 2;
  const centreY = box.y + box.height / 2;
  const initial = clampFullMapView({
    scale,
    x: viewportSize.width / 2 - centreX * scale,
    y: viewportSize.height / 2 - centreY * scale
  }, contentSize, viewportSize, zoomLimits);
  return { contentSize, limits: zoomLimits, view: initial };
}

function getElements() {
  return {
    overlay: document.getElementById(SURFACE_ID),
    viewport: document.getElementById("full-map-viewport"),
    canvas: document.getElementById("full-map-canvas"),
    title: document.getElementById("full-map-title"),
    legend: document.getElementById("full-map-legend"),
    zoomIn: document.getElementById("btn-full-map-zoom-in"),
    zoomOut: document.getElementById("btn-full-map-zoom-out"),
    fit: document.getElementById("btn-full-map-fit"),
    close: document.getElementById("btn-full-map-close"),
    back: document.getElementById("btn-full-map-back")
  };
}

function getViewportSize(viewport) {
  const rect = viewport.getBoundingClientRect();
  return { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
}

function applyView() {
  const { canvas, overlay, zoomIn, zoomOut } = getElements();
  if (!canvas) return;
  canvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  if (overlay?.dataset) overlay.dataset.zoom = view.scale.toFixed(3);
  if (zoomIn) zoomIn.disabled = view.scale >= limits.max - 1e-6;
  if (zoomOut) zoomOut.disabled = view.scale <= limits.min + 1e-6;
}

function setView(next) {
  const { viewport } = getElements();
  if (!viewport) return;
  view = clampFullMapView(next, content, getViewportSize(viewport), limits);
  applyView();
}

function zoomBy(factor, anchor = null) {
  const { viewport } = getElements();
  if (!viewport) return;
  const size = getViewportSize(viewport);
  const point = anchor || { x: size.width / 2, y: size.height / 2 };
  view = zoomFullMapView(view, factor, point, content, size, limits);
  applyView();
}

function renderLegend(legend) {
  if (!legend || legend.dataset.rendered === "true") return;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  FULL_MAP_LEGEND.forEach(({ kind, label }) => {
    const item = document.createElement("li");
    item.className = "full-map-legend-item";
    item.dataset.kind = kind;
    const icon = document.createElement("canvas");
    icon.className = "full-map-legend-icon";
    icon.width = 20 * dpr;
    icon.height = 20 * dpr;
    icon.setAttribute("aria-hidden", "true");
    const ctx = icon.getContext?.("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      drawFullMapIcon(ctx, kind, 1, 1, 18);
    }
    const text = document.createElement("span");
    text.textContent = label;
    item.append(icon, text);
    legend.appendChild(item);
  });
  legend.dataset.rendered = "true";
}

function renderMap() {
  const { overlay, viewport, canvas, title } = getElements();
  if (!overlay || !viewport || !canvas) return false;
  const renderInput = getRendererInput();
  const model = getFullMapModel(renderInput);
  if (!model) return false;

  const size = getViewportSize(viewport);
  const initial = getFullMapInitialView(model, size);
  content = initial.contentSize;
  limits = initial.limits;
  fitRect = size;

  const backing = Math.max(1, Math.min(
    (window.devicePixelRatio || 1) * limits.max,
    MAX_BACKING_EDGE / Math.max(content.width, content.height)
  ));
  canvas.width = Math.round(content.width * backing);
  canvas.height = Math.round(content.height * backing);
  canvas.style.width = `${content.width}px`;
  canvas.style.height = `${content.height}px`;
  const ctx = canvas.getContext?.("2d");
  if (!ctx) return false;
  ctx.setTransform(backing, 0, 0, backing, 0, 0);
  ctx.clearRect(0, 0, content.width, content.height);
  drawFullMap(ctx, model, { cellSize: CELL_SIZE, padding: PADDING });

  if (title) title.textContent = `B${renderInput.floor}F 全体地図`;
  overlay.dataset.markers = [...new Set(model.markers.map((marker) => marker.kind))].sort().join(" ");
  view = initial.view;
  applyView();
  return true;
}

function localPoint(event) {
  const { viewport } = getElements();
  const rect = viewport.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function startGesture() {
  const points = [...pointers.values()];
  if (points.length >= 2) {
    const [a, b] = points;
    gesture = {
      type: "pinch",
      distance: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      view: { ...view }
    };
  } else if (points.length === 1) {
    gesture = { type: "pan", start: points[0], view: { ...view } };
  } else {
    gesture = null;
  }
}

function onPointerDown(event) {
  if (!isOpen) return;
  event.preventDefault();
  event.currentTarget.setPointerCapture?.(event.pointerId);
  pointers.set(event.pointerId, localPoint(event));
  startGesture();
}

function onPointerMove(event) {
  if (!isOpen || !pointers.has(event.pointerId) || !gesture) return;
  event.preventDefault();
  pointers.set(event.pointerId, localPoint(event));
  const points = [...pointers.values()];
  if (gesture.type === "pinch" && points.length >= 2) {
    const [a, b] = points;
    const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const { viewport } = getElements();
    const zoomed = zoomFullMapView(gesture.view, distance / gesture.distance, gesture.mid, content, getViewportSize(viewport), limits);
    setView({ ...zoomed, x: zoomed.x + mid.x - gesture.mid.x, y: zoomed.y + mid.y - gesture.mid.y });
  } else if (gesture.type === "pan" && points.length === 1) {
    const [point] = points;
    setView({ ...gesture.view, x: gesture.view.x + point.x - gesture.start.x, y: gesture.view.y + point.y - gesture.start.y });
  }
}

function onPointerEnd(event) {
  if (!pointers.has(event.pointerId)) return;
  pointers.delete(event.pointerId);
  startGesture();
}

function onWheel(event) {
  if (!isOpen) return;
  event.preventDefault();
  zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15, localPoint(event));
}

function onKeyDown(event) {
  if (!isOpen) return;
  if (event.key === "Escape" || event.key === "m" || event.key === "M") {
    event.preventDefault();
    event.stopImmediatePropagation();
    closeFullMap();
    return;
  }
  if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    zoomBy(BUTTON_ZOOM_STEP);
  } else if (event.key === "-") {
    event.preventDefault();
    zoomBy(1 / BUTTON_ZOOM_STEP);
  }
  // Movement keys must not walk the party while the map covers the view.
  if (event.key !== "Tab" && event.key !== "Enter" && event.key !== " ") {
    event.stopImmediatePropagation();
  }
}

function onResize() {
  if (!isOpen) return;
  const { viewport } = getElements();
  if (!viewport) return;
  const size = getViewportSize(viewport);
  if (fitRect && size.width === fitRect.width && size.height === fitRect.height) return;
  renderMap();
}

function bindOnce() {
  if (bound) return;
  const { viewport, zoomIn, zoomOut, fit, close, back } = getElements();
  if (!viewport) return;
  bound = true;
  viewport.addEventListener("pointerdown", onPointerDown);
  viewport.addEventListener("pointermove", onPointerMove);
  viewport.addEventListener("pointerup", onPointerEnd);
  viewport.addEventListener("pointercancel", onPointerEnd);
  viewport.addEventListener("lostpointercapture", onPointerEnd);
  viewport.addEventListener("wheel", onWheel, { passive: false });
  zoomIn?.addEventListener("click", () => zoomBy(BUTTON_ZOOM_STEP));
  zoomOut?.addEventListener("click", () => zoomBy(1 / BUTTON_ZOOM_STEP));
  fit?.addEventListener("click", () => renderMap());
  close?.addEventListener("click", () => closeFullMap());
  back?.addEventListener("click", () => closeFullMap());
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("resize", onResize);
}

export function isFullMapOpen() {
  return isOpen;
}

export function openFullMap() {
  const { overlay, legend } = getElements();
  if (!overlay || isOpen) return false;
  bindOnce();
  overlay.hidden = false;
  isOpen = true;
  renderLegend(legend);
  if (!renderMap()) {
    closeFullMap();
    return false;
  }
  syncFocusSurface(SURFACE_ID, overlay);
  const { back } = getElements();
  back?.focus?.({ preventScroll: true });
  return true;
}

export function closeFullMap() {
  const { overlay } = getElements();
  if (!isOpen) return;
  isOpen = false;
  pointers = new Map();
  gesture = null;
  if (overlay) overlay.hidden = true;
  releaseFocusSurface(SURFACE_ID, "#btn-minimap-toggle");
}
