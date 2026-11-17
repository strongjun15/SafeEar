/** 인라인 SVG 차트 (외부 차트 라이브러리 없이 — 계획서 부록 A) */
import { BAND_LABELS } from '@safeear/core';
import type { CurvePoint } from '@safeear/core';
import type { Scenario } from '../shared/types';
import { lerp } from './dom';

const RAMP = ['#3DDC97', '#9BE36A', '#FFC94A', '#FF9442', '#FF5E57'];
function mix(h1: string, h2: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(h1), b = p(h2);
  return `rgb(${a.map((x, i) => Math.round(lerp(x, b[i], t))).join(',')})`;
}
export function bandColor(v: number): string {
  v = Math.max(0, Math.min(1, v));
  const s = RAMP.length - 1;
  const i = Math.min(s - 1, Math.floor(v * s));
  return mix(RAMP[i], RAMP[i + 1], v * s - i);
}

/** 링 둘레의 자리마다 정해진 색 (DESIGN.md 2-5) — 끝 캡 색을 맞추는 데 쓴다 */
const LOAD_STOPS: [number, string][] = [[0, '#3DDC97'], [110 / 360, '#9BE36A'], [0.5, '#FFC94A'], [0.75, '#FF9442'], [0.9, '#FF5E57'], [1, '#FF5E57']];
const REST_STOPS: [number, string][] = [[0, '#7B8CFF'], [0.5, '#62B8FF'], [290 / 360, '#4FD6C8'], [1, '#3DDC97']];
function colorAt(stops: [number, string][], p: number): string {
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i], [b, cb] = stops[i + 1];
    if (p <= b) return mix(ca, cb, b > a ? (p - a) / (b - a) : 0);
  }
  return stops[stops.length - 1][1];
}

/** 링: 원뿔 그라데이션 + 번지는 빛 + 둥근 캡. 값은 setArc로 */
export function ring(el: HTMLElement, center: string, label: string, variant: 'load' | 'rest' = 'load'): void {
  el.innerHTML = `<div class="ring${variant === 'rest' ? ' rest' : ''}" data-empty style="--p:0">
    <div class="ring-glow"><div class="ring-arc"></div></div><div class="ring-arc"></div>
    <div class="ring-cap start"></div><div class="ring-capw"><div class="ring-cap"></div></div>
  </div><div class="mid">${center}<div class="lbl">${label}</div></div>`;
}
export function setArc(el: HTMLElement, frac: number): void {
  const r = el.querySelector<HTMLElement>('.ring');
  if (!r) return;
  const p = Math.max(0, Math.min(1, frac));
  r.style.setProperty('--p', p.toFixed(4));
  r.style.setProperty('--capc', colorAt(r.classList.contains('rest') ? REST_STOPS : LOAD_STOPS, p));
  r.toggleAttribute('data-empty', p < 0.005);
}

/** 19밴드 막대 — 값은 최댓값으로 정규화 */
export function barMap(values: number[], w: number, h: number, axis: boolean): string {
  const max = Math.max(...values);
  const norm = values.map((v) => (max > 0 ? v / max : 0));
  const bw = w / values.length;
  const pad = axis ? 22 : 16;
  let s = `<svg viewBox="0 0 ${w} ${h + pad}" width="100%">`;
  if (axis) {
    [0, 0.5, 1].forEach((g) => {
      const y = h - g * (h - 10);
      s += `<line class="grid" x1="0" x2="${w}" y1="${y}" y2="${y}"/>`;
    });
    const i1 = BAND_LABELS.indexOf('3.15k');
    const i2 = BAND_LABELS.indexOf('6.3k');
    s += `<rect x="${i1 * bw}" y="0" width="${(i2 - i1 + 1) * bw}" height="${h}" rx="8" style="fill:var(--hot);opacity:.09"/>`;
  }
  norm.forEach((v, i) => {
    const bh = Math.max(2, v * (h - 10));
    s += `<rect x="${i * bw + 2}" y="${h - bh}" width="${bw - 4}" height="${bh}" rx="${Math.min(6, (bw - 4) / 2)}" fill="${max > 0 ? bandColor(v) : 'var(--line)'}"/>`;
  });
  const labs = axis ? ['125', '250', '500', '1k', '2k', '4k', '8k'] : ['125', '500', '2k', '4k', '8k'];
  BAND_LABELS.forEach((b, i) => {
    if (labs.includes(b)) s += `<text class="axl ${b === '4k' ? 'hot' : ''}" x="${i * bw + bw / 2}" y="${h + pad - 5}" text-anchor="middle">${b}</text>`;
  });
  return s + '</svg>';
}

