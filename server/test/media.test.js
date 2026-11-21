import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/app.js';
import { createMemoryPersistence } from '../src/persistence/memory.js';
import { createMediaService, createMemoryMediaAdapter, resolveMediaNames, fileType } from '../src/media.js';

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

describe('문제 세트의 파일 이름 → 올린 파일 주소', () => {
  async function serviceWith(files) {
    const adapter = createMemoryMediaAdapter();
    const media = createMediaService(adapter);
    for (const [name, path] of files) {
      await adapter.createUploadUrl(path);
      await media.complete(path, name, 1);
    }
    return media;
  }

  it('표시 이름·저장 이름·확장자 없는 이름을 찾아 바꾸고, 못 찾은 이름은 그대로 두고 알린다', async () => {
    const media = await serviceWith([['최경운.JPG', 'questions/a1.jpg'], ['여행.mp4', 'questions/b2.mp4'], ['정답.png', 'questions/c3.png']]);
    const set = { rounds: [{ gameMode: 'image_quiz', questions: [
      { imageUrl: '최경운.jpg', answerImage: 'c3.png' },
      { imageUrls: ['정답', 'https://x.example/y.png', '/media/sample_image_1.svg'], audioUrl: '여행.mp4', answerAudio: 'sample_image_1.svg' },
    ] }] };
    const out = await resolveMediaNames(set, media);
    const [q1, q2] = out.set.rounds[0].questions;
    expect(q1).toEqual({ imageUrl: 'https://files.example/questions/a1.jpg', answerImage: 'https://files.example/questions/c3.png' });
    expect(q2.imageUrls).toEqual(['https://files.example/questions/c3.png', 'https://x.example/y.png', '/media/sample_image_1.svg']);
    expect(q2.audioUrl).toBe('https://files.example/questions/b2.mp4');
    expect(q2.answerAudio).toBe('sample_image_1.svg');
    expect(out.missing).toEqual(['sample_image_1.svg']);
    expect(set.rounds[0].questions[0].imageUrl).toBe('최경운.jpg'); // 원본은 그대로
  });

  it('확장자 없는 이름이 여러 파일에 걸리면 고르지 않는다', async () => {
    const media = await serviceWith([['사진.jpg', 'questions/a.jpg'], ['사진.png', 'questions/b.png']]);
    const out = await resolveMediaNames({ rounds: [{ questions: [{ imageUrl: '사진' }] }] }, media);
    expect(out.set.rounds[0].questions[0].imageUrl).toBe('사진');
    expect(out.missing).toEqual(['사진']);
  });

  it('스토리지가 없으면 아무것도 바꾸지 않는다', async () => {
    const set = { rounds: [{ questions: [{ imageUrl: 'a.jpg' }] }] };
    expect((await resolveMediaNames(set, null)).set).toBe(set);
  });
});
