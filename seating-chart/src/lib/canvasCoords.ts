import type Konva from "konva";

/**
 * Translate browser page coordinates (e.g. clientX/clientY from a
 * window-level mouse event) into the room's local coordinate space.
 *
 * Returns `null` if the cursor is outside the stage's container, so palette
 * drops that miss the canvas can be quietly ignored.
 */
export function pageToRoom(
  stage: Konva.Stage | null,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  if (!stage) return null;
  const container = stage.container();
  const rect = container.getBoundingClientRect();
  const stageX = clientX - rect.left;
  const stageY = clientY - rect.top;
  if (stageX < 0 || stageY < 0 || stageX > rect.width || stageY > rect.height) return null;
  const layers = stage.getLayers();
  if (layers.length === 0) return null;
  const transform = layers[0].getAbsoluteTransform().copy().invert();
  return transform.point({ x: stageX, y: stageY });
}
