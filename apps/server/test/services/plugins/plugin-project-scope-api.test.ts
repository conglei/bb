import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProject,
  getPluginOwnedProject,
  getProject,
  noopNotifier,
  upsertHost,
  type DbConnection,
  type DbNotifier,
} from "@bb/db";
import { createMigratedConnection } from "@bb/db/testing";
import { HOST_ID_FILE_NAME } from "@bb/host-daemon-contract";
import type { Logger } from "@bb/logger";
import { createAiServiceRegistry } from "../../../src/services/ai/ai-service-registry.js";
import {
  createPluginService,
  type PluginService,
} from "../../../src/services/plugins/plugin-service.js";
import {
  clearProjectPluginScopeCache,
  isPluginEnabledForProject,
  setPluginWorkspaceOwner,
  setProjectPluginEnabled,
  setProjectPluginScopeSource,
} from "../../../src/services/plugins/project-plugin-scope.js";
import { createNoopTelemetryService } from "../../../src/services/system/telemetry.js";
import { testLogger } from "../../helpers/test-app.js";

const logger = testLogger as unknown as Logger;

interface OwnerProject {
  projectId: string;
  name: string;
  localPaths: string[];
}

interface ScopeState {
  initial: OwnerProject | null;
  changes: Array<{ next: OwnerProject | null; previous: OwnerProject | null }>;
  get(): Promise<OwnerProject | null>;
}

async function writePlugin(
  dir: string,
  options: { name: string; projectScope: "single" | "any" | undefined },
): Promise<string> {
  const rootDir = join(dir, options.name);
  await mkdir(rootDir, { recursive: true });
  await writeFile(
    join(rootDir, "package.json"),
    JSON.stringify({
      name: options.name,
      version: "0.1.0",
      bb: {
        name: "Project scope fixture",
        description: "Project-bound plugin fixture.",
        branding: { icon: "Zap" },
        server: "./server.ts",
        ...(options.projectScope === undefined
          ? {}
          : { experimental_projectScope: options.projectScope }),
      },
    }),
  );
  await writeFile(
    join(rootDir, "server.ts"),
    `
      export default async function plugin(bb: any) {
        const g = globalThis as any;
        g.__projectScope = {
          initial: await bb.experimental_projectScope.get(),
          changes: [],
          get: () => bb.experimental_projectScope.get(),
        };
        bb.experimental_projectScope.onChange((next: any, previous: any) => {
          g.__projectScope.changes.push({ next, previous });
        });
      }
    `,
  );
  return rootDir;
}

function state(): ScopeState {
  return (globalThis as Record<string, unknown>).__projectScope as ScopeState;
}

describe("bb.experimental_projectScope", () => {
  let db: DbConnection;
  let workDir: string;
  let dataDir: string;
  let service: PluginService;
  let notifier: DbNotifier;
  let notifyProject: ReturnType<typeof vi.fn<DbNotifier["notifyProject"]>>;
  let hostId: string;
  let alpha: string;
  let beta: string;

  beforeEach(async () => {
    db = createMigratedConnection();
    workDir = await mkdtemp(join(tmpdir(), "bb-plugin-project-scope-test-"));
    dataDir = join(workDir, "data");
    await mkdir(dataDir, { recursive: true });
    hostId = upsertHost(db, noopNotifier, { name: "server-host" }).id;
    await writeFile(join(dataDir, HOST_ID_FILE_NAME), hostId);
    const elsewhere = upsertHost(db, noopNotifier, { name: "elsewhere" }).id;
    alpha = createProject(db, noopNotifier, {
      name: "Alpha",
      source: { type: "local_path", hostId, path: "/srv/alpha" },
    }).project.id;
    beta = createProject(db, noopNotifier, {
      name: "Beta",
      source: { type: "local_path", hostId: elsewhere, path: "/mnt/beta" },
    }).project.id;
    notifyProject = vi.fn<DbNotifier["notifyProject"]>();
    notifier = { ...noopNotifier, notifyProject };
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
      logger,
      dataDir,
      appVersion: "0.9.0",
      loadTimeoutMs: 2000,
    });
    setProjectPluginScopeSource(service);
  });

  afterEach(async () => {
    setProjectPluginScopeSource(undefined);
    clearProjectPluginScopeCache();
    await service.stop();
    await rm(workDir, { recursive: true, force: true });
    delete (globalThis as Record<string, unknown>).__projectScope;
  });

  it("provisions a single-scope plugin's workspace on load and follows adopt and release", async () => {
    const entry = await service.installPath(
      await writePlugin(workDir, {
        name: "bb-plugin-master",
        projectScope: "single",
      }),
    );
    expect(entry.status).toBe("running");
    expect(entry.projectScope).toBe("single");
    expect(entry.projectDefault).toBe("off");
    expect(state().initial).toBeNull();

    const home = getPluginOwnedProject(db, "master");
    expect(home).not.toBeNull();
    const homePath = join(dataDir, "plugins", "master", "workspace");
    const provisioned = {
      projectId: home?.id,
      name: "Project scope fixture",
      localPaths: [homePath],
    };
    await expect(state().get()).resolves.toEqual(provisioned);
    expect(state().changes).toEqual([{ next: provisioned, previous: null }]);
    expect(
      isPluginEnabledForProject(db, {
        pluginId: "master",
        projectId: home!.id,
      }),
    ).toBe(true);

    setPluginWorkspaceOwner(db, notifier, {
      pluginId: "master",
      projectId: alpha,
    });
    const owner = {
      projectId: alpha,
      name: "Alpha",
      localPaths: ["/srv/alpha"],
    };
    await expect(state().get()).resolves.toEqual(owner);
    expect(state().changes[1]).toEqual({ next: owner, previous: provisioned });
    expect(getProject(db, home!.id)?.ownerKind).toBe("user");
    expect(notifyProject).toHaveBeenCalledWith(alpha, [
      "project-plugins-changed",
    ]);

    setProjectPluginEnabled(db, notifier, {
      projectId: beta,
      pluginId: "master",
      enabled: true,
    });
    await expect(state().get()).resolves.toEqual(owner);
    expect(state().changes).toHaveLength(2);

    setPluginWorkspaceOwner(db, notifier, {
      pluginId: "master",
      projectId: null,
    });
    await expect(state().get()).resolves.toBeNull();
    expect(state().changes[2]).toEqual({ next: null, previous: owner });
    expect(state().changes).toHaveLength(3);
  });

  it("returns null and never fires for an any-scope plugin", async () => {
    const entry = await service.installPath(
      await writePlugin(workDir, {
        name: "bb-plugin-shared",
        projectScope: undefined,
      }),
    );
    expect(entry.projectScope).toBe("any");
    expect(state().initial).toBeNull();

    setProjectPluginEnabled(db, notifier, {
      projectId: alpha,
      pluginId: "shared",
      enabled: true,
    });
    await expect(state().get()).resolves.toBeNull();
    expect(state().changes).toEqual([]);
  });
});
