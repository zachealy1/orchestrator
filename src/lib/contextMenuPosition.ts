export type FloatingMenuBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  gutter?: number;
};

export function clampFloatingMenuPosition({
  x,
  y,
  width,
  height,
  viewportWidth,
  viewportHeight,
  gutter = 8,
}: FloatingMenuBounds) {
  const maximumX = Math.max(gutter, viewportWidth - width - gutter);
  const maximumY = Math.max(gutter, viewportHeight - height - gutter);
  return {
    x: Math.max(gutter, Math.min(x, maximumX)),
    y: Math.max(gutter, Math.min(y, maximumY)),
  };
}
