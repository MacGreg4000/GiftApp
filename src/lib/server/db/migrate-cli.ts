import { runMigrations } from './migrate';
import { closeDb } from './client';

runMigrations()
	.then(async () => {
		console.log('Migrations appliquées.');
		await closeDb();
	})
	.catch(async (error) => {
		console.error(error);
		await closeDb();
		process.exit(1);
	});
