import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getDb, getSql } from './client';

let migrated = false;

export async function runMigrations() {
	if (migrated) return;
	const folder = join(process.cwd(), 'drizzle');
	await migrate(getDb(), { migrationsFolder: folder });
	const guards = readFileSync(join(folder, 'guards.sql'), 'utf8');
	await getSql().unsafe(guards);
	migrated = true;
}

export function resetMigrationFlag() {
	migrated = false;
}
