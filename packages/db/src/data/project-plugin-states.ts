import { and, desc, eq, ne } from "drizzle-orm";
import type { DbConnection } from "../connection.js";
import { projectPluginStates } from "../schema.js";

export interface ProjectPluginStateRow {
  projectId: string;
  pluginId: string;
  enabled: boolean;
  updatedAt: number;
}

export function getProjectPluginState(
  db: DbConnection,
  args: { projectId: string; pluginId: string },
): ProjectPluginStateRow | null {
  return (
    db
      .select()
      .from(projectPluginStates)
      .where(
        and(
          eq(projectPluginStates.projectId, args.projectId),
          eq(projectPluginStates.pluginId, args.pluginId),
        ),
      )
      .get() ?? null
  );
}

export function listProjectPluginStates(
  db: DbConnection,
  args: { projectId: string },
): ProjectPluginStateRow[] {
  return db
    .select()
    .from(projectPluginStates)
    .where(eq(projectPluginStates.projectId, args.projectId))
    .orderBy(projectPluginStates.pluginId)
    .all();
}

export function upsertProjectPluginState(
  db: DbConnection,
  args: { projectId: string; pluginId: string; enabled: boolean },
): ProjectPluginStateRow {
  const updatedAt = Date.now();
  return db
    .insert(projectPluginStates)
    .values({
      projectId: args.projectId,
      pluginId: args.pluginId,
      enabled: args.enabled,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [projectPluginStates.projectId, projectPluginStates.pluginId],
      set: { enabled: args.enabled, updatedAt },
    })
    .returning()
    .get();
}

export function deleteProjectPluginState(
  db: DbConnection,
  args: { projectId: string; pluginId: string },
): boolean {
  const deleted = db
    .delete(projectPluginStates)
    .where(
      and(
        eq(projectPluginStates.projectId, args.projectId),
        eq(projectPluginStates.pluginId, args.pluginId),
      ),
    )
    .returning({ pluginId: projectPluginStates.pluginId })
    .all();
  return deleted.length > 0;
}

export function deleteProjectPluginStatesForPlugin(
  db: DbConnection,
  args: { pluginId: string },
): number {
  return db
    .delete(projectPluginStates)
    .where(eq(projectPluginStates.pluginId, args.pluginId))
    .returning({ projectId: projectPluginStates.projectId })
    .all().length;
}

export function listEnabledProjectIdsForPlugin(
  db: DbConnection,
  args: { pluginId: string },
): string[] {
  return db
    .select({
      projectId: projectPluginStates.projectId,
      updatedAt: projectPluginStates.updatedAt,
    })
    .from(projectPluginStates)
    .where(
      and(
        eq(projectPluginStates.pluginId, args.pluginId),
        eq(projectPluginStates.enabled, true),
      ),
    )
    .orderBy(desc(projectPluginStates.updatedAt), projectPluginStates.projectId)
    .all()
    .map((row) => row.projectId);
}

export function deleteProjectPluginStatesForPluginExcept(
  db: DbConnection,
  args: { pluginId: string; keepProjectId: string },
): string[] {
  return db
    .delete(projectPluginStates)
    .where(
      and(
        eq(projectPluginStates.pluginId, args.pluginId),
        ne(projectPluginStates.projectId, args.keepProjectId),
      ),
    )
    .returning({ projectId: projectPluginStates.projectId })
    .all()
    .map((row) => row.projectId);
}
