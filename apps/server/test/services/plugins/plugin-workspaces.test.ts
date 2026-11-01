import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createProject,
  getPluginOwnedProject,
  getProject,
  listProjectSourcesByProjectIds,
  noopNotifier,
  upsertHost,
  upsertProjectPluginState,
  type DbConnection,
} from "@bb/db";
import { createMigratedConnection } from "@bb/db/testing";
import { HOST_ID_FILE_NAME } from "@bb/host-daemon-contract";
import {
  ensurePluginWorkspace,
  pluginWorkspaceDirectory,
} from "../../../src/services/plugins/plugin-workspaces.js";

const quietLogger = { info() {}, warn() {} };

describe("ensurePluginWorkspace", () => {
  let db: DbConnection;
  let workDir: string;
  let dataDir: string;
  let hostId: string;

  beforeEach(async () => {
    db = createMigratedConnection();
    workDir = await mkdtemp(join(tmpdir(), "bb-plugin-workspaces-test-"));
    dataDir = join(workDir, "data");
    await mkdir(dataDir, { recursive: true });
    hostId = upsertHost(db, noopNotifier, { name: "server-host" }).id;
    await writeFile(join(dataDir, HOST_ID_FILE_NAME), hostId);
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("does nothing for a plugin without a workspace manifest", async () => {
    await expect(
      ensurePluginWorkspace({
        db,
        notifier: noopNotifier,
        dataDir,
        logger: quietLogger,
        pluginId: "git",
        manifest: { workspace: null, projectScope: "any" },
      }),
    ).resolves.toBeNull();
    expect(getPluginOwnedProject(db, "git")).toBeNull();
  });

  it("provisions a seeded home once and reports it as existing afterwards", async () => {
    const seedPath = join(workDir, "seed");
    await mkdir(join(seedPath, ".bb", "skills", "inbox"), { recursive: true });
    await writeFile(join(seedPath, "CLAUDE.md"), "# Kept rulebook\n");
    await writeFile(
      join(seedPath, ".bb", "skills", "inbox", "SKILL.md"),
      "---\nname: inbox\n---\n",
    );
    const manifest = {
      workspace: { seedPath, name: "Kept" },
      projectScope: "any" as const,
    };

    const outcome = await ensurePluginWorkspace({
      db,
      notifier: noopNotifier,
      dataDir,
      logger: quietLogger,
      pluginId: "kept",
      manifest,
    });
    const path = pluginWorkspaceDirectory(dataDir, "kept");
    expect(outcome).toEqual({
      kind: "created",
      projectId: expect.any(String),
      path,
    });
    if (outcome?.kind !== "created") throw new Error("not created");
    const project = getProject(db, outcome.projectId);
    expect(project).toEqual(
      expect.objectContaining({
        name: "Kept",
        kind: "standard",
        ownerKind: "plugin",
        ownerPluginId: "kept",
      }),
    );
    expect(listProjectSourcesByProjectIds(db, [outcome.projectId])).toEqual([
      expect.objectContaining({ type: "local_path", hostId, path }),
    ]);
    await expect(readFile(join(path, "CLAUDE.md"), "utf8")).resolves.toBe(
      "# Kept rulebook\n",
    );
    await expect(
      readFile(join(path, ".bb", "skills", "inbox", "SKILL.md"), "utf8"),
    ).resolves.toContain("name: inbox");

    await writeFile(join(path, "CLAUDE.md"), "# edited by the user\n");
    await writeFile(join(seedPath, "CLAUDE.md"), "# newer seed\n");
    await expect(
      ensurePluginWorkspace({
        db,
        notifier: noopNotifier,
        dataDir,
        logger: quietLogger,
        pluginId: "kept",
        manifest,
      }),
    ).resolves.toEqual({ kind: "existing", projectId: outcome.projectId });
    await expect(readFile(join(path, "CLAUDE.md"), "utf8")).resolves.toBe(
      "# edited by the user\n",
    );
  });

  it("adopts the project where a single-scope plugin was already on", async () => {
    const { project } = createProject(db, noopNotifier, {
      name: "Kept by hand",
      source: { type: "local_path", hostId, path: "/srv/kept" },
    });
    upsertProjectPluginState(db, {
      projectId: project.id,
      pluginId: "kept",
      enabled: true,
    });

    await expect(
      ensurePluginWorkspace({
        db,
        notifier: noopNotifier,
        dataDir,
        logger: quietLogger,
        pluginId: "kept",
        manifest: {
          workspace: { seedPath: null, name: "Kept" },
          projectScope: "single",
        },
      }),
    ).resolves.toEqual({ kind: "adopted", projectId: project.id });
    expect(getPluginOwnedProject(db, "kept")?.id).toBe(project.id);
    expect(getProject(db, project.id)?.ownerPluginId).toBe("kept");
  });

  it("waits for the server host before provisioning an empty home", async () => {
    await rm(join(dataDir, HOST_ID_FILE_NAME));
    await expect(
      ensurePluginWorkspace({
        db,
        notifier: noopNotifier,
        dataDir,
        logger: quietLogger,
        pluginId: "guide",
        manifest: {
          workspace: { seedPath: null, name: "Guide" },
          projectScope: "any",
        },
      }),
    ).resolves.toEqual({ kind: "deferred", reason: expect.any(String) });
    expect(getPluginOwnedProject(db, "guide")).toBeNull();

    await writeFile(join(dataDir, HOST_ID_FILE_NAME), hostId);
    const outcome = await ensurePluginWorkspace({
      db,
      notifier: noopNotifier,
      dataDir,
      logger: quietLogger,
      pluginId: "guide",
      manifest: {
        workspace: { seedPath: null, name: "Guide" },
        projectScope: "any",
      },
    });
    expect(outcome?.kind).toBe("created");
    expect(getPluginOwnedProject(db, "guide")?.name).toBe("Guide");
  });
});
