// Supabase 저장소 — supabase/schema.sql 의 테이블을 쓴다.
import { createClient } from '@supabase/supabase-js';

const MEDIA_BUCKET = 'media';

// media_files 테이블이 아직 없으면(마이그레이션 전) 이름 기능만 꺼지도록 구분한다
function catalogError(error) {
  const missing = error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message || '');
  return Object.assign(new Error(`[db] media_files: ${error.message}`), missing ? { code: 'CATALOG_MISSING' } : {});
}
const RESTORE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function createSupabasePersistence({ url, serviceKey }) {
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  const check = (label) => ({ error }) => {
    if (error) throw new Error(`[db] ${label}: ${error.message}`);
  };

  const eventRow = (sessionId) => (e) => ({
    session_id: sessionId,
    player_id: e.playerId,
    round_idx: e.r,
    question_idx: e.q,
    answer: e.answer,
    is_correct: e.isCorrect,
    raw_delta: e.raw,
    applied_delta: e.applied,
    response_ms: Math.round(e.ms),
    created_at: new Date(e.at).toISOString(),
  });

  return {
    kind: 'supabase',

    async createRoom({ id, roomCode, createdAt }) {
      await db.from('sessions')
        .insert({ id, room_code: roomCode, status: 'lobby', created_at: new Date(createdAt).toISOString() })
        .then(check('createRoom'));
    },

    async saveSet(id, set) {
      await db.from('sessions')
        .update({ quiz_set: set, session_name: set.sessionName, updated_at: new Date().toISOString() })
        .eq('id', id).then(check('saveSet'));
    },

    async saveState(id, status, state) {
      await db.from('sessions')
        .update({ status, state, settings: state.settings, updated_at: new Date().toISOString() })
        .eq('id', id).then(check('saveState'));
    },

    async saveAwards(id, result) {
      await db.from('sessions').update({ awards_result: result }).eq('id', id).then(check('saveAwards'));
    },

    async upsertPlayers(id, players) {
      if (players.length === 0) return;
      await db.from('players').upsert(players.map((p) => ({
        id: p.id,
        session_id: id,
        name: p.name,
        group_name: p.group,
        unit_name: p.unit,
        score: p.score,
        total_response_ms: Math.round(p.totalResponseMs),
        submit_count: p.submitCount,
        chat_count: p.chatCount,
        joined_at: new Date(p.joinedAt).toISOString(),
      }))).then(check('upsertPlayers'));
    },

    async deletePlayer(_id, playerId) {
      await db.from('players').delete().eq('id', playerId).then(check('deletePlayer'));
    },

    async insertEvents(id, events) {
      if (events.length === 0) return;
      await db.from('score_events').insert(events.map(eventRow(id))).then(check('insertEvents'));
    },

    async rewriteRound(id, r, events) {
      await db.from('score_events').delete().eq('session_id', id).eq('round_idx', r).then(check('rewriteRound.delete'));
      if (events.length) await db.from('score_events').insert(events.map(eventRow(id))).then(check('rewriteRound.insert'));
    },

    async insertChat(id, playerId, message) {
      await db.from('chat_logs').insert({ session_id: id, player_id: playerId, message }).then(check('insertChat'));
    },

    async closeRoom(id) {
      await db.from('sessions').update({ status: 'closed', updated_at: new Date().toISOString() })
        .eq('id', id).then(check('closeRoom'));
    },

    // 서버 시작 시 복구할 방 (최근 24시간, 닫히지 않은 방)
    async loadActive() {
      const since = new Date(Date.now() - RESTORE_WINDOW_MS).toISOString();
      const { data: rows, error } = await db.from('sessions')
        .select('id, room_code, created_at, quiz_set, state')
        .neq('status', 'closed').gte('created_at', since);
      if (error) throw new Error(`[db] loadActive: ${error.message}`);
      const out = [];
      for (const row of rows) {
        const { data: evs, error: evErr } = await db.from('score_events')
          .select('player_id, round_idx, question_idx, answer, is_correct, raw_delta, applied_delta, response_ms, created_at')
          .eq('session_id', row.id).order('id', { ascending: true }).limit(20000);
        if (evErr) throw new Error(`[db] loadActive.events: ${evErr.message}`);
        out.push({
          id: row.id,
          roomCode: row.room_code,
          createdAt: Date.parse(row.created_at),
          set: row.quiz_set,
          state: row.state,
          events: evs.map((e) => ({
            playerId: e.player_id, r: e.round_idx, q: e.question_idx, answer: e.answer,
            isCorrect: e.is_correct, raw: e.raw_delta, applied: e.applied_delta,
            ms: e.response_ms, at: Date.parse(e.created_at),
          })),
        });
      }
      return out;
    },

    // 레크레이션용 파일 (Supabase Storage + 이름 목록 테이블 media_files). 관리자 브라우저가 서명 URL 로 직접 올린다.
    media: {
      async createUploadUrl(path) {
        const { data, error } = await db.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
        if (error) throw new Error(`[storage] ${error.message}`);
        return {
          path,
          token: data.token,
          signedUrl: data.signedUrl,
          publicUrl: db.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl,
        };
      },
      async listObjects(folder) {
        const { data, error } = await db.storage.from(MEDIA_BUCKET)
          .list(folder, { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } });
        if (error) throw new Error(`[storage] ${error.message}`);
        return data.filter((f) => f.id).map((f) => {
          const path = `${folder}/${f.name}`;
          return {
            path,
            size: f.metadata?.size ?? null,
            createdAt: f.created_at ?? null,
            publicUrl: db.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl,
          };
        });
      },
      async removeObject(path) {
        const { error } = await db.storage.from(MEDIA_BUCKET).remove([path]);
        if (error) throw new Error(`[storage] ${error.message}`);
      },
      catalog: {
        async list() {
          const { data, error } = await db.from('media_files').select('path, name');
          if (error) throw catalogError(error);
          return data;
        },
        async upsert({ path, name, folder, size }) {
          const row = { path, name, folder, updated_at: new Date().toISOString() };
          if (size !== undefined) row.size = size;
          const { error } = await db.from('media_files').upsert(row);
          if (error) throw catalogError(error);
        },
        async remove(path) {
          const { error } = await db.from('media_files').delete().eq('path', path);
          if (error) throw catalogError(error);
        },
      },
    },
  };
}
