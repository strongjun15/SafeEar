/** SafeEar 화면 — main 프로세스가 1초마다 보내는 AppState를 그린다 */
import { BAND_NOMINAL_HZ, niptsCurve, pa2FromDb, type AgeBand, type HearingMode, type OutputType } from '@safeear/core';
import type { AppState, Result, SafeEarApi, Scenario, Settings, WaveChunk } from '../shared/types';
import { AudioLab } from './audio-lab';
import { barMap, bandColor, curveSvg, dayBarsSvg, eqCurvesSvg, heatWeekHtml, mapPreviewSvg, ring, setArc, volSvg } from './charts';
import { DOCS } from './docs';
import { $, $$, esc, fmtDuration, notify } from './dom';

declare global {
  interface Window {
    safeear: SafeEarApi & { setPaused(p: boolean): Promise<void> };
  }
}
const api = window.safeear;

let S: AppState | null = null;
let lastSig: Record<string, string> = {};
const changed = (key: string, sig: unknown) => {
  const s = JSON.stringify(sig);
  if (lastSig[key] === s) return false;
  lastSig[key] = s;
  return true;
};

/* ---------------- 탭 ---------------- */
const ICON: Record<string, string> = {
  map: '<path d="M5 20V12M10 20V6M15 20V10M20 20V4"/>',
  recover: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  home: '<path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-8.5Z"/>',
  future: '<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  report: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 15l3-3 2 2 3-4"/>',
};
const TABS: [string, string][] = [['map', '음역'], ['recover', '회복'], ['home', '오늘'], ['future', '10년 뒤'], ['report', '리포트']];
const track = $('#track'), lens = $('#lens');
TABS.forEach(([id, l], i) => {
  const b = document.createElement('button');
  b.dataset.i = String(i);
  b.setAttribute('aria-label', l);
  b.dataset.tab = id;
  const svg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[id]}</svg>`;
  // 오늘(홈)은 다른 탭과 구분되는 둥근 버튼
  if (id === 'home') { b.className = 'home'; b.innerHTML = `<i class="hb">${svg}</i><span>${l}</span>`; }
  else b.innerHTML = `${svg}<span>${l}</span>`;
  b.addEventListener('click', (e) => {
    if (e.detail === 0) go(id);
  });
  track.appendChild(b);
});
let cur = 2;
const btns = () => [...track.querySelectorAll('button')];
const LENS_INSET = 3;
/** 렌즈: 늘 같은 요소를 두고 자리만 바꾼다 (새로 만들면 미끄러지다 끊김). jump면 전환 없이 바로 */
function place(i: number, jump = false) {
  const b = btns()[i];
  if (!b || !b.offsetWidth) return;
  const put = () => {
    lens.style.transform = `translate(${b.offsetLeft + LENS_INSET}px,${b.offsetTop + LENS_INSET}px)`;
    lens.style.width = `${b.offsetWidth - 2 * LENS_INSET}px`;
    lens.style.height = `${b.offsetHeight - 2 * LENS_INSET}px`;
  };
  if (jump || !lens.dataset.on) {
    lens.style.transition = 'none';
    put();
    void lens.offsetWidth;
    lens.style.transition = '';
    lens.dataset.on = '1';
  } else put();
}
/** 탭을 바꿀 때 내용이 아래에서 살짝 떠오른다 */
function animateTab() {
  const app = $('#app');
  app.removeAttribute('data-anim');
  void app.offsetWidth;
  app.dataset.anim = 'tab';
  clearTimeout((animateTab as unknown as { t?: number }).t);
  (animateTab as unknown as { t?: number }).t = window.setTimeout(() => app.removeAttribute('data-anim'), 700);
}
function go(id: string, anim = true) {
  const i = TABS.findIndex((t) => t[0] === id);
  if (i < 0) return;
  const changedTab = i !== cur || !lens.dataset.on;
  cur = i;
  track.dataset.cur = id;
  TABS.forEach(([t]) => ($('#' + t).hidden = t !== id));
  btns().forEach((b, k) => {
    b.classList.toggle('on', k === i);
    b.setAttribute('aria-current', k === i ? 'page' : 'false');
    b.classList.remove('peek');
  });
  place(i);
  $('#scroll').scrollTop = 0;
  if (id !== 'future') lab.stop();
  if (anim && changedTab) animateTab();
  lastSig = {};
  if (S) render(S);
}
// 끌어서 바꾸기: 8px 넘게 움직이면 렌즈가 손가락을 따라오고(살짝 커짐), 놓은 자리의 탭으로 바뀐다
let drag: { x0: number; id: number; moved: boolean } | null = null;
const nearest = (x: number) => {
  let best = 0, bd = Infinity;
  btns().forEach((b, k) => {
    const r = b.getBoundingClientRect();
    const d = Math.abs(x - (r.left + r.width / 2));
    if (d < bd) { bd = d; best = k; }
  });
  return best;
};
track.addEventListener('pointerdown', (e) => { drag = { x0: e.clientX, id: e.pointerId, moved: false }; });
track.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.moved && Math.abs(e.clientX - drag.x0) < 8) return;
  if (!drag.moved) {
    drag.moved = true;
    try { track.setPointerCapture(e.pointerId); } catch { /* */ }
    track.classList.add('drag');
  }
  const L = btns(), r = track.getBoundingClientRect();
  const x = Math.min(Math.max(e.clientX - r.left - lens.offsetWidth / 2, L[0].offsetLeft + LENS_INSET), L[L.length - 1].offsetLeft + LENS_INSET);
  lens.style.transform = `translate(${x}px,${LENS_INSET}px) scale(1.06,1.1)`;
  const k = nearest(e.clientX);
  L.forEach((b, j) => b.classList.toggle('peek', j === k));
});
function endDrag(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id) return;
  drag = null;
  track.classList.remove('drag');
  btns().forEach((b) => b.classList.remove('peek'));
  go(TABS[nearest(e.clientX)][0]);
}
track.addEventListener('pointerup', endDrag);
track.addEventListener('pointercancel', () => {
  drag = null;
  track.classList.remove('drag');
  btns().forEach((b) => b.classList.remove('peek'));
  place(cur);
});
new ResizeObserver(() => { if (!drag) place(cur, true); }).observe(track);

// 커서를 따라가는 은은한 빛: 커서 위치를 그 요소 안 좌표(--mx, --my)로 (마우스 기기만, 프레임당 한 번)
const GLOW = '.btn, .gbtn, .iconbtn, .herobtn, .back, .mins button, .seg button, .card.tap, .stat.tap, button.row, .dock button';
if (matchMedia('(hover: hover)').matches) {
  let ge: PointerEvent | null = null, raf = 0;
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    ge = e;
    if (!raf) raf = requestAnimationFrame(() => {
      raf = 0;
      const el = ge?.target instanceof Element ? (ge.target.closest(GLOW) as HTMLElement | null) : null;
      if (!el || !ge) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${Math.round(ge.clientX - r.left)}px`);
      el.style.setProperty('--my', `${Math.round(ge.clientY - r.top)}px`);
    });
  }, { passive: true });
}

