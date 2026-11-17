import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getConfig } from '../config';
import * as schema from './schema';

type Database = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
	nsSql?: ReturnType<typeof postgres>;
	nsDb?: Database;
};

export function getSql() {
	if (!globalForDb.nsSql) {
		globalForDb.nsSql = postgres(getConfig().databaseUrl, {
			max: 10,
			connect_timeout: 15,
			idle_timeout: 20
		});
	}
	return globalForDb.nsSql;
}

export function getDb() {
	if (!globalForDb.nsDb) {
		globalForDb.nsDb = drizzle(getSql(), { schema });
	}
	return globalForDb.nsDb;
}

export async function closeDb() {
	if (globalForDb.nsSql) {
		await globalForDb.nsSql.end({ timeout: 5 });
		globalForDb.nsSql = undefined;
		globalForDb.nsDb = undefined;
	}
}
