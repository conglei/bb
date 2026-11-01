import {
  deleteProjectPluginState,
  deleteProjectPluginStatesForPlugin,
  getPluginOwnedProject,
  getProject,
  setProjectOwner,
  listProjectPluginStates,
  listProjectSourcesByProjectIds,
  upsertProjectPluginState,
  type DbConnection,
  type DbNotifier,
} from "@bb/db";
import type { PluginProjectDefault, PluginProjectScope } from "@bb/domain";
import type { ProjectPluginEntry } from "@bb/server-contract";

export interface ProjectScopedPlugin {
  pluginId: string;
  name: string;
  icon: string | null;
  projectDefault: PluginProjectDefault;
  projectScope: PluginProjectScope;
  hasProjectSettings: boolean;
}

export interface PluginOwnerChange {
  pluginId: string;
  previousOwnerProjectId: string | null;
  ownerProjectId: string | null;
}

export interface ProjectPluginScopeSource {
  listProjectScopedPlugins(): ProjectScopedPlugin[];
  projectOwnerChanged?(change: PluginOwnerChange): void;
}

export interface PluginOwnerProject {
  projectId: string;
  name: string;
  localPaths: string[];
}

let source: ProjectPluginScopeSource | undefined;

export function setProjectPluginScopeSource(
  next: ProjectPluginScopeSource | undefined,
): void {
  source = next;
}

const overridesByProjectId = new Map<string, Map<string, boolean>>();

export function clearProjectPluginScopeCache(projectId?: string): void {
  if (projectId === undefined) {
    overridesByProjectId.clear();
  } else {
    overridesByProjectId.delete(projectId);
  }
}

function overridesFor(
  db: DbConnection,
  projectId: string,
): ReadonlyMap<string, boolean> {
  const cached = overridesByProjectId.get(projectId);
  if (cached !== undefined) return cached;
  const loaded = new Map<string, boolean>();
  for (const row of listProjectPluginStates(db, { projectId })) {
    loaded.set(row.pluginId, row.enabled);
  }
  overridesByProjectId.set(projectId, loaded);
  return loaded;
}

function manifestDefaults(): ReadonlyMap<string, PluginProjectDefault> {
  const defaults = new Map<string, PluginProjectDefault>();
  for (const plugin of source?.listProjectScopedPlugins() ?? []) {
    defaults.set(plugin.pluginId, plugin.projectDefault);
  }
  return defaults;
}

function findScopedPlugin(pluginId: string): ProjectScopedPlugin | undefined {
  return (source?.listProjectScopedPlugins() ?? []).find(
    (plugin) => plugin.pluginId === pluginId,
  );
}

function resolveEnabled(
  overrides: ReadonlyMap<string, boolean>,
  defaults: ReadonlyMap<string, PluginProjectDefault>,
  pluginId: string,
): boolean {
  const override = overrides.get(pluginId);
  if (override !== undefined) return override;
  return (defaults.get(pluginId) ?? "on") === "on";
}

function ownerPluginIdOf(db: DbConnection, projectId: string): string | null {
  return getProject(db, projectId)?.ownerPluginId ?? null;
}

export function projectPluginFilter(
  db: DbConnection,
  projectId: string,
): (pluginId: string) => boolean {
  const overrides = overridesFor(db, projectId);
  const defaults = manifestDefaults();
  const ownerPluginId = ownerPluginIdOf(db, projectId);
  return (pluginId) =>
    pluginId === ownerPluginId || resolveEnabled(overrides, defaults, pluginId);
}

export function isPluginEnabledForProject(
  db: DbConnection,
  args: { pluginId: string; projectId: string },
): boolean {
  return projectPluginFilter(db, args.projectId)(args.pluginId);
}

export function enabledPluginIdsForProject(
  db: DbConnection,
  projectId: string,
): ReadonlySet<string> {
  const isEnabled = projectPluginFilter(db, projectId);
  return new Set(
    (source?.listProjectScopedPlugins() ?? [])
      .map((plugin) => plugin.pluginId)
      .filter(isEnabled),
  );
}

export function withDisabledPluginSkillSelections(args: {
  isEnabled: (pluginId: string) => boolean;
  pluginIds: Iterable<string>;
  base?: ReadonlyMap<string, ReadonlySet<string>>;
}): Map<string, ReadonlySet<string>> {
  const selections = new Map<string, ReadonlySet<string>>(args.base ?? []);
  for (const pluginId of args.pluginIds) {
    if (!args.isEnabled(pluginId)) {
      selections.set(pluginId, new Set());
    }
  }
  return selections;
}

export function getPluginOwnerProjectId(
  db: DbConnection,
  pluginId: string,
): string | null {
  return getPluginOwnedProject(db, pluginId)?.id ?? null;
}

