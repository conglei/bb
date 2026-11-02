export interface AnchoredMenuBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface AnchoredMenuPlacementInput {
  viewport: { width: number; height: number };
  insets?: { top: number; bottom: number };
  anchor: AnchoredMenuBox;
  pointer: { x: number; y: number } | null;
  menu: { width: number; height: number };
}

export type AnchoredMenuSide = "below" | "above";

export interface AnchoredMenuPlacement {
  side: AnchoredMenuSide;
  previewTop: number;
  menuTop: number;
  menuLeft: number;
  menuWidth: number;
  menuMaxHeight: number;
  transformOrigin: string;
}

export const ANCHORED_MENU_GAP_PX = 10;
export const ANCHORED_MENU_VIEWPORT_PADDING_PX = 12;
export const ANCHORED_MENU_MIN_HEIGHT_PX = 132;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function placeAnchoredMenu({
  viewport,
  insets = { top: 0, bottom: 0 },
  anchor,
  pointer,
  menu,
}: AnchoredMenuPlacementInput): AnchoredMenuPlacement {
  const padTop = ANCHORED_MENU_VIEWPORT_PADDING_PX + insets.top;
  const padBottom = ANCHORED_MENU_VIEWPORT_PADDING_PX + insets.bottom;
  const anchorBottom = anchor.top + anchor.height;
  const roomBelow =
    viewport.height - padBottom - (anchorBottom + ANCHORED_MENU_GAP_PX);
  const roomAbove = anchor.top - ANCHORED_MENU_GAP_PX - padTop;

  let side: AnchoredMenuSide;
  let previewTop = anchor.top;
  let menuTop: number;
  let menuMaxHeight = menu.height;

  if (menu.height <= roomBelow) {
    side = "below";
    menuTop = anchorBottom + ANCHORED_MENU_GAP_PX;
  } else if (menu.height <= roomAbove) {
    side = "above";
    menuTop = anchor.top - ANCHORED_MENU_GAP_PX - menu.height;
  } else {
    const room =
      viewport.height -
      padTop -
      padBottom -
      anchor.height -
      ANCHORED_MENU_GAP_PX;
    menuMaxHeight = Math.min(
      menu.height,
      Math.max(room, ANCHORED_MENU_MIN_HEIGHT_PX),
    );
    if (roomBelow >= roomAbove) {
      side = "below";
      menuTop = viewport.height - padBottom - menuMaxHeight;
      previewTop = menuTop - ANCHORED_MENU_GAP_PX - anchor.height;
    } else {
      side = "above";
      menuTop = padTop;
      previewTop = menuTop + menuMaxHeight + ANCHORED_MENU_GAP_PX;
    }
  }

  const menuWidth = Math.min(
    menu.width,
    viewport.width - 2 * ANCHORED_MENU_VIEWPORT_PADDING_PX,
  );
  const pointerX = pointer?.x ?? anchor.left + anchor.width / 2;
  const alignRight = pointerX > viewport.width / 2;
  const menuLeft = clamp(
    alignRight ? anchor.left + anchor.width - menuWidth : anchor.left,
    ANCHORED_MENU_VIEWPORT_PADDING_PX,
    Math.max(
      ANCHORED_MENU_VIEWPORT_PADDING_PX,
      viewport.width - ANCHORED_MENU_VIEWPORT_PADDING_PX - menuWidth,
    ),
  );

  return {
    side,
    previewTop,
    menuTop,
    menuLeft,
    menuWidth,
    menuMaxHeight,
    transformOrigin: `${side === "below" ? "top" : "bottom"} ${alignRight ? "right" : "left"}`,
  };
}
