/**
 * 서버 설정. 빌드할 때 collector-desktop/.env 값이 들어가고(scripts/build.mjs),
 * 실행할 때 환경 변수로 덮어쓸 수 있다. 값이 없으면 로그인 없이 이 기기 안에서만 동작한다.
 */
declare const __SUPABASE_URL__: string;
declare const __SUPABASE_ANON_KEY__: string;
declare const __AUTH_CALLBACK_PORT__: string;

export const config = {
  supabaseUrl: process.env.SAFEEAR_SUPABASE_URL || __SUPABASE_URL__,
  supabaseAnonKey: process.env.SAFEEAR_SUPABASE_ANON_KEY || __SUPABASE_ANON_KEY__,
  authCallbackPort: Number(process.env.SAFEEAR_AUTH_PORT || __AUTH_CALLBACK_PORT__ || 51789),
};

export const isServerConfigured = (): boolean => Boolean(config.supabaseUrl && config.supabaseAnonKey);

export const authCallbackUrl = (): string => `http://127.0.0.1:${config.authCallbackPort}/auth/callback`;
