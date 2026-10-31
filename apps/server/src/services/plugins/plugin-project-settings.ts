import {
  deletePluginProjectKvValue,
  getPluginProjectKvValue,
  getPluginProjectSettingsValues,
  getProject,
  listPluginProjectKvKeys,
  setPluginProjectKvValue,
  setPluginProjectSettingsValues,
  type DbConnection,
} from "@bb/db";
import type {
  PluginKvStorage,
  PluginSettingDescriptor,
  PluginSettingDescriptors,
  PluginSettingValue,
} from "@get-bb/plugin-sdk";
import {
  coerceStoredPluginSettingValue,
  KV_VALUE_MAX_BYTES,
  validateSettingsUpdate,
} from "@get-bb/plugin-sdk/internal/host-policy";
export { registerProjectSettingDescriptors } from "@get-bb/plugin-sdk/internal/host-policy";
import type { PluginSettingDescriptor as PublicPluginSettingDescriptor } from "@bb/server-contract";
import {
  PluginSettingsValidationError,
  type PluginSettingsView,
} from "./plugin-settings.js";

export class UnknownProjectError extends Error {
  constructor(projectId: string) {
    super(`unknown project "${projectId}"`);
    this.name = "UnknownProjectError";
  }
}

export type PluginProjectSettingsListener = (
  projectId: string,
  next: Record<string, PluginSettingValue | undefined>,
  prev: Record<string, PluginSettingValue | undefined>,
) => void;

export interface PluginProjectSettingsRecord {
  descriptors: PluginSettingDescriptors;
  listeners: PluginProjectSettingsListener[];
}

export function assertProjectExists(db: DbConnection, projectId: string): void {
  if (!getProject(db, projectId)) throw new UnknownProjectError(projectId);
}

interface PluginProjectSettingsStoreArgs {
  db: DbConnection;
  pluginId: string;
  projectId: string;
  descriptors: PluginSettingDescriptors;
}

function parseStoredSettingValue(
  descriptor: PluginSettingDescriptor,
  raw: string | undefined,
): PluginSettingValue | undefined {
  let parsed: unknown;
  if (raw !== undefined) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
  }
  return coerceStoredPluginSettingValue(descriptor, parsed);
}

export function readPluginProjectSettingsValues(
  args: PluginProjectSettingsStoreArgs,
): Record<string, PluginSettingValue | undefined> {
  const stored = getPluginProjectSettingsValues(args.db, {
    pluginId: args.pluginId,
    projectId: args.projectId,
  });
  const values: Record<string, PluginSettingValue | undefined> = {};
  for (const [key, descriptor] of Object.entries(args.descriptors)) {
    values[key] = parseStoredSettingValue(
      descriptor,
      Object.hasOwn(stored, key) ? stored[key] : undefined,
    );
  }
  return values;
}

function writePluginProjectSettingsUpdate(
  args: PluginProjectSettingsStoreArgs & { values: Record<string, unknown> },
): void {
  const rowUpdates: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(args.values)) {
    if (!Object.hasOwn(args.descriptors, key)) continue;
    rowUpdates[key] = value === null ? null : JSON.stringify(value);
  }
  if (Object.keys(rowUpdates).length > 0) {
    setPluginProjectSettingsValues(
      args.db,
      { pluginId: args.pluginId, projectId: args.projectId },
      rowUpdates,
    );
  }
}

export function applyPluginProjectSettingsUpdate(args: {
  db: DbConnection;
  pluginId: string;
  projectId: string;
  record: PluginProjectSettingsRecord;
  values: Record<string, unknown>;
  onListenerError: (error: unknown) => void;
}): boolean {
  const errors = validateSettingsUpdate(args.record.descriptors, args.values);
  if (errors.length > 0) {
    throw new PluginSettingsValidationError(errors.join("; "));
  }
  assertProjectExists(args.db, args.projectId);
  const storeArgs = {
    db: args.db,
    pluginId: args.pluginId,
    projectId: args.projectId,
    descriptors: args.record.descriptors,
  };
  const prev = readPluginProjectSettingsValues(storeArgs);
  writePluginProjectSettingsUpdate({ ...storeArgs, values: args.values });
  const next = readPluginProjectSettingsValues(storeArgs);
  if (JSON.stringify(next) === JSON.stringify(prev)) return false;
  for (const listener of args.record.listeners) {
    try {
      listener(args.projectId, next, prev);
    } catch (error) {
      args.onListenerError(error);
    }
  }
  return true;
}

function publicSettingDescriptor(
  descriptor: PluginSettingDescriptor,
): PublicPluginSettingDescriptor {
  const publicDescriptor = { ...descriptor };
  delete publicDescriptor.experimental_schema;
  return publicDescriptor;
}

export function buildPluginProjectSettingsView(
  args: PluginProjectSettingsStoreArgs,
): PluginSettingsView {
  const effective = readPluginProjectSettingsValues(args);
  const values: Record<string, unknown> = {};
  for (const key of Object.keys(args.descriptors)) {
    if (effective[key] !== undefined) values[key] = effective[key];
  }
  return {
    schema: Object.fromEntries(
      Object.entries(args.descriptors).map(([key, descriptor]) => [
        key,
        publicSettingDescriptor(descriptor),
      ]),
    ),
    values,
  };
}

export function createPluginProjectKvStorage(args: {
  db: DbConnection;
  pluginId: string;
  projectId: string;
  assertLive: () => void;
}): PluginKvStorage {
  const scope = { pluginId: args.pluginId, projectId: args.projectId };
  return {
    async get(key) {
      args.assertLive();
      const raw = getPluginProjectKvValue(args.db, scope, key);
      if (raw === undefined) return undefined;
      return JSON.parse(raw);
    },
    async set(key, value) {
      args.assertLive();
      const json = JSON.stringify(value);
      if (json === undefined) {
        throw new Error(`kv value for "${key}" is not JSON-serializable`);
      }
      const bytes = Buffer.byteLength(json, "utf8");
      if (bytes > KV_VALUE_MAX_BYTES) {
        throw new Error(
          `kv value for "${key}" is ${bytes} bytes; the limit is ${KV_VALUE_MAX_BYTES} (256KB). ` +
            `Store large data in storage.database() instead.`,
        );
      }
      assertProjectExists(args.db, args.projectId);
      setPluginProjectKvValue(args.db, scope, key, json);
    },
    async delete(key) {
      args.assertLive();
      deletePluginProjectKvValue(args.db, scope, key);
    },
    async list(prefix) {
      args.assertLive();
      return listPluginProjectKvKeys(args.db, scope, prefix);
    },
  };
}
