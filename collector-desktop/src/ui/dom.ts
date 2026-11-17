export const $ = <T extends HTMLElement = HTMLElement>(s: string): T => document.querySelector(s) as T;
export const $$ = <T extends HTMLElement = HTMLElement>(s: string): T[] => [...document.querySelectorAll(s)] as T[];
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const TICON = {
  warn: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4M12 17.3v.1"/></svg>',
  rest: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  ok: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};

export function notify(o: { type?: keyof typeof TICON; title: string; desc?: string; action?: string; onAction?: () => void; ttl?: number }): void {
  const type = o.type ?? 'ok';
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = `<div class="ic">${TICON[type]}</div><div class="tx"><div class="t"></div>${o.desc ? '<div class="d"></div>' : ''}${o.action ? '<button class="go"></button>' : ''}</div><button class="x" aria-label="닫기">×</button>`;
  t.querySelector('.t')!.textContent = o.title;
  if (o.desc) t.querySelector('.d')!.textContent = o.desc;
  const close = () => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 260);
  };
  (t.querySelector('.x') as HTMLElement).onclick = close;
  if (o.action) {
    const g = t.querySelector('.go') as HTMLElement;
    g.textContent = o.action;
    g.onclick = () => {
      close();
      o.onAction?.();
    };
  }
  $('#toasts').appendChild(t);
  setTimeout(close, o.ttl ?? 6000);
}

export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}<small>분</small>`;
  return `${Math.floor(m / 60)}<small>시간</small> ${m % 60}<small>분</small>`;
}

export function fmtAgo(ms: number | null): string {
  if (!ms) return '아직 안 함';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  return `${Math.floor(s / 3600)}시간 전`;
}
