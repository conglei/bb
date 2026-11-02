import type {
  PluginBoundThreadAction,
  PluginThreadActionsInlineItem,
  PluginThreadActionTarget,
} from "@get-bb/plugin-sdk";
import { Fragment } from "react";
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@bb/shared-ui/context-menu";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@bb/shared-ui/dropdown-menu";
import { Icon } from "@bb/shared-ui/icon";
import { cn } from "@bb/shared-ui/lib/utils";
import {
  ActionMenuItem,
  ActionMenuSeparator,
} from "@bb/shared-ui/action-menu-items";
import {
  bindThreadAction,
  useDefaultRequestRename,
  useThreadActionEntries,
  useThreadBulkActionEntries,
} from "@/lib/thread-actions/thread-action-registry";

export type ThreadActionMenuSurface = "context" | "dropdown";

export interface ThreadActionMenuEntry {
  key: string;
  group: string;
  action: PluginBoundThreadAction;
}

const CHOICES_CONTENT_CLASS =
  "max-h-[min(24rem,calc(100vh-2rem))] min-w-44 overflow-y-auto";

export function groupThreadActionMenuEntries(
  entries: readonly ThreadActionMenuEntry[],
  inline: readonly ThreadActionMenuEntry[],
): ThreadActionMenuEntry[][] {
  const groups = new Map<string, ThreadActionMenuEntry[]>();
  for (const entry of [...entries, ...inline]) {
    const group = groups.get(entry.group);
    if (group === undefined) groups.set(entry.group, [entry]);
    else group.push(entry);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, group]) => group);
}

export function useThreadActionMenuGroups({
  thread,
  inline = [],
  requestRename,
}: {
  thread: PluginThreadActionTarget;
  inline?: readonly PluginThreadActionsInlineItem[];
  requestRename?: (threadId: string) => void;
}): ThreadActionMenuEntry[][] {
  const defaultRequestRename = useDefaultRequestRename();
  const rename = requestRename ?? defaultRequestRename;
  const entries = useThreadActionEntries(thread, { requestRename: rename });
  return groupThreadActionMenuEntries(
    entries,
    inline.map((item) => ({
      key: item.key,
      group: item.group,
      action: bindThreadAction(item.key, item.action, rename),
    })),
  );
}

export function useThreadBulkActionMenuGroups({
  threads,
  inline = [],
}: {
  threads: readonly PluginThreadActionTarget[];
  inline?: readonly PluginThreadActionsInlineItem[];
}): ThreadActionMenuEntry[][] {
  const rename = useDefaultRequestRename();
  const entries = useThreadBulkActionEntries(threads);
  return groupThreadActionMenuEntries(
    entries,
    inline.map((item) => ({
      key: item.key,
      group: item.group,
      action: bindThreadAction(item.key, item.action, rename),
    })),
  );
}