document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const g = t.closest<HTMLElement>('[data-go]');
  if (g) go(g.dataset.go!);
  const d = t.closest<HTMLElement>('[data-doc]');
  if (d) { e.preventDefault(); openDoc(d.dataset.doc!); }
  const c = t.closest<HTMLElement>('[data-close]');
  if (c) $('#' + c.dataset.close).hidden = true;
  const x = t.closest<HTMLElement>('[data-ext]');
  if (x) void api.openExternal(x.dataset.ext!);
});

function openDoc(k: string) {
  const d = DOCS[k];
  if (!d) return;
  $('#docTitle').textContent = d[0];
  $('#docBody').innerHTML = d[1];
  $('#doc').hidden = false;
  $('#doc').scrollTop = 0;
}
$('#docBack').onclick = () => ($('#doc').hidden = true);

/* ---------------- 오늘 ---------------- */
ring($('#homeRing'), `<div class="big"><span id="homePct">0</span><small>%</small></div>`, '일주일 권장량 중');
ring($('#timerRing'), `<div class="big" id="clock" style="font-size:50px">30:00</div>`, `<span id="timerLbl"></span>`);

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
/** 이 속도로 들으면 언제 100%가 되는지 — 친근한 말로 */
function projectionText(s: AppState): [string, string] {
  const p = s.gauge.projection;
  const nowMin = Math.floor(Date.now() / 60000);
  if (s.gauge.safeEarPct >= 100 || (p.minute !== null && p.minute <= nowMin)) return ['다 찼어요', '쉬면 다시 내려가요'];
  if (p.basisDays === 0) return ['살펴보는 중', '하루쯤 지나면 알려 드려요'];
  if (p.minute === null) return ['3일 넘게 여유', '이 속도라면'];
  const d = new Date(p.minute * 60000);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  const day = d.toDateString() === today.toDateString() ? '오늘' : d.toDateString() === tomorrow.toDateString() ? '내일' : `${DOW[d.getDay()]}요일`;
  const h = d.getHours();
  const part = h < 5 ? '새벽' : h < 12 ? '오전' : h < 18 ? '오후' : '밤';
  return [`${day} ${part}`, '이 속도면 다 차요'];
}

/** 남은 양을 '지금 크기로 몇 시간 더'로 바꾼다 */
function remainingText(s: AppState): [string, string] {
  const g = s.gauge, L = s.live;
  const left = g.allowancePa2h * Math.max(0, 1 - g.safeEarPct / 100);
  if (left <= 0) return ['0분', '오늘은 쉬어 가요'];
  const live = L.counting && L.splA != null;
  const level = live ? L.splA! : g.recentLaeq ?? 75;
  const w = live ? L.kurtWeight : g.kurtWeightAvg || 1;
  const hours = left / (pa2FromDb(level) * w);
  const tx = hours >= 24 ? '하루 넘게' : hours >= 1 ? `약 ${Math.floor(hours)}시간${hours < 10 && hours % 1 >= 0.5 ? ' 반' : ''}` : `약 ${Math.max(1, Math.round(hours * 60))}분`;
  return [tx, live ? '지금 크기로 남은 시간' : '평소 크기로 남은 시간'];
}

const betaWord = (b: number) => (b < 4 ? '부드러움' : b < 8 ? '보통' : '뾰족함');

const OUT_LABEL: Record<OutputType, string> = { headphones: '이어폰', speaker: '스피커 · 제외', unknown: '미확인' };

function renderHome(s: AppState) {
  const g = s.gauge, L = s.live;
  $('#homePct').textContent = String(Math.round(g.safeEarPct));
  setArc($('#homeRing'), g.safeEarPct / 100);
  const [lt, ll] = remainingText(s);
  $('#leftTx').textContent = lt;
  $('#leftLbl').textContent = ll;
  const [pt, pl] = projectionText(s);
  $('#projTx').textContent = pt;
  $('#projLbl').textContent = pl;

  // 상태 배지
  const badge = $('#badge');
  const st = L.paused ? 'paused' : L.capture.status;
  const TX: Record<string, string> = {
    running: L.demoPaused ? '분석 잠시 멈춤' : L.counting ? '측정 중' : '소리 기다리는 중',
    starting: '측정 준비 중',
    paused: '측정 일시정지',
    stopped: '측정 멈춤',
    error: '다시 연결 중',
    unsupported: '윈도우에서만 측정돼요',
  };
  $('#badgeTx').textContent = TX[st] ?? st;
  badge.className = 'badge ' + (st === 'running' ? 'b-live' : st === 'error' || st === 'unsupported' ? 'b-err' : 'b-off');
  badge.title = L.capture.message ?? '';

  $('#liveSpl').textContent = L.splA != null ? `${Math.round(L.splA)} dB` : '조용함';
  const v = L.volume;
  $('#liveVol').textContent = !v.available ? '읽지 못함' : v.muted ? '음소거' : v.scalar != null ? `${Math.round(v.scalar * 100)}%` : '–';
  $('#liveApp').textContent = L.app ?? '–';
  $('#liveApp').title = L.app ?? '';
  const pill = $('#outPill');
  pill.textContent = OUT_LABEL[L.output.type] + (L.output.source === 'user' ? ' (직접 설정)' : '');
  pill.className = 'pill' + (L.output.type === 'headphones' ? '' : ' off');
  $('#outName').textContent = L.output.name ?? '출력 장치 확인 중';

  const hintKey = [L.output.id, L.output.type, L.output.source, v.available, L.capture.status, s.settings.paused];
  if (changed('liveHint', hintKey)) {
    let h = '';
    if (L.capture.status === 'error' && L.capture.message) {
      h = `<div class="hintbox"><p>소리를 받지 못하고 있어요</p></div>`;
    } else if (L.output.id && L.output.type === 'speaker' && L.output.source === 'auto') {
      h = `<div class="hintbox"><p>스피커로 인식돼 계산에서 빠져 있어요</p><button class="btn sm" id="markHp">이어폰이에요</button></div>`;
    } else if (!v.available && L.capture.status === 'running') {
      h = `<div class="hintbox soft"><p>볼륨을 읽지 못해 100%로 계산 중</p></div>`;
    } else if (L.output.type === 'unknown' && L.output.id) {
      h = `<div class="hintbox soft"><p>이어폰으로 보고 계산 중</p><button class="btn sm ghost" id="markSp">스피커예요</button></div>`;
    }
    $('#liveHint').innerHTML = h;
    const mk = (sel: string, type: OutputType) => {
      const b = document.querySelector<HTMLElement>(sel);
      if (b && L.output.id) b.onclick = async () => {
        await call(api.setOutput(L.output.id!, { type }), type === 'headphones' ? '이어폰으로 바꿨어요' : '스피커로 바꿨어요');
      };
    };
    mk('#markHp', 'headphones');
    mk('#markSp', 'speaker');
  }
  // 경고까지 남은 거리 (0~120% 축, 80% 주의 · 100% 한도)
  const ax = (p: number) => `${(Math.min(120, Math.max(0, p)) / 120) * 100}%`;
  const pct = g.safeEarPct;
  $('#dualBar').style.width = ax(pct);
  $('#dualMk').style.left = ax(pct);
  const ticks = $$('#dual .tick');
  ticks[0].style.left = ax(80);
  ticks[1].style.left = ax(100);
  $('#gaugeTx').innerHTML = pct >= 100
    ? `한도를 넘었어요. <b>오늘은 쉬어 가요</b>`
    : pct >= 80
      ? `주의 구간이에요. 한도까지 <b>${Math.ceil(100 - pct)}%p</b>`
      : `주의선까지 <b>${Math.ceil(80 - pct)}%p</b> 남았어요`;

  $('#stToday').innerHTML = fmtDuration(g.todayListenSec);
  $('#stTodayPct').innerHTML = `${Math.round(g.todayPct)}<small>%</small>`;
  $('#stBeta').innerHTML = L.beta != null ? `${betaWord(L.beta)}<small>×${L.kurtWeight.toFixed(1)}</small>` : '–';
  $('#stMode').innerHTML = g.mode === 2 ? `청소년<small>75 dB</small>` : `성인<small>80 dB</small>`;

  if (changed('dev', [g.devices, s.session.signedIn, s.sync])) {
    const box = $('#devShare');
    if (!g.devices.length) box.innerHTML = `<div class="empty">기록 없음</div>`;
    else box.innerHTML = g.devices.map((d) => `<div class="r"><div><div>${esc(d.name)}</div><div class="t"><i style="width:${d.pct.toFixed(1)}%;${d.isThis ? '' : 'background:var(--teal)'}"></i></div></div><div class="p">${Math.round(d.pct)}%</div></div>`).join('');
    // 평소엔 아무것도 안 보이고, 할 일이 있을 때만 버튼이나 경고 한 줄
    const sl = $('#syncLine');
    if (!s.session.signedIn) sl.innerHTML = `<button class="btn ghost wide sm" id="syncLogin" style="margin-top:12px">다른 기기와 합치기</button>`;
    else if (s.sync.error) sl.innerHTML = `<div class="hintbox"><p>동기화 오류</p></div>`;
    else sl.innerHTML = '';
    const sb = document.querySelector<HTMLElement>('#syncLogin');
    if (sb) sb.onclick = () => showAuth('login', true);
  }

  if (changed('curve', g.curve)) $('#curve').innerHTML = curveSvg(g.curve);
  if (changed('mini', g.bands)) {
    $('#miniMap').innerHTML = barMap(g.bands, 320, 64, false);
  }
}

