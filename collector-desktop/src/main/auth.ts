/**
 * 계정 — 이메일 회원가입 · 구글 로그인 (Supabase Auth). 계획서 14.5절, 14.6절.
 *
 * 데스크톱 앱에서의 구글 로그인 흐름 (RFC 8252 루프백 방식 + PKCE):
 *   1) 앱이 127.0.0.1:<포트>/auth/callback 에서 기다리는 작은 HTTP 서버를 연다
 *   2) 기본 브라우저로 구글 로그인 페이지를 연다
 *   3) 로그인이 끝나면 Supabase가 ?code=... 를 붙여 루프백 주소로 돌려보낸다
 *   4) 앱이 code를 세션으로 바꾼다 (PKCE 검증값은 앱 안에만 있다)
 * 이메일 인증 링크와 비밀번호 재설정 링크도 같은 주소로 돌아온다.
 */
import { app, safeStorage, shell } from 'electron';
import { EventEmitter } from 'node:events';
import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { AgeBand, HearingMode } from '@safeear/core';
import type { SessionView, UserInfo } from '../shared/types';
import { authCallbackUrl, config, isServerConfigured } from './config';

/** 로그인 세션을 윈도우 DPAPI(safeStorage)로 암호화해 파일에 둔다 */
class EncryptedFileStorage {
  private readonly path = join(app.getPath('userData'), 'auth-session.bin');
  private data: Record<string, string> = {};

  constructor() {
    try {
      if (!existsSync(this.path)) return;
      const raw = readFileSync(this.path);
      const text = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8');
      this.data = JSON.parse(text);
    } catch {
      this.data = {};
    }
  }

  private persist(): void {
    const text = JSON.stringify(this.data);
    const buf = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text, 'utf8');
    writeJsonAtomicBuffer(this.path, buf);
  }

  getItem(key: string): string | null {
    return this.data[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.data[key] = value;
    this.persist();
  }
  removeItem(key: string): void {
    delete this.data[key];
    this.persist();
  }
}

function writeJsonAtomicBuffer(path: string, buf: Buffer): void {
  writeFileSync(`${path}.tmp`, buf);
  renameSync(`${path}.tmp`, path);
}

export interface Profile {
  display_name: string | null;
  age_band: AgeBand | null;
  hearing_mode: HearingMode | null;
}

/** Supabase 오류를 사용자에게 보여 줄 한국어 문장으로 */
export function koreanAuthError(e: unknown): string {
  const msg = String((e as { message?: string })?.message ?? e ?? '');
  const code = String((e as { code?: string })?.code ?? '');
  if (/invalid login credentials/i.test(msg) || code === 'invalid_credentials') return '이메일 또는 비밀번호가 맞지 않아요.';
  if (/email not confirmed/i.test(msg) || code === 'email_not_confirmed') return '메일함에서 인증 링크를 먼저 눌러 주세요.';
  if (/already registered|already been registered/i.test(msg) || code === 'user_already_exists') return '이미 가입된 이메일이에요.';
  if (/password should be|weak_password/i.test(msg + code)) return '비밀번호가 너무 짧거나 쉬워요. 8자 이상으로 해 주세요.';
  if (/rate limit|too many/i.test(msg) || code === 'over_email_send_rate_limit') return '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.';
  if (/provider is not enabled|unsupported provider/i.test(msg)) return '구글 로그인이 아직 서버에서 켜져 있지 않아요. (docs/AUTH_SETUP.md 참고)';
  if (/fetch failed|network|ENOTFOUND|ECONNREFUSED/i.test(msg)) return '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.';
  if (/redirect/i.test(msg)) return '로그인 주소가 허용 목록에 없어요. (docs/AUTH_SETUP.md의 Redirect URL 설정 참고)';
  return msg || '알 수 없는 오류가 생겼어요.';
}

