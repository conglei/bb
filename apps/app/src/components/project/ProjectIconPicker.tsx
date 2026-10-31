import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@bb/shared-ui/command";
import { ICON_NAMES, Icon, preloadExtendedIcons } from "@bb/shared-ui/icon";
import { cn } from "@bb/shared-ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@bb/shared-ui/popover";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useUpdateProject } from "@/hooks/mutations/project-mutations";
import { DEFAULT_PROJECT_ICON, ProjectIcon } from "./ProjectIcon";

export const PROJECT_ICON_PICKER_TRIGGER_LABEL = "Change project icon";

const ICON_CHOICES: readonly string[] = [...ICON_NAMES].sort((left, right) =>
  left.localeCompare(right),
);

export function filterProjectIconChoices(
  query: string,
  choices: readonly string[] = ICON_CHOICES,
): readonly string[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return choices;
  return choices.filter((name) => name.toLowerCase().includes(needle));
}

export function ProjectIconPicker({
  projectId,
  icon,
  children,
  triggerClassName,
}: {
  projectId: string;
  icon: string | null;
  children?: ReactNode;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const updateProject = useUpdateProject();
  const choices = useMemo(() => filterProjectIconChoices(query), [query]);

  useEffect(() => {
    if (open) void preloadExtendedIcons().catch(() => undefined);
  }, [open]);

  const choose = (next: string | null) => {
    setOpen(false);
    if (next === icon) return;
    updateProject.mutate({ id: projectId, icon: next });
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={PROJECT_ICON_PICKER_TRIGGER_LABEL}
          data-testid="project-icon-picker-trigger"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            triggerClassName,
          )}
        >
          {children ?? <ProjectIcon icon={icon} />}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        aria-label="Project icon"
        mobileTitle="Project icon"
        className="flex max-h-[min(var(--radix-popover-content-available-height),calc(100dvh-0.5rem))] w-72 flex-col overflow-hidden p-0 max-md:min-h-0 max-md:w-full max-md:flex-1"
      >
        <Command shouldFilter={false} className="min-h-0">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search icons"
            className="h-8 text-xs"
          />
          <CommandList className="min-h-0 max-h-none flex-1 overscroll-contain p-2">
            <CommandItem
              value="__none"
              onSelect={() => choose(null)}
              data-testid="project-icon-none"
              className={cn(
                "mb-2 flex items-center gap-2 text-xs",
                icon === null && "bg-state-hover",
              )}
            >
              <Icon
                name={DEFAULT_PROJECT_ICON}
                className="size-4 text-muted-foreground"
              />
              No icon
            </CommandItem>
            {choices.length === 0 ? (
              <CommandEmpty>No icons match.</CommandEmpty>
            ) : (
              <div role="group" className="grid grid-cols-8 gap-1">
                {choices.map((name) => (
                  <CommandItem
                    key={name}
                    value={name}
                    title={name}
                    aria-label={name}
                    onSelect={() => choose(name)}
                    className={cn(
                      "flex size-7 items-center justify-center p-0",
                      name === icon &&
                        "bg-state-hover ring-1 ring-ring ring-inset",
                    )}
                  >
                    <Icon name={name} className="size-4" />
                  </CommandItem>
                ))}
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
