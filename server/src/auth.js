// 서명 토큰 (HMAC-SHA256). 관리자·진행자·참가자 역할을 서버가 발급·검증한다.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ROLES } from '../../shared/protocol.js';

let secret = process.env.TOKEN_SECRET;
if (!secret) {
  secret = randomBytes(32).toString('hex');
  console.warn('[auth] TOKEN_SECRET 이 없어 임시 키를 사용합니다. 서버를 재시작하면 발급한 토큰이 모두 무효가 됩니다.');
}

const HOUR = 60 * 60 * 1000;
export const TOKEN_TTL = {
  [ROLES.ADMIN]: 12 * HOUR,
  [ROLES.HOST]: 24 * HOUR,
  [ROLES.PLAYER]: 24 * HOUR,
};

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const sign = (body) => createHmac('sha256', secret).update(body).digest();

export function signToken(payload, ttlMs = TOKEN_TTL[payload.role] ?? HOUR) {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + ttlMs }));
  return `${body}.${b64(sign(body))}`;
}

// 유효하면 payload, 아니면 null
export function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  const expected = sign(body);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function checkAdminPassword(password) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof password !== 'string') return false;
  // 길이가 달라도 비교 시간이 같도록 해시 후 비교
  const a = createHmac('sha256', secret).update(password).digest();
  const b = createHmac('sha256', secret).update(expected).digest();
  return timingSafeEqual(a, b);
}

// 로그인 시도 제한: 키(IP)당 windowMs 동안 max 회
export function createRateLimiter({ max = 10, windowMs = 5 * 60 * 1000 } = {}) {
  const hits = new Map();
  return function allow(key) {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      if (hits.size > 1000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      return true;
    }
    entry.count += 1;
    return entry.count <= max;
  };
}
