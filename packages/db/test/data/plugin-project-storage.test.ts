import { describe, expect, it } from "vitest";
import { noopNotifier } from "../../src/notifier.js";
import { createProject, deleteProject } from "../../src/data/projects.js";
import {
  deleteAllPluginProjectData,
  deletePluginProjectData,
  deletePluginProjectKvValue,
  getPluginProjectKvValue,
  getPluginProjectSettingsValues,
  listPluginProjectKvKeys,
  setPluginProjectKvValue,
  setPluginProjectSettingsValues,
} from "../../src/data/plugin-project-storage.js";
import {
  getPluginKvValue,
  setPluginKvValue,
} from "../../src/data/plugin-storage.js";
import { upsertHost } from "../../src/data/hosts.js";
import { createMigratedConnection } from "../../src/testing.js";

function setup() {
  const db = createMigratedConnection();
  const host = upsertHost(db, noopNotifier, { name: "plugin-storage-host" });
  const createNamed = (name: string) =>
    createProject(db, noopNotifier, {
      name,
      source: { type: "local_path", hostId: host.id, path: `/tmp/${name}` },
    }).project;
  return { db, project: createNamed("storage-a"), other: createNamed("storage-b") };
}

describe("plugin-project-storage", () => {
  it("keeps kv values isolated per project and from plugin-wide kv", () => {
    const { db, project, other } = setup();
    const a = { pluginId: "kept", projectId: project.id };
    const b = { pluginId: "kept", projectId: other.id };
    setPluginProjectKvValue(db, a, "cursor", "1");
    setPluginProjectKvValue(db, b, "cursor", "2");
    setPluginKvValue(db, "kept", "cursor", "global");
    expect(getPluginProjectKvValue(db, a, "cursor")).toBe("1");
    expect(getPluginProjectKvValue(db, b, "cursor")).toBe("2");
    expect(getPluginKvValue(db, "kept", "cursor")).toBe("global");
    expect(
      getPluginProjectKvValue(
        db,
        { pluginId: "other", projectId: project.id },
        "cursor",
      ),
    ).toBeUndefined();
  });

  it("overwrites, lists by prefix, and deletes kv keys", () => {
    const { db, project } = setup();
    const scope = { pluginId: "kept", projectId: project.id };
    setPluginProjectKvValue(db, scope, "a:1", "x");
    setPluginProjectKvValue(db, scope, "a:1", "y");
    setPluginProjectKvValue(db, scope, "a:2", "z");
    setPluginProjectKvValue(db, scope, "b_1", "w");
    expect(getPluginProjectKvValue(db, scope, "a:1")).toBe("y");
    expect(listPluginProjectKvKeys(db, scope, "a:")).toEqual(["a:1", "a:2"]);
    expect(listPluginProjectKvKeys(db, scope, "b_")).toEqual(["b_1"]);
    expect(listPluginProjectKvKeys(db, scope)).toEqual(["a:1", "a:2", "b_1"]);
    expect(deletePluginProjectKvValue(db, scope, "a:1")).toBe(true);
    expect(deletePluginProjectKvValue(db, scope, "a:1")).toBe(false);
    expect(listPluginProjectKvKeys(db, scope)).toEqual(["a:2", "b_1"]);
  });

  it("stores settings per project and deletes keys set to null", () => {
    const { db, project, other } = setup();
    const a = { pluginId: "kept", projectId: project.id };
    const b = { pluginId: "kept", projectId: other.id };
    setPluginProjectSettingsValues(db, a, { mode: "fast", limit: "3" });
    setPluginProjectSettingsValues(db, b, { mode: "slow" });
    expect(getPluginProjectSettingsValues(db, a)).toEqual({
      mode: "fast",
      limit: "3",
    });
    setPluginProjectSettingsValues(db, a, { limit: null, mode: "safe" });
    expect(getPluginProjectSettingsValues(db, a)).toEqual({ mode: "safe" });
    expect(getPluginProjectSettingsValues(db, b)).toEqual({ mode: "slow" });
  });

  it("deletes all rows for a plugin across projects", () => {
    const { db, project, other } = setup();
    for (const projectId of [project.id, other.id]) {
      setPluginProjectKvValue(db, { pluginId: "kept", projectId }, "k", "v");
      setPluginProjectSettingsValues(db, { pluginId: "kept", projectId }, {
        s: "v",
      });
      setPluginProjectKvValue(db, { pluginId: "git", projectId }, "k", "v");
    }
    expect(deleteAllPluginProjectData(db, "kept")).toEqual({
      kv: 2,
      settings: 2,
    });
    expect(
      listPluginProjectKvKeys(db, { pluginId: "kept", projectId: project.id }),
    ).toEqual([]);
    expect(
      listPluginProjectKvKeys(db, { pluginId: "git", projectId: project.id }),
    ).toEqual(["k"]);
  });

  it("deletes one plugin+project scope only", () => {
    const { db, project, other } = setup();
    const a = { pluginId: "kept", projectId: project.id };
    const b = { pluginId: "kept", projectId: other.id };
    setPluginProjectKvValue(db, a, "k", "v");
    setPluginProjectSettingsValues(db, a, { s: "v" });
    setPluginProjectKvValue(db, b, "k", "v");
    expect(deletePluginProjectData(db, a)).toEqual({ kv: 1, settings: 1 });
    expect(getPluginProjectKvValue(db, b, "k")).toBe("v");
  });

  it("cascades on project delete", () => {
    const { db, project, other } = setup();
    const a = { pluginId: "kept", projectId: project.id };
    const b = { pluginId: "kept", projectId: other.id };
    setPluginProjectKvValue(db, a, "k", "v");
    setPluginProjectSettingsValues(db, a, { s: "v" });
    setPluginProjectKvValue(db, b, "k", "v");
    deleteProject(db, noopNotifier, project.id);
    expect(listPluginProjectKvKeys(db, a)).toEqual([]);
    expect(getPluginProjectSettingsValues(db, a)).toEqual({});
    expect(getPluginProjectKvValue(db, b, "k")).toBe("v");
  });
});
