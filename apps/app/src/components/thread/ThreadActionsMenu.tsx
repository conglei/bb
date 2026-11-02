import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import type {
  PluginThreadActionsContextMenuProps,
  PluginThreadActionsInlineItem,
  PluginThreadActionsMenuProps,
  PluginThreadActionsTriggerProps,
  PluginThreadActionTarget,
} from "@get-bb/plugin-sdk";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuLabel,
  ContextMenuTrigger,
} from "@bb/shared-ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@bb/shared-ui/dropdown-menu";
import { ActionMenuSeparator } from "@bb/shared-ui/action-menu-items";
import { useIsCompactViewport } from "@bb/shared-ui/hooks/use-compact-viewport";
import { CompactLongPressMenu } from "@bb/shared-ui/compact-long-press-menu";
import { CORE_THREAD_ACTION_OWNER } from "@/lib/thread-actions/thread-action-registry";
import {
  LongPressThreadActionMenuRows,
  ThreadActionMenuRows,
  useThreadActionMenuGroups,
  useThreadBulkActionMenuGroups,
  type ThreadActionMenuSurface,
} from "./ThreadActionMenuItems";

const MENU_LABEL = "Thread actions";

export const LONG_PRESS_QUICK_ACTION_KEYS: ReadonlySet<string> = new Set([
  `${CORE_THREAD_ACTION_OWNER}/pin`,
  `${CORE_THREAD_ACTION_OWNER}/read`,
  "push-notifications/notifications",
  `${CORE_THREAD_ACTION_OWNER}/rename`,
  `${CORE_THREAD_ACTION_OWNER}/archive`,
]);

interface LongPressMenuState {
  showAll: boolean;
  onShowAll: () => void;
}

function ThreadActionsMenuItems({
  thread,
  inline,
  requestRename,
  surface,
  isDrawer,
  drawerStep,
  onDrawerStepChange,
  longPress,
}: {
  thread: PluginThreadActionTarget;
  inline?: readonly PluginThreadActionsInlineItem[];
  requestRename?: (threadId: string) => void;
  surface: ThreadActionMenuSurface;
  isDrawer: boolean;
  drawerStep: string | null;
  onDrawerStepChange: (key: string | null) => void;
  longPress?: LongPressMenuState;
}) {
  const groups = useThreadActionMenuGroups({ thread, inline, requestRename });
  if (longPress !== undefined) {
    return (
      <LongPressThreadActionMenuRows
        groups={groups}
        quickKeys={LONG_PRESS_QUICK_ACTION_KEYS}
        showAll={longPress.showAll}
        onShowAll={longPress.onShowAll}
        drawerStep={drawerStep}
        onDrawerStepChange={onDrawerStepChange}
      />
    );
  }
  return (
    <ThreadActionMenuRows
      groups={groups}
      surface={surface}
      isDrawer={isDrawer}
      drawerStep={drawerStep}
      onDrawerStepChange={onDrawerStepChange}
    />
  );
}

function describeTriggerContractViolation(
  element: HTMLElement | null,
  hostClassName: string | undefined,
): string | null {
  if (element === null) {
    return "did not attach the ref it received, so the menu cannot open; spread its props and ref onto the button";
  }
  const missing = (hostClassName ?? "")
    .split(/\s+/)
    .filter((name) => name.length > 0 && !element.classList.contains(name));
  return missing.length === 0
    ? null
    : `dropped the host's classes (${missing.join(" ")}); merge props.className into your own className`;
}

const ThreadActionsTriggerSlot = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<"button"> & {
    render: (props: PluginThreadActionsTriggerProps) => ReactNode;
  }
>(function ThreadActionsTriggerSlot({ render, ...props }, ref) {
  const element = useRef<HTMLButtonElement | null>(null);
  const hostClassName = props.className;
  useLayoutEffect(() => {
    const problem = describeTriggerContractViolation(
      element.current,
      hostClassName,
    );
    if (problem !== null) {
      console.error(`experimental_ThreadActionsMenu: \`trigger\` ${problem}`);
    }
  }, [hostClassName]);
  return render({
    ...props,
    ref: (node: HTMLButtonElement | null) => {
      element.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref !== null) ref.current = node;
    },
  });
});

function useDrawerStep(onOpenChange?: (open: boolean) => void) {
  const [drawerStep, setDrawerStep] = useState<string | null>(null);
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) setDrawerStep(null);
      onOpenChange?.(open);
    },
    [onOpenChange],
  );
  return { drawerStep, setDrawerStep, handleOpenChange };
}

