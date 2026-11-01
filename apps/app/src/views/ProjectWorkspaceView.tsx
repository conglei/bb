import { Icon } from "@bb/shared-ui/icon";
import { EmptyStatePanel } from "@bb/shared-ui/empty-state";
import { useIsCompactViewport } from "@bb/shared-ui/hooks/use-compact-viewport";
import { cn } from "@bb/shared-ui/lib/utils";
import { Link } from "react-router-dom";
import { PluginItemIcon } from "@/components/plugin/PluginIcon";
import { PluginSlotMount } from "@/components/plugin/PluginSlotMount";
import { PageShell } from "@/components/ui/page-shell";
import { useProjectPlugins } from "@/hooks/queries/project-plugins-query";
import { usePluginFrontendsSettled } from "@/lib/plugin-frontend-boot-state";
import {
  usePluginSlots,
  type ExperimentalProjectViewSlot,
} from "@/lib/plugin-slots";
import {
  CORE_PROJECT_VIEW_PLUGIN_ID,
  DEFAULT_PROJECT_VIEW_KEY,
  getProjectViewKey,
  getProjectViewRoutePath,
} from "@/lib/route-paths";

interface ProjectWorkspaceViewProps {
  projectId: string;
  viewKey: string | null;
}

export function projectViewKeyOf(view: ExperimentalProjectViewSlot): string {
  return getProjectViewKey(view.pluginId, view.id);
}

export function defaultProjectViewKey(
  views: readonly ExperimentalProjectViewSlot[],
): string {
  const claimed = views.find((view) => view.experimental_default === true);
  return claimed === undefined
    ? DEFAULT_PROJECT_VIEW_KEY
    : projectViewKeyOf(claimed);
}

function ProjectViewTabs({
  projectId,
  views,
  activeViewKey,
}: {
  projectId: string;
  views: readonly ExperimentalProjectViewSlot[];
  activeViewKey: string | null;
}) {
  return (
    <nav
      aria-label="Project views"
      className="-mx-4 overflow-x-auto px-4 md:-mx-5 md:px-5 [scrollbar-width:none]"
    >
      <ul
        role="tablist"
        className="flex min-w-max gap-1 border-b border-border"
      >
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

export function selectProjectViews(
  views: readonly ExperimentalProjectViewSlot[],
  plugins: {
    data: readonly { pluginId: string; enabled: boolean }[] | undefined;
    isError: boolean;
  },
): { views: readonly ExperimentalProjectViewSlot[]; settled: boolean } {
  if (plugins.data === undefined) {
    return {
      views: plugins.isError
        ? views
        : views.filter((view) => view.pluginId === CORE_PROJECT_VIEW_PLUGIN_ID),
      settled: plugins.isError,
    };
  }
  const enabled = new Set(
    plugins.data
      .filter((plugin) => plugin.enabled)
      .map((plugin) => plugin.pluginId),
  );
  return {
    views: views.filter(
      (view) =>
        view.pluginId === CORE_PROJECT_VIEW_PLUGIN_ID ||
        enabled.has(view.pluginId),
    ),
    settled: true,
  };
}

export function ProjectWorkspaceView({
  projectId,
  viewKey,
}: ProjectWorkspaceViewProps) {
  const { projectViews: registeredViews } = usePluginSlots();
  const pluginsSettled = usePluginFrontendsSettled();
  const isCompactViewport = useIsCompactViewport();
  const projectPluginsQuery = useProjectPlugins({ projectId });
  const { views: projectViews, settled: projectPluginsSettled } =
    selectProjectViews(registeredViews, projectPluginsQuery);
  const settled = pluginsSettled && projectPluginsSettled;
  const activeViewKey =
    viewKey ?? (settled ? defaultProjectViewKey(projectViews) : null);
  const view =
    activeViewKey === null
      ? null
      : (projectViews.find(
          (candidate) => projectViewKeyOf(candidate) === activeViewKey,
        ) ?? null);

  return (
    <div className="-mx-4 -mt-4 flex min-h-0 flex-1 flex-col md:-mx-5 md:-mt-5">
      <div className="mx-auto w-full max-w-[760px] shrink-0 px-4 pt-2">
        <ProjectViewTabs
          projectId={projectId}
          views={projectViews}
          activeViewKey={activeViewKey}
        />
      </div>
      <PageShell
        shellClassName="mx-0 mt-0 md:mx-0 md:mt-0"
        contentClassName="pt-4 md:pt-5"
      >
        {view === null ? (
          settled ? (
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
      </PageShell>
    </div>
  );
}