/* ---------------- 음역별 부담 ---------------- */
function renderMap(s: AppState) {
  const g = s.gauge;
  if (!changed('map', [g.bands, g.bandCoverage])) return;
  $('#bigMap').innerHTML = barMap(g.bands, 340, 190, true);
  const max = Math.max(...g.bands);
  const avg = (a: number, b: number) => g.bands.slice(a, b + 1).reduce((x, y) => x + y, 0) / (b - a + 1) / (max || 1);
  const top = g.bands.indexOf(max);
  const hz = BAND_NOMINAL_HZ[top];
  const ex = hz < 300 ? '베이스·드럼' : hz < 1000 ? '목소리·기타' : hz < 3000 ? '말소리·멜로디' : hz < 6500 ? '자음·심벌즈' : '하이햇·쇳소리';
  $('#bandTop').innerHTML = max > 0
    ? `가장 많이 들은 높이 <b>${hz >= 1000 ? +(hz / 1000).toFixed(2) + ' kHz' : hz + ' Hz'}</b><span>${ex} 높이예요</span>`
    : '';
  $('#meter').innerHTML = ([['저음', '125~500 Hz', avg(0, 6)], ['중음', '630~2.5k', avg(7, 13)], ['고음', '3~8 kHz', avg(14, 18)]] as const)
    .map(([n, r, v]) => `<div class="r"><div><b>${n}</b><br><em>${r}</em></div><div class="track"><div class="fill" style="width:${(v * 100).toFixed(1)}%;background:${bandColor(v)}"></div></div><div class="p">${Math.round(v * 100)}</div></div>`)
    .join('');
}

/* ---------------- 회복 ---------------- */
const T = { total: 1800, left: 1800, run: false, h: 0 as unknown as ReturnType<typeof setInterval>, minutes: 30, from: 0, warned: false };
const fmt = (sec: number) => String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
function restPct(min: number) {
  return S?.gauge.rest.find((r) => r.min === min)?.pct ?? 0;
}
/** 변화가 2%p보다 작으면 소수 한 자리까지 보여 줘서 '37% → 37%'처럼 안 보이게 */
function pctTx(from: number, to: number) {
  const d = from - to < 2 ? 1 : 0;
  return `${from.toFixed(d)}% → ${to.toFixed(d)}%`;
}
function paintTimer() {
  $('#clock').textContent = fmt(T.left);
  setArc($('#timerRing'), (T.total - T.left) / T.total);
  const now = S?.gauge.safeEarPct ?? 0;
  $('#timerLbl').textContent = T.run || (T.left < T.total && T.left > 0)
    ? `지금 ${Math.round(now)}%`
    : T.left === 0 ? `지금 ${Math.round(now)}%` : `${T.minutes}분 쉬면 ${pctTx(now, restPct(T.minutes))}`;
}
function renderMins() {
  const box = $('#mins');
  const now = S?.gauge.safeEarPct ?? 0;
  box.innerHTML = '';
  for (const r of S?.gauge.rest ?? []) {
    const b = document.createElement('button');
    b.disabled = T.run;
    b.className = r.min === T.minutes ? 'on' : '';
    const label = r.min >= 60 ? `${r.min / 60}시간` : `${r.min}분`;
    b.innerHTML = `<span class="m">${label}</span><span class="d">−${Math.max(0, now - r.pct).toFixed(1)}%p</span><span class="t">${Math.round(r.pct)}%</span>`;
    b.onclick = () => {
      if (T.run) return;
      T.minutes = r.min;
      T.total = T.left = r.min * 60;
      renderMins();
      paintTimer();
    };
    box.appendChild(b);
  }
}
$('#tbtn').onclick = () => {
  const btn = $('#tbtn');
  if (T.left === 0) { T.left = T.total; paintTimer(); btn.textContent = '시작'; renderMins(); return; }
  if (T.run) { T.run = false; clearInterval(T.h); btn.textContent = '계속'; renderMins(); return; }
  if (T.left === T.total) {
    T.from = S?.gauge.safeEarPct ?? 0;
    T.warned = false;
    notify({ type: 'rest', title: `${T.minutes}분 쉬면 ${pctTx(T.from, restPct(T.minutes))}` });
  }
  T.run = true;
  btn.textContent = '일시정지';
  renderMins();
  T.h = setInterval(() => {
    T.left--;
    paintTimer();
    if (S?.live.counting && !T.warned) {
      T.warned = true;
      notify({ type: 'warn', title: '쉬는 중인데 소리가 들려요' });
    }
    if (T.left <= 0) {
      clearInterval(T.h);
      T.run = false;
      btn.textContent = '다시 하기';
      renderMins();
      notify({ type: 'ok', title: `잘 쉬었어요. 지금 ${Math.round(S?.gauge.safeEarPct ?? 0)}%예요` });
    }
  }, 1000);
};
function renderRecover(s: AppState) {
  if (changed('rest', [s.gauge.rest.map((r) => Math.round(r.pct * 10)), Math.round(s.gauge.safeEarPct * 10), T.run])) renderMins();
  paintTimer();
}

