import { Icon } from "@bb/shared-ui/icon";
import { cn } from "@bb/shared-ui/lib/utils";

export const DEFAULT_PROJECT_ICON = "FolderGit";

export function ProjectIcon({
  icon,
  className,
}: {
  icon: string | null | undefined;
  className?: string;
}) {
  return (
    <Icon
      name={icon ?? DEFAULT_PROJECT_ICON}
      fallback={DEFAULT_PROJECT_ICON}
      className={cn("size-4 shrink-0", className)}
    />
  );
}
