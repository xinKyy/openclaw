import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);

function requireNodeSqlite(): typeof import("node:sqlite") {
  try {
    return require("node:sqlite") as typeof import("node:sqlite");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `SQLite support is unavailable in this Node runtime (missing node:sqlite). ${message}`,
      { cause: err },
    );
  }
}

const SCHEMA_VERSION = 1;

const MIGRATIONS: Record<number, string[]> = {
  1: [
    `CREATE TABLE IF NOT EXISTS channel_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      msg_id TEXT NOT NULL UNIQUE,
      channel TEXT NOT NULL,
      group_id TEXT,
      group_name TEXT,
      sender TEXT,
      sender_name TEXT,
      content TEXT,
      raw_context TEXT,
      chat_type TEXT,
      thread_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_messages_group_time ON channel_messages(group_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_messages_channel ON channel_messages(channel, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_messages_sender ON channel_messages(sender, created_at)`,

    `CREATE TABLE IF NOT EXISTS sop_tasks (
      id TEXT PRIMARY KEY,
      sop_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      project_id TEXT,
      status TEXT DEFAULT 'pending',
      current_step TEXT,
      context TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_sop_tasks_agent ON sop_tasks(agent_id, status)`,

    `CREATE TABLE IF NOT EXISTS sop_step_logs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      step_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      input TEXT,
      output TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (task_id) REFERENCES sop_tasks(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_step_logs_task ON sop_step_logs(task_id)`,

    `CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
  ],
};

function runMigrations(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

  const row = db.prepare(`SELECT value FROM schema_meta WHERE key = 'version'`).get() as
    | { value: string }
    | undefined;
  const currentVersion = row ? parseInt(row.value, 10) : 0;

  for (let v = currentVersion + 1; v <= SCHEMA_VERSION; v++) {
    const stmts = MIGRATIONS[v];
    if (!stmts) continue;
    for (const sql of stmts) {
      db.exec(sql);
    }
  }

  if (currentVersion === 0) {
    db.exec(`INSERT INTO schema_meta (key, value) VALUES ('version', '${SCHEMA_VERSION}')`);
  } else if (currentVersion < SCHEMA_VERSION) {
    db.exec(`UPDATE schema_meta SET value = '${SCHEMA_VERSION}' WHERE key = 'version'`);
  }
}

export function initDatabase(dataDir: string): DatabaseSync {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "solo-company.db");
  const { DatabaseSync } = requireNodeSqlite();
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA foreign_keys=ON");
  runMigrations(db);
  return db;
}
