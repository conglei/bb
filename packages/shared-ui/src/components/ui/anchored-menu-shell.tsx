import * as React from "react";
import { createPortal } from "react-dom";

import { usePortalScopeProps } from "../../lib/portal-scope.js";
import {
  placeAnchoredMenu,
  type AnchoredMenuBox,
  type AnchoredMenuPlacement,
} from "./anchored-menu-placement.js";
import {
  usePersistentOverlayFocus,
  useResponsiveDrawerRealization,
} from "./responsive-overlay.js";
import { blurActiveKeyboardInputWithin } from "./overlay-trigger.js";

export interface CompactMenuAnchor {
  element: HTMLElement;
  pointer: { x: number; y: number } | null;
}

type AnchoredOutsideEvent = CustomEvent<{ originalEvent: PointerEvent }>;

export interface AnchoredMenuShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: CompactMenuAnchor;
  srLabel?: string;
  onAfterCloseAutoFocus?: () => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onPointerDownOutside?: (event: AnchoredOutsideEvent) => void;
  onInteractOutside?: (event: AnchoredOutsideEvent) => void;
  children: React.ReactNode;
}

export const ANCHORED_MENU_MOTION_MS = 220;
const ANCHORED_MENU_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
const ANCHORED_MENU_WIDTH_PX = 260;
const ANCHORED_MENU_ACTIVATE_FALLBACK_MS = 80;
const PREVIEW_SCALE = 1.02;
const PREVIEW_RADIUS_PX = 10;

interface AnchoredScene {
  rect: AnchoredMenuBox;
  pointer: { x: number; y: number } | null;
  typography: Pick<
    React.CSSProperties,
    "font" | "color" | "letterSpacing" | "lineHeight"
  >;
  preview: HTMLElement;
}

function captureScene(anchor: CompactMenuAnchor): AnchoredScene {
  const rect = anchor.element.getBoundingClientRect();
  const computed = getComputedStyle(anchor.element);
  const preview = anchor.element.cloneNode(true) as HTMLElement;
  preview.removeAttribute("id");
  for (const element of preview.querySelectorAll("[id]")) {
    element.removeAttribute("id");
  }
  preview.setAttribute("aria-hidden", "true");
  preview.setAttribute("inert", "");
  preview.style.pointerEvents = "none";
  preview.style.margin = "0";
  preview.style.width = `${rect.width}px`;
  preview.style.height = `${rect.height}px`;
  preview.style.boxSizing = "border-box";
  return {
    rect: {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    },
    pointer: anchor.pointer,
    typography: {
      font: computed.font,
      color: computed.color,
      letterSpacing: computed.letterSpacing,
      lineHeight: computed.lineHeight,
    },
    preview,
  };
}

function readInset(element: HTMLElement | null, side: "Top" | "Bottom") {
  if (element === null) return 0;
  const value = parseFloat(getComputedStyle(element)[`padding${side}`]);
  return Number.isFinite(value) ? value : 0;
}

function useAnchoredActivation(active: boolean): boolean {
  const [settled, setSettled] = React.useState(false);
  React.useLayoutEffect(() => {
    if (!active) {
      setSettled(false);
      return;
    }
    let firstFrame: number | null = null;
    let secondFrame: number | null = null;
    firstFrame = window.requestAnimationFrame(() => {
      firstFrame = null;
      secondFrame = window.requestAnimationFrame(() => {
        secondFrame = null;
        setSettled(true);
      });
    });
    const fallback = window.setTimeout(
      () => setSettled(true),
      ANCHORED_MENU_ACTIVATE_FALLBACK_MS,
    );
    return () => {
      if (firstFrame !== null) window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(fallback);
    };
  }, [active]);
  return active && settled;
}

