// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompactViewportOverrideProvider } from "@bb/shared-ui/hooks/use-compact-viewport";
import { DropdownMenuItem } from "@bb/shared-ui/dropdown-menu";
import {
  CompactLongPressMenu,
  LONG_PRESS_MS,
} from "@bb/shared-ui/compact-long-press-menu";
import { registerHapticHandler } from "@bb/shared-ui/haptics";

function renderRow({
  disabled = false,
  presentation,
  onRowClick = vi.fn(),
  onOpenChange = vi.fn(),
  onRename = vi.fn(),
}: {
  disabled?: boolean;
  presentation?: "anchored" | "sheet";
  onRowClick?: () => void;
  onOpenChange?: (open: boolean) => void;
  onRename?: () => void;
} = {}) {
  const root = document.createElement("div");
  root.id = "root";
  document.body.appendChild(root);
  const utils = render(
    <CompactViewportOverrideProvider isCompactViewport>
      <CompactLongPressMenu
        disabled={disabled}
        label="Thread actions"
        presentation={presentation}
        onOpenChange={onOpenChange}
        items={<DropdownMenuItem onSelect={onRename}>Rename</DropdownMenuItem>}
      >
        <a href="#thread" onClick={onRowClick} data-testid="row">
          Thread row
        </a>
      </CompactLongPressMenu>
    </CompactViewportOverrideProvider>,
    { container: root },
  );
  return {
    ...utils,
    row: screen.getByTestId("row"),
    onRowClick,
    onOpenChange,
    onRename,
  };
}

function touchPointerDown(target: Element, x = 100, y = 100) {
  fireEvent.pointerDown(target, {
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
    clientX: x,
    clientY: y,
  });
}

function longPress(target: Element) {
  touchPointerDown(target);
  act(() => {
    vi.advanceTimersByTime(LONG_PRESS_MS);
  });
}

function settle() {
  act(() => {
    vi.advanceTimersByTime(500);
  });
}

const openBackdrop = () =>
  document.querySelector("[data-anchored-menu-backdrop][data-state='open']");

afterEach(() => {
  cleanup();
  document.getElementById("root")?.remove();
  registerHapticHandler(null);
  vi.useRealTimers();
});

