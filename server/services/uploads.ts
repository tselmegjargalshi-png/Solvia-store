import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { env } from '../env.ts';
import { badRequest } from '../lib/http.ts';
import { randomToken } from '../lib/security.ts';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { ext: 'webp', magic: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
};

let sharpMod: any = undefined;
async function loadSharp() {
  if (sharpMod !== undefined) return sharpMod;
  try {
    sharpMod = (await import('sharp')).default;
  } catch {
    sharpMod = null;
  }
  return sharpMod;
}

/**
 * Validate an uploaded image by declared type AND file signature, size-limit it,
 * then re-encode to WebP with sharp (which also strips EXIF/GPS metadata).
 * SVG is deliberately not accepted (it can carry script).
 */
export async function saveImageUpload(buf: Buffer, contentType: string): Promise<string> {
  const type = (contentType || '').split(';')[0].trim().toLowerCase();
  const spec = ALLOWED[type];
  if (!spec) throw badRequest('Only JPEG, PNG or WebP images are allowed.');
  if (buf.length === 0) throw badRequest('The file is empty.');
  if (buf.length > MAX_UPLOAD_BYTES) throw badRequest('Images must be 5 MB or smaller.');
  if (!spec.magic(buf)) throw badRequest('The file content does not match its image type.');

  mkdirSync(env.uploadDir, { recursive: true });
  const name = `${Date.now().toString(36)}-${randomToken(8)}`;
  const sharp = await loadSharp();
  if (sharp) {
    try {
      const out = await sharp(buf, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      writeFileSync(path.join(env.uploadDir, `${name}.webp`), out);
      return `/uploads/${name}.webp`;
    } catch {
      throw badRequest('The image could not be processed.');
    }
  }
  writeFileSync(path.join(env.uploadDir, `${name}.${spec.ext}`), buf);
  return `/uploads/${name}.${spec.ext}`;
}
