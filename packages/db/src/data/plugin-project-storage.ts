import { and, asc, eq, sql } from "drizzle-orm";
import type { DbConnection } from "../connection.js";
import { pluginProjectKv, pluginProjectSettings } from "../schema.js";
import { likePrefixPattern } from "./sql-like.js";

export interface PluginProjectScope {
  pluginId: string;
  projectId: string;
}

function kvScope(scope: PluginProjectScope) {
  return and(
    eq(pluginProjectKv.pluginId, scope.pluginId),
    eq(pluginProjectKv.projectId, scope.projectId),
  );
}

function settingsScope(scope: PluginProjectScope) {
  return and(
    eq(pluginProjectSettings.pluginId, scope.pluginId),
    eq(pluginProjectSettings.projectId, scope.projectId),
  );
}

export function getPluginProjectKvValue(
  db: DbConnection,
  scope: PluginProjectScope,
  key: string,
): string | undefined {
  return db
    .select({ value: pluginProjectKv.value })
    .from(pluginProjectKv)
    .where(and(kvScope(scope), eq(pluginProjectKv.key, key)))
    .get()?.value;
}

export function setPluginProjectKvValue(
  db: DbConnection,
  scope: PluginProjectScope,
  key: string,
  value: string,
): void {
  const updatedAt = Date.now();
  db.insert(pluginProjectKv)
    .values({ ...scope, key, value, updatedAt })
    .onConflictDoUpdate({
      target: [
        pluginProjectKv.pluginId,
        pluginProjectKv.projectId,
        pluginProjectKv.key,
      ],
      set: { value, updatedAt },
    })
    .run();
}

export function deletePluginProjectKvValue(
  db: DbConnection,
  scope: PluginProjectScope,
  key: string,
): boolean {
  const result = db
    .delete(pluginProjectKv)
    .where(and(kvScope(scope), eq(pluginProjectKv.key, key)))
    .run();
  return result.changes > 0;
}

export function listPluginProjectKvKeys(
  db: DbConnection,
  scope: PluginProjectScope,
  prefix?: string,
): string[] {
  const conditions = [kvScope(scope)];
  if (prefix !== undefined && prefix.length > 0) {
    conditions.push(
      sql`${pluginProjectKv.key} LIKE ${likePrefixPattern(prefix)} ESCAPE '\\'`,
    );
  }
  return db
    .select({ key: pluginProjectKv.key })
    .from(pluginProjectKv)
    .where(and(...conditions))
    .orderBy(asc(pluginProjectKv.key))
    .all()
    .map((row) => row.key);
}

export function getPluginProjectSettingsValues(
  db: DbConnection,
  scope: PluginProjectScope,
): Record<string, string> {
  const rows = db
    .select({ key: pluginProjectSettings.key, value: pluginProjectSettings.value })
    .from(pluginProjectSettings)
    .where(settingsScope(scope))
    .all();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export function setPluginProjectSettingsValues(
  db: DbConnection,
  scope: PluginProjectScope,
  values: Record<string, string | null>,
): void {
  const updatedAt = Date.now();
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(values)) {
      if (value === null) {
        tx.delete(pluginProjectSettings)
          .where(and(settingsScope(scope), eq(pluginProjectSettings.key, key)))
          .run();
        continue;
      }
      tx.insert(pluginProjectSettings)
        .values({ ...scope, key, value, updatedAt })
        .onConflictDoUpdate({
          target: [
            pluginProjectSettings.pluginId,
            pluginProjectSettings.projectId,
            pluginProjectSettings.key,
          ],
          set: { value, updatedAt },
        })
        .run();
    }
  });
}

export function deleteAllPluginProjectData(
  db: DbConnection,
  pluginId: string,
): { kv: number; settings: number } {
  const kv = db
    .delete(pluginProjectKv)
    .where(eq(pluginProjectKv.pluginId, pluginId))
    .run().changes;
  const settings = db
    .delete(pluginProjectSettings)
    .where(eq(pluginProjectSettings.pluginId, pluginId))
    .run().changes;
  return { kv, settings };
}

export function deletePluginProjectData(
  db: DbConnection,
  scope: PluginProjectScope,
): { kv: number; settings: number } {
  const kv = db.delete(pluginProjectKv).where(kvScope(scope)).run().changes;
  const settings = db
    .delete(pluginProjectSettings)
    .where(settingsScope(scope))
    .run().changes;
  return { kv, settings };
}
