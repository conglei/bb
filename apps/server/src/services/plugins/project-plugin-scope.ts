import {
  deleteProjectPluginState,
  deleteProjectPluginStatesForPlugin,
  listProjectPluginStates,
  upsertProjectPluginState,
  type DbConnection,
  type DbNotifier,
} from "@bb/db";
import type { PluginProjectDefault } from "@bb/domain";
import type { ProjectPluginEntry } from "@bb/server-contract";

export interface ProjectScopedPlugin {
  pluginId: string;
  name: string;
  icon: string | null;
  projectDefault: PluginProjectDefault;
}

export interface ProjectPluginScopeSource {
  listProjectScopedPlugins(): ProjectScopedPlugin[];
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

function resolveEnabled(
  overrides: ReadonlyMap<string, boolean>,
  defaults: ReadonlyMap<string, PluginProjectDefault>,
  pluginId: string,
): boolean {
  const override = overrides.get(pluginId);
  if (override !== undefined) return override;
  return (defaults.get(pluginId) ?? "on") === "on";
}

export function projectPluginFilter(
  db: DbConnection,
  projectId: string,
): (pluginId: string) => boolean {
  const overrides = overridesFor(db, projectId);
  const defaults = manifestDefaults();
  return (pluginId) => resolveEnabled(overrides, defaults, pluginId);
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
      return {
        pluginId: plugin.pluginId,
        name: plugin.name,
        icon: plugin.icon,
        enabled: override ?? plugin.projectDefault === "on",
        source: override === undefined ? "default" : "project",
      };
    });
}

export function isProjectScopedPluginKnown(pluginId: string): boolean {
  return (source?.listProjectScopedPlugins() ?? []).some(
    (plugin) => plugin.pluginId === pluginId,
  );
}

export function setProjectPluginEnabled(
  db: DbConnection,
  notifier: DbNotifier,
  args: { projectId: string; pluginId: string; enabled: boolean | null },
): void {
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