/* ---------------- 10년 뒤 ---------------- */
const lab = new AudioLab();
lab.onChange = (playing) => {
  void api.setDemoPlaying(playing);
  const p = $('#play');
  p.textContent = playing ? '■  정지' : '▶  재생';
  p.classList.toggle('ghost', playing);
};
/** 문장 속 숫자: "[10년] 뒤, 평소보다 [3 dB] 크게 들었을 때" — 숫자를 누르면 바로 아래에서 고른다 */
let futYears = 10;
let futVol = 0;
let picking: 'years' | 'vol' | null = null;
const YEAR_PRESETS = [1, 5, 10, 20, 30];
const VOL_PRESETS = [-6, -3, 0, 3, 6, 10];
const rerenderFuture = () => {
  lastSig.future = '';
  if (S) renderFuture(S);
};
const volChip = (d: number) => (d === 0 ? '평소 크기' : `${Math.abs(d)} dB ${d > 0 ? '크게' : '작게'}`);
const energyTx = (d: number) => {
  if (d === 0) return '평소 듣던 크기 그대로예요';
  const k = Math.pow(10, d / 10);
  return d > 0 ? `귀가 받는 소리 에너지가 ${k >= 10 ? Math.round(k) : k.toFixed(1)}배예요` : `귀가 받는 소리 에너지가 ${Math.round(k * 100)}%로 줄어요`;
};
function sentenceHtml(): string {
  const y = `<button class="numpill${picking === 'years' ? ' on' : ''}" data-pick="years" aria-expanded="${picking === 'years'}">${futYears}년</button>`;
  const v = `<button class="numpill${picking === 'vol' ? ' on' : ''}" data-pick="vol" aria-expanded="${picking === 'vol'}">${futVol === 0 ? '평소 크기' : `${Math.abs(futVol)} dB`}</button>`;
  return futVol === 0 ? `${y} 뒤,<br>${v}로 들었을 때` : `${y} 뒤,<br>평소보다 ${v} ${futVol > 0 ? '크게' : '작게'} 들었을 때`;
}
function pickerHtml(): string {
  if (picking === 'years') {
    return `<div class="pk-step"><button class="pk-btn" data-step="-1" aria-label="1년 줄이기"${futYears <= 1 ? ' disabled' : ''}>−</button>
      <b>${futYears}년 뒤</b><button class="pk-btn" data-step="1" aria-label="1년 늘리기"${futYears >= 30 ? ' disabled' : ''}>+</button></div>
      <div class="pk-chips">${YEAR_PRESETS.map((y) => `<button class="pk-chip${y === futYears ? ' on' : ''}" data-val="${y}">${y}년</button>`).join('')}</div>`;
  }
  if (picking === 'vol') {
    return `<div class="pk-step"><button class="pk-btn" data-step="-1" aria-label="1 dB 작게"${futVol <= -10 ? ' disabled' : ''}>−</button>
      <b>${volChip(futVol)}</b><button class="pk-btn" data-step="1" aria-label="1 dB 크게"${futVol >= 10 ? ' disabled' : ''}>+</button></div>
      <div class="pk-chips">${VOL_PRESETS.map((d) => `<button class="pk-chip${d === futVol ? ' on' : ''}" data-val="${d}">${d === 0 ? '평소' : `${d > 0 ? '+' : '−'}${Math.abs(d)} dB`}</button>`).join('')}</div>
      <p class="pk-tx">${energyTx(futVol)}</p>`;
  }
  return '';
}
$('#futSentence').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-pick]');
  if (!b) return;
  const k = b.dataset.pick as 'years' | 'vol';
  picking = picking === k ? null : k;
  rerenderFuture();
});
$('#picker').addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const step = t.closest<HTMLElement>('[data-step]');
  const val = t.closest<HTMLElement>('[data-val]');
  if (picking === 'years') {
    if (step) futYears = Math.min(30, Math.max(1, futYears + Number(step.dataset.step)));
    if (val) { futYears = Number(val.dataset.val); picking = null; }
  } else if (picking === 'vol') {
    if (step) futVol = Math.min(10, Math.max(-10, futVol + Number(step.dataset.step)));
    if (val) { futVol = Number(val.dataset.val); picking = null; }
  }
  if (step || val) rerenderFuture();
});
// 바깥을 누르거나 Esc를 누르면 닫는다
document.addEventListener('pointerdown', (e) => {
  if (!picking) return;
  const t = e.target as HTMLElement;
  if (t.closest('#picker') || t.closest('#futSentence')) return;
  picking = null;
  rerenderFuture();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && picking) { picking = null; rerenderFuture(); }
});
$('#play').onclick = () => lab.toggle();
($('#fileIn') as HTMLInputElement).onchange = async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  try {
    await lab.loadFile(f);
    notify({ title: `「${f.name}」로 들어요` });
  } catch {
    notify({ type: 'warn', title: '이 파일은 재생할 수 없어요' });
  }
};
const freqLabel = (f: number) => (f >= 1000 ? `${f / 1000}k` : String(f));
function renderFuture(s: AppState) {
  const lex = s.gauge.iso.lex8h;
  if (!changed('future', [lex == null ? null : Math.round(lex * 10), futYears, futVol, picking])) return;
  $('#futSentence').innerHTML = sentenceHtml();
  const pk = $('#picker');
  pk.innerHTML = pickerHtml();
  pk.hidden = !picking;
  if (lex == null) {
    lab.setScenario(null);
    $('#eq').innerHTML = `<div class="empty">이어폰으로 들은 기록이 생기면 계산해요</div>`;
    $('#eqnote').textContent = '';
    $('#isoHint').textContent = '';
    $('#isoTbl').innerHTML = '';
    return;
  }
  // 점선 = 같은 기간을 평소 크기로 들었을 때, 실선 = 고른 조건
  const ref = niptsCurve(lex, futYears);
  const cur = niptsCurve(lex + futVol, futYears);
  lab.setScenario({ id: 'keep', deltaDb: futVol, points: cur });
  $('#eq').innerHTML = eqCurvesSvg([
    { points: ref, color: 'var(--faint)', width: 1.4, dash: true },
    { points: cur, color: futVol < 0 ? 'var(--teal)' : 'var(--hot)', width: 3 },
  ]);
  const k4 = cur.find((p) => p.freq === 4000)?.db ?? 0;
  $('#eqnote').textContent = k4 < 0.5 ? '4 kHz 쪽은 거의 그대로예요' : `4 kHz 소리가 ${k4.toFixed(1)} dB 작게 들려요`;
  $('#isoHint').textContent = `평소 크기 ${Math.round(lex)} dB 기준`;
  $('#isoTbl').innerHTML = `<tr><th>높이</th>${ref.map((p) => `<th>${freqLabel(p.freq)}</th>`).join('')}</tr>
    <tr><td>평소 크기로</td>${ref.map((p) => `<td>${p.db.toFixed(1)}</td>`).join('')}</tr>
    <tr class="mine"><td>${futVol === 0 ? '고른 조건' : volChip(futVol)}</td>${cur.map((p) => `<td>${p.db.toFixed(1)}</td>`).join('')}</tr>`;
}

