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
  getPluginOwnerProjectId,
  isPluginEnabledForProject,
  isProjectScopedPluginKnown,
  listProjectPlugins,
  projectPluginFilter,
  resolvePluginOwnerProject,
  setProjectPluginEnabled,
  setProjectPluginScopeSource,
  withDisabledPluginSkillSelections,
  type PluginOwnerChange,
  type ProjectScopedPlugin,
} from "../../../src/services/plugins/project-plugin-scope.js";

const PLUGINS: ProjectScopedPlugin[] = [
  {
    pluginId: "git",
    name: "Git",
    icon: "GitBranch",
    projectDefault: "on",
    projectScope: "any",
    hasProjectSettings: false,
  },
  {
    pluginId: "kept",
    name: "Kept",
    icon: null,
    projectDefault: "off",
    projectScope: "any",
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
  return { db, host, project, notifier, notifyProject };
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
        scope: "any",
        ownerProjectId: null,
        ownerProjectName: null,
      },
      {
        pluginId: "kept",
        name: "Kept",
        icon: null,
        enabled: false,
        source: "default",
        hasProjectSettings: true,
        scope: "any",
        ownerProjectId: null,
        ownerProjectName: null,
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

  describe("single-scope plugins", () => {
    const SINGLE: ProjectScopedPlugin = {
      pluginId: "master",
      name: "Master",
      icon: null,
      projectDefault: "off",
      projectScope: "single",
      hasProjectSettings: false,
    };

    function setupSingle() {
      const base = setup();
      const { project: other } = createProject(base.db, noopNotifier, {
        name: "other-project",
        source: {
          type: "local_path",
          hostId: base.host.id,
          path: "/tmp/other",
        },
      });
      const ownerChanges: PluginOwnerChange[] = [];
      setProjectPluginScopeSource({
        listProjectScopedPlugins: () => [...PLUGINS, SINGLE],
        projectOwnerChanged: (change) => ownerChanges.push(change),
      });
      return { ...base, other, ownerChanges };
    }

    it("has no owner until a project turns it on, then lists the owner everywhere", () => {
      const { db, project, other, notifier, ownerChanges } = setupSingle();
      expect(getPluginOwnerProjectId(db, "master")).toBeNull();
      expect(listProjectPlugins(db, project.id)[2]).toEqual(
        expect.objectContaining({
          pluginId: "master",
          enabled: false,
          scope: "single",
          ownerProjectId: null,
          ownerProjectName: null,
        }),
      );

      setProjectPluginEnabled(db, notifier, {
        projectId: project.id,
        pluginId: "master",
        enabled: true,
      });

      expect(getPluginOwnerProjectId(db, "master")).toBe(project.id);
      expect(listProjectPlugins(db, project.id)[2]).toEqual(
        expect.objectContaining({
          enabled: true,
          source: "project",
          ownerProjectId: project.id,
          ownerProjectName: "scope-project",
        }),
      );
      expect(listProjectPlugins(db, other.id)[2]).toEqual(
        expect.objectContaining({
          enabled: false,
          source: "default",
          ownerProjectId: project.id,
          ownerProjectName: "scope-project",
        }),
      );
      expect(ownerChanges).toEqual([
        {
          pluginId: "master",
          previousOwnerProjectId: null,
          ownerProjectId: project.id,
        },
      ]);
    });

    it("moves ownership on enable, invalidating and notifying both projects", () => {
      const { db, project, other, notifier, notifyProject, ownerChanges } =
        setupSingle();
      setProjectPluginEnabled(db, notifier, {
        projectId: project.id,
        pluginId: "master",
        enabled: true,
      });
      expect(
        isPluginEnabledForProject(db, {
          pluginId: "master",
          projectId: project.id,
        }),
      ).toBe(true);
      expect(
        isPluginEnabledForProject(db, {
          pluginId: "master",
          projectId: other.id,
        }),
      ).toBe(false);
      notifyProject.mockClear();

      setProjectPluginEnabled(db, notifier, {
        projectId: other.id,
        pluginId: "master",
        enabled: true,
      });

      expect(getPluginOwnerProjectId(db, "master")).toBe(other.id);
      expect(
        isPluginEnabledForProject(db, {
          pluginId: "master",
          projectId: project.id,
        }),
      ).toBe(false);
      expect(
        isPluginEnabledForProject(db, {
          pluginId: "master",
          projectId: other.id,
        }),
      ).toBe(true);
      expect(listProjectPlugins(db, project.id)[2]).toEqual(
        expect.objectContaining({
          enabled: false,
          source: "default",
          ownerProjectId: other.id,
        }),
      );
      expect(notifyProject.mock.calls.map(([id]) => id).sort()).toEqual(
        [project.id, other.id].sort(),
      );
      expect(ownerChanges.at(-1)).toEqual({
        pluginId: "master",
        previousOwnerProjectId: project.id,
        ownerProjectId: other.id,
      });
    });

    it("clears the owner on disable or reset and leaves another owner's row alone", () => {
      const { db, project, other, notifier, ownerChanges } = setupSingle();
      setProjectPluginEnabled(db, notifier, {
        projectId: project.id,
        pluginId: "master",
        enabled: true,
      });

      setProjectPluginEnabled(db, notifier, {
        projectId: other.id,
        pluginId: "master",
        enabled: false,
      });
      expect(getPluginOwnerProjectId(db, "master")).toBe(project.id);
      expect(ownerChanges).toHaveLength(1);

      setProjectPluginEnabled(db, notifier, {
        projectId: project.id,
        pluginId: "master",
        enabled: false,
      });
      expect(getPluginOwnerProjectId(db, "master")).toBeNull();
      expect(
        isPluginEnabledForProject(db, {
          pluginId: "master",
          projectId: project.id,
        }),
      ).toBe(false);
      expect(ownerChanges.at(-1)).toEqual({
        pluginId: "master",
        previousOwnerProjectId: project.id,
        ownerProjectId: null,
      });

      setProjectPluginEnabled(db, notifier, {
        projectId: project.id,
        pluginId: "master",
        enabled: true,
      });
      setProjectPluginEnabled(db, notifier, {
        projectId: project.id,
        pluginId: "master",
        enabled: null,
      });
      expect(getPluginOwnerProjectId(db, "master")).toBeNull();
      expect(ownerChanges).toHaveLength(4);
    });

    it("resolves the owner with its local paths on the server host only", () => {
      const { db, host, project, notifier } = setupSingle();
      const otherHost = upsertHost(db, noopNotifier, { name: "elsewhere" });
      expect(
        resolvePluginOwnerProject(db, {
          pluginId: "master",
          localHostId: host.id,
        }),
      ).toBeNull();

      setProjectPluginEnabled(db, notifier, {
        projectId: project.id,
        pluginId: "master",
        enabled: true,
      });
      expect(
        resolvePluginOwnerProject(db, {
          pluginId: "master",
          localHostId: host.id,
        }),
      ).toEqual({
        projectId: project.id,
        name: "scope-project",
        localPaths: ["/tmp/scope"],
      });
      expect(
        resolvePluginOwnerProject(db, {
          pluginId: "master",
          localHostId: otherHost.id,
        }),
      ).toEqual({
        projectId: project.id,
        name: "scope-project",
        localPaths: [],
      });
      expect(
        resolvePluginOwnerProject(db, {
          pluginId: "master",
          localHostId: null,
        }),
      ).toEqual({
        projectId: project.id,
        name: "scope-project",
        localPaths: [],
      });
    });
  });
});
