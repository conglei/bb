import { Icon } from "@bb/shared-ui/icon";
import { Button } from "@bb/shared-ui/button";
import { EmptyStatePanel } from "@bb/shared-ui/empty-state";
import type { ExperimentalProjectViewProps } from "@get-bb/plugin-sdk";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSidebarNavigation } from "@/hooks/queries/sidebar-navigation-query";
import {
  collectPluginAppRegistrations,
  definePluginApp,
} from "@/lib/plugin-app-definition";
import { formatRelativeTime } from "@/lib/relative-time";
import {
  useRootComposePlacement,
  useSetRootComposeProjectId,
} from "@/lib/root-compose-selection";
import {
  CORE_PROJECT_VIEW_PLUGIN_ID,
  getRootComposeRoutePath,
  getThreadRoutePath,
} from "@/lib/route-paths";
import { DEFAULT_THREAD_CREATION_PLACEMENT } from "@/lib/thread-creation-placement";
import { getThreadDisplayTitle } from "@/lib/thread-title";

export const CORE_THREADS_PROJECT_VIEW_ID = "threads";

export function ProjectThreadsView({ projectId }: ExperimentalProjectViewProps) {
  const navigate = useNavigate();
  const setRootComposeProjectId = useSetRootComposeProjectId();
  const [, setPlacement] = useRootComposePlacement();
  const sidebarNavigationQuery = useSidebarNavigation();
  const project = sidebarNavigationQuery.data?.projects.find(
    (candidate) => candidate.id === projectId,
  );
  const now = Date.now();
  const threads = useMemo(
    () =>
      [...(project?.threads ?? [])].sort(
        (left, right) => right.updatedAt - left.updatedAt,
      ),
    [project?.threads],
  );
  const startThread = () => {
    setRootComposeProjectId(projectId);
    setPlacement(DEFAULT_THREAD_CREATION_PLACEMENT);
    void navigate(getRootComposeRoutePath(), {
      state: { focusPrompt: true },
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {sidebarNavigationQuery.data === undefined
            ? "Loading threads"
            : threads.length === 0
              ? "No threads yet"
              : `${threads.length} ${threads.length === 1 ? "thread" : "threads"}`}
        </p>
        <Button type="button" size="sm" onClick={startThread}>
          <Icon name="Plus" className="size-3.5" />
          New thread
        </Button>
      </div>
      {sidebarNavigationQuery.data !== undefined && threads.length === 0 ? (
        <EmptyStatePanel className="rounded-lg p-6">
          Threads started in this project appear here.
        </EmptyStatePanel>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {threads.map((thread) => (
            <li key={thread.id}>
              <Link
                to={getThreadRoutePath({ projectId, threadId: thread.id })}
                className="flex min-w-0 items-center justify-between gap-3 px-3 py-2 text-sm transition-colors hover:bg-state-hover"
              >
                <span className="min-w-0 truncate text-foreground">
                  {getThreadDisplayTitle(thread)}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatRelativeTime({ timestamp: thread.updatedAt, now })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const coreProjectViews = collectPluginAppRegistrations(
  definePluginApp((app) => {
    app.slots.experimental_projectView({
      id: CORE_THREADS_PROJECT_VIEW_ID,
      title: "Threads",
      icon: "LayoutList",
      component: ProjectThreadsView,
    });
  }),
).projectViews.map((slot) => ({
  ...slot,
  pluginId: CORE_PROJECT_VIEW_PLUGIN_ID,
  generation: 0,
}));