/* ---------------- 리포트 ---------------- */
const BLOCKS: [number, number, string][] = [[0, 5, '새벽'], [5, 9, '아침'], [9, 12, '오전'], [12, 17, '오후'], [17, 21, '저녁'], [21, 24, '밤']];
const dayName = (g: AppState['gauge'], i: number) => (i === 6 ? '오늘' : i === 5 ? '어제' : `${g.days[i]?.dow ?? ''}요일`);

/** 한 주를 한 문장으로 */
function quoteSentence(g: AppState['gauge']): string {
  const total = g.days.reduce((a, d) => a + d.listenSec, 0);
  if (total < 120) return '조용한 한 주였어요. 귀도 푹 쉬었을 거예요.';
  let best = { v: -1, day: 0, block: '' };
  g.heat.forEach((hours, di) => BLOCKS.forEach(([a, b, name]) => {
    const v = hours.slice(a, b).reduce((x, y) => x + y, 0);
    if (v > best.v) best = { v, day: di, block: name };
  }));
  const busy = `${dayName(g, best.day)} ${best.block}`;
  const app = g.apps.find((a) => a.label !== '그 밖의 앱')?.label;
  const vt = g.volumeTrend;
  if (vt.length >= 3 && vt[vt.length - 1].avg - vt[0].avg >= 5) return `볼륨이 조금씩 올라가고 있어요. ${busy}엔 한 번 쉬어 가요.`;
  if (g.safeEarPct >= 80) return `${busy}, 귀가 가장 바빴어요. 이번 주는 조금 쉬어 가요.`;
  return app ? `이번 주 귀가 가장 바빴던 때는 ${busy}, 주인공은 ${app}.` : `이번 주 귀가 가장 바빴던 때는 ${busy}.`;
}

let heatView: 'week' | 'day' = 'day';
let dayIdx = 6;
const rerenderReport = () => {
  lastSig.heat = '';
  if (S) renderReport(S);
};
$$<HTMLElement>('#heatSeg button').forEach((b) => (b.onclick = () => {
  heatView = b.dataset.hv as 'week' | 'day';
  rerenderReport();
}));
$('#dayPrev').onclick = () => { dayIdx = Math.max(0, dayIdx - 1); rerenderReport(); };
$('#dayNext').onclick = () => { dayIdx = Math.min(6, dayIdx + 1); rerenderReport(); };
const durTx = (sec: number) => {
  const m = Math.round(sec / 60);
  return m < 1 ? '안 들었어요' : m < 60 ? `${m}분 들었어요` : `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''} 들었어요`;
};

function renderReport(s: AppState) {
  const g = s.gauge;
  if (changed('quote', [g.days, g.apps[0]?.label, g.volumeTrend.length, Math.round(g.safeEarPct / 10)])) {
    $('#quoteTx').textContent = quoteSentence(g);
    $('#quoteBy').textContent = g.days.length ? `${g.days[0].date} – ${g.days[6].date}, 나의 귀` : '';
  }
  if (changed('heat', [g.heat, g.days, heatView, dayIdx])) {
    $$<HTMLElement>('#heatSeg button').forEach((b) => b.classList.toggle('on', b.dataset.hv === heatView));
    $('#heatWeek').hidden = heatView !== 'week';
    $('#heatDay').hidden = heatView !== 'day';
    if (heatView === 'week') $('#heat').innerHTML = heatWeekHtml(g.heat, g.days.map((d, i) => ({ top: i === 6 ? '오늘' : d.dow, sub: d.date })));
    else {
      const d = g.days[dayIdx];
      $('#dayTitle').textContent = d ? `${d.date} ${dayName(g, dayIdx) === '오늘' || dayName(g, dayIdx) === '어제' ? dayName(g, dayIdx) : d.dow + '요일'}` : '–';
      $('#daySub').textContent = d ? durTx(d.listenSec) : '';
      ($('#dayPrev') as HTMLButtonElement).disabled = dayIdx === 0;
      ($('#dayNext') as HTMLButtonElement).disabled = dayIdx === 6;
      $('#dayBars').innerHTML = dayBarsSvg(g.heat[dayIdx] ?? new Array(24).fill(0), Math.max(0, ...g.heat.flat()));
    }
  }
  if (changed('apps', g.apps)) {
    const COL = ['var(--hot)', 'var(--amber)', 'var(--teal)', 'var(--blue)'];
    $('#stack').innerHTML = g.apps.length ? g.apps.map((c, i) => `<div style="width:${c.pct}%;background:${COL[i % 4]}"></div>`).join('') : '';
    $('#stackLg').innerHTML = g.apps.length
      ? g.apps.map((c, i) => `<span><i style="background:${COL[i % 4]}"></i>${esc(c.label)} ${Math.round(c.pct)}%</span>`).join('')
      : `<span>아직 기록이 없어요</span>`;
  }
  if (changed('vol', g.volumeTrend)) {
    $('#vol').innerHTML = volSvg(g.volumeTrend);
    const vt = g.volumeTrend;
    const diff = vt.length >= 2 ? Math.round(vt[vt.length - 1].avg - vt[0].avg) : 0;
    $('#volTx').textContent = vt.length < 2 ? '' : diff >= 3 ? `${vt[0].day}보다 ${diff}%p 올랐어요` : diff <= -3 ? `${vt[0].day}보다 ${-diff}%p 내렸어요` : '거의 그대로예요';
  }
  if (!mapStarted) {
    mapStarted = true;
    loadMap();
  }
}

