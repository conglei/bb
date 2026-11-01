import { cp, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  createProject,
  getPluginOwnedProject,
  listEnabledProjectIdsForPlugin,
  setProjectOwner,
  type DbConnection,
  type DbNotifier,
} from "@bb/db";
import { readPrimaryHostIdFromDataDir } from "../hosts/primary-host.js";
import type { PluginManifest } from "./manifest.js";

export type PluginWorkspaceOutcome =
  | { kind: "existing"; projectId: string }
  | { kind: "adopted"; projectId: string }
  | { kind: "created"; projectId: string; path: string }
  | { kind: "deferred"; reason: string };

export function pluginWorkspaceDirectory(
  dataDir: string,
  pluginId: string,
): string {
  return join(dataDir, "plugins", pluginId, "workspace");
}

async function isEmptyDirectory(path: string): Promise<boolean> {
  return (await readdir(path)).length === 0;
}

export async function ensurePluginWorkspace(args: {
  db: DbConnection;
  notifier: DbNotifier;
  dataDir: string;
  logger: { info(message: string): void; warn(message: string): void };
  pluginId: string;
  manifest: Pick<PluginManifest, "workspace" | "projectScope">;
}): Promise<PluginWorkspaceOutcome | null> {
  const { db, notifier, pluginId, manifest } = args;
  if (manifest.workspace === null) return null;
  const existing = getPluginOwnedProject(db, pluginId);
  if (existing !== null) {
    return { kind: "existing", projectId: existing.id };
  }
  if (manifest.projectScope === "single") {
    const legacyOwnerId =
      listEnabledProjectIdsForPlugin(db, { pluginId })[0] ?? null;
    if (legacyOwnerId !== null) {
      const adopted = setProjectOwner(db, notifier, {
        projectId: legacyOwnerId,
        owner: { kind: "plugin", pluginId },
      });
      if (adopted !== null) {
        args.logger.info(
          `plugin ${pluginId} adopted project ${adopted.id} as its workspace`,
        );
        return { kind: "adopted", projectId: adopted.id };
      }
    }
  }
  const hostId = readPrimaryHostIdFromDataDir({ dataDir: args.dataDir });
  if (hostId === null) {
    return {
      kind: "deferred",
      reason: "the server's own host is not enrolled yet",
    };
  }
  const path = pluginWorkspaceDirectory(args.dataDir, pluginId);
  await mkdir(path, { recursive: true });
  if (manifest.workspace.seedPath !== null && (await isEmptyDirectory(path))) {
    await cp(manifest.workspace.seedPath, path, {
      recursive: true,
      errorOnExist: false,
      force: false,
    });
  }
  const { project } = createProject(db, notifier, {
    name: manifest.workspace.name,
    source: { type: "local_path", hostId, path },
    owner: { kind: "plugin", pluginId },
  });
  args.logger.info(
    `plugin ${pluginId} workspace provisioned as project ${project.id} at ${path}`,
  );
  return { kind: "created", projectId: project.id, path };
}
