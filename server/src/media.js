// 레크레이션용 파일(사진·음원·배경) 관리.
// 파일은 스토리지에 `폴더/임의이름.확장자` 로 저장하고(스토리지 경로에 한글을 못 써서),
// 사람이 보는 이름은 목록 테이블(media_files)에 따로 둔다 — 이름을 바꿔도 주소는 그대로다.
import { randomUUID } from 'node:crypto';

export const MEDIA_EXT = /\.(png|jpe?g|gif|webp|svg|mp4|webm|mp3|wav|ogg|oga|m4a|aac)$/i;
export const FOLDERS = { question: 'questions', background: 'backgrounds' };
const MAX_NAME = 100;

export function fileType(path) {
  const ext = (path.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac'].includes(ext)) return 'audio';
  if (['mp4', 'webm'].includes(ext)) return 'video';
  return 'other';
}

export class MediaError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const cleanName = (name) => String(name ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, MAX_NAME);

// 관리할 수 있는 경로인지 (다른 폴더나 상위 경로를 건드리지 못하게)
function checkPath(path) {
  const p = String(path || '');
  const ok = Object.values(FOLDERS).some((f) => p.startsWith(`${f}/`)) && !p.includes('..') && /^[\w./-]+$/.test(p);
  if (!ok) throw new MediaError(400, '잘못된 파일 경로입니다.');
  return p;
}

/**
 * adapter (persistence.media):
 *   createUploadUrl(path) → { path, token, signedUrl, publicUrl }
 *   listObjects(folder)   → [{ path, size, createdAt, publicUrl }]
 *   removeObject(path)
 *   catalog: { list() → [{ path, name }], upsert({ path, name, folder, size }), remove(path) }
 *            — 테이블이 없으면 CatalogMissing 을 던진다
 */
export function createMediaService(adapter) {
  if (!adapter) return null;
  let catalogReady = true;

  async function catalogCall(fn, fallback) {
    try {
      const out = await fn();
      catalogReady = true;
      return out;
    } catch (e) {
      if (e.code === 'CATALOG_MISSING') { catalogReady = false; return fallback; }
      throw e;
    }
  }

  return {
    get catalogReady() { return catalogReady; },

    async list(kind = 'all') {
      const folders = kind === 'all' ? Object.values(FOLDERS) : [FOLDERS[kind] || FOLDERS.question];
      const objects = (await Promise.all(folders.map((f) => adapter.listObjects(f)))).flat();
      const names = new Map((await catalogCall(() => adapter.catalog.list(), [])).map((r) => [r.path, r.name]));
      return objects
        .map((o) => ({
          path: o.path,
          name: names.get(o.path) || o.path.split('/').pop(),
          named: names.has(o.path),
          folder: o.path.split('/')[0],
          type: fileType(o.path),
          size: o.size ?? null,
          createdAt: o.createdAt ?? null,
          publicUrl: o.publicUrl,
        }))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    },

    async prepareUpload(filename, kind) {
      const ext = String(filename || '').match(MEDIA_EXT)?.[0].toLowerCase();
      if (!ext) throw new MediaError(400, '지원하지 않는 파일 형식입니다. (이미지: png·jpg·gif·webp·svg, 음원: mp3·wav·m4a·ogg, 영상: mp4·webm)');
      const folder = FOLDERS[kind] || FOLDERS.question;
      return adapter.createUploadUrl(`${folder}/${randomUUID()}${ext}`);
    },

    // 올리기가 끝나면 원래 이름을 목록에 남긴다
    async complete(path, name, size) {
      const p = checkPath(path);
      const label = cleanName(name) || p.split('/').pop();
      const saved = await catalogCall(async () => {
        await adapter.catalog.upsert({ path: p, name: label, folder: p.split('/')[0], size: Number.isFinite(size) ? size : null });
        return true;
      }, false);
      return { path: p, name: label, catalog: saved };
    },

    async rename(path, name) {
      const p = checkPath(path);
      const label = cleanName(name);
      if (!label) throw new MediaError(400, '이름을 입력해주세요.');
      const saved = await catalogCall(async () => {
        await adapter.catalog.upsert({ path: p, name: label, folder: p.split('/')[0] });
        return true;
      }, false);
      if (!saved) throw new MediaError(409, '이름을 저장할 테이블이 없습니다. Supabase에서 supabase/migrations/002_media_files.sql 을 실행해주세요.');
      return { path: p, name: label };
    },

    async remove(path) {
      const p = checkPath(path);
      await adapter.removeObject(p);
      await catalogCall(() => adapter.catalog.remove(p), null);
      return { path: p };
    },
  };
}

// 테스트·로컬용 메모리 어댑터
export function createMemoryMediaAdapter({ withCatalog = true } = {}) {
  const objects = new Map(); // path → { size, createdAt }
  const names = new Map();
  const missing = () => Object.assign(new Error('catalog missing'), { code: 'CATALOG_MISSING' });
  return {
    objects,
    names,
    async createUploadUrl(path) {
      objects.set(path, { size: 0, createdAt: new Date().toISOString() });
      return { path, token: 't', signedUrl: `memory://upload/${path}`, publicUrl: `https://files.example/${path}` };
    },
    async listObjects(folder) {
      return [...objects.entries()].filter(([p]) => p.startsWith(`${folder}/`))
        .map(([path, o]) => ({ path, ...o, publicUrl: `https://files.example/${path}` }));
    },
    async removeObject(path) { objects.delete(path); },
    catalog: {
      async list() { if (!withCatalog) throw missing(); return [...names.entries()].map(([path, name]) => ({ path, name })); },
      async upsert({ path, name }) { if (!withCatalog) throw missing(); names.set(path, name); },
      async remove(path) { if (!withCatalog) throw missing(); names.delete(path); },
    },
  };
}

// 문제 세트에 "최경운.jpg" 처럼 파일 이름만 적은 경우, ⑥ 파일에 올린 파일(표시 이름 또는 저장 이름)과 맞춰
// 실제 주소로 바꾼다. 확장자를 빼고 적어도 하나로 정해지면 찾는다.
// 못 찾은 이름은 그대로 둔다 (앱 기본 폴더 /media 의 파일일 수 있다 — 예: sample_image_1.svg).
const MEDIA_FIELDS = ['imageUrl', 'audioUrl', 'answerImage', 'answerAudio'];
const isBareName = (v) => typeof v === 'string' && v.trim() && !/^https?:\/\//i.test(v.trim()) && !v.trim().startsWith('/');
const keyOf = (s) => String(s).normalize('NFC').trim().toLowerCase();
const stem = (s) => keyOf(s).replace(/\.[a-z0-9]{2,5}$/, '');

export async function resolveMediaNames(set, media) {
  const result = { set, resolved: [], missing: [] };
  if (!media || !set || !Array.isArray(set.rounds)) return result;
  const bare = [];
  for (const r of set.rounds) {
    for (const q of r?.questions || []) {
      for (const f of MEDIA_FIELDS) if (isBareName(q?.[f])) bare.push(q[f]);
      if (Array.isArray(q?.imageUrls)) for (const u of q.imageUrls) if (isBareName(u)) bare.push(u);
    }
  }
  if (!bare.length) return result;

  let files;
  try { files = await media.list('question'); } catch { return result; } // 스토리지를 못 읽으면 그대로 둔다
  const exact = new Map();
  const byStem = new Map();
  // 최근 것이 앞에 오므로 같은 이름이면 최근 파일
  for (const f of files) {
    for (const k of [keyOf(f.name), keyOf(f.path.split('/').pop())]) if (!exact.has(k)) exact.set(k, f.publicUrl);
    for (const k of [stem(f.name), stem(f.path.split('/').pop())]) byStem.set(k, byStem.has(k) && byStem.get(k) !== f.publicUrl ? null : f.publicUrl);
  }
  const find = (name) => exact.get(keyOf(name)) || (!/\.[a-z0-9]{2,5}$/i.test(name.trim()) ? byStem.get(stem(name)) : null) || null;

  const copy = JSON.parse(JSON.stringify(set));
  const swap = (value) => {
    if (!isBareName(value)) return value;
    const url = find(value);
    if (url) { result.resolved.push(value); return url; }
    result.missing.push(value);
    return value;
  };
  for (const r of copy.rounds) {
    for (const q of r?.questions || []) {
      if (!q) continue;
      for (const f of MEDIA_FIELDS) if (q[f] !== undefined) q[f] = swap(q[f]);
      if (Array.isArray(q.imageUrls)) q.imageUrls = q.imageUrls.map(swap);
    }
  }
  result.set = copy;
  result.missing = [...new Set(result.missing)];
  return result;
}
