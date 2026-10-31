import { describe, expect, it } from "vitest";
import { noopNotifier } from "../../src/notifier.js";
import { createProject, deleteProject } from "../../src/data/projects.js";
import {
  deleteProjectPluginState,
  deleteProjectPluginStatesForPlugin,
  getProjectPluginState,
  listProjectPluginStates,
  upsertProjectPluginState,
} from "../../src/data/project-plugin-states.js";
import { upsertHost } from "../../src/data/hosts.js";
import { createMigratedConnection } from "../../src/testing.js";

function setup() {
  const db = createMigratedConnection();
  const host = upsertHost(db, noopNotifier, { name: "plugin-states-host" });
  const createNamed = (name: string) =>
    createProject(db, noopNotifier, {
      name,
      source: { type: "local_path", hostId: host.id, path: `/tmp/${name}` },
    }).project;
  return { db, project: createNamed("states-a"), other: createNamed("states-b") };
}

describe("project-plugin-states", () => {
  it("returns no override until one is written", () => {
    const { db, project } = setup();
    expect(
      getProjectPluginState(db, { projectId: project.id, pluginId: "kept" }),
    ).toBeNull();
    expect(listProjectPluginStates(db, { projectId: project.id })).toEqual([]);
  });

  it("upserts an override and replaces it on a second write", () => {
    const { db, project } = setup();
    upsertProjectPluginState(db, {
      projectId: project.id,
      pluginId: "kept",
      enabled: true,
    });
    const flipped = upsertProjectPluginState(db, {
      projectId: project.id,
      pluginId: "kept",
      enabled: false,
    });
    expect(flipped).toMatchObject({
      projectId: project.id,
      pluginId: "kept",
      enabled: false,
    });
    expect(listProjectPluginStates(db, { projectId: project.id })).toEqual([
      expect.objectContaining({ pluginId: "kept", enabled: false }),
    ]);
  });

  it("resets one project's override without touching another project", () => {
    const { db, project, other } = setup();
    upsertProjectPluginState(db, {
      projectId: project.id,
      pluginId: "kept",
      enabled: false,
    });
    upsertProjectPluginState(db, {
      projectId: other.id,
      pluginId: "kept",
      enabled: false,
    });
    expect(
      deleteProjectPluginState(db, { projectId: project.id, pluginId: "kept" }),
    ).toBe(true);
    expect(
      deleteProjectPluginState(db, { projectId: project.id, pluginId: "kept" }),
    ).toBe(false);
    expect(
      getProjectPluginState(db, { projectId: project.id, pluginId: "kept" }),
    ).toBeNull();
    expect(
      getProjectPluginState(db, { projectId: other.id, pluginId: "kept" }),
    ).toMatchObject({ enabled: false });
  });

  it("deletes every project's rows for a removed plugin", () => {
    const { db, project, other } = setup();
    for (const projectId of [project.id, other.id]) {
      upsertProjectPluginState(db, { projectId, pluginId: "kept", enabled: true });
      upsertProjectPluginState(db, { projectId, pluginId: "git", enabled: false });
    }
    expect(deleteProjectPluginStatesForPlugin(db, { pluginId: "kept" })).toBe(2);
    expect(listProjectPluginStates(db, { projectId: project.id })).toEqual([
      expect.objectContaining({ pluginId: "git" }),
    ]);
    expect(listProjectPluginStates(db, { projectId: other.id })).toEqual([
      expect.objectContaining({ pluginId: "git" }),
    ]);
  });

  it("cascades on project delete", () => {
    const { db, project, other } = setup();
    upsertProjectPluginState(db, {
      projectId: project.id,
      pluginId: "kept",
      enabled: false,
    });
    upsertProjectPluginState(db, {
      projectId: other.id,
      pluginId: "kept",
      enabled: false,
    });
    deleteProject(db, noopNotifier, project.id);
    expect(listProjectPluginStates(db, { projectId: project.id })).toEqual([]);
    expect(listProjectPluginStates(db, { projectId: other.id })).toHaveLength(1);
  });
});
