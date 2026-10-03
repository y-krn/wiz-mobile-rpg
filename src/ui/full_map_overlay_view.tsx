import * as React from "react";
import { useEffect, useRef } from "react";
import { drawFullMapIcon, FULL_MAP_LEGEND } from "./full_map.js";

export interface FullMapOverlayProjection {
  readonly title: string;
  readonly markerKinds: readonly string[];
}

export interface FullMapOverlayProps {
  readonly visible: boolean;
  readonly projection: FullMapOverlayProjection;
  readonly onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  readonly onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  readonly onPointerEnd: (event: React.PointerEvent<HTMLDivElement>) => void;
  readonly onWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onFit: () => void;
  readonly onClose: () => void;
}

export function FullMapOverlayView({
  visible,
  projection,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
  onWheel,
  onZoomIn,
  onZoomOut,
  onFit,
  onClose,
}: FullMapOverlayProps): React.ReactElement {
  const legendCanvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const legend = FULL_MAP_LEGEND.filter(entry =>
    !("optional" in entry && entry.optional) || projection.markerKinds.includes(entry.kind));
  const legendKey = legend.map(({ kind }) => kind).join(" ");

  useEffect(() => {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    legend.forEach(({ kind }, index) => {
      const canvas = legendCanvases.current[index];
      if (!canvas) return;
      canvas.width = 20 * dpr;
      canvas.height = 20 * dpr;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(dpr, dpr);
      drawFullMapIcon(context, kind, 1, 1, 18);
    });
    // The legend only changes when the floor's marker kinds change.
  }, [legendKey]);

  return (
    <div
      id="full-map-overlay"
      className="full-map-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="full-map-title"
      data-markers={projection.markerKinds.join(" ")}
      hidden={!visible}
    >
      <div className="full-map-header">
        <h2 id="full-map-title" className="full-map-title">{projection.title}</h2>
        <button id="btn-full-map-close" type="button" className="btn full-map-close" aria-label="地図を閉じる" title="地図を閉じる" onClick={onClose}>✕</button>
      </div>
      <div
        id="full-map-viewport"
        className="full-map-viewport"
        aria-label="ピンチで拡大、ドラッグで移動"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onLostPointerCapture={onPointerEnd}
        onWheel={onWheel}
      >
        <canvas id="full-map-canvas" className="full-map-canvas" role="img" aria-label="現在の階の地図" />
        <div className="full-map-zoom" role="group" aria-label="地図の表示">
          <button id="btn-full-map-zoom-in" type="button" className="btn full-map-zoom-btn" aria-label="拡大" onClick={onZoomIn}>＋</button>
          <button id="btn-full-map-zoom-out" type="button" className="btn full-map-zoom-btn" aria-label="縮小" onClick={onZoomOut}>－</button>
          <button id="btn-full-map-fit" type="button" className="btn full-map-zoom-btn" aria-label="初期表示に戻す" title="初期表示に戻す" onClick={onFit}>⤢</button>
        </div>
      </div>
      <ul id="full-map-legend" className="full-map-legend" aria-label="凡例">
        {legend.map(({ kind, label }, index) => (
          <li key={kind} className="full-map-legend-item" data-kind={kind}>
            <canvas
              ref={canvas => { legendCanvases.current[index] = canvas; }}
              className="full-map-legend-icon"
              aria-hidden="true"
            />
            <span>{label}</span>
          </li>
        ))}
      </ul>
      <button id="btn-full-map-back" type="button" className="btn btn-neon full-map-back" onClick={onClose}>探索に戻る</button>
    </div>
  );
}
