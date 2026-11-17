import { auditLog } from '../db/schema';
import { getDb } from '../db/client';

export async function audit(entry: {
	actor: string;
	action: string;
	targetId?: string | null;
	details?: Record<string, unknown> | null;
}) {
	await getDb().insert(auditLog).values({
		actor: entry.actor,
		action: entry.action,
		targetId: entry.targetId ?? null,
		details: entry.details ?? null
	});
}
