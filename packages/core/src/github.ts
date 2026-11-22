import { MANIFEST_FILE } from './config';

export interface GithubLocation {
  owner: string;
  repo: string;
  ref: string;
  dir: string; // '' or 'path/to/plugin'
}

/**
 * Accepts any of:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/tree/<ref>/path/to/plugin
 *   https://github.com/owner/repo/blob/<ref>/path/to/easyserver.plugin.json
 *   https://raw.githubusercontent.com/owner/repo/<ref>/path/to/easyserver.plugin.json
 */
export function parseGithubUrl(input: string): GithubLocation {
  const url = new URL(input.trim());
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const strip = (segs: string[]) => {
    if (segs.length && segs[segs.length - 1] === MANIFEST_FILE) segs = segs.slice(0, -1);
    return segs.join('/');
  };
  if (url.hostname === 'raw.githubusercontent.com') {
    if (parts.length < 3) throw new Error('Incomplete raw.githubusercontent.com URL');
    const [owner, repo, ref, ...rest] = parts;
    return { owner, repo, ref, dir: strip(rest) };
  }
  if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') throw new Error('Only GitHub URLs are supported');
  if (parts.length < 2) throw new Error('GitHub URL must include owner and repository');
  const [owner, rawRepo, kind, ref, ...rest] = parts;
  const repo = rawRepo.replace(/\.git$/, '');
  if (!kind) return { owner, repo, ref: 'HEAD', dir: '' };
  if ((kind === 'tree' || kind === 'blob') && ref) return { owner, repo, ref, dir: strip(rest) };
  throw new Error('Unrecognised GitHub URL');
}

const SAFE = /^[A-Za-z0-9._\-/]+$/;

export function rawUrl(loc: GithubLocation, file: string): string {
  if (!SAFE.test(file) || file.split('/').includes('..')) throw new Error(`Unsafe file path: ${file}`);
  const enc = (s: string) => s.split('/').map(encodeURIComponent).join('/');
  const path = [loc.dir, file].filter(Boolean).join('/');
  return `https://raw.githubusercontent.com/${enc(loc.owner)}/${enc(loc.repo)}/${enc(loc.ref)}/${enc(path)}`;
}

export const manifestUrl = (loc: GithubLocation) => rawUrl(loc, MANIFEST_FILE);
