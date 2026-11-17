import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export type BackupInfo = {
	file: string;
	mtime: Date;
	stale: boolean;
};

export function latestBackup(dir: string, now = new Date()): BackupInfo | null {
	if (!existsSync(dir)) return null;
	const found: { file: string; mtime: Date }[] = [];
	const walk = (current: string) => {
		let entries: string[] = [];
		try {
			entries = readdirSync(current);
		} catch {
			return;
		}
		for (const name of entries) {
			const path = join(current, name);
			let st;
			try {
				st = statSync(path);
			} catch {
				continue;
			}
			if (st.isDirectory()) walk(path);
			else if (st.isFile() && st.size > 0 && name.endsWith('.sql.gz')) {
				found.push({ file: path, mtime: st.mtime });
			}
		}
	};
	walk(dir);
	found.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
	const best = found[0];
	if (!best) return null;
	const age = now.getTime() - best.mtime.getTime();
	return { file: best.file, mtime: best.mtime, stale: age > 36 * 60 * 60 * 1000 };
}
