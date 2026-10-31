import { useQuery } from "@tanstack/react-query";
import type { ProjectPluginEntry } from "@bb/server-contract";
import { sdk } from "@/lib/sdk";
import { useProjectDetailRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { requireProjectId, type QueryOptions } from "./query-helpers";
import { projectPluginsQueryKey } from "./query-keys";

interface UseProjectPluginsArgs {
  projectId: string | undefined;
}

export function useProjectPlugins(
  args: UseProjectPluginsArgs,
  options?: QueryOptions,
) {
  const { projectId } = args;
  const enabled = (options?.enabled ?? true) && Boolean(projectId);
  useProjectDetailRealtimeSubscription(projectId, { enabled });

  return useQuery<ProjectPluginEntry[]>({
    queryKey: projectPluginsQueryKey(projectId ?? ""),
    queryFn: ({ signal }) =>
      sdk.projects.plugins.list({
        projectId: requireProjectId(projectId, "useProjectPlugins"),
        signal,
      }),
    enabled,
    staleTime: 10_000,
    placeholderData: (previousData) => (projectId ? previousData : undefined),
  });
}
