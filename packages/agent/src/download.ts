import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { UpdateAsset } from '@easyserver/core';

/** Streams an update asset to disk, reporting progress, and verifies its SHA-512 before returning. */
export async function downloadVerified(asset: UpdateAsset, dest: string, onProgress?: (fraction: number) => void): Promise<string> {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest) && (await sha512File(dest)) === asset.sha512) return dest; // already downloaded
  const res = await fetch(asset.url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status})`);
  const part = dest + '.part';
  const out = fs.createWriteStream(part);
  const hash = crypto.createHash('sha512');
  let got = 0;
  const reader = (res.body as any).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
    got += value.length;
    if (!out.write(value)) await new Promise((r) => out.once('drain', r));
    onProgress?.(asset.size ? got / asset.size : 0);
  }
  await new Promise<void>((r, j) => out.end((e?: Error) => (e ? j(e) : r())));
  if (hash.digest('hex') !== asset.sha512) {
    fs.rmSync(part, { force: true });
    throw new Error('The download was corrupted (checksum mismatch). It will be tried again later.');
  }
  fs.renameSync(part, dest);
  return dest;
}

export function sha512File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha512');
    fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}