/* 가까운 이비인후과 지도 — 앱에서는 네이버 지도(모바일)를 상자 안에 띄운다 */
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
let mapStarted = false;
const regionIn = $('#mapRegion') as HTMLInputElement;
try { regionIn.value = localStorage.getItem('safeear.mapRegion') ?? ''; } catch { /* 저장소를 못 써도 괜찮다 */ }
const mapQuery = () => `${regionIn.value.trim() ? regionIn.value.trim() + ' ' : ''}이비인후과`;
function loadMap() {
  try { localStorage.setItem('safeear.mapRegion', regionIn.value.trim()); } catch { /* */ }
  const box = $('#mapBox');
  if (api.env !== 'electron') {
    box.innerHTML = mapPreviewSvg() + `<span class="mapchip">앱에서는 네이버 지도가 열려요</span>`;
    return;
  }
  const src = `https://m.map.naver.com/search2/search.naver?query=${encodeURIComponent(mapQuery())}`;
  const wv = box.querySelector('webview') as (HTMLElement & { loadURL(u: string): Promise<void> }) | null;
  if (wv) { void wv.loadURL(src).catch(() => undefined); return; }
  box.classList.remove('loaded', 'failed');
  box.innerHTML = `<webview partition="persist:naver-map" useragent="${MOBILE_UA}" src="${src}"></webview><span class="mapchip wait">지도 불러오는 중</span>`;
  const el = box.querySelector('webview')!;
  el.addEventListener('did-finish-load', () => box.classList.add('loaded'));
  el.addEventListener('did-fail-load', (e) => {
    if ((e as unknown as { isMainFrame?: boolean }).isMainFrame === false) return;
    box.classList.add('failed');
    box.innerHTML = mapPreviewSvg() + `<span class="mapchip">지도를 불러오지 못했어요. 아래 버튼으로 열어 보세요</span>`;
  });
}
$('#mapGo').onclick = loadMap;
regionIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadMap(); });
$('#mapOpen').onclick = () => void api.openExternal(`https://map.naver.com/p/search/${encodeURIComponent(mapQuery())}`);