/** 오늘의 피로 곡선: 빠른+느린(주황) 위에 느린(파랑) */
export function curveSvg(pts: CurvePoint[]): string {
  const w = 340, h = 150;
  if (pts.length < 2) return `<div class="empty">기록이 쌓이면 곡선이 그려져요</div>`;
  const mx = Math.max(1, ...pts.map((p) => p.fast + p.slow)) * 1.1;
  const X = (i: number) => (i / (pts.length - 1)) * w;
  const Y = (v: number) => h - (v / mx) * (h - 12);
  let a = `M0,${h}`, b = `M0,${h}`;
  pts.forEach((p, i) => {
    a += ` L${X(i).toFixed(1)},${Y(p.fast + p.slow).toFixed(1)}`;
    b += ` L${X(i).toFixed(1)},${Y(p.slow).toFixed(1)}`;
  });
  a += ` L${w},${h}Z`;
  b += ` L${w},${h}Z`;
  const last = pts[pts.length - 1];
  return `<svg viewBox="0 0 ${w} ${h + 22}" width="100%">
   <line class="grid" x1="0" x2="${w}" y1="${h * 0.5}" y2="${h * 0.5}"/>
   <path d="${a}" style="fill:var(--amber);fill-opacity:.28;stroke:var(--amber)" stroke-width="2.4" stroke-linejoin="round"/>
   <path d="${b}" style="fill:var(--blue);fill-opacity:.2;stroke:var(--blue)" stroke-width="2" stroke-linejoin="round"/>
   <circle cx="${w}" cy="${Y(last.fast + last.slow)}" r="4.5" style="fill:var(--amber)"/>
   <line class="grid" x1="0" x2="${w}" y1="${h}" y2="${h}"/>
   <text class="axl" x="0" y="${h + 16}">8시간 전</text><text class="axl" x="${w / 2}" y="${h + 16}" text-anchor="middle">4시간 전</text><text class="axl" x="${w}" y="${h + 16}" text-anchor="end">지금</text></svg>`;
}

/** ISO 1999 주파수별 NIPTS를 로그 주파수로 이어 EQ 게인(−N)으로 */
export function gainAt(points: Scenario['points'], f: number): number {
  if (!points.length) return 0;
  const lf = Math.log2(f);
  const P = points.map((p) => ({ x: Math.log2(p.freq), g: -p.db }));
  if (lf <= P[0].x) return P[0].g * Math.max(0, 1 - (P[0].x - lf)); // 500 Hz 아래로 한 옥타브에 걸쳐 0으로
  if (lf >= P[P.length - 1].x) return P[P.length - 1].g;
  for (let i = 0; i < P.length - 1; i++) {
    if (lf <= P[i + 1].x) return lerp(P[i].g, P[i + 1].g, (lf - P[i].x) / (P[i + 1].x - P[i].x));
  }
  return 0;
}

