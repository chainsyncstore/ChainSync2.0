import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

type Snapshot = {
  id: string;
  version: string;
  dialect: string;
  tables: Record<string, { name: string; schema: string | null | undefined }>;
};

describe('Schema smoke test against migrations snapshot', () => {
  function getLatestSnapshotPath(): string {
    const metaDir = path.resolve(process.cwd(), 'migrations', 'meta');
    const journalPath = path.join(metaDir, '_journal.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as { entries: Array<{ tag: string }> };
    if (!journal.entries?.length) throw new Error('No migration journal entries found');
    const last = journal.entries[journal.entries.length - 1];
    const idx = last.tag.split('_')[0]; // e.g., 0001
    const snap = path.join(metaDir, `${idx}_snapshot.json`);
    if (!fs.existsSync(snap)) throw new Error(`Snapshot not found: ${snap}`);
    return snap;
  }

  it('contains core PRD tables required by app', () => {
    const snapPath = getLatestSnapshotPath();
    const snapshot = JSON.parse(fs.readFileSync(snapPath, 'utf8')) as Snapshot;
    const tables = snapshot.tables || {};

    const required: Array<[key: string, name: string]> = [
      ['public.organizations', 'organizations'],
      ['public.subscriptions', 'subscriptions'],
      ['public.subscription_payments', 'subscription_payments'],
      ['public.webhook_events', 'webhook_events'],
    ];

    for (const [key, name] of required) {
      const t = (tables as any)[key];
      expect(t, `Missing table key in snapshot: ${key}`).toBeTruthy();
      expect(t.name, `Table name mismatch for ${key}`).toBe(name);
    }
  });
});
