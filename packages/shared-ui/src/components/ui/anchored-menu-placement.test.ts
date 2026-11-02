import { describe, expect, it } from "vitest";
import {
  ANCHORED_MENU_GAP_PX,
  ANCHORED_MENU_MIN_HEIGHT_PX,
  ANCHORED_MENU_VIEWPORT_PADDING_PX,
  placeAnchoredMenu,
} from "./anchored-menu-placement";

const PHONE = { width: 390, height: 844 };
const ROW = { left: 8, width: 374, height: 44 };
const MENU = { width: 260, height: 320 };

describe("placeAnchoredMenu", () => {
  it("opens below a row near the top, aligned to the side the thumb pressed", () => {
    const placement = placeAnchoredMenu({
      viewport: PHONE,
      anchor: { ...ROW, top: 120 },
      pointer: { x: 320, y: 140 },
      menu: MENU,
    });
    expect(placement.side).toBe("below");
    expect(placement.menuTop).toBe(120 + 44 + ANCHORED_MENU_GAP_PX);
    expect(placement.previewTop).toBe(120);
    expect(placement.menuLeft).toBe(
      PHONE.width - ANCHORED_MENU_VIEWPORT_PADDING_PX - MENU.width,
    );
    expect(placement.transformOrigin).toBe("top right");

    const leftHanded = placeAnchoredMenu({
      viewport: PHONE,
      anchor: { ...ROW, top: 120 },
      pointer: { x: 60, y: 140 },
      menu: MENU,
    });
    expect(leftHanded.menuLeft).toBe(ANCHORED_MENU_VIEWPORT_PADDING_PX);
    expect(leftHanded.transformOrigin).toBe("top left");
  });

  it("opens above a row near the bottom and grows from the row's edge", () => {
    const placement = placeAnchoredMenu({
      viewport: PHONE,
      anchor: { ...ROW, top: 700 },
      pointer: { x: 320, y: 720 },
      menu: MENU,
    });
    expect(placement.side).toBe("above");
    expect(placement.menuTop).toBe(700 - ANCHORED_MENU_GAP_PX - MENU.height);
    expect(placement.previewTop).toBe(700);
    expect(placement.menuMaxHeight).toBe(MENU.height);
    expect(placement.transformOrigin).toBe("bottom right");
  });

  it("shifts the preview to make room when the menu fits on neither side", () => {
    const placement = placeAnchoredMenu({
      viewport: { width: 390, height: 500 },
      anchor: { ...ROW, top: 200 },
      pointer: null,
      menu: MENU,
    });
    expect(placement.side).toBe("below");
    expect(placement.menuMaxHeight).toBe(MENU.height);
    expect(placement.menuTop + MENU.height).toBe(
      500 - ANCHORED_MENU_VIEWPORT_PADDING_PX,
    );
    expect(placement.previewTop).toBe(
      placement.menuTop - ANCHORED_MENU_GAP_PX - ROW.height,
    );
    expect(placement.previewTop).toBeLessThan(200);

    const lowRow = placeAnchoredMenu({
      viewport: { width: 390, height: 500 },
      anchor: { ...ROW, top: 300 },
      pointer: null,
      menu: MENU,
    });
    expect(lowRow.side).toBe("above");
    expect(lowRow.menuTop).toBe(ANCHORED_MENU_VIEWPORT_PADDING_PX);
    expect(lowRow.previewTop).toBe(
      lowRow.menuTop + MENU.height + ANCHORED_MENU_GAP_PX,
    );
    expect(lowRow.previewTop).toBeGreaterThan(300);
  });

  it("caps the menu height and keeps it inside the safe area when even a shifted preview leaves too little room", () => {
    const insets = { top: 47, bottom: 34 };
    const placement = placeAnchoredMenu({
      viewport: { width: 390, height: 360 },
      insets,
      anchor: { ...ROW, top: 60 },
      pointer: null,
      menu: MENU,
    });
    const padTop = ANCHORED_MENU_VIEWPORT_PADDING_PX + insets.top;
    const padBottom = ANCHORED_MENU_VIEWPORT_PADDING_PX + insets.bottom;
    expect(placement.menuMaxHeight).toBe(
      360 - padTop - padBottom - ROW.height - ANCHORED_MENU_GAP_PX,
    );
    expect(placement.menuTop).toBeGreaterThanOrEqual(padTop);
    expect(placement.menuTop + placement.menuMaxHeight).toBeLessThanOrEqual(
      360 - padBottom,
    );
    expect(placement.previewTop).toBeGreaterThanOrEqual(padTop);
  });

  it("never squeezes the menu below its minimum height for a tall anchor", () => {
    const placement = placeAnchoredMenu({
      viewport: { width: 390, height: 300 },
      anchor: { left: 0, width: 390, top: 20, height: 260 },
      pointer: null,
      menu: MENU,
    });
    expect(placement.menuMaxHeight).toBe(ANCHORED_MENU_MIN_HEIGHT_PX);
  });

  it("narrows the menu on a viewport thinner than the menu and keeps its padding", () => {
    const placement = placeAnchoredMenu({
      viewport: { width: 240, height: 600 },
      anchor: { left: 0, width: 240, top: 100, height: 44 },
      pointer: { x: 200, y: 110 },
      menu: MENU,
    });
    expect(placement.menuWidth).toBe(240 - 2 * ANCHORED_MENU_VIEWPORT_PADDING_PX);
    expect(placement.menuLeft).toBe(ANCHORED_MENU_VIEWPORT_PADDING_PX);
  });
});
