import { createMemoryPersistence } from './memory.js';

export async function createPersistence(env = process.env) {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    const { createSupabasePersistence } = await import('./supabase.js');
    return createSupabasePersistence({ url: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_KEY });
  }
  console.warn('[db] SUPABASE_URL / SUPABASE_SERVICE_KEY 가 없어 메모리 저장소를 씁니다. 서버를 끄면 기록이 사라집니다.');
  return createMemoryPersistence();
}
