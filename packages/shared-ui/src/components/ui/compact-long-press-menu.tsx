import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Slot } from "@radix-ui/react-slot";
import { DropdownMenu, DropdownMenuContent } from "./dropdown-menu";
import type { CompactMenuAnchor } from "./anchored-menu-shell";
import type { CompactMenuPresentation } from "./responsive-overlay";
import { triggerHaptic } from "../../lib/haptics";

export const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_SLOP_PX = 10;

const LONG_PRESS_TARGET_STYLE: CSSProperties = {
  WebkitTouchCallout: "none",
};

const CLAIMED_PRESS_EVENT_KEY = Symbol.for(
  "bb.compactLongPressMenu.claimedPressEvent",
);

function isClaimedPressEvent(event: Event): boolean {
  return Reflect.get(event, CLAIMED_PRESS_EVENT_KEY) === true;
}

function claimPressEvent(event: Event) {
  Reflect.set(event, CLAIMED_PRESS_EVENT_KEY, true);
}

interface CompactLongPressMenuProps {
  children: ReactNode;
  disabled?: boolean;
  dragging?: boolean;
  items: ReactNode;
  label: string;
  presentation?: CompactMenuPresentation;
  onOpenChange?: (open: boolean) => void;
}

interface PendingPress {
  pointerId: number;
  element: HTMLElement;
  x: number;
  y: number;
}

export function CompactLongPressMenu({
  children,
  disabled = false,
  dragging = false,
  items,
  label,
  presentation = "anchored",
  onOpenChange,
}: CompactLongPressMenuProps) {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [anchor, setAnchor] = useState<CompactMenuAnchor | null>(null);
  const timerRef = useRef<number | null>(null);
  const pressRef = useRef<PendingPress | null>(null);
  const suppressClickRef = useRef(false);

  const clearPress = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pressRef.current = null;
  }, []);

  useEffect(() => clearPress, [clearPress]);

  useEffect(() => {
    if (disabled || dragging) {
      clearPress();
      suppressClickRef.current = false;
    }
  }, [clearPress, disabled, dragging]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen && dragging) return;
      setOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [dragging, onOpenChange],
  );

  useEffect(() => {
    if (!dragging) return;
    clearPress();
    if (open) handleOpenChange(false);
  }, [clearPress, dragging, handleOpenChange, open]);

  const openMenu = useCallback(
    (nextAnchor: CompactMenuAnchor) => {
      clearPress();
      setAnchor(nextAnchor);
      setHasOpened(true);
      triggerHaptic("impact-medium");
      handleOpenChange(true);
    },
    [clearPress, handleOpenChange],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      suppressClickRef.current = false;
      if (disabled || dragging) {
        return;
      }
      if (event.pointerType !== "touch" && event.pointerType !== "pen") {
        return;
      }
      if (!event.isPrimary) {
        return;
      }
      if (isClaimedPressEvent(event.nativeEvent)) {
        return;
      }
      claimPressEvent(event.nativeEvent);
      clearPress();
      pressRef.current = {
        pointerId: event.pointerId,
        element: event.currentTarget,
        x: event.clientX,
        y: event.clientY,
      };
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        const press = pressRef.current;
        if (press === null) {
          return;
        }
        pressRef.current = null;
        suppressClickRef.current = true;
        openMenu({
          element: press.element,
          pointer: { x: press.x, y: press.y },
        });
      }, LONG_PRESS_MS);
    },
    [clearPress, disabled, dragging, openMenu],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const press = pressRef.current;
      if (press === null || press.pointerId !== event.pointerId) {
        return;
      }
      if (
        Math.abs(event.clientX - press.x) > LONG_PRESS_MOVE_SLOP_PX ||
        Math.abs(event.clientY - press.y) > LONG_PRESS_MOVE_SLOP_PX
      ) {
        clearPress();
      }
    },
    [clearPress],
  );

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (pressRef.current?.pointerId === event.pointerId) {
        clearPress();
      }
    },
    [clearPress],
  );

  const handleContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (dragging) {
        event.preventDefault();
        return;
      }
      if (disabled || event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      if (pressRef.current !== null) {
        suppressClickRef.current = true;
      }
      openMenu({
        element: event.currentTarget,
        pointer:
          event.clientX === 0 && event.clientY === 0
            ? null
            : { x: event.clientX, y: event.clientY },
      });
    },
    [disabled, dragging, openMenu],
  );

  const handleClickCapture = useCallback(
    (event: ReactMouseEvent<HTMLElement> | MouseEvent) => {
      if (!suppressClickRef.current) {
        return;
      }
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const clearSuppressedClick = () => {
      suppressClickRef.current = false;
    };
    document.addEventListener("click", handleClickCapture, true);
    document.addEventListener("pointerdown", clearSuppressedClick, true);
    document.addEventListener("keydown", clearSuppressedClick, true);
    return () => {
      document.removeEventListener("click", handleClickCapture, true);
      document.removeEventListener("pointerdown", clearSuppressedClick, true);
      document.removeEventListener("keydown", clearSuppressedClick, true);
    };
  }, [handleClickCapture, open]);

  return (
    <>
      <Slot
        style={LONG_PRESS_TARGET_STYLE}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onContextMenu={handleContextMenu}
        onClickCapture={handleClickCapture}
        onKeyDownCapture={() => {
          suppressClickRef.current = false;
        }}
      >
        {children}
      </Slot>
      {hasOpened ? (
        <DropdownMenu open={open} onOpenChange={handleOpenChange}>
          <DropdownMenuContent
            mobileTitle={label}
            aria-label={label}
            compactPresentation={presentation}
            compactAnchor={anchor}
            onPointerDownCapture={() => {
              suppressClickRef.current = false;
            }}
            onClickCapture={handleClickCapture}
            onKeyDownCapture={() => {
              suppressClickRef.current = false;
            }}
          >
            {items}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );
}
