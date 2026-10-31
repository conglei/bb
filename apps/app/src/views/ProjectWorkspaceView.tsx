import { Icon } from "@bb/shared-ui/icon";
import { EmptyStatePanel } from "@bb/shared-ui/empty-state";
import { useIsCompactViewport } from "@bb/shared-ui/hooks/use-compact-viewport";
import { cn } from "@bb/shared-ui/lib/utils";
import { Link } from "react-router-dom";
import { PluginItemIcon } from "@/components/plugin/PluginIcon";
import { PluginSlotMount } from "@/components/plugin/PluginSlotMount";
import { PageShell } from "@/components/ui/page-shell";
import { useSidebarNavigation } from "@/hooks/queries/sidebar-navigation-query";
import { usePluginFrontendsSettled } from "@/lib/plugin-frontend-boot-state";
import {
  usePluginSlots,
  type ExperimentalProjectViewSlot,
} from "@/lib/plugin-slots";
import {
  CORE_PROJECT_VIEW_PLUGIN_ID,
  getProjectViewKey,
  getProjectViewRoutePath,
} from "@/lib/route-paths";

interface ProjectWorkspaceViewProps {
  projectId: string;
  viewKey: string;
}

export function projectViewKeyOf(view: ExperimentalProjectViewSlot): string {
  return getProjectViewKey(view.pluginId, view.id);
}

function ProjectViewTabs({
  projectId,
  views,
  activeViewKey,
}: {
  projectId: string;
  views: readonly ExperimentalProjectViewSlot[];
  activeViewKey: string;
}) {
  return (
    <nav
      aria-label="Project views"
      className="-mx-4 overflow-x-auto px-4 md:-mx-5 md:px-5 [scrollbar-width:none]"
    >
      <ul role="tablist" className="flex min-w-max gap-1 border-b border-border">
        {views.map((view) => {
          const key = projectViewKeyOf(view);
          const isActive = key === activeViewKey;
          return (
            <li key={key} role="presentation">
              <Link
                role="tab"
                aria-selected={isActive}
                to={getProjectViewRoutePath(projectId, key)}
                replace
                className={cn(
                  "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
                  isActive
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {view.pluginId === CORE_PROJECT_VIEW_PLUGIN_ID ? (
                  <Icon name={view.icon} className="size-3.5 shrink-0" />
                ) : (
                  <PluginItemIcon
                    pluginId={view.pluginId}
                    icon={view.icon}
                    className="size-3.5 shrink-0"
                  />
                )}
                {view.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function ProjectWorkspaceView({
  projectId,
  viewKey,
}: ProjectWorkspaceViewProps) {
  const { projectViews } = usePluginSlots();
  const pluginsSettled = usePluginFrontendsSettled();
  const isCompactViewport = useIsCompactViewport();
  const sidebarNavigationQuery = useSidebarNavigation();
  const project = sidebarNavigationQuery.data?.projects.find(
    (candidate) => candidate.id === projectId,
  );
  const view =
    projectViews.find((candidate) => projectViewKeyOf(candidate) === viewKey) ??
    null;

  return (
    <PageShell contentClassName="pt-4 md:pt-5">
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <Icon
            name="FolderGit"
            className="size-4 shrink-0 text-muted-foreground"
          />
          <h1
            className="min-w-0 truncate text-sm font-semibold text-foreground"
            data-testid="project-workspace-title"
          >
            {project?.name ??
              (sidebarNavigationQuery.data === undefined ? "" : "Project")}
          </h1>
        </div>
        <ProjectViewTabs
          projectId={projectId}
          views={projectViews}
          activeViewKey={viewKey}
        />
        {view === null ? (
          pluginsSettled ? (
            <EmptyStatePanel
              className="rounded-lg p-6 text-sm"
              data-testid="project-view-unavailable"
            >
              This project view is not available. The plugin may have been
              disabled or removed.
            </EmptyStatePanel>
          ) : null
        ) : (
          <div
            className="flex min-h-0 flex-1 flex-col"
            data-testid="project-view-body"
          >
            <PluginSlotMount
              key={`${view.pluginId}/${view.id}/${view.generation}`}
              pluginId={view.pluginId}
              slotKind="projectView"
              slotId={view.id}
            >
              <view.component
                projectId={projectId}
                isCompactViewport={isCompactViewport}
              />
            </PluginSlotMount>
          </div>
        )}
      </div>
    </PageShell>
  );
}