/* ---------------- 프로필 ---------------- */
const initial = (n: string) => (n || '?').trim().charAt(0) || '?';
function paintTheme(st: Settings) {
  const r = document.documentElement;
  if (st.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', st.theme);
  if (st.accent === 'ocean') r.removeAttribute('data-accent'); else r.setAttribute('data-accent', st.accent);
}
function renderProfile(s: AppState, force = false) {
  const st = s.settings, u = s.session.user;
  $('#avBtn').textContent = u ? initial(u.name) : '?';
  $('#pAv').textContent = u ? initial(u.name) : '?';
  $('#pHead').textContent = u ? u.name : '로그인하지 않음';
  $('#pMail').textContent = u ? `${u.email ?? ''}${u.provider === 'google' ? ' · Google' : ''}` : '';
  $('#pLoginCard').hidden = !!u;
  $('#pNameField').hidden = !u;
  $('#accountActions').hidden = !u;
  $('#verTx').textContent = s.version;
  $$<HTMLElement>('[data-set]').forEach((b) => b.setAttribute('aria-checked', String(!!st[b.dataset.set as keyof Settings])));
  $$<HTMLElement>('[data-notify]').forEach((b) => b.setAttribute('aria-checked', String(!!st.notify[b.dataset.notify as keyof Settings['notify']])));
  $('#swMeasure').setAttribute('aria-checked', String(!st.paused));
  $$<HTMLElement>('#themeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.themeSet === st.theme));
  $$<HTMLElement>('#accents button').forEach((b) => b.classList.toggle('on', b.dataset.accent === st.accent));
  if (force || changed('profileForm', [u?.id, st.ageBand, st.mode])) {
    ($('#pName') as HTMLInputElement).value = u?.name ?? '';
    ($('#pAge') as HTMLSelectElement).value = st.ageBand ?? '';
    ($('#pMode') as HTMLSelectElement).value = String(s.gauge.mode);
    ($('#pMode') as HTMLSelectElement).disabled = st.ageBand === '14-17' || !st.ageBand;
  }
  if (force || changed('outs', [st.outputs, s.live.output.id, st.defaultRefSplDb])) renderOutputs(s);
}
function renderOutputs(s: AppState) {
  const outs = Object.entries(s.settings.outputs).sort((a, b) => b[1].lastSeen - a[1].lastSeen);
  const box = $('#outList');
  if (!outs.length) { box.innerHTML = `<div class="empty">없음</div>`; return; }
  const ff = (n: number | null) => (n === 3 || n === 5 || n === 6 ? '이어폰' : n === 1 || n === 2 || n === 8 || n === 9 ? '스피커' : '미확인');
  box.innerHTML = outs.map(([id, o]) => `<div class="outcard" data-out="${esc(id)}">
    <div class="n">${esc(o.name)}${id === s.live.output.id ? ' · 사용 중' : ''}</div>
    <div class="inline">
      <select data-k="type"><option value="">자동 (${ff(o.formFactor)})</option><option value="headphones"${o.type === 'headphones' ? ' selected' : ''}>이어폰·헤드폰</option><option value="speaker"${o.type === 'speaker' ? ' selected' : ''}>스피커</option></select>
      <input data-k="ref" type="number" min="70" max="140" step="1" placeholder="${s.settings.defaultRefSplDb}" value="${o.refSplDb ?? ''}" title="볼륨 100%에서 0 dBFS가 내는 dBA (교정값)">
      <span>dBA</span>
    </div></div>`).join('');
  box.querySelectorAll<HTMLElement>('.outcard').forEach((card) => {
    const id = card.dataset.out!;
    (card.querySelector('[data-k=type]') as HTMLSelectElement).onchange = (e) => {
      const v = (e.target as HTMLSelectElement).value as OutputType | '';
      void call(api.setOutput(id, { type: v || undefined }), '출력 장치 종류를 바꿨어요');
    };
    (card.querySelector('[data-k=ref]') as HTMLInputElement).onchange = (e) => {
      const raw = (e.target as HTMLInputElement).value;
      void call(api.setOutput(id, { refSplDb: raw ? Number(raw) : undefined }), '교정값을 바꿨어요');
    };
  });
}
async function loadDevices() {
  const list = $('#devList');
  if (!S?.session.signedIn) {
    list.innerHTML = `<div class="empty">로그인 필요</div>`;
    return;
  }
  list.innerHTML = `<div class="empty">…</div>`;
  const r = await api.listDevices();
  if (!r.ok) { list.innerHTML = `<div class="empty">${esc(r.error)}</div>`; return; }
  const ICON_DEV = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>';
  const PHONE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>';
  list.innerHTML = r.data.length
    ? r.data.map((d) => `<div class="row"><div class="lft"><div class="devic">${d.platform === 'windows' || d.platform === 'mac' ? ICON_DEV : PHONE}</div><div><div class="n">${esc(d.name)}</div><div class="v">${d.last_seen_at ? new Date(d.last_seen_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : ''}</div></div></div></div>`).join('')
    : `<div class="empty">없음</div>`;
}
function openProfile(scrollTo?: string) {
  if (!S) return;
  renderProfile(S, true);
  $('#profile').hidden = false;
  $('#profile').scrollTop = scrollTo ? $(scrollTo).offsetTop - 70 : 0;
  void loadDevices();
}
$('#avBtn').onclick = () => openProfile();
$('#toDevices').onclick = () => openProfile('#devSec');
$('#pToLogin').onclick = () => { $('#profile').hidden = true; showAuth('login', true); };
$('#toInfo').onclick = () => { $('#info').hidden = false; $('#info').scrollTop = 0; };
($('#pAge') as HTMLSelectElement).onchange = (e) => {
  const v = (e.target as HTMLSelectElement).value;
  ($('#pMode') as HTMLSelectElement).disabled = v === '14-17' || !v;
  if (v === '14-17' || !v) ($('#pMode') as HTMLSelectElement).value = '2';
};
$('#pSave').onclick = async () => {
  const name = ($('#pName') as HTMLInputElement).value.trim();
  const ageBand = (($('#pAge') as HTMLSelectElement).value || null) as AgeBand | null;
  const mode = Number(($('#pMode') as HTMLSelectElement).value) as HearingMode;
  if (S?.session.signedIn && !name) { notify({ type: 'warn', title: '이름을 입력해 주세요' }); return; }
  await call(api.updateProfile({ ...(S?.session.signedIn ? { name } : {}), ageBand, mode }), '저장했어요');
};
$$<HTMLElement>('[data-set]').forEach((b) => (b.onclick = () => {
  const k = b.dataset.set as keyof Settings;
  void call(api.setSettings({ [k]: !S?.settings[k] } as Partial<Settings>));
}));
$$<HTMLElement>('[data-notify]').forEach((b) => (b.onclick = () => {
  if (!S) return;
  const k = b.dataset.notify as keyof Settings['notify'];
  void call(api.setSettings({ notify: { ...S.settings.notify, [k]: !S.settings.notify[k] } }));
}));
$('#swMeasure').onclick = () => void api.setPaused(!S?.settings.paused ? true : false);
$$<HTMLElement>('#themeSeg button').forEach((b) => (b.onclick = () => void call(api.setSettings({ theme: b.dataset.themeSet as Settings['theme'] }))));
$$<HTMLElement>('#accents button').forEach((b) => (b.onclick = () => void call(api.setSettings({ accent: b.dataset.accent as Settings['accent'] }))));
$('#exportBtn').onclick = async () => {
  const r = await api.exportData();
  if (r.ok && r.data) notify({ title: '내보냈어요', desc: r.data });
  else if (!r.ok) notify({ type: 'warn', title: r.error });
};
$('#clearBtn').onclick = () => void call(api.clearLocalData(), '이 PC 기록을 지웠어요');
$('#logout').onclick = async () => {
  lab.stop();
  await call(api.signOut(), '로그아웃했어요');
  $('#profile').hidden = true;
};
$('#deleteAcc').onclick = async () => {
  const r = await api.deleteAccount();
  if (r.ok) { $('#profile').hidden = true; notify({ title: '탈퇴했어요' }); }
  else if (r.error !== '취소했어요.') notify({ type: 'warn', title: r.error });
};
$('#pauseBtn').onclick = () => void api.setPaused(!S?.settings.paused);
$('#badge').onclick = () => openDoc('tier');

async function call<T>(p: Promise<Result<T>>, okMsg?: string): Promise<Result<T>> {
  const r = await p;
  if (!r.ok) { if (r.error !== '취소했어요.') notify({ type: 'warn', title: r.error }); }
  else if (okMsg) notify({ title: okMsg, ttl: 2600 });
  return r;
}

/* ---------------- 로그인 · 회원가입 ---------------- */
const mailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
let authForced = false;
function showAuth(mode: 'login' | 'signup', force = false) {
  authForced = force;
  $('#auth').hidden = false;
  $('#auth').scrollTop = 0;
  $$<HTMLElement>('#authTabs button').forEach((b) => b.classList.toggle('on', b.dataset.at === mode));
  $('#fLogin').hidden = mode !== 'login';
  $('#fSignup').hidden = mode !== 'signup';
  ['#lErr', '#sErr', '#lOk', '#sOk'].forEach((x) => ($(x).textContent = ''));
}
$$<HTMLElement>('#authTabs button').forEach((b) => (b.onclick = () => showAuth(b.dataset.at as 'login' | 'signup', authForced)));
function busy(btn: HTMLElement, on: boolean, text?: string) {
  (btn as HTMLButtonElement).disabled = on;
  if (text) btn.textContent = text;
}
$('#googleBtn').onclick = async () => {
  const tx = $('#googleTx');
  busy($('#googleBtn'), true);
  tx.textContent = '브라우저에서 로그인을 마쳐 주세요…';
  $('#lErr').textContent = '';
  const r = await api.signInWithGoogle();
  busy($('#googleBtn'), false);
  tx.textContent = 'Google로 계속하기';
  if (!r.ok) ($('#fLogin').hidden ? $('#sErr') : $('#lErr')).textContent = r.error;
};
$('#fLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const m = ($('#lEmail') as HTMLInputElement).value.trim(), p = ($('#lPw') as HTMLInputElement).value;
  $('#lOk').textContent = '';
  if (!mailOk(m)) { $('#lErr').textContent = '이메일 주소를 다시 확인해 주세요.'; return; }
  if (!p) { $('#lErr').textContent = '비밀번호를 입력해 주세요.'; return; }
  busy($('#lBtn'), true, '로그인 중…');
  const r = await api.signIn({ email: m, password: p });
  busy($('#lBtn'), false, '로그인');
  if (!r.ok) { $('#lErr').textContent = r.error; return; }
  ($('#lPw') as HTMLInputElement).value = '';
});
$('#forgotBtn').onclick = async () => {
  const m = ($('#lEmail') as HTMLInputElement).value.trim();
  if (!mailOk(m)) { $('#lErr').textContent = '위에 이메일을 입력한 뒤 눌러 주세요.'; return; }
  const r = await api.resetPassword(m);
  $('#lErr').textContent = r.ok ? '' : r.error;
  $('#lOk').textContent = r.ok ? '재설정 메일을 보냈어요. 이 PC에서 메일의 링크를 누르면 새 비밀번호를 정할 수 있어요.' : '';
};
const reqBoxes = () => $$<HTMLInputElement>('#fSignup input[data-req]');
function syncAgree() {
  ($('#sBtn') as HTMLButtonElement).disabled = !reqBoxes().every((c) => c.checked);
  ($('#agAll') as HTMLInputElement).checked = $$<HTMLInputElement>('#fSignup .ag input').filter((c) => c.id !== 'agAll').every((c) => c.checked);
}
($('#agAll') as HTMLInputElement).onchange = (e) => {
  $$<HTMLInputElement>('#fSignup .ag input').forEach((c) => (c.checked = (e.target as HTMLInputElement).checked));
  syncAgree();
};
$$<HTMLInputElement>('#fSignup .ag input').forEach((c) => { if (c.id !== 'agAll') c.onchange = syncAgree; });
$('#fSignup').addEventListener('submit', async (e) => {
  e.preventDefault();
  const n = ($('#sName') as HTMLInputElement).value.trim(), m = ($('#sEmail') as HTMLInputElement).value.trim();
  const p = ($('#sPw') as HTMLInputElement).value, p2 = ($('#sPw2') as HTMLInputElement).value;
  const err = !n ? '이름을 입력해 주세요.' : !mailOk(m) ? '이메일 주소를 다시 확인해 주세요.' : p.length < 8 ? '비밀번호는 8자 이상으로 해 주세요.' : p !== p2 ? '비밀번호가 서로 달라요.' : '';
  $('#sErr').textContent = err;
  $('#sOk').textContent = '';
  if (err) return;
  busy($('#sBtn'), true, '가입하는 중…');
  const r = await api.signUp({ name: n, email: m, password: p, marketing: ($('#agPush') as HTMLInputElement).checked });
  busy($('#sBtn'), false, '가입하기');
  if (!r.ok) { $('#sErr').textContent = r.error; return; }
  ($('#sPw') as HTMLInputElement).value = ($('#sPw2') as HTMLInputElement).value = '';
  if (r.data.needsConfirm) {
    $('#sOk').textContent = `${m}로 인증 메일을 보냈어요. 이 PC에서 메일의 링크를 누르면 바로 로그인돼요.`;
    ($('#lEmail') as HTMLInputElement).value = m;
  }
});
$('#localBtn').onclick = async () => {
  if (authForced && !S?.session.signedIn) { $('#auth').hidden = true; authForced = false; return; }
  await api.continueLocal();
};
$('#fRecovery').addEventListener('submit', async (e) => {
  e.preventDefault();
  const p = ($('#rPw') as HTMLInputElement).value, p2 = ($('#rPw2') as HTMLInputElement).value;
  if (p.length < 8) { $('#rErr').textContent = '비밀번호는 8자 이상으로 해 주세요.'; return; }
  if (p !== p2) { $('#rErr').textContent = '비밀번호가 서로 달라요.'; return; }
  const r = await api.updatePassword(p);
  $('#rErr').textContent = r.ok ? '' : r.error;
  if (r.ok) notify({ title: '비밀번호를 바꿨어요' });
});

let wasSignedIn: boolean | null = null;
function renderAuth(s: AppState) {
  const ss = s.session;
  $('#noServer').hidden = ss.configured;
  ($('#googleBtn') as HTMLButtonElement).disabled = !ss.configured;
  ($('#lBtn') as HTMLButtonElement).disabled = !ss.configured;
  $('#recoveryScreen').hidden = !ss.recovery;
  const needAuth = !ss.signedIn && !ss.localOnly;
  if (needAuth && $('#auth').hidden) showAuth('login');
  if (ss.signedIn && !$('#auth').hidden) $('#auth').hidden = true;
  if (!needAuth && !authForced && !$('#auth').hidden) $('#auth').hidden = true;
  if (wasSignedIn === false && ss.signedIn) notify({ title: `${ss.user?.name ?? ''}님, 환영해요` });
  wasSignedIn = ss.signedIn;
}

/* ---------------- 파형 ---------------- */
const canvas = $('#wave') as HTMLCanvasElement;
const cctx = canvas.getContext('2d')!;
const WAVE_SECONDS = 5;
let waveBuf: { min: number; max: number }[] = [];
let waveDirty = false;
api.onWave((w: WaveChunk) => {
  for (let i = 0; i < w.min.length; i++) waveBuf.push({ min: w.min[i], max: w.max[i] });
  const cap = WAVE_SECONDS * 10 * w.min.length;
  if (waveBuf.length > cap) waveBuf = waveBuf.slice(waveBuf.length - cap);
  waveDirty = true;
});
function drawWave() {
  requestAnimationFrame(drawWave);
  if (!waveDirty || $('#home').hidden) return;
  waveDirty = false;
  const W = canvas.width, H = canvas.height, mid = H / 2;
  cctx.clearRect(0, 0, W, H);
  const css = getComputedStyle(document.documentElement);
  cctx.strokeStyle = css.getPropertyValue('--line').trim() || '#E2E8F2';
  cctx.beginPath();
  cctx.moveTo(0, mid);
  cctx.lineTo(W, mid);
  cctx.stroke();
  if (!waveBuf.length) return;
  const cap = WAVE_SECONDS * 10 * 24;
  const bw = W / cap;
  const counting = S?.live.counting;
  cctx.fillStyle = counting ? css.getPropertyValue('--teal').trim() : css.getPropertyValue('--dimmer').trim();
  const off = cap - waveBuf.length;
  // 작은 소리도 보이도록 √ 스케일
  const sc = (v: number) => Math.sign(v) * Math.sqrt(Math.abs(v));
  waveBuf.forEach((p, i) => {
    const y1 = mid - sc(p.max) * (mid - 4);
    const y2 = mid - sc(p.min) * (mid - 4);
    cctx.fillRect((off + i) * bw, y1, Math.max(1, bw - 0.6), Math.max(1.5, y2 - y1));
  });
}
requestAnimationFrame(drawWave);

/* ---------------- 그리기 ---------------- */
const PAUSE_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
const PLAY_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>';
function render(s: AppState) {
  S = s;
  paintTheme(s.settings);
  renderAuth(s);
  if (changed('pause', s.settings.paused)) {
    $('#pauseBtn').innerHTML = s.settings.paused ? PLAY_ICON : PAUSE_ICON;
    $('#pauseBtn').title = s.settings.paused ? '측정 다시 시작' : '측정 일시정지';
  }
  const tab = TABS[cur][0];
  if (tab === 'home') renderHome(s);
  if (tab === 'map') renderMap(s);
  if (tab === 'recover') renderRecover(s);
  if (tab === 'future') renderFuture(s);
  if (tab === 'report') renderReport(s);
  if (!$('#profile').hidden) renderProfile(s);
}

api.onState(render);
api.onNavigate((tab) => {
  ['#profile', '#info', '#doc'].forEach((x) => ($(x).hidden = true));
  go(tab);
});
void api.getState().then((s) => {
  if (!s) return;
  go('home', false);
  render(s);
});