function ThreadActionChoiceRows({
  entry,
  surface,
  leadingCheck = false,
}: {
  entry: ThreadActionMenuEntry;
  surface: ThreadActionMenuSurface;
  leadingCheck?: boolean;
}) {
  const choices = entry.action.choices;
  if (choices === undefined) return null;
  const Item = surface === "context" ? ContextMenuItem : DropdownMenuItem;
  return choices.items.map((choice) => (
    <Item
      key={choice.id}
      aria-current={choice.selected ? "true" : undefined}
      className="flex items-center justify-between gap-3"
      disabled={choice.disabled}
      onSelect={() => {
        void entry.action.run(choice.id);
      }}
    >
      {leadingCheck ? (
        <span
          className="flex w-4 shrink-0 items-center justify-center"
          aria-hidden="true"
        >
          {choice.selected ? <Icon name="Check" /> : null}
        </span>
      ) : null}
      {choice.icon !== undefined ? (
        <Icon name={choice.icon} aria-hidden="true" />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{choice.label}</span>
      {choice.selected && !leadingCheck ? (
        <Icon name="Check" className="ml-auto" aria-hidden="true" />
      ) : null}
    </Item>
  ));
}

function ThreadActionChoicesHint({
  entry,
  surface,
}: {
  entry: ThreadActionMenuEntry;
  surface: ThreadActionMenuSurface;
}) {
  const hint = entry.action.choices?.hint;
  if (hint === undefined) return null;
  return (
    <>
      <ActionMenuSeparator surface={surface} />
      <div className="max-w-56 px-2 py-1 text-xs text-muted-foreground">
        {hint}
      </div>
    </>
  );
}

function ThreadActionLabel({ action }: { action: PluginBoundThreadAction }) {
  if (action.detail === undefined) return action.label;
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate">{action.label}</span>
      <span className="truncate text-2xs text-muted-foreground">
        {action.detail}
      </span>
    </span>
  );
}

function ThreadActionSubmenuLabel({
  action,
}: {
  action: PluginBoundThreadAction;
}) {
  return (
    <span className="min-w-0 flex-1 truncate">
      {action.label}
      {action.detail === undefined ? null : (
        <span className="sr-only">, {action.detail}</span>
      )}
    </span>
  );
}

function ThreadActionMenuRow({
  entry,
  surface,
  isDrawer,
  inlineSubmenus = false,
  expanded = false,
  onOpenDrawerStep,
}: {
  entry: ThreadActionMenuEntry;
  surface: ThreadActionMenuSurface;
  isDrawer: boolean;
  inlineSubmenus?: boolean;
  expanded?: boolean;
  onOpenDrawerStep: (key: string | null) => void;
}) {
  const { action } = entry;
  if (action.choices === undefined) {
    return (
      <ActionMenuItem
        surface={surface}
        icon={action.icon}
        variant={action.variant}
        disabled={action.disabled}
        onSelect={() => {
          void action.run();
        }}
      >
        <ThreadActionLabel action={action} />
      </ActionMenuItem>
    );
  }
  if (isDrawer && inlineSubmenus) {
    const hint = action.choices.hint;
    return (
      <>
        <DropdownMenuItem
          aria-expanded={expanded}
          disabled={action.disabled}
          onSelect={(event) => {
            event.preventDefault();
            onOpenDrawerStep(expanded ? null : entry.key);
          }}
        >
          <Icon name={action.icon} aria-hidden="true" />
          <ThreadActionSubmenuLabel action={action} />
          <Icon
            name="ChevronDown"
            className={cn(
              "order-last shrink-0 transition-transform",
              expanded && "rotate-180",
            )}
            aria-hidden="true"
          />
        </DropdownMenuItem>
        {expanded ? (
          <div role="group" className="bg-muted/40">
            <ThreadActionChoiceRows entry={entry} surface="dropdown" leadingCheck />
            {hint === undefined ? null : (
              <div className="px-4 pb-2.5 pt-1 text-xs text-muted-foreground">
                {hint}
              </div>
            )}
          </div>
        ) : null}
      </>
    );
  }
  if (isDrawer) {
    return (
      <DropdownMenuItem
        disabled={action.disabled}
        onSelect={(event) => {
          event.preventDefault();
          onOpenDrawerStep(entry.key);
        }}
      >
        <Icon name={action.icon} aria-hidden="true" />
        <ThreadActionSubmenuLabel action={action} />
        <Icon name="ChevronRight" className="ml-auto" aria-hidden="true" />
      </DropdownMenuItem>
    );
  }
  const Sub = surface === "context" ? ContextMenuSub : DropdownMenuSub;
  const SubTrigger =
    surface === "context" ? ContextMenuSubTrigger : DropdownMenuSubTrigger;
  const SubContent =
    surface === "context" ? ContextMenuSubContent : DropdownMenuSubContent;
  return (
    <Sub>
      <SubTrigger disabled={action.disabled}>
        <Icon name={action.icon} aria-hidden="true" />
        <ThreadActionSubmenuLabel action={action} />
      </SubTrigger>
      <SubContent className={CHOICES_CONTENT_CLASS}>
        <ThreadActionChoiceRows entry={entry} surface={surface} />
        <ThreadActionChoicesHint entry={entry} surface={surface} />
      </SubContent>
    </Sub>
  );
}

function ThreadActionDrawerStep({
  entry,
  onBack,
}: {
  entry: ThreadActionMenuEntry;
  onBack: () => void;
}) {
  return (
    <>
      <DropdownMenuItem
        onSelect={(event) => {
          event.preventDefault();
          onBack();
        }}
      >
        <Icon name="ChevronLeft" aria-hidden="true" />
        Back
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>
        {entry.action.choices?.heading ?? entry.action.label}
      </DropdownMenuLabel>
      <ThreadActionChoiceRows entry={entry} surface="dropdown" leadingCheck />
      <ThreadActionChoicesHint entry={entry} surface="dropdown" />
    </>
  );
}

export function ThreadActionMenuRows({
  groups,
  surface,
  isDrawer,
  inlineSubmenus = false,
  drawerStep,
  onDrawerStepChange,
}: {
  groups: readonly ThreadActionMenuEntry[][];
  surface: ThreadActionMenuSurface;
  isDrawer: boolean;
  inlineSubmenus?: boolean;
  drawerStep: string | null;
  onDrawerStepChange: (key: string | null) => void;
}) {
  const stepEntry =
    isDrawer && !inlineSubmenus && drawerStep !== null
      ? groups.flat().find((entry) => entry.key === drawerStep)
      : undefined;
  if (stepEntry !== undefined && stepEntry.action.choices !== undefined) {
    return (
      <ThreadActionDrawerStep
        entry={stepEntry}
        onBack={() => onDrawerStepChange(null)}
      />
    );
  }
  return groups.map((group, index) => (
    <Fragment key={group[0]?.group ?? index}>
      {index > 0 ? <ActionMenuSeparator surface={surface} /> : null}
      {group.map((entry) => (
        <ThreadActionMenuRow
          key={entry.key}
          entry={entry}
          surface={surface}
          isDrawer={isDrawer}
          inlineSubmenus={inlineSubmenus}
          expanded={inlineSubmenus && drawerStep === entry.key}
          onOpenDrawerStep={onDrawerStepChange}
        />
      ))}
    </Fragment>
  ));
}

export interface LongPressMenuArrangement {
  primary: ThreadActionMenuEntry[][];
  destructive: ThreadActionMenuEntry[];
  hidden: number;
}

function isDestructive(entry: ThreadActionMenuEntry): boolean {
  return entry.action.variant === "destructive";
}

export function arrangeLongPressMenuGroups(
  groups: readonly ThreadActionMenuEntry[][],
  { quickKeys, showAll }: { quickKeys: ReadonlySet<string>; showAll: boolean },
): LongPressMenuArrangement {
  const entries = groups.flat();
  const destructive = entries.filter(isDestructive);
  if (showAll) {
    return {
      primary: groups
        .map((group) => group.filter((entry) => !isDestructive(entry)))
        .filter((group) => group.length > 0),
      destructive,
      hidden: 0,
    };
  }
  const quick = entries.filter(
    (entry) => quickKeys.has(entry.key) && !isDestructive(entry),
  );
  return {
    primary: quick.length > 0 ? [quick] : [],
    destructive,
    hidden: entries.length - quick.length - destructive.length,
  };
}

export function LongPressThreadActionMenuRows({
  groups,
  quickKeys,
  showAll,
  onShowAll,
  drawerStep,
  onDrawerStepChange,
}: {
  groups: readonly ThreadActionMenuEntry[][];
  quickKeys: ReadonlySet<string>;
  showAll: boolean;
  onShowAll: () => void;
  drawerStep: string | null;
  onDrawerStepChange: (key: string | null) => void;
}) {
  const { primary, destructive, hidden } = arrangeLongPressMenuGroups(groups, {
    quickKeys,
    showAll,
  });
  const rows = (rowGroups: readonly ThreadActionMenuEntry[][]) => (
    <ThreadActionMenuRows
      groups={rowGroups}
      surface="dropdown"
      isDrawer
      inlineSubmenus
      drawerStep={drawerStep}
      onDrawerStepChange={onDrawerStepChange}
    />
  );
  return (
    <>
      {rows(primary)}
      {hidden > 0 ? (
        <>
          {primary.length > 0 ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              onShowAll();
            }}
          >
            <Icon name="MoreHorizontal" aria-hidden="true" />
            More…
          </DropdownMenuItem>
        </>
      ) : null}
      {destructive.length > 0 ? (
        <>
          {primary.length > 0 || hidden > 0 ? <DropdownMenuSeparator /> : null}
          {rows([destructive])}
        </>
      ) : null}
    </>
  );
}
