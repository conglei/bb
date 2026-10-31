import { createPluginUpdateJobs } from "../../../src/services/plugins/plugin-update-jobs.js";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createProject,
  deleteProject,
  getPluginKvValue,
  getPluginProjectKvValue,
  getPluginProjectSettingsValues,
  listPluginProjectKvKeys,
  noopNotifier,
  setPluginProjectKvValue,
  upsertHost,
  type DbConnection,
} from "@bb/db";
import { createMigratedConnection } from "@bb/db/testing";
import type { Logger } from "@bb/logger";
import { registerPluginRoutes } from "../../../src/routes/plugins.js";
import { createPluginInstallJobs } from "../../../src/services/plugins/plugin-install-jobs.js";
import { createAiServiceRegistry } from "../../../src/services/ai/ai-service-registry.js";
import {
  createPluginService,
  type PluginService,
} from "../../../src/services/plugins/plugin-service.js";
import { PluginSettingsValidationError } from "../../../src/services/plugins/plugin-settings.js";
import { UnknownProjectError } from "../../../src/services/plugins/plugin-project-settings.js";
import { testLogger } from "../../helpers/test-app.js";
import { createNoopTelemetryService } from "../../../src/services/system/telemetry.js";

const logger = testLogger as unknown as Logger;

async function writePlugin(
  dir: string,
  options: { name: string; serverSource: string },
): Promise<string> {
  const rootDir = join(dir, options.name);
  await mkdir(rootDir, { recursive: true });
  await writeFile(
    join(rootDir, "package.json"),
    JSON.stringify({
      name: options.name,
      version: "0.1.0",
      bb: {
        name: "Project settings fixture",
        description: "Per-project settings and storage plugin fixture.",
        branding: { icon: "Zap" },
        server: "./server.ts",
      },
    }),
  );
  await writeFile(join(rootDir, "server.ts"), options.serverSource);
  return rootDir;
}

interface ProjectSettingsState {
  initial: Record<string, unknown>;
  changes: Array<{
    projectId: string;
    next: Record<string, unknown>;
    prev: Record<string, unknown>;
  }>;
  settings: {
    get(projectId: string): Promise<Record<string, unknown>>;
    experimental_set(
      projectId: string,
      values: Record<string, unknown>,
    ): Promise<Record<string, unknown>>;
  };
}

