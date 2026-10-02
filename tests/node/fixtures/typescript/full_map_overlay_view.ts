import type { FullMapOverlayProps } from "../../../../src/ui/full_map_overlay_view.js";

const validOverlayProps: FullMapOverlayProps = {
  visible: true,
  projection: { title: "B2F 全体地図", markerKinds: ["stairs"] },
  onPointerDown: () => {},
  onPointerMove: () => {},
  onPointerEnd: () => {},
  onWheel: () => {},
  onZoomIn: () => {},
  onZoomOut: () => {},
  onFit: () => {},
  onClose: () => {},
};

const invalidOverlayProps: FullMapOverlayProps = {
  ...validOverlayProps,
  // @ts-expect-error the overlay projection must use a string title and marker list.
  projection: { title: 2, markerKinds: "stairs" },
};

void invalidOverlayProps;
