import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { migrations } from './migrations.ts';

export type Row = Record<string, any>;

let db: DatabaseSync | null = null;

export function openDb(file: string): DatabaseSync {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const d = new DatabaseSync(file);
  d.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(d);
  db = d;
  return d;
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error('Database not opened');
  return db;
}

export function closeDb() {
  db?.close();
  db = null;
}

function migrate(d: DatabaseSync) {
  d.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set((d.prepare('SELECT id FROM schema_migrations').all() as Row[]).map((r) => r.id));
  for (const m of migrations) {
    if (applied.has(m.id)) continue;
    d.exec('BEGIN IMMEDIATE');
    try {
      d.exec(m.sql);
      d.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(m.id, now());
      d.exec('COMMIT');
    } catch (e) {
      d.exec('ROLLBACK');
      throw e;
    }
  }
}

export function now(): string {
  return new Date().toISOString();
}

/** Small typed helpers over prepared statements. */
export function all<T = Row>(sql: string, ...params: any[]): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}
export function get<T = Row>(sql: string, ...params: any[]): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}
export function run(sql: string, ...params: any[]) {
  return getDb().prepare(sql).run(...params);
}

/**
 * Run fn inside a write transaction. node:sqlite is synchronous, and BEGIN IMMEDIATE
 * takes the write lock up front, so the stock check + decrement + order insert in
 * checkout happen atomically even with multiple processes on the same file.
 */
export function tx<T>(fn: () => T): T {
  const d = getDb();
  d.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    d.exec('COMMIT');
    return result;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}
