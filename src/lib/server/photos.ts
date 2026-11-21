import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { getConfig } from './config';
import { getDb } from './db/client';
import { groupMember, photo, wish, wishList } from './db/schema';

const MAX_UPLOAD = 10 * 1024 * 1024;
const KEY_RE = /^\d{4}\/\d{2}\/[0-9a-f-]{36}$/i;

export class PhotoError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PhotoError';
	}
}

export function sniffImage(buffer: Buffer): 'jpeg' | 'png' | 'webp' | 'heic' | null {
	if (buffer.length < 12) return null;
	if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
	if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
	if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
		return 'webp';
	}
	if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
		const brand = buffer.subarray(8, 12).toString('ascii');
		if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'heic';
	}
	return null;
}

export async function encodeImage(buffer: Buffer): Promise<{ full: Buffer; thumb: Buffer; width: number; height: number }> {
	const sharp = (await import('sharp')).default;
	try {
		const base = sharp(buffer, { failOn: 'error', limitInputPixels: 24_000_000, animated: false }).rotate();
		const full = await base
			.clone()
			.resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
			.webp({ quality: 80 })
			.toBuffer({ resolveWithObject: true });
		const thumb = await base
			.clone()
			.resize({ width: 320, height: 320, fit: 'cover', position: 'attention' })
			.webp({ quality: 72 })
			.toBuffer();
		return { full: full.data, thumb, width: full.info.width, height: full.info.height };
	} catch (error) {
		console.error('[photo] décodage impossible', error);
		throw new PhotoError('Cette photo ne peut pas être lue. Essayez JPEG, PNG ou WebP.');
	}
}

function storageKey(): string {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Europe/Brussels',
		year: 'numeric',
		month: '2-digit'
	}).formatToParts(new Date());
	const year = parts.find((part) => part.type === 'year')?.value ?? '2026';
	const month = parts.find((part) => part.type === 'month')?.value ?? '01';
	return `${year}/${month}/${randomUUID()}`;
}

export function photoFile(storageKey: string, thumb: boolean): string | null {
	if (!KEY_RE.test(storageKey)) return null;
	const root = resolve(getConfig().uploadDir);
	const name = thumb ? `${storageKey}_thumb.webp` : `${storageKey}.webp`;
	const file = resolve(root, name);
	if (file !== root && !file.startsWith(root + sep)) return null;
	return file;
}

export async function storeImage(
	buffer: Buffer,
	source: 'upload' | 'link_preview',
	uploadedBy: string | null
): Promise<{ id: string }> {
	if (buffer.length === 0) throw new PhotoError('La photo est vide.');
	if (buffer.length > MAX_UPLOAD) throw new PhotoError('La photo dépasse 10 Mo.');
	if (source === 'upload' && !sniffImage(buffer)) {
		throw new PhotoError('Choisissez une photo JPEG, PNG, WebP ou HEIC.');
	}
	const encoded = await encodeImage(buffer);
	const key = storageKey();
	const fullPath = photoFile(key, false);
	const thumbPath = photoFile(key, true);
	if (!fullPath || !thumbPath) throw new PhotoError('Enregistrement impossible.');
	const rows = await getDb()
		.insert(photo)
		.values({
			storageKey: key,
			source,
			width: encoded.width,
			height: encoded.height,
			bytes: encoded.full.length,
			uploadedBy
		})
		.returning({ id: photo.id });
	const id = rows[0]!.id;
	try {
		await mkdir(dirname(fullPath), { recursive: true });
		await writeFile(fullPath, encoded.full);
		await writeFile(thumbPath, encoded.thumb);
	} catch (error) {
		await getDb().delete(photo).where(eq(photo.id, id));
		await rm(fullPath, { force: true }).catch(() => undefined);
		await rm(thumbPath, { force: true }).catch(() => undefined);
		throw error;
	}
	return { id };
}

export async function readPhoto(
	photoId: string,
	viewer: { role: 'admin' } | { role: 'member'; userId: string },
	thumb: boolean
): Promise<{ bytes: Buffer } | null> {
	const rows = await getDb()
		.select({
			storageKey: photo.storageKey,
			uploadedBy: photo.uploadedBy
		})
		.from(photo)
		.where(eq(photo.id, photoId))
		.limit(1);
	const row = rows[0];
	if (!row) return null;
	if (viewer.role !== 'admin') {
		const own = row.uploadedBy === viewer.userId;
		const shared = await getDb()
			.select({ id: wish.id })
			.from(wish)
			.innerJoin(wishList, eq(wishList.id, wish.listId))
			.innerJoin(groupMember, eq(groupMember.groupId, wishList.groupId))
			.where(
				and(
					eq(groupMember.userId, viewer.userId),
					sql`${wish.deletedAt} IS NULL`,
					sql`(${wish.photoId} = ${photoId} OR ${wish.linkPreview}->>'image_photo_id' = ${photoId})`
				)
			)
			.limit(1);
		if (!own && !shared[0]) return null;
	}
	const file = photoFile(row.storageKey, thumb);
	if (!file) return null;
	try {
		return { bytes: await readFile(file) };
	} catch {
		return null;
	}
}

/** Photos jamais rattachées à un souhait, plus vieilles que sept jours. */
export async function cleanupOrphanPhotos(): Promise<void> {
	const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
	const rows = await getDb()
		.select({ id: photo.id, storageKey: photo.storageKey })
		.from(photo)
		.where(
			and(
				sql`${photo.createdAt} < ${cutoff}`,
				sql`not exists (
					select 1 from wish w
					where w.photo_id = ${photo.id}
					or w.link_preview->>'image_photo_id' = ${photo.id}::text
				)`
			)
		);
	for (const row of rows) {
		const full = photoFile(row.storageKey, false);
		const thumb = photoFile(row.storageKey, true);
		if (full) await rm(full, { force: true }).catch(() => undefined);
		if (thumb) await rm(thumb, { force: true }).catch(() => undefined);
		await getDb().delete(photo).where(eq(photo.id, row.id));
	}
}