describe("CompactLongPressMenu", () => {
  it("preserves touch selection and the native context menu while disabled", () => {
    vi.useFakeTimers();
    const { row, onOpenChange } = renderRow({ disabled: true });

    longPress(row);
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(row, event);

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("mounts nothing for the menu until a long press, then opens a menu anchored to the row without a modal takeover", () => {
    vi.useFakeTimers();
    const { row, onOpenChange } = renderRow();

    expect(screen.queryByRole("menuitem")).toBeNull();
    expect(document.querySelector("[role='menu']")).toBeNull();

    touchPointerDown(row);
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    });
    expect(onOpenChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onOpenChange).toHaveBeenCalledWith(true);

    settle();
    const menu = screen.getByRole("menu", { name: "Thread actions" });
    expect(menu.getAttribute("data-anchored-menu-content")).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeTruthy();
    expect(document.querySelector("[role='dialog']")).toBeNull();

    const root = document.getElementById("root");
    expect(root?.getAttribute("aria-hidden")).toBeNull();
    expect(root?.hasAttribute("inert")).toBe(false);
    expect(document.body.style.pointerEvents).toBe("");
  });

  it("lifts a copy of the pressed row above the backdrop and drops it once the menu closes", () => {
    vi.useFakeTimers();
    const { row, onOpenChange } = renderRow();

    longPress(row);
    settle();
    const preview = document.querySelector("[data-anchored-menu-preview]");
    expect(preview?.getAttribute("aria-hidden")).toBe("true");
    const copy = preview?.firstElementChild;
    expect(copy?.textContent).toBe("Thread row");
    expect(copy?.hasAttribute("inert")).toBe(true);
    expect(copy).not.toBe(row);
    expect(row.isConnected).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    settle();
    expect(document.querySelector("[data-anchored-menu-preview]")).toBeNull();
    expect(openBackdrop()).toBeNull();
  });

  it("asks the shell for a haptic when the press opens the menu", () => {
    vi.useFakeTimers();
    const haptic = vi.fn();
    registerHapticHandler(haptic);
    const { row } = renderRow();

    touchPointerDown(row);
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    });
    expect(haptic).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(haptic).toHaveBeenCalledWith("impact-medium");
    expect(haptic).toHaveBeenCalledOnce();
  });

  it("keeps the bottom sheet for callers that ask for it", () => {
    vi.useFakeTimers();
    const { row } = renderRow({ presentation: "sheet" });

    longPress(row);
    settle();
    expect(document.querySelector("[role='dialog']")).not.toBeNull();
    expect(document.querySelector("[data-anchored-menu-content]")).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeTruthy();
  });

  it("swallows the click that follows a long press so the row does not navigate", () => {
    vi.useFakeTimers();
    const { row, onRowClick } = renderRow();

    longPress(row);
    fireEvent.pointerUp(row, { pointerId: 1, pointerType: "touch" });
    fireEvent.click(row);
    expect(onRowClick).not.toHaveBeenCalled();

    fireEvent.click(row);
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it("ignores the opening release on a menu item but allows a new tap", () => {
    vi.useFakeTimers();
    const { row, onRename } = renderRow();
    longPress(row);
    settle();
    const item = screen.getByRole("menuitem", { name: "Rename" });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    fireEvent.click(item);
    expect(onRename).not.toHaveBeenCalled();
    touchPointerDown(item);
    fireEvent.click(item);
    expect(onRename).toHaveBeenCalledOnce();
  });

  it("ignores the opening release on the backdrop but allows a fresh tap to dismiss", () => {
    vi.useFakeTimers();
    const { row, onOpenChange } = renderRow();
    longPress(row);
    settle();
    const backdrop = openBackdrop();
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    touchPointerDown(backdrop!);
    fireEvent.click(backdrop!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("cancels the press when the finger moves or lifts early, and ignores mouse pointers", () => {
    vi.useFakeTimers();
    const { row, onOpenChange, onRowClick } = renderRow();

    touchPointerDown(row, 100, 100);
    fireEvent.pointerMove(row, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 100,
      clientY: 130,
    });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS);
    });
    expect(onOpenChange).not.toHaveBeenCalled();

    touchPointerDown(row, 100, 100);
    fireEvent.pointerUp(row, { pointerId: 1, pointerType: "touch" });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS);
    });
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.pointerDown(row, {
      pointerId: 2,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
    });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS);
    });
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.click(row);
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it("lets only the innermost menu open when menus nest (thread row inside a project section)", () => {
    vi.useFakeTimers();
    const onProjectOpenChange = vi.fn();
    const onThreadOpenChange = vi.fn();
    render(
      <CompactViewportOverrideProvider isCompactViewport>
        <CompactLongPressMenu
          label="Project actions"
          onOpenChange={onProjectOpenChange}
          items={<DropdownMenuItem>Rename project</DropdownMenuItem>}
        >
          <div data-testid="project-section">
            <span>Project</span>
            <CompactLongPressMenu
              label="Thread actions"
              onOpenChange={onThreadOpenChange}
              items={<DropdownMenuItem>Rename thread</DropdownMenuItem>}
            >
              <a href="#thread" data-testid="row">
                Thread row
              </a>
            </CompactLongPressMenu>
          </div>
        </CompactLongPressMenu>
      </CompactViewportOverrideProvider>,
    );
    const row = screen.getByTestId("row");

    longPress(row);
    expect(onThreadOpenChange).toHaveBeenCalledWith(true);
    expect(onProjectOpenChange).not.toHaveBeenCalled();

    onThreadOpenChange.mockClear();
    fireEvent.contextMenu(row);
    expect(onThreadOpenChange).toHaveBeenCalledWith(true);
    expect(onProjectOpenChange).not.toHaveBeenCalled();

    longPress(screen.getAllByText("Project")[0]!);
    expect(onProjectOpenChange).toHaveBeenCalledWith(true);
  });

  it("lets only the innermost menu open when the menus come from separately bundled copies", async () => {
    vi.useFakeTimers();
    const pluginBundleSpecifier =
      "@bb/shared-ui/compact-long-press-menu?plugin-bundle";
    const pluginBundleCopy: typeof import("@bb/shared-ui/compact-long-press-menu") =
      await import(pluginBundleSpecifier);
    expect(pluginBundleCopy.CompactLongPressMenu).not.toBe(
      CompactLongPressMenu,
    );
    const ProjectMenu = pluginBundleCopy.CompactLongPressMenu;
    const onProjectOpenChange = vi.fn();
    const onThreadOpenChange = vi.fn();
    render(
      <CompactViewportOverrideProvider isCompactViewport>
        <ProjectMenu
          label="Project actions"
          onOpenChange={onProjectOpenChange}
          items={<DropdownMenuItem>Rename project</DropdownMenuItem>}
        >
          <div>
            <span>Project</span>
            <CompactLongPressMenu
              label="Thread actions"
              onOpenChange={onThreadOpenChange}
              items={<DropdownMenuItem>Rename thread</DropdownMenuItem>}
            >
              <a href="#thread" data-testid="row">
                Thread row
              </a>
            </CompactLongPressMenu>
          </div>
        </ProjectMenu>
      </CompactViewportOverrideProvider>,
    );

    longPress(screen.getByTestId("row"));
    expect(onThreadOpenChange).toHaveBeenCalledWith(true);
    expect(onProjectOpenChange).not.toHaveBeenCalled();
  });

  it("opens from a right-click on a narrow window without the native menu", () => {
    const { row, onOpenChange } = renderRow();
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(row, event);
    expect(event.defaultPrevented).toBe(true);
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("cancels a pending actions menu when dragging begins", () => {
    vi.useFakeTimers();
    const onOpenChange = vi.fn();
    const renderMenu = (dragging: boolean) => (
      <CompactLongPressMenu
        label="Thread actions"
        dragging={dragging}
        items={<button type="button">Action</button>}
        onOpenChange={onOpenChange}
      >
        <button type="button">Thread</button>
      </CompactLongPressMenu>
    );
    const { getByRole, rerender } = render(renderMenu(false));
    fireEvent.pointerDown(getByRole("button", { name: "Thread" }), {
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: 10,
      clientY: 10,
    });

    rerender(renderMenu(true));
    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(onOpenChange).not.toHaveBeenCalledWith(true);
  });

  it("dismisses an open actions menu when dragging begins", () => {
    const onOpenChange = vi.fn();
    const renderMenu = (dragging: boolean) => (
      <CompactLongPressMenu
        label="Thread actions"
        dragging={dragging}
        items={<button type="button">Action</button>}
        onOpenChange={onOpenChange}
      >
        <button type="button">Thread</button>
      </CompactLongPressMenu>
    );
    const { getByRole, rerender } = render(renderMenu(false));
    fireEvent.contextMenu(getByRole("button", { name: "Thread" }));
    expect(onOpenChange).toHaveBeenCalledWith(true);

    rerender(renderMenu(true));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});
