import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createProject,
  noopNotifier,
  upsertHost,
  upsertProjectPluginState,
  type DbNotifier,
} from "@bb/db";
import { createMigratedConnection } from "@bb/db/testing";
import {
  clearProjectPluginScopeCache,
  enabledPluginIdsForProject,
  forgetPluginProjectStates,
  isPluginEnabledForProject,
  isProjectScopedPluginKnown,
  listProjectPlugins,
  projectPluginFilter,
  setProjectPluginEnabled,
  setProjectPluginScopeSource,
  withDisabledPluginSkillSelections,
  type ProjectScopedPlugin,
} from "../../../src/services/plugins/project-plugin-scope.js";

const PLUGINS: ProjectScopedPlugin[] = [
  {
    pluginId: "git",
    name: "Git",
    icon: "GitBranch",
    projectDefault: "on",
    hasProjectSettings: false,
  },
  {
    pluginId: "kept",
    name: "Kept",
    icon: null,
    projectDefault: "off",
    hasProjectSettings: true,
  },
];

function setup() {
  const db = createMigratedConnection();
  const host = upsertHost(db, noopNotifier, { name: "scope-host" });
  const { project } = createProject(db, noopNotifier, {
    name: "scope-project",
    source: { type: "local_path", hostId: host.id, path: "/tmp/scope" },
  });
  setProjectPluginScopeSource({ listProjectScopedPlugins: () => PLUGINS });
  const notifyProject = vi.fn();
  const notifier: DbNotifier = { ...noopNotifier, notifyProject };
  return { db, project, notifier, notifyProject };
}

afterEach(() => {
  setProjectPluginScopeSource(undefined);
  clearProjectPluginScopeCache();
});

describe("project plugin scope", () => {
  it("falls back to the manifest default when a project has no override", () => {
    const { db, project } = setup();
    const isEnabled = projectPluginFilter(db, project.id);

    expect(isEnabled("git")).toBe(true);
    expect(isEnabled("kept")).toBe(false);
    expect(isEnabled("unknown-plugin")).toBe(true);
    expect([...enabledPluginIdsForProject(db, project.id)]).toEqual(["git"]);
    expect(listProjectPlugins(db, project.id)).toEqual([
      {
        pluginId: "git",
        name: "Git",
        icon: "GitBranch",
        enabled: true,
        source: "default",
        hasProjectSettings: false,
      },
      {
        pluginId: "kept",
        name: "Kept",
        icon: null,
        enabled: false,
        source: "default",
        hasProjectSettings: true,
      },
    ]);
  });

  it("treats every plugin as on when no source is registered", () => {
    const { db, project } = setup();
    setProjectPluginScopeSource(undefined);

    expect(
      isPluginEnabledForProject(db, {
        pluginId: "kept",
        projectId: project.id,
      }),
    ).toBe(true);
    expect(listProjectPlugins(db, project.id)).toEqual([]);
    expect(isProjectScopedPluginKnown("kept")).toBe(false);
  });

  it("applies a project override over the manifest default and notifies the project", () => {
    const { db, project, notifier, notifyProject } = setup();

    setProjectPluginEnabled(db, notifier, {
      projectId: project.id,
      pluginId: "kept",
      enabled: true,
    });
    setProjectPluginEnabled(db, notifier, {
      projectId: project.id,
      pluginId: "git",
      enabled: false,
    });

    expect(listProjectPlugins(db, project.id)).toEqual([
      expect.objectContaining({
        pluginId: "git",
        enabled: false,
        source: "project",
      }),
      expect.objectContaining({
        pluginId: "kept",
        enabled: true,
        source: "project",
      }),
    ]);
    expect(notifyProject).toHaveBeenCalledTimes(2);
    expect(notifyProject).toHaveBeenCalledWith(project.id, [
      "project-plugins-changed",
    ]);

    setProjectPluginEnabled(db, notifier, {
      projectId: project.id,
      pluginId: "kept",
      enabled: null,
    });
    expect(listProjectPlugins(db, project.id)[1]).toEqual(
      expect.objectContaining({
        pluginId: "kept",
        enabled: false,
        source: "default",
      }),
    );
  });

  it("serves cached overrides until a scope write clears them", () => {
    const { db, project, notifier } = setup();
    expect(
      isPluginEnabledForProject(db, {
        pluginId: "kept",
        projectId: project.id,
      }),
    ).toBe(false);

    upsertProjectPluginState(db, {
      projectId: project.id,
      pluginId: "kept",
      enabled: true,
    });
    expect(
      isPluginEnabledForProject(db, {
        pluginId: "kept",
        projectId: project.id,
      }),
    ).toBe(false);

    clearProjectPluginScopeCache(project.id);
    expect(
      isPluginEnabledForProject(db, {
        pluginId: "kept",
        projectId: project.id,
      }),
    ).toBe(true);

    setProjectPluginEnabled(db, notifier, {
      projectId: project.id,
      pluginId: "kept",
      enabled: false,
    });
    expect(
      isPluginEnabledForProject(db, {
        pluginId: "kept",
        projectId: project.id,
      }),
    ).toBe(false);
  });

  it("forgets a removed plugin's overrides in every project", () => {
    const { db, project, notifier } = setup();
    setProjectPluginEnabled(db, notifier, {
      projectId: project.id,
      pluginId: "kept",
      enabled: true,
    });

    forgetPluginProjectStates(db, "kept");

    expect(
      isPluginEnabledForProject(db, {
        pluginId: "kept",
        projectId: project.id,
      }),
    ).toBe(false);
    expect(listProjectPlugins(db, project.id)[1]?.source).toBe("default");
  });

  it("builds empty skill selections for disabled plugins only", () => {
    const { db, project } = setup();
    const selections = withDisabledPluginSkillSelections({
      isEnabled: projectPluginFilter(db, project.id),
      pluginIds: ["git", "kept"],
      base: new Map([["git", new Set(["review"])]]),
    });

    expect(selections.get("git")).toEqual(new Set(["review"]));
    expect(selections.get("kept")).toEqual(new Set());
  });
});
