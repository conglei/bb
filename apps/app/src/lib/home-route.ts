import { useMemo } from "react";
import { getProjectViewRoutePath, getRootComposeRoutePath } from "@/lib/route-paths";
import { useSidebarNavigation } from "@/hooks/queries/sidebar-navigation-query";
import { useUiPreferences } from "@/hooks/queries/system-queries";
import { createSyncedPreferenceAtom } from "@/lib/ui-preferences/synced-preference-atom";

export const homeProjectIdAtom = createSyncedPreferenceAtom("home.projectId");

export interface HomeRoute {
  path: string;
  projectId: string | null;
  loaded: boolean;
}

export function resolveHomeRoute(args: {
  homeProjectId: string | null;
  projectIds: ReadonlySet<string> | null;
}): Pick<HomeRoute, "path" | "projectId"> {
  const { homeProjectId, projectIds } = args;
  if (homeProjectId === null || projectIds === null || !projectIds.has(homeProjectId)) {
    return { path: getRootComposeRoutePath(), projectId: null };
  }
  return { path: getProjectViewRoutePath(homeProjectId), projectId: homeProjectId };
}

export function useHomeRoute(): HomeRoute {
  const preferences = useUiPreferences();
  const navigation = useSidebarNavigation();
  const homeProjectId =
    preferences.data?.preferences["home.projectId"]?.value ?? null;
  const projectIds = useMemo(
    () =>
      navigation.data === undefined
        ? null
        : new Set(navigation.data.projects.map((project) => project.id)),
    [navigation.data],
  );
  const loaded =
    (preferences.data !== undefined || preferences.isError) &&
    (navigation.data !== undefined || navigation.isError);
  return useMemo(
    () => ({ ...resolveHomeRoute({ homeProjectId, projectIds }), loaded }),
    [homeProjectId, loaded, projectIds],
  );
}
