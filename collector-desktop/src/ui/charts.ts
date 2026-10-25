import snailUrl from './assets/snail-map-cartoon.png';
/** 인라인 SVG 차트 (외부 차트 라이브러리 없이 — 계획서 부록 A) */
import { BAND_LABELS } from '@safeear/core';
import type { CurvePoint } from '@safeear/core';
import type { Scenario } from '../shared/types';
import { lerp } from './dom';

const RAMP = ['#4B6FD0', '#17A398', '#8CC24E', '#F0A13C', '#E2542E'];
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

const RC = 2 * Math.PI * 88;
export function ring(el: HTMLElement, center: string, label: string): void {
  el.innerHTML = `<svg viewBox="0 0 216 216" width="216" height="216">
    <defs><linearGradient id="rg${el.id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#FFFFFF" stop-opacity=".78"/></linearGradient></defs>
    <circle cx="108" cy="108" r="88" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="16"/>
    <circle class="arc" cx="108" cy="108" r="88" fill="none" stroke="url(#rg${el.id})" stroke-width="16" stroke-linecap="round"
      stroke-dasharray="${RC}" stroke-dashoffset="${RC}" transform="rotate(-90 108 108)" style="transition:stroke-dashoffset .9s ease"/>
  </svg><div class="mid">${center}<div class="lbl">${label}</div></div>`;
}
export function setArc(el: HTMLElement, frac: number): void {
  const a = el.querySelector('.arc');
  if (a) a.setAttribute('stroke-dashoffset', String(RC * (1 - Math.max(0, Math.min(1, frac)))));
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
  const time = (m: number) => new Date(m * 60000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `<svg viewBox="0 0 ${w} ${h + 22}" width="100%">
   <line class="grid" x1="0" x2="${w}" y1="${h * 0.5}" y2="${h * 0.5}"/>
   <path d="${a}" style="fill:var(--amber);fill-opacity:.28;stroke:var(--amber)" stroke-width="2.4" stroke-linejoin="round"/>
   <path d="${b}" style="fill:var(--blue);fill-opacity:.2;stroke:var(--blue)" stroke-width="2" stroke-linejoin="round"/>
   <circle cx="${w}" cy="${Y(last.fast + last.slow)}" r="4.5" style="fill:var(--amber)"/>
   <line class="grid" x1="0" x2="${w}" y1="${h}" y2="${h}"/>
   <text class="axl" x="0" y="${h + 16}">${time(pts[0].minute)}</text><text class="axl" x="${w / 2}" y="${h + 16}" text-anchor="middle">${time(pts[Math.floor(pts.length / 2)].minute)}</text><text class="axl" x="${w}" y="${h + 16}" text-anchor="end">지금</text></svg>`;
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

export function eqSvg(scenarios: Scenario[], active: string): string {
  const w = 340, h = 120, L = 30;
  const fmin = Math.log10(200), fmax = Math.log10(16000);
  const worst = Math.max(0, ...scenarios.flatMap((s) => s.points.map((p) => p.db)));
  const gmin = -Math.max(10, Math.ceil((worst + 2) / 5) * 5), gmax = 3;
  const X = (f: number) => L + ((Math.log10(f) - fmin) / (fmax - fmin)) * (w - L - 4);
  const Y = (g: number) => h - ((g - gmin) / (gmax - gmin)) * h;
  let s = `<svg viewBox="0 0 ${w} ${h + 20}" width="100%">`;
  const step = gmin <= -20 ? 10 : 5;
  for (let g = 0; g >= gmin; g -= step) s += `<line class="grid" x1="${L}" x2="${w - 4}" y1="${Y(g)}" y2="${Y(g)}"/><text class="axl" x="${L - 6}" y="${Y(g) + 3}" text-anchor="end">${g}</text>`;
  s += `<line x1="${X(4000)}" x2="${X(4000)}" y1="0" y2="${h}" stroke-dasharray="3 3" style="stroke:var(--hot);opacity:.5"/>`;
  const COL: Record<string, string> = { now: 'var(--dimmer)', keep: 'var(--hot)', down: 'var(--teal)' };
  for (const sc of scenarios) {
    const on = sc.id === active;
    let d = '';
    for (let i = 0; i <= 120; i++) {
      const f = Math.pow(10, lerp(fmin, fmax, i / 120));
      d += (i ? ' L' : 'M') + X(f).toFixed(1) + ',' + Y(Math.max(gmin, gainAt(sc.points, f))).toFixed(1);
    }
    s += `<path d="${d}" fill="none" style="stroke:${COL[sc.id]}" stroke-width="${on ? 3 : 1.4}" stroke-linejoin="round" opacity="${on ? 1 : 0.3}"/>`;
  }
  ([['500', 500], ['1k', 1000], ['4k', 4000], ['8k', 8000]] as const).forEach(([l, f]) => {
    s += `<text class="axl ${f === 4000 ? 'hot' : ''}" x="${X(f)}" y="${h + 15}" text-anchor="middle">${l}</text>`;
  });
  return s + '</svg>';
}

export function heatHtml(heat: number[][], days: string[]): string {
  const max = Math.max(0, ...heat.flat());
  let h = `<div></div>` + days.map((d) => `<div class="d ${d === '토' || d === '일' ? 'we' : ''}">${d}</div>`).join('');
  for (let y = 0; y < 12; y++) {
    h += `<div class="t">${y % 3 === 0 ? y * 2 + '시' : ''}</div>`;
    for (let x = 0; x < 7; x++) {
      const v = max > 0 ? (heat[x]?.[y] ?? 0) / max : 0;
      h += v < 0.03 ? `<div class="c"></div>` : `<div class="c" style="background:var(--hot);opacity:${(0.14 + v * 0.86).toFixed(2)}"></div>`;
    }
  }
  return h;
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

/** A schematic cochlea: high frequencies at the outer base, low frequencies at the inner tip. */
export function cochleaSvg(values: number[]): string {
  const maximum = Math.max(0, ...values);
  const color = (v: number) => maximum === 0 ? 'var(--line)' : v / maximum < .33 ? '#2468ce' : v / maximum < .66 ? '#c66608' : '#c43c25';
  const point = (t: number) => { const angle = t * Math.PI * 4.8 + .22; const radius = 73 - t * 62; return [151 + radius * Math.cos(angle), 112 + radius * Math.sin(angle) * .88]; };
  let segments = '';
  for (let i = 0; i < 19; i++) {
    const band = 18 - i;
    let path = '';
    for (let k = 0; k <= 16; k++) { const [x, y] = point((i + k / 16) / 19); path += `${k ? ' L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`; }
    segments += `<path d="${path}" fill="none" stroke="${color(values[band] ?? 0)}" stroke-width="9" stroke-linecap="round"><title>${BAND_LABELS[band]} Hz</title></path>`;
  }
  return `<svg viewBox="0 0 350 233" role="img" aria-label="귀여운 달팽이의 등껍질에 표시한 소리별 청취 부담 지도">
    <image href="${snailUrl}" x="0" y="0" width="350" height="233"/>
    <g opacity=".85">${segments}</g>
    <path d="M100 68L145 108M257 175L219 134" fill="none" stroke="var(--ink)" stroke-width="1.3"/>
    <circle cx="145" cy="108" r="2.5" fill="var(--ink)"/><circle cx="219" cy="134" r="2.5" fill="var(--ink)"/>
    <rect x="44" y="44" width="104" height="25" rx="9" fill="var(--solid)" stroke="var(--line)"/><text x="96" y="61" text-anchor="middle" fill="currentColor" font-size="11" font-weight="700">안쪽: 낮은 소리</text>
    <rect x="209" y="174" width="108" height="25" rx="9" fill="var(--solid)" stroke="var(--line)"/><text x="263" y="191" text-anchor="middle" fill="currentColor" font-size="11" font-weight="700">바깥: 높은 소리</text>
  </svg>`;
}

/** Compare both existing ten-year scenarios without changing prediction values. */
export function hearingCompareSvg(scenarios: Scenario[]): string {
  const keep = scenarios.find(s => s.id === 'keep'), down = scenarios.find(s => s.id === 'down');
  if (!keep || !down) return '<div class="empty">청취 기록이 쌓이면 두 가지 습관을 비교할 수 있어요.</div>';
  const w = 352, h = 258, left = 36, right = 334, top = 34, bottom = 210;
  const maximum = Math.max(5, Math.ceil(Math.max(...keep.points.map(p => p.db), ...down.points.map(p => p.db)) / 5) * 5);
  const x = (frequency: number) => left + Math.log(frequency / 500) / Math.log(6000 / 500) * (right - left);
  const y = (value: number) => bottom - value / maximum * (bottom - top);
  let svg = `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="10년 뒤 같은 소리를 듣기 위해 더 필요한 음량 비교. 높을수록 더 큰 소리가 필요해요. 주황 실선은 현재 습관 유지, 청록 점선은 음량을 3 dB 낮춘 경우."><text x="${left}" y="16" class="hearing-svg-label">청력 역치 상승 (dB)</text>`;
  for (let i = 0; i <= 4; i++) {
    const value = maximum * i / 4;
    svg += `<line x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}" stroke="var(--line)"/><text x="${left - 8}" y="${y(value) + 4}" text-anchor="end" class="hearing-svg-label">${Number(value.toFixed(1))}</text>`;
  }
  for (const [scenario, color, dashed] of [[keep, '#cb601b', false], [down, '#087f83', true]] as const) {
    const path = scenario.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.freq).toFixed(2)},${y(p.db).toFixed(2)}`).join(' ');
    svg += `<path d="${path}" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"${dashed ? ' stroke-dasharray="6 5"' : ''}/>`;
    scenario.points.forEach(p => { svg += `<circle cx="${x(p.freq)}" cy="${y(p.db)}" r="3.5" fill="var(--solid)" stroke="${color}" stroke-width="2"><title>${p.freq} Hz: ${p.db.toFixed(1)} dB</title></circle>`; });
  }
  for (const [label, frequency] of [['500', 500], ['1k', 1000], ['2k', 2000], ['4k', 4000], ['6k', 6000]] as const) svg += `<text x="${x(frequency)}" y="${bottom + 20}" text-anchor="middle" class="hearing-svg-label">${label}</text>`;
  return svg + `<text x="${left}" y="254" class="hearing-svg-label">낮은 소리</text><text x="${right}" y="254" text-anchor="end" class="hearing-svg-label">높은 소리 (Hz)</text></svg>`;
}
