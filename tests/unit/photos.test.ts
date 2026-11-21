import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { encodeImage, sniffImage } from '#lib/server/photos';

describe('photos', () => {
	it('reconnaît les formats autorisés et refuse le reste', () => {
		expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('jpeg');
		expect(sniffImage(Buffer.from('<html></html>'))).toBeNull();
	});

	it('réencode en WebP et retire les métadonnées', async () => {
		const secret = 'coordonnees-secretes-exif';
		const input = await sharp({
			create: { width: 40, height: 24, channels: 3, background: { r: 180, g: 40, b: 40 } }
		})
			.jpeg()
			.withMetadata({ exif: { IFD0: { ImageDescription: secret } } })
			.toBuffer();
		expect(input.toString('latin1')).toContain(secret);
		const encoded = await encodeImage(input);
		const meta = await sharp(encoded.full).metadata();
		expect(meta.format).toBe('webp');
		expect(meta.exif).toBeUndefined();
		expect(encoded.full.toString('latin1')).not.toContain(secret);
		expect(encoded.thumb.length).toBeGreaterThan(10);
		expect(encoded.width).toBeLessThanOrEqual(1200);
	});
});
