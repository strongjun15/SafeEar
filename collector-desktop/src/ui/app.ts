import { durationText, localDateKey } from '../shared/report';
/** SafeEar 화면 — main 프로세스가 1초마다 보내는 AppState를 그린다 */
import { niptsCurve, pa2FromDb, type HearingMode, type OutputType } from '@safeear/core';
import type { AppState, Result, SafeEarApi, Scenario, Settings } from '../shared/types';
import { createUiApi } from './api';
import { AudioLab } from './audio-lab';
import { hearingCompareSvg, cochleaSvg, ring, setArc, volSvg } from './charts';
import { DOCS } from './docs';
import { $, $$, esc, fmtDuration, notify } from './dom';

declare global {
  interface Window {
    safeear: SafeEarApi & { setPaused(p: boolean): Promise<void> };
  }
}
const api = createUiApi(window.safeear);

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
const TABS: [string, string][] = [['map', '귀 지도'], ['recover', '회복'], ['home', '오늘'], ['future', '10년 뒤'], ['report', '리포트']];
const track = $('#track'), lens = $('#lens');
TABS.forEach(([id, l], i) => {
  const b = document.createElement('button');
  b.dataset.i = String(i);
  b.setAttribute('aria-label', l);
  b.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[id]}</svg><span>${l}</span>`;
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
  TABS.forEach(([t]) => ($('#' + t).hidden = t !== id));
  btns().forEach((b, k) => {
    b.classList.toggle('on', k === i);
    b.setAttribute('aria-current', k === i ? 'page' : 'false');
    b.classList.remove('peek');
  });
  place(i);
  $('#scroll').scrollTop = 0;
  if (id !== 'future') lab.stop();
  if (id !== 'home') $('#soundAlertPopup').hidden = true;
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
ring($('#homeRing'), `<div class="big"><span id="homePct">0</span><small>%</small></div>`, '오늘 청취 부담');
ring($('#timerRing'), `<div class="big" id="clock" style="font-size:50px">30:00</div>`, `<span id="timerLbl"></span>`);

let soundAlertUser: string | null = null;
let activeSoundAlert = '';
const dismissedSoundAlerts = new Set<string>();
function updateSoundPopup(alerts: string[], key: string) {
  const user = S?.session.user?.id ?? null;
  if (soundAlertUser !== user) { soundAlertUser = user; dismissedSoundAlerts.clear(); }
  if (!alerts.length) { activeSoundAlert = ''; dismissedSoundAlerts.clear(); $('#soundAlertPopup').hidden = true; return; }
  activeSoundAlert = key;
  if (!user || !$('#auth').hidden || !$('#onboarding').hidden || !$('#profile').hidden || !$('#info').hidden || !$('#doc').hidden || dismissedSoundAlerts.has(key)) { $('#soundAlertPopup').hidden = true; return; }
  $('#soundAlertBody').textContent = alerts.join(' ');
  $('#soundAlertPopup').hidden = false;
}
function dismissSoundPopup() { dismissedSoundAlerts.add(activeSoundAlert); $('#soundAlertPopup').hidden = true; }
$('#soundAlertClose').onclick = dismissSoundPopup;
$('#soundAlertConfirm').onclick = dismissSoundPopup;
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#soundAlertPopup').hidden) dismissSoundPopup(); });

function renderHome(s: AppState) {
  const g = s.gauge;
  $('#homeRing').hidden = false;
  $('#recordPaused').hidden = !s.settings.paused;
  $('#recordCard').classList.toggle('is-paused', s.settings.paused);
  const today = g.todayPct * 7;
  $('#homePct').textContent = String(Math.round(today));
  setArc($('#homeRing'), today / 100);
  $('#restWarning').hidden = today < 80;
  $('#weeklyPct').textContent = `${Math.round(g.standardPct)}%`;
  $('#weeklyBar').style.width = `${Math.min(100, Math.max(0, g.standardPct))}%`;
  const device = s.live.output.name ?? s.live.volume.deviceName ?? '연결된 출력 기기 없음';
  $('#connectedDevice').textContent = device;
  $('#connectedDevice').title = device;
  const status = s.live.capture.status;
  $('#badgeTx').textContent = s.settings.paused ? '기록 일시정지' : status === 'running' ? '기록 중' : status === 'unsupported' ? '이 기기에서는 측정 불가' : status === 'error' ? '측정 연결 확인 필요' : '측정 준비 중';
  $('#badge').className = 'badge ' + (status === 'running' && !s.settings.paused ? 'b-live' : 'b-off');
  const live = s.live;
  const measuring = !s.settings.paused && live.capture.status === 'running' && !live.demoPaused;
  const counting = measuring && live.counting && live.splA != null;
  const perMinute = counting ? pa2FromDb(live.splA!) * live.kurtWeight / (g.allowancePa2h / 7) * 100 / 60 : 0;
  const reference = g.mode === 2 ? 75 : 80;
  const aboveReference = counting && live.splA! > reference;
  const minutesToLimit = perMinute > 0 ? Math.max(0, 100 - today) / perMinute : null;
  const risingFast = minutesToLimit != null && minutesToLimit <= 30;
  $('#liveSoundStatus').textContent = s.settings.paused ? '기록 일시정지' : live.capture.status === 'unsupported' ? '측정 불가' : live.demoPaused ? '소리 체험 중' : counting ? '분석 중' : '소리 대기 중';
  $('#liveSoundLevel').textContent = measuring && live.splA != null ? `${Math.round(live.splA)} dBA` : '–';
  $('#liveSoundRate').textContent = counting ? `청취 부담 +${perMinute.toFixed(2)}%/분` : '';
  $('#liveSoundSource').textContent = !measuring ? '기록을 재개하거나 측정 가능한 기기를 연결해 주세요.' : live.output.type === 'speaker' ? '스피커 소리는 청취 부담 계산에서 제외돼요.' : `${live.app ?? '소리 감지 대기'}${live.volume.scalar != null ? `, 기기 볼륨 ${Math.round(live.volume.scalar * 100)}%` : ''}, 추정 음량`;
  const alerts: string[] = [];
  if (aboveReference) alerts.push(`현재 음량이 앱 기준 ${reference} dBA보다 높아요. 기기 볼륨을 낮춰 주세요.`);
  if (risingFast) alerts.push(today >= 100 ? '오늘 청취 부담이 이미 100%에 도달했어요. 잠시 쉬어가세요.' : `현재 속도라면 약 ${Math.max(1, Math.ceil(minutesToLimit!))}분 안에 오늘 청취 부담이 100%에 도달해요. 볼륨을 줄여 주세요.`);
  updateSoundPopup(alerts, `${aboveReference}:${risingFast}`);
  const p = g.projection;
  const now = Math.floor(Date.now() / 60000);
  $('#weeklyProjection').textContent = g.safeEarPct >= 100 || g.standardPct >= 100 || (p.minute != null && p.minute <= now)
    ? '100%에 도달했어요' : p.basisDays === 0 ? '기록이 쌓이면 표시돼요' : p.minute == null ? '3일 안에는 도달하지 않아요'
    : new Date(p.minute * 60000).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/* ---------------- 귀 지도 ---------------- */
function renderMap(s: AppState) {
  const g = s.gauge;
  if (!changed('map', [g.bands, g.bandCoverage])) return;
  $('#bigMap').innerHTML = cochleaSvg(g.bands);
  const total = g.bands.reduce((a, b) => a + b, 0);
  const groups = [
    { name: '낮은 소리', example: '베이스, 낮게 울리는 소리', frequency: '125~500 Hz', from: 0, to: 7 },
    { name: '중간 소리', example: '대화, 노래의 목소리', frequency: '630~2,500 Hz', from: 7, to: 14 },
    { name: '높은 소리', example: '심벌즈, 날카로운 소리', frequency: '3,150~8,000 Hz', from: 14, to: 19 },
  ];
  const colors = ['#3478db', '#8554c9', '#d47523'];
  const shares = groups.map(group => g.bands.slice(group.from, group.to).reduce((a, b) => a + b, 0) / (total || 1) * 100);
  const first = shares[0], second = first + shares[1];
  const gradient = total > 0 ? `conic-gradient(${colors[0]} 0% ${first}%, ${colors[1]} ${first}% ${second}%, ${colors[2]} ${second}% 100%)` : 'var(--tint)';
  $('#meter').innerHTML = `<div class="sound-donut" style="background:${gradient}" role="img" aria-label="${total > 0 ? groups.map((group, i) => `${group.name} ${shares[i].toFixed(1)}%`).join(', ') : '청취 기록 없음'}"><div><span>${total > 0 ? '부담이 가장 큰 소리' : '기록 없음'}</span>${total > 0 ? `<b>${groups[shares.indexOf(Math.max(...shares))].name}</b>` : ''}</div></div><div class="donut-legend">${groups.map((group, i) => `<div><span><i style="background:${colors[i]}"></i>${group.name}</span><b>${total > 0 ? `${shares[i].toFixed(1)}%` : '–'}</b></div>`).join('')}</div>`;

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
  const recommended = now > 0 ? (S?.gauge.rest.find(r => now >= 80 ? r.pct < 80 : r.min >= 30) ?? S?.gauge.rest.at(-1))?.min : null;
  box.innerHTML = '';
  for (const r of S?.gauge.rest ?? []) {
    const b = document.createElement('button');
    b.disabled = T.run;
    b.className = r.min === T.minutes ? 'on' : '';
    const label = r.min >= 60 ? `${r.min / 60}시간` : `${r.min}분`;
    b.innerHTML = `${r.min === recommended ? '<span class="rest-recommend-badge">추천</span>' : ''}<span class="m">${label}</span><span class="d">−${Math.max(0, now - r.pct).toFixed(1)}%p</span><span class="t">${Math.round(r.pct)}%</span>`;
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
const SEG: { id: Scenario['id']; t: string; good?: boolean }[] = [
  { id: 'now', t: '원래 소리' },
  { id: 'keep', t: '현재 습관' },
  { id: 'down', t: '음량 낮추기', good: true },
];
let segCur: Scenario['id'] = 'keep';
SEG.forEach((a) => {
  const b = document.createElement('button');
  b.className = a.good ? 'good' : '';
  b.dataset.id = a.id;
  b.innerHTML = `<span class="t">${a.t}</span>`;
  b.onclick = () => {
    segCur = a.id;
    lastSig.future = '';
    if (S) renderFuture(S);
  };
  $('#seg').appendChild(b);
});
$('#play').onclick = () => lab.toggle();
($('#fileIn') as HTMLInputElement).onchange = async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  try {
    await lab.loadFile(f);
    if (S) renderFuture(S);
    notify({ title: `「${f.name}」로 들어요` });
  } catch {
    notify({ type: 'warn', title: '이 파일은 재생할 수 없어요' });
  }
};
function renderFuture(s: AppState) {
  const demo = s.session.user?.provider === 'demo';
  const iso: AppState['gauge']['iso'] = demo ? {
    lex8h: 85,
    scenarios: [
      { id: 'now', deltaDb: 0, points: niptsCurve(85, 0) },
      { id: 'keep', deltaDb: 0, points: niptsCurve(85, 10) },
      { id: 'down', deltaDb: -3, points: niptsCurve(82, 10) },
    ],
  } : s.gauge.iso;
  $('#futureDataLabel').hidden = !demo;
  if (!changed('future', [iso, segCur, lab.fileName, s.session.user?.provider])) return;
  ($('#play') as HTMLButtonElement).disabled = !lab.fileName && s.session.user?.provider !== 'demo';
  [...$('#seg').children].forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.id === segCur));
  const sc = iso.scenarios.find((x) => x.id === segCur) ?? null;
  lab.setScenario(sc);
  $('#eq').innerHTML = hearingCompareSvg(iso.scenarios);
  const keep = iso.scenarios.find(x => x.id === 'keep');
  const down = iso.scenarios.find(x => x.id === 'down');
  const benefit = keep && down ? Math.max(0, ...keep.points.map(point => point.db - (down.points.find(p => p.freq === point.freq)?.db ?? point.db))) : null;
  $('#volumeBenefit').hidden = benefit == null;
  $('#volumeBenefit').textContent = benefit == null ? '' : benefit < .1 ? '현재 기록에서는 음량을 낮췄을 때의 예상 차이가 거의 없어요.' : `음량을 3 dB 낮추면, 10년 뒤 예상 청력 손실이 최대 ${benefit.toFixed(1)} dB 적어요.`;


}

/* ---------------- 리포트 ---------------- */
let reportView: 'day' | 'week' = 'week';
let reportDate = localDateKey(new Date());
let reportRequest = 0;
document.addEventListener('pointerdown', e => {
  if (!(e.target as Element).closest('#weekChart')) $('#recordDetail').hidden = true;
});
function moveReport(direction: number) {
  const next = new Date(`${reportDate}T00:00:00`);
  next.setDate(next.getDate() + direction * (reportView === 'day' ? 1 : 7));
  if (localDateKey(next) > localDateKey(new Date())) return;
  reportDate = localDateKey(next);
  if (S) void renderReport(S);
}
$('#reportPrev').onclick = () => moveReport(-1);
$('#reportNext').onclick = () => moveReport(1);
$$<HTMLButtonElement>('[data-report-view]').forEach(button => {
  button.onclick = () => {
    reportView = button.dataset.reportView as 'day' | 'week';
    $$<HTMLButtonElement>('[data-report-view]').forEach(b => {
      b.classList.toggle('on', b === button);
      b.setAttribute('aria-pressed', String(b === button));
    });
    if (S) renderReport(S);
  };
});
async function renderReport(s: AppState) {
  const g = s.gauge;
  if (!changed('report', [reportView, reportDate, g.weekDays, g.todayHours, g.todayApps, g.apps, g.volumeTrend])) return;
  const daily = reportView === 'day';
  const request = ++reportRequest;
  const date = reportDate;
  const selected = new Date(`${date}T00:00:00`);
  const start = new Date(selected); if (!daily) start.setDate(start.getDate() - 6);
  const dateText = (d: Date) => `${d.getMonth() + 1}월 ${d.getDate()}일`;
  $('#reportPeriod').textContent = daily ? selected.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }) : `${dateText(start)} – ${dateText(selected)}`;
  const next = new Date(selected); next.setDate(next.getDate() + (daily ? 1 : 7));
  ($('#reportNext') as HTMLButtonElement).disabled = localDateKey(next) > localDateKey(new Date());
  $('#reportTitle').textContent = '청취 부담 리포트';
  $('#reportCaption').textContent = daily ? '하루 누적 청취 부담' : '주간 누적 청취 부담';
  $('#reportAverage').textContent = '불러오는 중';
  $('#weekChart').innerHTML = '';
  $('#reportApps').innerHTML = '';
  $('#reportVolume').hidden = true;
  let result;
  try { result = await api.getReport(date, reportView); }
  catch { if (request === reportRequest) $('#reportAverage').textContent = '기록을 불러오지 못했어요'; return; }
  if (request !== reportRequest) return;
  if (!result.ok) { $('#reportAverage').textContent = result.error; return; }
  const report = result.data;
  const listeningSeconds = report.totals;
  const totals = report.burdenTotals;
  const percent = (value: number) => value > 0 && value < .1 ? '0.1% 미만' : `${value.toFixed(1)}%`;
  $('#recordDetail').hidden = true;
  const unit = 25;
  const max = Math.max(unit, Math.ceil(Math.max(0, ...totals) / unit) * unit);
  const total = totals.reduce((a, b) => a + b, 0);
  $('#reportAverage').textContent = percent(daily ? total : total / 7);
  $('#weekChart').classList.toggle('hourly-chart', daily);
  const maxLabel = `${max}%`;
  $('#weekChart').innerHTML = `<div class="week-grid"><span>${maxLabel}</span><span>0</span></div><div class="week-columns">${totals.map((value, i) => {
    const label = daily ? i % 6 === 0 ? report.labels[i] : '' : report.labels[i];
    const day = new Date(`${report.start}T00:00:00`); if (!daily) day.setDate(day.getDate() + i);
    const targetDate = localDateKey(day);
    return `<button class="week-column report-column" data-date="${targetDate}" data-detail="${esc(daily ? `${i}시~${i + 1}시` : `${day.getMonth() + 1}월 ${day.getDate()}일`)} · 청취 부담 ${percent(value)}\n청취 시간 ${durationText(listeningSeconds[i])}" aria-label="${esc(report.labels[i])} 청취 부담 ${percent(value)}${daily ? '' : ', 일별 기록 보기'}"><div class="week-bar-area"><div class="week-bar${i === (daily ? new Date().getHours() : totals.length - 1) ? ' selected' : ''}" style="height:${value / max * 100}%"></div></div><span>${esc(label)}</span></button>`;
  }).join('')}</div>`;
  $$<HTMLButtonElement>('#weekChart .report-column').forEach(button => {
    const inspect = () => {
      const tooltip = $('#recordDetail');
      tooltip.textContent = (button.dataset.detail ?? '').replace(' · ', '\n');
      tooltip.hidden = false;
      const card = button.closest<HTMLElement>('.screen-time-card')!;
      const cardRect = card.getBoundingClientRect();
      const bar = button.querySelector<HTMLElement>('.week-bar')!;
      const barRect = bar.getBoundingClientRect();
      const barTop = bar.parentElement!.getBoundingClientRect().bottom - bar.offsetHeight;
      const center = barRect.left + barRect.width / 2 - cardRect.left;
      const left = Math.max(8, Math.min(cardRect.width - tooltip.offsetWidth - 8, center - tooltip.offsetWidth / 2));
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${Math.max(8, barTop - cardRect.top - tooltip.offsetHeight - 10)}px`;
      tooltip.style.setProperty('--tip-arrow', `${Math.max(12, Math.min(tooltip.offsetWidth - 12, center - left))}px`);
      $$<HTMLElement>('#weekChart .report-column').forEach(b => b.classList.toggle('inspecting', b === button));
    };
    const dismiss = () => { $('#recordDetail').hidden = true; button.classList.remove('inspecting'); };
    button.addEventListener('pointerenter', inspect);
    button.addEventListener('pointerdown', inspect);
    button.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') dismiss(); });
    button.addEventListener('focus', inspect);
    button.addEventListener('blur', dismiss);
    button.onclick = () => {
      if (daily) return;
      reportDate = button.dataset.date!;
      reportView = 'day';
      $$<HTMLButtonElement>('[data-report-view]').forEach(b => { b.classList.toggle('on', b.dataset.reportView === 'day'); b.setAttribute('aria-pressed', String(b.dataset.reportView === 'day')); });
      if (S) void renderReport(S);
    };
  });
  $('#reportApps').innerHTML = report.apps.length ? report.apps.map(c => `<div class="report-app"><div class="rowh"><span>${esc(c.label)}</span><span>${Math.round(c.pct)}%</span></div><div class="app-usage-track"><i style="width:${Math.min(100, c.pct)}%"></i></div></div>`).join('') : '<div class="empty">선택한 기간에 청취 기록이 없어요</div>';
  $('#reportVolume').hidden = daily;
  if (!daily) $('#vol').innerHTML = volSvg(report.volumeTrend);
}