export function setPluginWorkspaceOwner(
  db: DbConnection,
  notifier: DbNotifier,
  args: { pluginId: string; projectId: string | null },
): string | null {
  const previousOwnerProjectId =
    getPluginOwnedProject(db, args.pluginId)?.id ?? null;
  const touchedProjectIds = new Set<string>();
  if (
    previousOwnerProjectId !== null &&
    previousOwnerProjectId !== args.projectId
  ) {
    setProjectOwner(db, notifier, {
      projectId: previousOwnerProjectId,
      owner: { kind: "user" },
    });
    touchedProjectIds.add(previousOwnerProjectId);
  }
  let ownerProjectId: string | null = null;
  if (args.projectId !== null) {
    const adopted = setProjectOwner(db, notifier, {
      projectId: args.projectId,
      owner: { kind: "plugin", pluginId: args.pluginId },
    });
    ownerProjectId = adopted?.id ?? null;
    if (ownerProjectId !== null) touchedProjectIds.add(ownerProjectId);
  }
  for (const projectId of touchedProjectIds) {
    clearProjectPluginScopeCache(projectId);
    notifier.notifyProject(projectId, ["project-plugins-changed"]);
  }
  if (ownerProjectId !== previousOwnerProjectId) {
    source?.projectOwnerChanged?.({
      pluginId: args.pluginId,
      previousOwnerProjectId,
      ownerProjectId,
    });
  }
  return ownerProjectId;
}

export function resolvePluginOwnerProject(
  db: DbConnection,
  args: { pluginId: string; localHostId: string | null },
): PluginOwnerProject | null {
  const ownerProjectId = getPluginOwnerProjectId(db, args.pluginId);
  if (ownerProjectId === null) return null;
  return describeOwnerProject(db, {
    projectId: ownerProjectId,
    localHostId: args.localHostId,
  });
}

export function describeOwnerProject(
  db: DbConnection,
  args: { projectId: string; localHostId: string | null },
): PluginOwnerProject | null {
  const project = getProject(db, args.projectId);
  if (project === null || project.deletedAt !== null) return null;
  const localPaths =
    args.localHostId === null
      ? []
      : listProjectSourcesByProjectIds(db, [project.id])
          .filter(
            (projectSource) =>
              projectSource.type === "local_path" &&
              projectSource.hostId === args.localHostId,
          )
          .map((projectSource) => projectSource.path);
  return { projectId: project.id, name: project.name, localPaths };
}

export function listProjectPlugins(
  db: DbConnection,
  projectId: string,
): ProjectPluginEntry[] {
  const overrides = overridesFor(db, projectId);
  const plugins = source?.listProjectScopedPlugins() ?? [];
  return plugins
    .slice()
    .sort((a, b) => a.pluginId.localeCompare(b.pluginId))
    .map((plugin) => {
      const override = overrides.get(plugin.pluginId);
      const ownerProjectId = getPluginOwnerProjectId(db, plugin.pluginId);
      return {
        pluginId: plugin.pluginId,
        name: plugin.name,
        icon: plugin.icon,
        enabled:
          ownerProjectId === projectId ||
          (override ?? plugin.projectDefault === "on"),
        source: override === undefined ? "default" : "project",
        hasProjectSettings: plugin.hasProjectSettings,
        scope: plugin.projectScope,
        ownerProjectId,
        ownerProjectName:
          ownerProjectId === null
            ? null
            : (getProject(db, ownerProjectId)?.name ?? null),
      };
    });
}

export function isProjectScopedPluginKnown(pluginId: string): boolean {
  return findScopedPlugin(pluginId) !== undefined;
}

export function setProjectPluginEnabled(
  db: DbConnection,
  notifier: DbNotifier,
  args: { projectId: string; pluginId: string; enabled: boolean | null },
): void {
  if (ownerPluginIdOf(db, args.projectId) === args.pluginId) {
    deleteProjectPluginState(db, {
      projectId: args.projectId,
      pluginId: args.pluginId,
    });
    clearProjectPluginScopeCache(args.projectId);
    return;
  }
  if (args.enabled === null) {
    deleteProjectPluginState(db, {
      projectId: args.projectId,
      pluginId: args.pluginId,
    });
  } else {
    upsertProjectPluginState(db, {
      projectId: args.projectId,
      pluginId: args.pluginId,
      enabled: args.enabled,
    });
  }
  clearProjectPluginScopeCache(args.projectId);
  notifier.notifyProject(args.projectId, ["project-plugins-changed"]);
}

export function forgetPluginProjectStates(
  db: DbConnection,
  pluginId: string,
): void {
  deleteProjectPluginStatesForPlugin(db, { pluginId });
  clearProjectPluginScopeCache();
}