describe("plugin per-project settings + storage", () => {
  let db: DbConnection;
  let workDir: string;
  let dataDir: string;
  let service: PluginService;
  let projectChanges: Array<{ pluginId: string; projectId: string }>;
  let projectA: string;
  let projectB: string;

  beforeEach(async () => {
    db = createMigratedConnection();
    workDir = await mkdtemp(join(tmpdir(), "bb-plugin-project-storage-test-"));
    dataDir = join(workDir, "data");
    projectChanges = [];
    const host = upsertHost(db, noopNotifier, {
      name: "project-settings-host",
    });
    const createNamed = (name: string) =>
      createProject(db, noopNotifier, {
        name,
        source: { type: "local_path", hostId: host.id, path: `/tmp/${name}` },
      }).project.id;
    projectA = createNamed("alpha");
    projectB = createNamed("beta");
    service = createPluginService({
      aiServices: createAiServiceRegistry(),
      telemetry: createNoopTelemetryService(),
      db,
      hub: {
        getDaemonSessionIdForHost: () => null,
        notifyPluginChanged: () => {},
        onWatchedTargets: () => () => {},
        notifyPluginSignal: () => 0,
        notifySystem: () => {},
      },
      onProjectSettingsChanged: (args) => {
        projectChanges.push(args);
      },
      logger,
      dataDir,
      appVersion: "0.9.0",
      loadTimeoutMs: 2000,
    });
  });

  afterEach(async () => {
    await service.stop();
    await rm(workDir, { recursive: true, force: true });
    delete (globalThis as Record<string, unknown>).__projectConfigurable;
  });

  async function installConfigurable(): Promise<void> {
    const rootDir = await writePlugin(workDir, {
      name: "bb-plugin-project-configurable",
      serverSource: `
        export default async function plugin(bb: any) {
          const settings = bb.experimental_projectSettings.define({
            mode: { type: "select", label: "Mode", options: ["fast", "slow"], default: "fast" },
            autoSync: { type: "boolean", label: "Sync automatically", default: true },
            retries: { type: "number", label: "Retries", default: 3 },
            note: { type: "string", label: "Note" },
          });
          const g = globalThis as any;
          g.__projectConfigurable = { initial: await settings.get("proj_unknown"), changes: [], settings };
          settings.onChange((projectId: string, next: any, prev: any) => {
            g.__projectConfigurable.changes.push({ projectId, next, prev });
          });
        }
      `,
    });
    const entry = await service.installPath(rootDir);
    expect(entry.status).toBe("running");
  }

  function state(): ProjectSettingsState {
    return (globalThis as Record<string, unknown>)
      .__projectConfigurable as ProjectSettingsState;
  }

  function routes(): Hono {
    const app = new Hono();
    registerPluginRoutes(
      app,
      { config: { serverPort: 3334 }, db },
      service,
      createPluginInstallJobs({ notifyChanged: () => {} }),
      createPluginUpdateJobs({ notifyChanged: () => {} }),
    );
    return app;
  }

  describe("settings", () => {
    it("get() is load-safe, applies defaults, and reads any project id", async () => {
      await installConfigurable();
      expect(state().initial).toEqual({
        mode: "fast",
        autoSync: true,
        retries: 3,
        note: undefined,
      });
      expect(
        service.list().find((p) => p.id === "project-configurable"),
      ).toMatchObject({ hasSettings: false, hasProjectSettings: true });
      expect(
        service
          .listProjectScopedPlugins()
          .find((p) => p.pluginId === "project-configurable"),
      ).toMatchObject({ hasProjectSettings: true });
    });

    it("stores values per project and fires onChange only when effective values change", async () => {
      await installConfigurable();
      const view = service.updateProjectSettings(
        "project-configurable",
        projectA,
        { autoSync: false, retries: 4.5, note: "hello" },
      );
      expect(view?.values).toEqual({
        mode: "fast",
        autoSync: false,
        retries: 4.5,
        note: "hello",
      });
      expect(view?.schema.note).toEqual({ type: "string", label: "Note" });

      await expect(state().settings.get(projectA)).resolves.toEqual({
        mode: "fast",
        autoSync: false,
        retries: 4.5,
        note: "hello",
      });
      await expect(state().settings.get(projectB)).resolves.toEqual({
        mode: "fast",
        autoSync: true,
        retries: 3,
        note: undefined,
      });

      expect(state().changes).toEqual([
        {
          projectId: projectA,
          prev: expect.objectContaining({ autoSync: true }),
          next: expect.objectContaining({ autoSync: false, note: "hello" }),
        },
      ]);
      expect(projectChanges).toEqual([
        { pluginId: "project-configurable", projectId: projectA },
      ]);

      service.updateProjectSettings("project-configurable", projectA, {
        note: "hello",
      });
      expect(state().changes).toHaveLength(1);
      expect(projectChanges).toHaveLength(1);

      const cleared = service.updateProjectSettings(
        "project-configurable",
        projectA,
        { note: null },
      );
      expect(cleared?.values).not.toHaveProperty("note");
      expect(state().changes).toHaveLength(2);
      expect(
        getPluginProjectSettingsValues(db, {
          pluginId: "project-configurable",
          projectId: projectA,
        }),
      ).toEqual({
        autoSync: "false",
        retries: "4.5",
      });
    });

    it("lets plugin server code persist its own per-project values", async () => {
      await installConfigurable();
      await expect(
        state().settings.experimental_set(projectB, { mode: "slow" }),
      ).resolves.toEqual({
        mode: "slow",
        autoSync: true,
        retries: 3,
        note: undefined,
      });
      expect(state().changes).toEqual([
        expect.objectContaining({ projectId: projectB }),
      ]);
      expect(projectChanges).toEqual([
        { pluginId: "project-configurable", projectId: projectB },
      ]);
      await expect(
        state().settings.experimental_set(projectB, { mode: "warp" }),
      ).rejects.toThrow(/must be one of/);
      await expect(
        state().settings.experimental_set(projectB, { nope: 1 }),
      ).rejects.toThrow(/unknown setting/);
      await expect(
        state().settings.experimental_set("proj_missing", { mode: "slow" }),
      ).rejects.toThrow('unknown project "proj_missing"');
    });

    it("rejects unknown keys, type mismatches, and unknown projects", async () => {
      await installConfigurable();
      expect(() =>
        service.updateProjectSettings("project-configurable", projectA, {
          nope: "x",
        }),
      ).toThrow(PluginSettingsValidationError);
      expect(() =>
        service.updateProjectSettings("project-configurable", projectA, {
          autoSync: "yes",
        }),
      ).toThrow(/expects a boolean/);
      expect(() =>
        service.updateProjectSettings("project-configurable", "proj_missing", {
          autoSync: false,
        }),
      ).toThrow(UnknownProjectError);
      expect(() =>
        service.getProjectSettings("project-configurable", "proj_missing"),
      ).toThrow(UnknownProjectError);
      expect(
        service.updateProjectSettings("missing-plugin", projectA, {}),
      ).toBeUndefined();
      expect(state().changes).toEqual([]);
    });

    it("refuses a secret descriptor", async () => {
      const rootDir = await writePlugin(workDir, {
        name: "bb-plugin-project-secret",
        serverSource: `
          export default function plugin(bb: any) {
            bb.experimental_projectSettings.define({
              token: { type: "string", label: "Token", secret: true },
            });
          }
        `,
      });
      await service.installPath(rootDir);
      const entry = service.list().find((p) => p.id === "project-secret");
      expect(entry?.status).toBe("error");
      expect(entry?.statusDetail).toContain(
        'project setting "token" cannot be secret',
      );
    });

    it("serves schema+values over the routes and 404s without project settings", async () => {
      await installConfigurable();
      const plain = await writePlugin(workDir, {
        name: "bb-plugin-plain",
        serverSource: `export default function plugin() {}`,
      });
      await service.installPath(plain);
      const app = routes();
      const path = (pluginId: string, projectId: string) =>
        `/plugins/${pluginId}/projects/${projectId}/settings`;

      const got = await app.request(path("project-configurable", projectA));
      expect(got.status).toBe(200);
      expect(await got.json()).toEqual({
        ok: true,
        schema: {
          mode: {
            type: "select",
            label: "Mode",
            options: ["fast", "slow"],
            default: "fast",
          },
          autoSync: {
            type: "boolean",
            label: "Sync automatically",
            default: true,
          },
          retries: { type: "number", label: "Retries", default: 3 },
          note: { type: "string", label: "Note" },
        },
        values: { mode: "fast", autoSync: true, retries: 3 },
      });

      const put = await app.request(path("project-configurable", projectA), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: { mode: "slow", note: "wire" } }),
      });
      expect(put.status).toBe(200);
      expect(((await put.json()) as { values: unknown }).values).toEqual({
        mode: "slow",
        autoSync: true,
        retries: 3,
        note: "wire",
      });
      const other = await app.request(path("project-configurable", projectB));
      expect(((await other.json()) as { values: unknown }).values).toEqual({
        mode: "fast",
        autoSync: true,
        retries: 3,
      });

      const badKey = await app.request(path("project-configurable", projectA), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: { bogus: 1 } }),
      });
      expect(badKey.status).toBe(400);
      expect(((await badKey.json()) as { error: string }).error).toContain(
        "bogus",
      );
      const badBody = await app.request(
        path("project-configurable", projectA),
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ values: "nope" }),
        },
      );
      expect(badBody.status).toBe(400);

      expect(
        (await app.request(path("project-configurable", "proj_missing")))
          .status,
      ).toBe(404);
      expect((await app.request(path("plain", projectA))).status).toBe(404);
      expect((await app.request(path("nowhere", projectA))).status).toBe(404);
    });

    it("deletes a project's rows with the project and every row on plugin removal", async () => {
      await installConfigurable();
      service.updateProjectSettings("project-configurable", projectA, {
        note: "a",
      });
      service.updateProjectSettings("project-configurable", projectB, {
        note: "b",
      });
      const api = service.getApi("project-configurable")!;
      await api.storage.experimental_forProject(projectA).set("k", 1);
      await api.storage.experimental_forProject(projectB).set("k", 2);

      deleteProject(db, noopNotifier, projectA);
      await expect(state().settings.get(projectA)).resolves.toMatchObject({
        note: undefined,
      });
      await expect(state().settings.get(projectB)).resolves.toMatchObject({
        note: "b",
      });
      expect(
        listPluginProjectKvKeys(db, {
          pluginId: "project-configurable",
          projectId: projectA,
        }),
      ).toEqual([]);
      await expect(
        api.storage.experimental_forProject(projectB).get("k"),
      ).resolves.toBe(2);

      await service.remove("project-configurable");
      expect(
        getPluginProjectSettingsValues(db, {
          pluginId: "project-configurable",
          projectId: projectB,
        }),
      ).toEqual({});
      expect(
        listPluginProjectKvKeys(db, {
          pluginId: "project-configurable",
          projectId: projectB,
        }),
      ).toEqual([]);
    });
  });

  describe("per-project kv storage", () => {
    it("isolates projects from each other and from plugin-wide kv, and caps value size", async () => {
      const rootDir = await writePlugin(workDir, {
        name: "bb-plugin-project-kver",
        serverSource: `export default function plugin() {}`,
      });
      await service.installPath(rootDir);
      const api = service.getApi("project-kver")!;
      const a = api.storage.experimental_forProject(projectA);
      const b = api.storage.experimental_forProject(projectB);

      await a.set("issue:1", { title: "one" });
      await a.set("issue:2", { title: "two" });
      await a.set("note", "plain");
      await b.set("issue:1", { title: "other" });
      await api.storage.kv.set("issue:1", { title: "global" });

      await expect(a.get("issue:1")).resolves.toEqual({ title: "one" });
      await expect(b.get("issue:1")).resolves.toEqual({ title: "other" });
      await expect(api.storage.kv.get("issue:1")).resolves.toEqual({
        title: "global",
      });
      await expect(a.list("issue:")).resolves.toEqual(["issue:1", "issue:2"]);
      await expect(a.list()).resolves.toEqual(["issue:1", "issue:2", "note"]);
      await expect(b.list()).resolves.toEqual(["issue:1"]);

      await a.delete("issue:1");
      await expect(a.get("issue:1")).resolves.toBeUndefined();
      await expect(b.get("issue:1")).resolves.toEqual({ title: "other" });
      expect(
        getPluginProjectKvValue(
          db,
          { pluginId: "project-kver", projectId: projectB },
          "issue:1",
        ),
      ).toBe(JSON.stringify({ title: "other" }));
      expect(getPluginKvValue(db, "project-kver", "note")).toBeUndefined();

      await expect(a.set("big", "x".repeat(256 * 1024 + 1))).rejects.toThrow(
        /256KB/,
      );
      await expect(a.set("undef", undefined)).rejects.toThrow(
        /not JSON-serializable/,
      );
      await expect(
        api.storage.experimental_forProject("proj_missing").set("k", 1),
      ).rejects.toThrow('unknown project "proj_missing"');
      expect(() => api.storage.experimental_forProject("")).toThrow(
        /expects a project id/,
      );
    });

    it("removal deletes project kv rows but leaves plugin-wide kv alone", async () => {
      const rootDir = await writePlugin(workDir, {
        name: "bb-plugin-project-kv-remove",
        serverSource: `export default function plugin() {}`,
      });
      await service.installPath(rootDir);
      const api = service.getApi("project-kv-remove")!;
      await api.storage.experimental_forProject(projectA).set("k", "v");
      await api.storage.kv.set("k", "global");
      setPluginProjectKvValue(
        db,
        { pluginId: "unrelated", projectId: projectA },
        "k",
        '"keep"',
      );

      await service.remove("project-kv-remove");

      expect(
        listPluginProjectKvKeys(db, {
          pluginId: "project-kv-remove",
          projectId: projectA,
        }),
      ).toEqual([]);
      expect(getPluginKvValue(db, "project-kv-remove", "k")).toBe('"global"');
      expect(
        getPluginProjectKvValue(
          db,
          { pluginId: "unrelated", projectId: projectA },
          "k",
        ),
      ).toBe('"keep"');
    });
  });
});