/** 여러 EQ 곡선을 한 그래프에 (점선 = 비교 기준) */
export function eqCurvesSvg(curves: { points: Scenario['points']; color: string; width: number; dash?: boolean }[]): string {
  const w = 340, h = 120, L = 30;
  const fmin = Math.log10(200), fmax = Math.log10(16000);
  const worst = Math.max(0, ...curves.flatMap((c) => c.points.map((p) => p.db)));
  const gmin = -Math.max(10, Math.ceil((worst + 2) / 5) * 5), gmax = 3;
  const X = (f: number) => L + ((Math.log10(f) - fmin) / (fmax - fmin)) * (w - L - 4);
  const Y = (g: number) => h - ((g - gmin) / (gmax - gmin)) * h;
  let s = `<svg viewBox="0 0 ${w} ${h + 20}" width="100%">`;
  const step = gmin <= -20 ? 10 : 5;
  for (let g = 0; g >= gmin; g -= step) s += `<line class="grid" x1="${L}" x2="${w - 4}" y1="${Y(g)}" y2="${Y(g)}"/><text class="axl" x="${L - 6}" y="${Y(g) + 3}" text-anchor="end">${g}</text>`;
  s += `<line x1="${X(4000)}" x2="${X(4000)}" y1="0" y2="${h}" stroke-dasharray="3 3" style="stroke:var(--hot);opacity:.5"/>`;
  for (const c of curves) {
    let d = '';
    for (let i = 0; i <= 120; i++) {
      const f = Math.pow(10, lerp(fmin, fmax, i / 120));
      d += (i ? ' L' : 'M') + X(f).toFixed(1) + ',' + Y(Math.max(gmin, gainAt(c.points, f))).toFixed(1);
    }
    s += `<path d="${d}" fill="none" style="stroke:${c.color}" stroke-width="${c.width}" stroke-linejoin="round" stroke-linecap="round"${c.dash ? ' stroke-dasharray="4 4" opacity=".7"' : ''}/>`;
  }
  ([['500', 500], ['1k', 1000], ['4k', 4000], ['8k', 8000]] as const).forEach(([l, f]) => {
    s += `<text class="axl ${f === 4000 ? 'hot' : ''}" x="${X(f)}" y="${h + 15}" text-anchor="middle">${l}</text>`;
  });
  return s + '</svg>';
}

const BLOCK_ROWS: [number, number, string][] = [[0, 5, '새벽'], [5, 9, '아침'], [9, 12, '오전'], [12, 17, '오후'], [17, 21, '저녁'], [21, 24, '밤']];

/** 한 주 전체: 7일 × 6개 시간대 (오래된 날 → 오늘) */
export function heatWeekHtml(heat: number[][], cols: { top: string; sub: string }[]): string {
  const cell = (di: number, a: number, b: number) => (heat[di] ?? []).slice(a, b).reduce((x, y) => x + y, 0);
  let max = 0;
  for (let di = 0; di < 7; di++) for (const [a, b] of BLOCK_ROWS) max = Math.max(max, cell(di, a, b));
  let h = `<div></div>` + cols.map((c, i) => `<div class="hd${i === 6 ? ' today' : ''}"><b>${c.top}</b><span>${c.sub}</span></div>`).join('');
  for (const [a, b, name] of BLOCK_ROWS) {
    h += `<div class="t">${name}</div>`;
    for (let di = 0; di < 7; di++) {
      const v = max > 0 ? cell(di, a, b) / max : 0;
      h += v < 0.03 ? `<div class="c"></div>` : `<div class="c" style="--v:${(0.18 + v * 0.82).toFixed(2)}"></div>`;
    }
  }
  return h;
}

/** 요일별: 그날 24시간 막대 (한 주 최댓값 기준이라 다른 날과 비교돼요) */
export function dayBarsSvg(hours: number[], weekMax: number): string {
  if (!hours.some((v) => v > 0)) return `<div class="empty">이 날은 이어폰으로 듣지 않았어요</div>`;
  const w = 340, h = 120, bw = w / 24;
  const top = hours.indexOf(Math.max(...hours));
  let s = `<svg viewBox="0 0 ${w} ${h + 20}" width="100%"><line class="grid" x1="0" x2="${w}" y1="${h}" y2="${h}"/>`;
  hours.forEach((v, i) => {
    if (v <= 0) return;
    const bh = Math.max(3, (v / (weekMax || 1)) * (h - 8));
    s += `<rect x="${(i * bw + 1.5).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${(bw - 3).toFixed(1)}" height="${bh.toFixed(1)}" rx="3" style="fill:${i === top ? 'var(--hot)' : 'var(--blue)'};opacity:${i === top ? 1 : 0.75}"/>`;
  });
  [0, 6, 12, 18].forEach((hr) => (s += `<text class="axl" x="${hr * bw + 2}" y="${h + 15}">${hr}시</text>`));
  s += `<text class="axl" x="${w}" y="${h + 15}" text-anchor="end">24시</text>`;
  return s + '</svg>';
}