export function ThreadActionsMenu({
  thread,
  trigger,
  inline,
  requestRename,
  onOpenChange,
  onCloseAutoFocus,
  side,
  align = "end",
  sideOffset,
}: PluginThreadActionsMenuProps) {
  const isCompactViewport = useIsCompactViewport();
  const { drawerStep, setDrawerStep, handleOpenChange } =
    useDrawerStep(onOpenChange);
  return (
    <DropdownMenu modal={false} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <ThreadActionsTriggerSlot render={trigger} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={side}
        align={align}
        sideOffset={sideOffset}
        mobileTitle={MENU_LABEL}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <ThreadActionsMenuItems
          thread={thread}
          inline={inline}
          requestRename={requestRename}
          surface="dropdown"
          isDrawer={isCompactViewport}
          drawerStep={drawerStep}
          onDrawerStepChange={setDrawerStep}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ContextMenuShellProps {
  label: string;
  children: ReactNode;
  disabled: boolean;
  dragging: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  renderItems: (props: MenuItemsRenderProps) => ReactNode;
}

interface MenuItemsRenderProps {
  surface: ThreadActionMenuSurface;
  isDrawer: boolean;
  drawerStep: string | null;
  onDrawerStepChange: (key: string | null) => void;
  longPress?: LongPressMenuState;
}

export function ThreadActionsContextMenu({
  thread,
  inline,
  requestRename,
  experimental_bulkThreads,
  disabled = false,
  dragging = false,
  ...props
}: PluginThreadActionsContextMenuProps) {
  const selection =
    experimental_bulkThreads !== undefined &&
    experimental_bulkThreads.length > 1
      ? experimental_bulkThreads
      : null;
  return (
    <ResponsiveContextMenu
      {...props}
      label={
        selection === null
          ? MENU_LABEL
          : `Actions for ${describeThreadCount(selection.length)}`
      }
      disabled={disabled}
      dragging={dragging}
      renderItems={(itemProps) =>
        selection === null ? (
          <ThreadActionsMenuItems
            thread={thread}
            inline={inline}
            requestRename={requestRename}
            {...itemProps}
          />
        ) : (
          <ThreadBulkMenuItems
            threads={selection}
            inline={inline}
            {...itemProps}
          />
        )
      }
    />
  );
}

function describeThreadCount(count: number): string {
  return count === 1 ? "1 thread" : `${count} threads`;
}

function ThreadBulkMenuItems({
  threads,
  inline,
  surface,
  isDrawer,
  drawerStep,
  onDrawerStepChange,
  longPress,
}: {
  threads: readonly PluginThreadActionTarget[];
  inline?: readonly PluginThreadActionsInlineItem[];
} & MenuItemsRenderProps) {
  const groups = useThreadBulkActionMenuGroups({ threads, inline });
  const Label = surface === "context" ? ContextMenuLabel : DropdownMenuLabel;
  return (
    <>
      {drawerStep === null || longPress !== undefined ? (
        <>
          <Label className="text-muted-foreground">
            {describeThreadCount(threads.length)} selected
          </Label>
          {groups.length > 0 ? <ActionMenuSeparator surface={surface} /> : null}
        </>
      ) : null}
      {longPress === undefined ? (
        <ThreadActionMenuRows
          groups={groups}
          surface={surface}
          isDrawer={isDrawer}
          drawerStep={drawerStep}
          onDrawerStepChange={onDrawerStepChange}
        />
      ) : (
        <LongPressThreadActionMenuRows
          groups={groups}
          quickKeys={LONG_PRESS_QUICK_ACTION_KEYS}
          showAll
          onShowAll={longPress.onShowAll}
          drawerStep={drawerStep}
          onDrawerStepChange={onDrawerStepChange}
        />
      )}
    </>
  );
}

function ResponsiveContextMenu(props: ContextMenuShellProps) {
  const isCompactViewport = useIsCompactViewport();
  return isCompactViewport ? (
    <LongPressMenuShell {...props} />
  ) : (
    <DesktopContextMenuShell {...props} />
  );
}

function LongPressMenuShell({
  label,
  children,
  renderItems,
  onOpenChange,
  disabled,
  dragging,
}: ContextMenuShellProps) {
  const [showAll, setShowAll] = useState(false);
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) setShowAll(false);
      onOpenChange?.(open);
    },
    [onOpenChange],
  );
  const { drawerStep, setDrawerStep, handleOpenChange: handleStepOpenChange } =
    useDrawerStep(handleOpenChange);
  const longPress = useMemo<LongPressMenuState>(
    () => ({ showAll, onShowAll: () => setShowAll(true) }),
    [showAll],
  );
  return (
    <CompactLongPressMenu
      label={label}
      disabled={disabled}
      dragging={dragging}
      onOpenChange={handleStepOpenChange}
      items={renderItems({
        surface: "dropdown",
        isDrawer: true,
        drawerStep,
        onDrawerStepChange: setDrawerStep,
        longPress,
      })}
    >
      {children}
    </CompactLongPressMenu>
  );
}

function DesktopContextMenuShell({
  label,
  children,
  renderItems,
  onOpenChange,
  onCloseAutoFocus,
  onEscapeKeyDown,
  disabled,
  dragging,
}: ContextMenuShellProps) {
  const [open, setOpen] = useState(false);
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen && dragging) return;
      setOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [dragging, onOpenChange],
  );
  useEffect(() => {
    if (dragging && open) handleOpenChange(false);
  }, [dragging, handleOpenChange, open]);
  return (
    <ContextMenu modal={false} open={open} onOpenChange={handleOpenChange}>
      <ContextMenuTrigger asChild disabled={disabled || dragging}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent
        aria-label={label}
        onCloseAutoFocus={onCloseAutoFocus}
        onEscapeKeyDown={onEscapeKeyDown}
      >
        {renderItems({
          surface: "context",
          isDrawer: false,
          drawerStep: null,
          onDrawerStepChange: () => {},
        })}
      </ContextMenuContent>
    </ContextMenu>
  );
}
