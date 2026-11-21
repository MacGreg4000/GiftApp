import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { latestBackup } from '#lib/server/backup';

describe('dernière sauvegarde', () => {
	it('retient le dump le plus récent et signale un fichier trop vieux', () => {
		const dir = mkdtempSync(join(tmpdir(), 'ns-backup-'));
		mkdirSync(join(dir, 'daily'));
		const oldFile = join(dir, 'daily', 'wishlist-old.sql.gz');
		const freshFile = join(dir, 'daily', 'wishlist-fresh.sql.gz');
		writeFileSync(oldFile, 'a');
		writeFileSync(freshFile, 'b');
		const now = new Date('2026-11-21T12:00:00Z');
		utimesSync(oldFile, now, new Date(now.getTime() - 48 * 60 * 60 * 1000));
		utimesSync(freshFile, now, new Date(now.getTime() - 2 * 60 * 60 * 1000));
		const found = latestBackup(dir, now);
		expect(found?.file).toBe(freshFile);
		expect(found?.stale).toBe(false);
		utimesSync(freshFile, now, new Date(now.getTime() - 40 * 60 * 60 * 1000));
		expect(latestBackup(dir, now)?.stale).toBe(true);
		expect(latestBackup(join(dir, 'absent'), now)).toBeNull();
	});
});
