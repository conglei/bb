import { describe, expect, it } from "vitest";
import { createConnection, migrate } from "../src/index.js";
import { relocatedForkMigrations } from "../src/migration-history.js";
import {
  dropPluginFailureLabelColumns,
  dropProjectOwnerColumns,
  dropQueuedMessageDeliveryColumns,
  dropThreadStatusChangedAtColumn,
  restoreDiffViewedFilesTable,
} from "./helpers/rewind.js";

type Db = ReturnType<typeof createConnection>;

const firstUpstreamMigrationWhen = 1793309187609;

interface LedgerRow {
  createdAt: number;
  hash: string;
}

function ledger(db: Db): LedgerRow[] {
  return db.$client
    .prepare<[], LedgerRow>(
      "SELECT hash, created_at AS createdAt FROM __drizzle_migrations ORDER BY created_at",
    )
    .all();
}

function columnNames(db: Db, table: string): string[] {
  return db.$client
    .prepare<[], { name: string }>(`PRAGMA table_info(${table})`)
    .all()
    .map((column) => column.name);
}

function tableNames(db: Db): string[] {
  return db.$client
    .prepare<[], { name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    )
    .all()
    .map((row) => row.name);
}

function databaseOnLegacyForkLedger(appliedForkMigrations: number): {
  db: Db;
  expectedLedger: LedgerRow[];
} {
  const db = createConnection(":memory:");
  migrate(db);
  const expectedLedger = ledger(db);

  dropQueuedMessageDeliveryColumns(db);
  dropThreadStatusChangedAtColumn(db);
  restoreDiffViewedFilesTable(db);
  db.$client.exec(`
    DROP INDEX IF EXISTS terminal_sessions_exited_prune_idx;
    DROP TABLE IF EXISTS sweep_item_failures;
    DROP INDEX IF EXISTS thread_purges_requested_idx;
    DROP TABLE IF EXISTS thread_purges;
    DROP INDEX IF EXISTS project_sources_default_project_idx;
  `);
  dropPluginFailureLabelColumns(db);
  if (appliedForkMigrations < 4) {
    dropProjectOwnerColumns(db);
  }

  const forkLedger = expectedLedger.slice(-relocatedForkMigrations.length);
  db.$client
    .prepare("DELETE FROM __drizzle_migrations WHERE created_at >= ?")
    .run(firstUpstreamMigrationWhen);
  const insert = db.$client.prepare<[string, number]>(
    "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
  );
  relocatedForkMigrations
    .slice(0, appliedForkMigrations)
    .forEach((relocation, index) => {
      insert.run(forkLedger[index]!.hash, relocation.legacyWhen);
    });
  return { db, expectedLedger };
}

describe("relocating the fork's project migrations", () => {
  it("moves a fully applied legacy ledger onto 0157-0160 and applies upstream's skipped migrations", () => {
    const { db, expectedLedger } = databaseOnLegacyForkLedger(4);
    try {
      migrate(db);
      expect(ledger(db)).toEqual(expectedLedger);
      expect(columnNames(db, "queued_thread_messages")).toEqual(
        expect.arrayContaining(["delivery_mode", "coalesce_key"]),
      );
      expect(columnNames(db, "threads")).toContain("status_changed_at");
      expect(columnNames(db, "plugins")).toContain("last_failure_label");
      expect(tableNames(db)).toEqual(
        expect.arrayContaining(["sweep_item_failures", "thread_purges"]),
      );
      expect(tableNames(db)).not.toContain("diff_viewed_files");
      expect(columnNames(db, "projects")).toEqual(
        expect.arrayContaining(["icon", "owner_kind", "owner_plugin_id"]),
      );
    } finally {
      db.$client.close();
    }
  });

  it("runs the fork migrations a partially applied legacy ledger never reached", () => {
    const { db, expectedLedger } = databaseOnLegacyForkLedger(3);
    try {
      migrate(db);
      expect(ledger(db)).toEqual(expectedLedger);
      expect(columnNames(db, "projects")).toEqual(
        expect.arrayContaining(["icon", "owner_kind", "owner_plugin_id"]),
      );
    } finally {
      db.$client.close();
    }
  });

  it("leaves a database without legacy fork rows to the normal migrator", () => {
    const db = createConnection(":memory:");
    try {
      migrate(db);
      const before = ledger(db);
      migrate(db);
      expect(ledger(db)).toEqual(before);
      for (const relocation of relocatedForkMigrations) {
        expect(before.map((row) => row.createdAt)).not.toContain(
          relocation.legacyWhen,
        );
      }
    } finally {
      db.$client.close();
    }
  });
});