/* ---------------- 프로필 ---------------- */
const avatarKey = (id: string) => `safeear:avatar:${id}`;
let lastAvatarSignature = '';
function paintAvatar(id?: string, name?: string) {
  let photo: string | null = null;
  try { if (id) photo = localStorage.getItem(avatarKey(id)); } catch { /* Use initials when storage is unavailable. */ }
  const signature = `${id}:${name}:${photo}`;
  if (signature === lastAvatarSignature) return;
  lastAvatarSignature = signature;
  for (const element of [$('#avBtn'), $('#pAv')]) {
    element.replaceChildren();
    if (photo?.startsWith('data:image/')) { const img = new Image(); img.src = photo; img.alt = '프로필 사진'; element.append(img); }
    else element.textContent = initial(name ?? '');
  }
}
$('#pAv').onclick = $('#changePhoto').onclick = () => ($('#avatarFile') as HTMLInputElement).click();
($('#avatarFile') as HTMLInputElement).onchange = async event => {
  const input = event.target as HTMLInputElement, file = input.files?.[0], user = S?.session.user;
  if (!file || !user) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { notify({ type: 'warn', title: '10MB 이하의 JPG, PNG, WebP 사진을 선택해 주세요.' }); input.value = ''; return; }
  const url = URL.createObjectURL(file);
  try {
    const photo = new Image(); photo.src = url; await photo.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const size = Math.min(photo.naturalWidth, photo.naturalHeight);
    canvas.getContext('2d')!.drawImage(photo, (photo.naturalWidth - size) / 2, (photo.naturalHeight - size) / 2, size, size, 0, 0, 256, 256);
    localStorage.setItem(avatarKey(user.id), canvas.toDataURL('image/jpeg', .85));
    paintAvatar(user.id, user.name);
  } catch { notify({ type: 'warn', title: '사진을 저장할 수 없어요. 다른 사진으로 시도해 주세요.' }); }
  finally { URL.revokeObjectURL(url); input.value = ''; }
};
const initial = (n: string) => (n || '?').trim().charAt(0) || '?';
function paintTheme(st: Settings) {
  const r = document.documentElement;
  if (st.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', st.theme);
  if (st.accent === 'ocean') r.removeAttribute('data-accent'); else r.setAttribute('data-accent', st.accent);
}
function renderProfile(s: AppState, force = false) {
  const st = s.settings, u = s.session.user;
  paintAvatar(u?.id, u?.name);
  $('#pHead').textContent = u ? u.name : '로그인하지 않음';
  $('#pMail').textContent = u ? `${u.email ?? ''}${u.provider === 'google' ? ' · Google' : ''}` : '';
  $('#pLoginCard').hidden = !!u;
  $('#pNameField').hidden = !u;
  $('#accountActions').hidden = !u;
  $('#verTx').textContent = s.version;
  $$<HTMLElement>('[data-set]').forEach((b) => b.setAttribute('aria-checked', String(!!st[b.dataset.set as keyof Settings])));
  $$<HTMLElement>('[data-notify]').forEach((b) => b.setAttribute('aria-checked', String(!!st.notify[b.dataset.notify as keyof Settings['notify']])));

  $$<HTMLElement>('#themeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.themeSet === st.theme));
  $$<HTMLElement>('#accents button').forEach((b) => b.classList.toggle('on', b.dataset.accent === st.accent));
  if (force || changed('profileForm', [u?.id, st.age, st.mode])) {
    ($('#pName') as HTMLInputElement).value = u?.name ?? '';
    ($('#pAge') as HTMLInputElement).value = st.age == null ? '' : String(st.age);
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
function openProfile(scrollTo?: string) {
  if (!S) return;
  renderProfile(S, true);
  $('#profile').hidden = false;
  $('#profile').scrollTop = scrollTo ? $(scrollTo).offsetTop - 70 : 0;

}
$('#avBtn').onclick = () => openProfile();

$('#pToLogin').onclick = () => { $('#profile').hidden = true; showAuth('login', true); };
$('#toInfo').onclick = () => { $('#info').hidden = false; $('#info').scrollTop = 0; };
($('#pAge') as HTMLInputElement).onchange = (e) => {
  const v = Number((e.target as HTMLInputElement).value);
  ($('#pMode') as HTMLSelectElement).disabled = v < 18;
  if (v < 18) ($('#pMode') as HTMLSelectElement).value = '2';
};
$('#pSave').onclick = async () => {
  const name = ($('#pName') as HTMLInputElement).value.trim();
  const age = Number(($('#pAge') as HTMLInputElement).value);
  if (!Number.isInteger(age) || age < 14 || age > 120) { notify({ type: 'warn', title: '나이는 만 14~120세로 입력해 주세요' }); return; }
  const mode = Number(($('#pMode') as HTMLSelectElement).value) as HearingMode;
  if (S?.session.signedIn && !name) { notify({ type: 'warn', title: '이름을 입력해 주세요' }); return; }
  await call(api.updateProfile({ ...(S?.session.signedIn ? { name } : {}), age, mode }), '저장했어요');
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
  $('#authTitle').textContent = mode === 'login' ? '로그인' : '회원가입';
  $('#fLogin').hidden = mode !== 'login';
  $('#fSignup').hidden = mode !== 'signup';
  ['#lErr', '#sErr', '#lOk', '#sOk'].forEach((x) => ($(x).textContent = ''));
}
$('#toSignup').onclick = () => showAuth('signup');
$('#toLogin').onclick = () => showAuth('login');
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
  if (!m) { $('#lErr').textContent = '이메일 또는 아이디를 입력해 주세요.'; return; }
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
function validatePasswordMatch() {
  const password = ($('#sPw') as HTMLInputElement).value;
  const confirmation = ($('#sPw2') as HTMLInputElement).value;
  const mismatch = confirmation.length > 0 && password !== confirmation;
  $('#sPwMatch').textContent = confirmation ? mismatch ? '비밀번호가 일치하지 않아요.' : '비밀번호가 일치해요.' : '';
  $('#sPwMatch').classList.toggle('match', !!confirmation && !mismatch);
  ($('#sPw2') as HTMLInputElement).setAttribute('aria-invalid', String(mismatch));
}
$('#sPw').addEventListener('input', validatePasswordMatch);
$('#sPw2').addEventListener('input', validatePasswordMatch);
const reqBoxes = () => $$<HTMLInputElement>('#fSignup input[data-req]');
function syncAgree() {
  ($('#sBtn') as HTMLButtonElement).disabled = false;
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
  const username = ($('#sUsername') as HTMLInputElement).value.trim();
  const age = Number(($('#sAge') as HTMLInputElement).value);
  const err = !/^[A-Za-z0-9_]{4,20}$/.test(username) ? '아이디는 영문, 숫자, 밑줄 4~20자로 입력해 주세요.' : !Number.isInteger(age) || age < 14 || age > 120 ? '나이는 만 14~120세로 입력해 주세요.' : !n ? '이름을 입력해 주세요.' : !mailOk(m) ? '이메일 주소를 다시 확인해 주세요.' : p.length < 8 ? '비밀번호는 8자 이상으로 해 주세요.' : p !== p2 ? '비밀번호가 서로 달라요.' : '';
  $('#sErr').textContent = err;
  $('#sOk').textContent = '';
  if (err) return;
  if (!reqBoxes().every(c => c.checked)) { $('#sErr').textContent = '필수 항목에 동의해 주세요.'; return; }
  busy($('#sBtn'), true, '가입하는 중…');
  const r = await api.signUp({ name: n, username, email: m, password: p, age, marketing: ($('#agPush') as HTMLInputElement).checked });
  busy($('#sBtn'), false, '가입하고 로그인');
  if (!r.ok) { $('#sErr').textContent = r.error; return; }
  ($('#sPw') as HTMLInputElement).value = ($('#sPw2') as HTMLInputElement).value = '';
  if (r.data.needsConfirm) {
    $('#sErr').textContent = '현재 서버에 이메일 확인이 켜져 있어 바로 로그인할 수 없어요. 서버 연결 설정을 확인해 주세요.';
    return;
  }
});
$('#fRecovery').addEventListener('submit', async (e) => {
  e.preventDefault();
  const p = ($('#rPw') as HTMLInputElement).value, p2 = ($('#rPw2') as HTMLInputElement).value;
  if (p.length < 8) { $('#rErr').textContent = '비밀번호는 8자 이상으로 해 주세요.'; return; }
  if (p !== p2) { $('#rErr').textContent = '비밀번호가 서로 달라요.'; return; }
  const r = await api.updatePassword(p);
  $('#rErr').textContent = r.ok ? '' : r.error;
  if (r.ok) notify({ title: '비밀번호를 바꿨어요' });
});

const tutorialSteps = [
  { title: '오늘 얼마나 들었는지', body: '홈에서 오늘 청취 부담을 확인하세요. 아래에서는 최근 7일 청취 부담과 기준치 도달 예상 시점을 볼 수 있어요.', art: '<circle cx="80" cy="80" r="53" opacity=".15" stroke-width="12"/><circle class="pulse" cx="80" cy="80" r="53" stroke-width="12" stroke-dasharray="220 333" transform="rotate(-90 80 80)"/><text x="80" y="90" text-anchor="middle" fill="currentColor" stroke="none" font-size="30">오늘</text>' },
  { title: '잠깐 쉬어가는 습관', body: '회복 버튼을 눌러 쉬는 시간을 정하세요. 타이머를 켜고 이어폰을 잠시 내려놓으면 돼요.', art: '<circle cx="80" cy="80" r="53"/><path class="pulse" d="M80 44v38l25 15"/><path d="M57 16h46"/>' },
  { title: '한 주의 습관을 한눈에', body: '주간 리포트에서 일별 청취 시간과 앱별 사용을 확인하세요. 계정의 기록은 자동으로 동기화돼요.', art: '<path d="M23 131h116"/><path class="rise" d="M38 116V75m28 41V46m28 70V64m28 52V29" stroke-width="15"/>' },
  { permission: true, title: '필요할 때 알려드릴게요', body: '청취 부담과 쉬어갈 시간을 알림으로 받아보세요. 기기의 알림 권한을 허용해 주세요.', art: '<path d="M40 102h80l-10-15V65a30 30 0 0 0-60 0v22z"/><path d="M68 117a12 12 0 0 0 24 0"/><circle class="pulse" cx="113" cy="39" r="13" fill="currentColor" stroke="none"/>' },
  { title: '이제 시작해 볼까요?', body: '홈에서 오늘의 사용량부터 확인해 보세요. 이 안내를 다시 보고 싶지 않다면 아래 항목을 선택해 주세요.', art: '<circle cx="80" cy="80" r="53"/><path class="pulse" d="M53 80l18 18 37-39" stroke-width="9"/>' },
];
let tutorialStep = 0;
let onboardingUser: string | null = null;
const tutorialKey = (id: string) => `safeear:tutorial-hidden:${id}`;
function tutorialHidden(id: string) { try { return localStorage.getItem(tutorialKey(id)) === '1'; } catch { return false; } }
function paintTutorial() {
  const step = tutorialSteps[tutorialStep];
  $('#onboardCount').textContent = `${tutorialStep + 1} / ${tutorialSteps.length}`;
  $('#onboardTitle').textContent = step.title;
  $('#onboardBody').textContent = step.body;
  $('#onboardArt').innerHTML = `<svg viewBox="0 0 160 160" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${step.art}</svg>`;
  $('#onboardDots').innerHTML = tutorialSteps.map((_, i) => `<i class="${i === tutorialStep ? 'on' : ''}"></i>`).join('');
  $('#permissionPanel').hidden = !step.permission;
  $('#onboardPrev').hidden = tutorialStep === 0;
  $('#onboardSkip').hidden = tutorialStep !== tutorialSteps.length - 1;
  $('#onboardNext').textContent = tutorialStep === tutorialSteps.length - 1 ? '시작하기' : '다음';
  $('#onboardTitle').setAttribute('tabindex', '-1');
  $('#onboardTitle').focus();
}
$('#showTutorial').onclick = () => {
  $('#profile').hidden = true;
  tutorialStep = 0;
  ($('#hideTutorial') as HTMLInputElement).checked = !!onboardingUser && tutorialHidden(onboardingUser);
  $('#onboarding').hidden = false;
  paintTutorial();
};
$('#onboardPrev').onclick = () => { tutorialStep = Math.max(0, tutorialStep - 1); paintTutorial(); };
function advanceTutorial() {
  if (tutorialStep < tutorialSteps.length - 1) { tutorialStep++; paintTutorial(); return; }
  if (($('#hideTutorial') as HTMLInputElement).checked && onboardingUser) {
    try { localStorage.setItem(tutorialKey(onboardingUser), '1'); } catch { /* Tutorial will appear again if storage is unavailable. */ }
  }
  $('#onboarding').hidden = true;
}
$('#onboardNext').onclick = advanceTutorial;
$('#permissionBtn').onclick = async () => {
  const requestStep = tutorialStep, requestUser = onboardingUser;
  busy($('#permissionBtn'), true);
  try {
    const r = await api.requestNotifications();
    if (requestStep !== tutorialStep || requestUser !== onboardingUser || $('#onboarding').hidden) return;
    if (r.ok && (r.data === 'granted' || r.data === 'requested')) { advanceTutorial(); return; }
    $('#permissionStatus').textContent = !r.ok ? r.error : r.data === 'granted' ? '알림이 허용되었어요.' : r.data === 'requested' ? '기기에서 알림을 허용해 주세요. 알림이 안 오면 시스템 설정에서 SafeEar 알림을 켜 주세요.' : r.data === 'denied' ? '알림이 차단되어 있어요. 기기 설정에서 언제든 허용할 수 있어요.' : '현재 환경에서는 알림을 지원하지 않아요.';
  } finally { busy($('#permissionBtn'), false); }
};

let wasSignedIn: boolean | null = null;
function renderAuth(s: AppState) {
  const ss = s.session;
  $('#noServer').hidden = ss.configured;
  ($('#googleBtn') as HTMLButtonElement).disabled = !ss.configured;
  ($('#lBtn') as HTMLButtonElement).disabled = false;
  $('#recoveryScreen').hidden = !ss.recovery;
  const needAuth = !ss.signedIn;
  if (needAuth && $('#auth').hidden) showAuth('login');
  if (ss.signedIn && !$('#auth').hidden) $('#auth').hidden = true;
  if (!needAuth && !authForced && !$('#auth').hidden) $('#auth').hidden = true;
  if (wasSignedIn === false && ss.signedIn) notify({ title: `${ss.user?.name ?? ''}님, 환영해요` });
  if (ss.signedIn && ss.user && onboardingUser !== ss.user.id) {
    onboardingUser = ss.user.id;
    tutorialStep = 0;
    ($('#hideTutorial') as HTMLInputElement).checked = false;
    if (!tutorialHidden(ss.user.id)) { $('#onboarding').hidden = false; paintTutorial(); }
  }
  if (!ss.signedIn) { onboardingUser = null; $('#onboarding').hidden = true; $('#soundAlertPopup').hidden = true; }
  wasSignedIn = ss.signedIn;
}

let deviceNoticeUser: string | null = null;
let deviceMissingSince: number | null = null;
let deviceNoticeDismissed = false;
let deviceNoticeTimer: ReturnType<typeof setTimeout> | null = null;
function hideDeviceNotice() {
  if (deviceNoticeTimer) clearTimeout(deviceNoticeTimer);
  deviceNoticeTimer = null;
  $('#deviceConnectPopup').hidden = true;
}
$('#deviceConnectClose').onclick = () => { deviceNoticeDismissed = true; hideDeviceNotice(); };
function updateDeviceNotice(s: AppState) {
  const user = s.session.user?.id ?? null;
  if (user !== deviceNoticeUser) { hideDeviceNotice(); deviceNoticeUser = user; deviceMissingSince = null; deviceNoticeDismissed = false; }
  const missing = !s.live.output.id && !s.live.volume.deviceId;
  if (!user || !missing) {
    deviceMissingSince = null; deviceNoticeDismissed = false; hideDeviceNotice(); return;
  }
  if (s.live.capture.status === 'starting') { hideDeviceNotice(); return; }
  const obscured = !$('#auth').hidden || !$('#onboarding').hidden || !$('#profile').hidden || !$('#info').hidden || !$('#doc').hidden;
  if (obscured || deviceNoticeDismissed) { deviceMissingSince = null; hideDeviceNotice(); return; }
  deviceMissingSince ??= Date.now();
  if (Date.now() - deviceMissingSince < 1200) return;
  $('#deviceConnectPopup').hidden = false;
  deviceNoticeTimer ??= setTimeout(() => { deviceNoticeDismissed = true; hideDeviceNotice(); }, 5000);
}

/* ---------------- 그리기 ---------------- */
const PAUSE_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
const PLAY_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>';
function render(s: AppState) {
  S = s;
  paintTheme(s.settings);
  renderAuth(s);
  updateDeviceNotice(s);
  paintAvatar(s.session.user?.id, s.session.user?.name);
  if (changed('pause', s.settings.paused)) {
    const label = s.settings.paused ? '기록 재개' : '기록 정지';
    $('#pauseBtn').innerHTML = `${s.settings.paused ? PLAY_ICON : PAUSE_ICON}<span>${label}</span>`;
    $('#pauseBtn').title = label;
    $('#pauseBtn').setAttribute('aria-label', label);
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
