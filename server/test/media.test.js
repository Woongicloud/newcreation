import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/app.js';
import { createMemoryPersistence } from '../src/persistence/memory.js';
import { createMediaService, createMemoryMediaAdapter, fileType } from '../src/media.js';

process.env.ADMIN_PASSWORD = 'test-password';

describe('파일 관리 서비스', () => {
  it('올린 파일은 원래 이름으로 보이고, 이름을 바꿔도 주소는 그대로다', async () => {
    const adapter = createMemoryMediaAdapter();
    const media = createMediaService(adapter);
    const ticket = await media.prepareUpload('나의 하나님 (후렴).MP3', 'question');
    expect(ticket.path).toMatch(/^questions\/[0-9a-f-]+\.mp3$/);
    await media.complete(ticket.path, '나의 하나님 (후렴).MP3', 1234);
    let [file] = await media.list('question');
    expect(file).toMatchObject({ path: ticket.path, name: '나의 하나님 (후렴).MP3', type: 'audio', named: true, publicUrl: ticket.publicUrl });

    await media.rename(ticket.path, '  찬양 1번  ');
    [file] = await media.list('all');
    expect(file).toMatchObject({ name: '찬양 1번', publicUrl: ticket.publicUrl });

    await media.remove(ticket.path);
    expect(await media.list('all')).toEqual([]);
    expect(adapter.names.size).toBe(0);
  });

  it('지원하지 않는 형식·잘못된 경로·빈 이름은 거절한다', async () => {
    const media = createMediaService(createMemoryMediaAdapter());
    await expect(media.prepareUpload('a.exe', 'question')).rejects.toMatchObject({ status: 400 });
    await expect(media.remove('../sessions/x')).rejects.toMatchObject({ status: 400 });
    await expect(media.remove('other/x.png')).rejects.toMatchObject({ status: 400 });
    await expect(media.rename('questions/a.png', '   ')).rejects.toMatchObject({ status: 400 });
  });

  it('이름 테이블이 없어도 올리기·목록·삭제는 되고, 이름 변경만 안내한다', async () => {
    const adapter = createMemoryMediaAdapter({ withCatalog: false });
    const media = createMediaService(adapter);
    const t = await media.prepareUpload('bg.jpg', 'background');
    expect(await media.complete(t.path, 'bg.jpg')).toMatchObject({ catalog: false });
    const [file] = await media.list('background');
    expect(file).toMatchObject({ type: 'image', folder: 'backgrounds', named: false });
    expect(media.catalogReady).toBe(false);
    await expect(media.rename(t.path, '배경')).rejects.toMatchObject({ status: 409 });
    await media.remove(t.path);
    expect(await media.list('all')).toEqual([]);
  });

  it('파일 종류', () => {
    expect(['a.png', 'b.JPG', 'c.mp3', 'd.m4a', 'e.mp4', 'f.txt'].map(fileType)).toEqual(['image', 'image', 'audio', 'audio', 'video', 'other']);
  });
});

describe('파일 관리 API', () => {
  let server;
  let base;
  let token;
  const call = (path, method = 'GET', body, auth = token) => fetch(`${base}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

  beforeAll(async () => {
    server = await buildServer({ persistence: { ...createMemoryPersistence(), media: createMemoryMediaAdapter() } });
    await new Promise((r) => server.httpServer.listen(0, r));
    base = `http://localhost:${server.httpServer.address().port}`;
    token = (await call('/api/admin/login', 'POST', { password: 'test-password' }, null)).body.token;
  });
  afterAll(() => server.close());

  it('관리자만 쓸 수 있고, 올리기→이름 변경→삭제가 된다', async () => {
    expect((await call('/api/media?kind=all', 'GET', null, null)).status).toBe(401);
    const ticket = (await call('/api/media/upload-url', 'POST', { filename: '서울.jpg', kind: 'question' })).body;
    expect(ticket.ok).toBe(true);
    await call('/api/media/complete', 'POST', { path: ticket.path, name: '서울.jpg', size: 10 });
    const sound = (await call('/api/media/upload-url', 'POST', { filename: 'intro.mp3', kind: 'question' })).body;
    await call('/api/media/complete', 'POST', { path: sound.path, name: 'intro.mp3' });

    let list = (await call('/api/media?kind=question')).body;
    expect(list).toMatchObject({ ok: true, catalog: true });
    expect(list.files.map((f) => [f.name, f.type]).sort()).toEqual([['intro.mp3', 'audio'], ['서울.jpg', 'image']]);

    expect((await call('/api/media', 'PATCH', { path: ticket.path, name: '서울 야경' })).body).toMatchObject({ ok: true, name: '서울 야경' });
    expect((await call('/api/media', 'DELETE', { path: sound.path })).body.ok).toBe(true);
    list = (await call('/api/media?kind=all')).body;
    expect(list.files.map((f) => f.name)).toEqual(['서울 야경']);
    expect((await call('/api/media', 'DELETE', { path: '../x' })).status).toBe(400);
  });
});
