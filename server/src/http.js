// HTTP API — 로그인, 방 공개 정보(등록 화면용), 미디어 업로드.
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { ROLES } from '../../shared/protocol.js';
import { checkAdminPassword, createRateLimiter, signToken, verifyToken } from './auth.js';

const MEDIA_EXT = /\.(png|jpe?g|gif|webp|svg|mp4|webm|mp3|wav|ogg|m4a)$/i;

export function createApp({ registry, allowedOrigins }) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(cors({ origin: allowedOrigins }));
  app.use(express.json({ limit: '100kb' }));

  const loginLimiter = createRateLimiter();

  const requireAdmin = (req, res, next) => {
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (verifyToken(token)?.role !== ROLES.ADMIN) return res.status(401).json({ ok: false, message: '관리자 로그인이 필요합니다.' });
    next();
  };

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), rooms: registry.rooms.size, storage: registry.persistence.kind });
  });

  app.post('/api/admin/login', (req, res) => {
    if (!process.env.ADMIN_PASSWORD) return res.status(503).json({ ok: false, message: '서버에 ADMIN_PASSWORD 가 설정되지 않았습니다.' });
    if (!loginLimiter(req.ip)) return res.status(429).json({ ok: false, message: '시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' });
    if (!checkAdminPassword(req.body?.password)) return res.status(401).json({ ok: false, message: '비밀번호가 올바르지 않습니다.' });
    res.json({ ok: true, token: signToken({ role: ROLES.ADMIN }) });
  });

  // 등록 화면이 방 코드를 입력받은 뒤 학년·브릿지 목록을 받아간다
  app.get('/api/rooms/:code/public', (req, res) => {
    const room = registry.get(req.params.code);
    if (!room) return res.status(404).json({ ok: false, message: '존재하지 않는 방 코드입니다.' });
    res.json({
      ok: true,
      roomCode: room.roomCode,
      sessionName: room.set?.sessionName || null,
      ready: !!room.set,
      finished: room.isFinished,
      teams: room.set?.teams ? { labels: room.set.teams.labels, groups: room.set.teams.groups } : null,
    });
  });

  // 미디어: 서버는 서명 URL 만 발급하고, 파일은 관리자 브라우저가 스토리지로 직접 올린다
  app.post('/api/media/upload-url', requireAdmin, async (req, res) => {
    const media = registry.persistence.media;
    if (!media) return res.status(503).json({ ok: false, message: '스토리지가 설정되지 않았습니다.' });
    const filename = String(req.body?.filename || '');
    const ext = filename.match(MEDIA_EXT)?.[0].toLowerCase();
    if (!ext) return res.status(400).json({ ok: false, message: '지원하지 않는 파일 형식입니다.' });
    const folder = req.body?.kind === 'background' ? 'backgrounds' : 'questions';
    try {
      res.json({ ok: true, ...(await media.createUploadUrl(`${folder}/${randomUUID()}${ext}`)) });
    } catch (e) {
      console.error(e.message);
      res.status(502).json({ ok: false, message: '업로드 주소를 만들지 못했습니다.' });
    }
  });

  app.get('/api/media', requireAdmin, async (req, res) => {
    const media = registry.persistence.media;
    if (!media) return res.status(503).json({ ok: false, message: '스토리지가 설정되지 않았습니다.' });
    const folder = req.query.kind === 'background' ? 'backgrounds' : 'questions';
    try {
      res.json({ ok: true, files: await media.list(folder) });
    } catch (e) {
      console.error(e.message);
      res.status(502).json({ ok: false, message: '파일 목록을 불러오지 못했습니다.' });
    }
  });

  return app;
}