const page = (title: string, body: string) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>SafeEar</title>
<style>body{font-family:"Malgun Gothic",system-ui,sans-serif;background:#EDF1F8;color:#16243A;display:grid;place-items:center;height:100vh;margin:0}
div{background:#fff;border-radius:22px;padding:32px 36px;box-shadow:0 6px 22px rgba(40,64,110,.12);max-width:420px;text-align:center}
h1{font-size:20px;margin:0 0 8px}p{color:#6B7A90;margin:0}</style></head><body><div><h1>${title}</h1><p>${body}</p></div></body></html>`;

export class AuthService extends EventEmitter {
  client: SupabaseClient | null = null;
  session: Session | null = null;
  recovery = false;
  serverError: string | null = null;
  profile: Profile | null = null;
  private server: Server | null = null;
  private pending: { resolve: () => void; reject: (e: Error) => void; timer: NodeJS.Timeout } | null = null;

  get configured(): boolean {
    return this.client !== null;
  }

  get userId(): string | null {
    return this.session?.user.id ?? null;
  }

  async init(): Promise<void> {
    if (!isServerConfigured()) return;
    this.client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        storage: new EncryptedFileStorage(),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    });
    this.client.auth.onAuthStateChange((event, session) => {
      const changedUser = session?.user.id !== this.session?.user.id;
      this.session = session;
      if (event === 'PASSWORD_RECOVERY') this.recovery = true;
      if (event === 'SIGNED_OUT') {
        this.profile = null;
        this.recovery = false;
      }
      if (changedUser || event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // onAuthStateChange 안에서 다른 supabase 호출을 기다리면 교착될 수 있어 다음 틱으로 미룬다
        setTimeout(() => this.emit('change', event), 0);
      }
    });
    const { data } = await this.client.auth.getSession();
    this.session = data.session;
    this.startServer();
  }

  userInfo(): UserInfo | null {
    const u = this.session?.user;
    if (!u) return null;
    const meta = u.user_metadata ?? {};
    const name =
      this.profile?.display_name || meta.display_name || meta.full_name || meta.name || (u.email ? u.email.split('@')[0] : '사용자');
    return { id: u.id, email: u.email ?? null, name, provider: String(u.app_metadata?.provider ?? 'email') };
  }

  view(localOnlyChosen: boolean): SessionView {
    return {
      configured: this.configured,
      signedIn: !!this.session,
      localOnly: false,
      user: this.userInfo(),
      recovery: this.recovery,
    };
  }

  private need(): SupabaseClient {
    if (!this.client) throw new Error('서버가 설정되지 않았어요. (collector-desktop/.env — docs/AUTH_SETUP.md 참고)');
    return this.client;
  }

  async signUp(p: { name: string; username: string; email: string; password: string; age: number; marketing: boolean }): Promise<{ needsConfirm: boolean }> {
    if (!Number.isInteger(p.age) || p.age < 14 || p.age > 120) throw new Error('나이는 만 14~120세로 입력해 주세요.');
    const now = new Date().toISOString();
    const { data, error } = await this.need().auth.signUp({
      email: p.email,
      password: p.password,
      options: {
        emailRedirectTo: authCallbackUrl(),
        data: {
          display_name: p.name,
          username: p.username,
          age: p.age,
          age_14_plus: true,
          agreed_terms_at: now,
          agreed_privacy_at: now,
          agreed_sensitive_at: now,
          marketing_opt_in: p.marketing,
        },
      },
    });
    if (error) throw error;
    // 이메일 인증을 켠 상태에서 이미 가입된 주소면 identities가 빈 배열로 온다
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error('User already registered');
    }
    return { needsConfirm: !data.session };
  }

  async saveAge(age: number): Promise<void> {
    if (!Number.isInteger(age) || age < 14 || age > 120) throw new Error('나이는 만 14~120세로 입력해 주세요.');
    const { data, error } = await this.need().auth.updateUser({ data: { age } });
    if (error) throw error;
    if (this.session) this.session.user = data.user;
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.need().auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async signInWithGoogle(): Promise<void> {
    const client = this.need();
    if (!this.server) this.startServer();
    if (this.serverError) throw new Error(this.serverError);
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authCallbackUrl(), skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
    });
    if (error) throw error;
    if (!data.url) throw new Error('로그인 주소를 만들지 못했어요.');
    this.pending?.reject(new Error('새 로그인을 시작했어요.'));
    const done = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new Error('로그인 시간이 지났어요. 다시 시도해 주세요.'));
      }, 5 * 60_000);
      this.pending = { resolve, reject, timer };
    });
    await shell.openExternal(data.url);
    return done;
  }

  async resetPassword(email: string): Promise<void> {
    const { error } = await this.need().auth.resetPasswordForEmail(email, { redirectTo: `${authCallbackUrl()}?type=recovery` });
    if (error) throw error;
  }

  async updatePassword(password: string): Promise<void> {
    const { error } = await this.need().auth.updateUser({ password });
    if (error) throw error;
    this.recovery = false;
    this.emit('change', 'USER_UPDATED');
  }

  async signOut(): Promise<void> {
    if (!this.client) return;
    await this.client.auth.signOut({ scope: 'local' });
    this.session = null;
    this.profile = null;
    this.emit('change', 'SIGNED_OUT');
  }

  /** 서버의 내 계정과 기록을 모두 지운다 (14.5절 삭제) — server/supabase/migrations의 delete_my_account() */
  async deleteAccount(): Promise<void> {
    const { error } = await this.need().rpc('delete_my_account');
    if (error) throw error;
    await this.signOut();
  }

  async loadProfile(): Promise<Profile | null> {
    if (!this.client || !this.userId) return null;
    const { data, error } = await this.client
      .from('profiles')
      .select('display_name, age_band, hearing_mode')
      .eq('id', this.userId)
      .maybeSingle();
    if (error) {
      console.warn('[auth] profile load failed', error.message);
      return null;
    }
    this.profile = (data as Profile | null) ?? null;
    return this.profile;
  }

  async saveProfile(p: Partial<Profile>): Promise<void> {
    if (!this.client || !this.userId) return;
    const { error } = await this.client.from('profiles').upsert({ id: this.userId, ...p, updated_at: new Date().toISOString() });
    if (error) throw error;
    this.profile = { display_name: null, age_band: null, hearing_mode: null, ...(this.profile ?? {}), ...p };
  }

  private startServer(): void {
    if (this.server) return;
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${config.authCallbackPort}`);
      if (url.pathname !== '/auth/callback') {
        res.writeHead(404).end();
        return;
      }
      const send = (title: string, body: string) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page(title, body));
      };
      const errDesc = url.searchParams.get('error_description') || url.searchParams.get('error');
      const code = url.searchParams.get('code');
      if (errDesc) {
        send('로그인하지 못했어요', errDesc);
        this.finishPending(new Error(errDesc));
        return;
      }
      if (!code || !this.client) {
        send('잘못된 접근이에요', 'SafeEar 앱에서 다시 시도해 주세요.');
        return;
      }
      try {
        const { error } = await this.client.auth.exchangeCodeForSession(code);
        if (error) throw error;
        if (url.searchParams.get('type') === 'recovery') {
          this.recovery = true;
          send('본인 확인이 끝났어요', 'SafeEar 앱으로 돌아가 새 비밀번호를 정해 주세요.');
        } else {
          send('로그인했어요', '이 창을 닫고 SafeEar 앱으로 돌아가세요.');
        }
        this.finishPending(null);
        this.emit('change', 'SIGNED_IN');
        this.emit('focus');
      } catch (e) {
        if (this.pending) send('로그인하지 못했어요', koreanAuthError(e));
        // 이메일 인증 링크를 다른 브라우저·기기에서 연 경우 PKCE 검증값이 없어 여기로 온다. 인증 자체는 끝났다.
        else send('인증은 끝났어요', 'SafeEar 앱에서 이메일과 비밀번호로 로그인해 주세요.');
        this.finishPending(e instanceof Error ? e : new Error(String(e)));
      }
    });
    server.on('error', (e: NodeJS.ErrnoException) => {
      this.serverError =
        e.code === 'EADDRINUSE'
          ? `로그인용 포트 ${config.authCallbackPort}를 다른 프로그램이 쓰고 있어요. 그 프로그램을 끄거나 SAFEEAR_AUTH_PORT를 바꿔 주세요.`
          : `로그인용 로컬 서버를 열지 못했어요: ${e.message}`;
      this.server = null;
      console.error('[auth]', this.serverError);
    });
    server.listen(config.authCallbackPort, '127.0.0.1', () => {
      this.serverError = null;
    });
    this.server = server;
  }

  private finishPending(err: Error | null): void {
    if (!this.pending) return;
    clearTimeout(this.pending.timer);
    if (err) this.pending.reject(err);
    else this.pending.resolve();
    this.pending = null;
  }

  stop(): void {
    this.server?.close();
    this.server = null;
  }
}