export function AnchoredMenuShell({
  open,
  onOpenChange,
  anchor,
  srLabel,
  onAfterCloseAutoFocus,
  onEscapeKeyDown,
  onPointerDownOutside,
  onInteractOutside,
  children,
}: AnchoredMenuShellProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const previewRef = React.useRef<HTMLDivElement>(null);
  const backdropRef = React.useRef<HTMLDivElement>(null);
  const backdropPointerDownRef = React.useRef<PointerEvent | null>(null);
  const [scene, setScene] = React.useState<AnchoredScene | null>(null);
  const [placement, setPlacement] =
    React.useState<AnchoredMenuPlacement | null>(null);
  const portalScopeProps = usePortalScopeProps();
  const { isContentRealized } = useResponsiveDrawerRealization({ open });
  const active = useAnchoredActivation(open && scene !== null);
  const shown = active && placement !== null && isContentRealized;

  const onOpenChangeRef = React.useRef(onOpenChange);
  React.useLayoutEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);
  const requestClose = React.useCallback(() => {
    blurActiveKeyboardInputWithin(panelRef.current);
    onOpenChangeRef.current(false);
  }, []);

  usePersistentOverlayFocus({
    onAfterCloseAutoFocus,
    onEscapeKeyDown,
    open: open && scene !== null,
    panelRef,
    requestClose,
  });

  React.useLayoutEffect(() => {
    if (open) {
      setScene(captureScene(anchor));
      return;
    }
    const timeout = window.setTimeout(() => {
      setScene(null);
      setPlacement(null);
    }, ANCHORED_MENU_MOTION_MS + 50);
    return () => window.clearTimeout(timeout);
  }, [anchor, open]);

  React.useLayoutEffect(() => {
    const host = previewRef.current;
    if (host === null || scene === null) return;
    host.replaceChildren(scene.preview);
    return () => host.replaceChildren();
  }, [scene]);

  const measure = React.useCallback(() => {
    const content = contentRef.current;
    if (scene === null || content === null) return;
    const viewport = {
      width: window.visualViewport?.width ?? window.innerWidth,
      height: window.visualViewport?.height ?? window.innerHeight,
    };
    setPlacement(
      placeAnchoredMenu({
        viewport,
        insets: {
          top: readInset(backdropRef.current, "Top"),
          bottom: readInset(backdropRef.current, "Bottom"),
        },
        anchor: scene.rect,
        pointer: scene.pointer,
        menu: { width: ANCHORED_MENU_WIDTH_PX, height: content.offsetHeight },
      }),
    );
  }, [scene]);

  React.useLayoutEffect(() => {
    if (!open || !isContentRealized) return;
    measure();
    const content = contentRef.current;
    if (content === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(content);
    return () => observer.disconnect();
  }, [isContentRealized, measure, open]);

  const handleBackdropClick = () => {
    const originalEvent = backdropPointerDownRef.current;
    backdropPointerDownRef.current = null;
    if (originalEvent !== null) {
      const outsideEvent: AnchoredOutsideEvent = new CustomEvent(
        "dismissableLayer.pointerDownOutside",
        { cancelable: true, detail: { originalEvent } },
      );
      onPointerDownOutside?.(outsideEvent);
      onInteractOutside?.(outsideEvent);
      if (outsideEvent.defaultPrevented) return;
    }
    requestClose();
  };

  const portalTarget = typeof document === "undefined" ? null : document.body;
  if (portalTarget === null || scene === null) {
    return null;
  }

  const previewShift =
    placement === null ? 0 : placement.previewTop - scene.rect.top;
  const motion = `${ANCHORED_MENU_MOTION_MS}ms ${ANCHORED_MENU_EASING}`;

  return createPortal(
    <>
      <div
        ref={backdropRef}
        {...portalScopeProps}
        aria-hidden="true"
        data-anchored-menu-backdrop=""
        data-state={open ? "open" : "closed"}
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[6px]"
        style={{
          opacity: active ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: `opacity ${motion}`,
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom:
            "var(--bb-safe-area-bottom, env(safe-area-inset-bottom, 0px))",
        }}
        onPointerDown={(event) => {
          backdropPointerDownRef.current = event.nativeEvent;
        }}
        onClick={handleBackdropClick}
        onTouchMove={(event) => event.preventDefault()}
      />
      <div
        ref={previewRef}
        {...portalScopeProps}
        aria-hidden="true"
        data-anchored-menu-preview=""
        className="pointer-events-none fixed z-50 overflow-hidden bg-popover"
        style={{
          ...scene.typography,
          top: scene.rect.top,
          left: scene.rect.left,
          width: scene.rect.width,
          height: scene.rect.height,
          borderRadius: PREVIEW_RADIUS_PX,
          transform: active
            ? `translate3d(0, ${previewShift}px, 0) scale(${PREVIEW_SCALE})`
            : "translate3d(0, 0, 0) scale(1)",
          boxShadow: active ? "var(--shadow-xl)" : "none",
          transition: `transform ${motion}, box-shadow ${motion}`,
          willChange: open ? "transform" : undefined,
        }}
      />
      <div
        ref={panelRef}
        {...portalScopeProps}
        aria-hidden={!open}
        aria-label={srLabel}
        data-bb-portaled-overlay=""
        data-anchored-menu-content=""
        data-state={open ? "open" : "closed"}
        inert={!open}
        role="menu"
        tabIndex={-1}
        className="fixed z-50 flex flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl outline-none"
        style={{
          top: placement?.menuTop ?? 0,
          left: placement?.menuLeft ?? 0,
          width: placement?.menuWidth ?? ANCHORED_MENU_WIDTH_PX,
          maxHeight: placement?.menuMaxHeight,
          transformOrigin: placement?.transformOrigin,
          transform: shown ? "scale(1)" : "scale(0.85)",
          opacity: shown ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: `transform ${motion}, opacity ${Math.round(ANCHORED_MENU_MOTION_MS * 0.7)}ms ease-out`,
          willChange: open ? "transform, opacity" : undefined,
        }}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [touch-action:pan-y]">
          <div
            ref={contentRef}
            className="flex flex-col [&_[role^=menuitem]+[role^=menuitem]]:border-t [&_[role^=menuitem]+[role^=menuitem]]:border-border-hairline"
          >
            {isContentRealized ? children : null}
          </div>
        </div>
      </div>
    </>,
    portalTarget,
  );
}