/** 미리보기용 지도 그림 (실제 지도는 앱에서 네이버 지도로) */
export function mapPreviewSvg(): string {
  const pins = [[96, 78], [214, 58], [252, 132]];
  return `<svg class="mapsvg" viewBox="0 0 340 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="340" height="200" style="fill:var(--map-land)"/>
    <path d="M-10 150 C60 130 110 170 180 150 S300 120 350 140 L350 210 L-10 210Z" style="fill:var(--map-water)"/>
    <rect x="20" y="20" width="60" height="38" rx="8" style="fill:var(--map-park)"/>
    <rect x="270" y="20" width="56" height="52" rx="8" style="fill:var(--map-park)"/>
    <path d="M0 100 H340 M150 0 V200 M0 40 L340 90 M240 0 L300 200" style="stroke:var(--map-road);stroke-width:7;fill:none;stroke-linecap:round"/>
    <path d="M60 0 V200 M0 170 H340 M200 0 V200" style="stroke:var(--map-road);stroke-width:3.5;fill:none;opacity:.8"/>
    ${pins.map(([x, y]) => `<g transform="translate(${x} ${y})"><path d="M0 0c-7-9-11-14-11-19a11 11 0 0 1 22 0c0 5-4 10-11 19Z" style="fill:var(--blue)"/><circle cy="-19" r="4" fill="#fff"/></g>`).join('')}
    <circle cx="160" cy="112" r="14" style="fill:var(--blue);opacity:.18"/><circle cx="160" cy="112" r="6" style="fill:var(--blue);stroke:#fff;stroke-width:2.5"/>
  </svg>`;
}

export function volSvg(trend: { day: string; avg: number }[]): string {
  if (trend.length < 2) return `<div class="empty">이틀 이상 기록이 쌓이면 보여드려요</div>`;
  const V = trend.map((t) => t.avg);
  const w = 340, vh = 100;
  const mn = Math.max(0, Math.min(...V) - 5), mx = Math.min(100, Math.max(...V) + 5);
  const px = (i: number) => (i / (V.length - 1)) * w;
  const py = (v: number) => vh - ((v - mn) / Math.max(1, mx - mn)) * vh;
  const line = V.map((v, i) => (i ? 'L' : 'M') + px(i).toFixed(1) + ',' + py(v).toFixed(1)).join(' ');
  return `<svg viewBox="0 0 ${w} ${vh + 22}" width="100%">
   <defs><linearGradient id="vg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E2542E" stop-opacity=".3"/><stop offset="1" stop-color="#E2542E" stop-opacity="0"/></linearGradient></defs>
   <line class="grid" x1="0" x2="${w}" y1="${vh * 0.5}" y2="${vh * 0.5}"/>
   <path d="${line} L${w},${vh} L0,${vh}Z" fill="url(#vg)"/>
   <path d="${line}" fill="none" style="stroke:var(--hot)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
   <circle cx="${w - 3}" cy="${py(V[V.length - 1])}" r="5" style="fill:var(--hot)"/>
   <text class="axl" x="0" y="${vh + 17}">${trend[0].day}</text><text class="axl" x="${w}" y="${vh + 17}" text-anchor="end">${trend[trend.length - 1].day} · ${Math.round(V[V.length - 1])}%</text></svg>`;
}
