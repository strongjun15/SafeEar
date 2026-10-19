/** SafeEar 화면 — main 프로세스가 1초마다 보내는 AppState를 그린다 */
import { BAND_LABELS, type AgeBand, type HearingMode, type OutputType } from '@safeear/core';
import type { AppState, Result, SafeEarApi, Scenario, Settings, WaveChunk } from '../shared/types';
import { AudioLab } from './audio-lab';
import { barMap, bandColor, curveSvg, eqSvg, heatHtml, ring, setArc, volSvg } from './charts';
import { DOCS } from './docs';
import { $, $$, esc, fmtAgo, fmtDuration, notify } from './dom';

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
let cur = 2, slot = 0;
const btns = () => [...track.querySelectorAll('button')];
function place(i: number) {
  slot = track.getBoundingClientRect().width / TABS.length;
  lens.style.transform = `translateX(${i * slot}px)`;
}
function go(id: string) {
  const i = TABS.findIndex((t) => t[0] === id);
  if (i < 0) return;
  cur = i;
  TABS.forEach(([t]) => ($('#' + t).hidden = t !== id));
  btns().forEach((b, k) => {
    b.classList.toggle('on', k === i);
    b.classList.remove('peek');
  });
  place(i);
  $('#scroll').scrollTop = 0;
  if (id !== 'future') lab.stop();
  lastSig = {};
  if (S) render(S);
}
let dragging = false, lastPx = 0;
function dragTo(e: PointerEvent) {
  const r = track.getBoundingClientRect();
  slot = r.width / TABS.length;
  lastPx = Math.max(0, Math.min(r.width - slot, e.clientX - r.left - slot / 2));
  lens.style.transform = `translateX(${lastPx}px) scale(1.1)`;
  const k = Math.round(lastPx / slot);
  btns().forEach((b, j) => b.classList.toggle('peek', j === k));
}
track.addEventListener('pointerdown', (e) => {
  dragging = true;
  track.classList.add('drag');
  try { track.setPointerCapture(e.pointerId); } catch { /* */ }
  dragTo(e);
});
track.addEventListener('pointermove', (e) => { if (dragging) dragTo(e); });
function endDrag() {
  if (!dragging) return;
  dragging = false;
  track.classList.remove('drag');
  go(TABS[Math.round(lastPx / slot)][0]);
}
track.addEventListener('pointerup', endDrag);
track.addEventListener('pointercancel', endDrag);
new ResizeObserver(() => { if (!dragging) place(cur); }).observe(track);

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
ring($('#homeRing'), `<div class="big"><span id="homePct">0</span><small>%</small></div>`, '허용 선량 중 (SafeEar)');
ring($('#timerRing'), `<div class="big" id="clock" style="font-size:50px">30:00</div>`, `<span id="timerLbl"></span>`);

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
function projectionText(s: AppState): [string, string] {
  const p = s.gauge.projection;
  const nowMin = Math.floor(Date.now() / 60000);
  if (s.gauge.safeEarPct >= 100 || (p.minute !== null && p.minute <= nowMin)) return ['이미 넘었어요', '쉬면 내려가요'];
  if (p.basisDays === 0) return ['데이터 모으는 중', '하루 이상 기록이 필요해요'];
  if (p.minute === null) return ['3일 안엔 없음', '지금 습관이 이어지면'];
  const d = new Date(p.minute * 60000);
  const today = new Date();
  const day = d.toDateString() === today.toDateString() ? '오늘' : DOW[d.getDay()];
  return [`${day} ${d.getHours()}시쯤`, '100%를 넘을 것으로 예상'];
}

const OUT_LABEL: Record<OutputType, string> = { headphones: '이어폰', speaker: '스피커 · 제외', unknown: '미확인' };

function renderHome(s: AppState) {
  const g = s.gauge, L = s.live;
  $('#homePct').textContent = String(Math.round(g.safeEarPct));
  setArc($('#homeRing'), g.safeEarPct / 100);
  $('#leftPct').textContent = `${Math.max(0, Math.round(100 - g.safeEarPct))}%`;
  const [pt, pl] = projectionText(s);
  $('#projTx').textContent = pt;
  $('#projLbl').textContent = pl;
  $('#homeSub').textContent = `H.870 Mode ${g.mode} · 주간 ${g.allowancePa2h} Pa²h 기준`;

  // 상태 배지
  const badge = $('#badge');
  const st = L.paused ? 'paused' : L.capture.status;
  const TX: Record<string, string> = {
    running: L.demoPaused ? '「10년 뒤」 재생 중 · 분석 잠시 멈춤' : L.counting ? '측정 중 · 이어폰 소리 분석' : '측정 중 · 소리 기다리는 중',
    starting: '측정 준비 중',
    paused: '측정 일시정지',
    stopped: '측정 멈춤',
    error: '소리 캡처 다시 연결 중',
    unsupported: '윈도우에서만 측정돼요',
  };
  $('#badgeTx').textContent = TX[st] ?? st;
  badge.className = 'badge ' + (st === 'running' ? 'b-live' : st === 'error' || st === 'unsupported' ? 'b-err' : 'b-off');
  badge.title = L.capture.message ?? '';

  $('#liveSpl').textContent = L.splA != null ? `${Math.round(L.splA)} dBA` : '조용함';
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
      h = `<div class="hintbox"><p>소리를 받지 못하고 있어요: ${esc(L.capture.message)}</p></div>`;
    } else if (L.output.id && L.output.type === 'speaker' && L.output.source === 'auto') {
      h = `<div class="hintbox"><p>윈도우가 이 장치를 <b>스피커</b>로 알려 줘서 귀 피로도에 넣지 않고 있어요. 이어폰·헤드폰을 꽂았다면 바꿔 주세요.</p><button class="btn sm" id="markHp">이어폰이에요</button></div>`;
    } else if (!v.available && L.capture.status === 'running') {
      h = `<div class="hintbox soft"><p>윈도우 볼륨을 읽지 못해 볼륨 100%로 가정하고 있어요. 실제보다 크게 계산될 수 있어요.${v.error ? ` (${esc(v.error)})` : ''}</p></div>`;
    } else if (L.output.type === 'unknown' && L.output.id) {
      h = `<div class="hintbox soft"><p>출력 장치 종류를 알 수 없어 이어폰으로 보고 계산하고 있어요.</p><button class="btn sm ghost" id="markSp">스피커예요</button></div>`;
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
  $('#tierTx').textContent =
    L.capture.method === 'demo' ? '데모 소리 (실제 측정 아님)' : L.capture.method === 'desktopUserMedia' ? '등급 B · 시스템 캡처 (호환 모드)' : '등급 B · 시스템 캡처';

  // 이중 게이지 (0~120% 축)
  const ax = (p: number) => `${(Math.min(120, Math.max(0, p)) / 120) * 100}%`;
  $('#dualBar').style.width = ax(g.safeEarPct);
  $('#dualMk').style.left = ax(g.standardPct);
  const ticks = $$('#dual .tick');
  ticks[0].style.left = ax(80);
  ticks[1].style.left = ax(100);
  $('#dualSe').textContent = `${Math.round(g.safeEarPct)}%`;
  $('#dualStd').textContent = `${Math.round(g.standardPct)}%`;

  $('#stToday').innerHTML = fmtDuration(g.todayListenSec);
  $('#stTodayPct').innerHTML = `${Math.round(g.todayPct)}<small>%</small>`;
  $('#stBeta').innerHTML = L.beta != null ? `${L.beta.toFixed(1)}<small>×${L.kurtWeight.toFixed(2)}</small>` : '–';
  $('#stMode').innerHTML = `Mode ${g.mode}<small>${g.mode === 2 ? '75 dBA' : '80 dBA'}</small>`;

  if (changed('dev', [g.devices, s.session.signedIn, s.sync])) {
    const box = $('#devShare');
    if (!g.devices.length) box.innerHTML = `<div class="empty">아직 이어폰으로 들은 기록이 없어요</div>`;
    else box.innerHTML = g.devices.map((d) => `<div class="r"><div><div>${esc(d.name)}</div><div class="t"><i style="width:${d.pct.toFixed(1)}%;${d.isThis ? '' : 'background:var(--teal)'}"></i></div></div><div class="p">${Math.round(d.pct)}%</div></div>`).join('');
    let line = '';
    if (!s.session.signedIn) line = '로그인하면 휴대폰 · 태블릿 기록과 합쳐서 계산해요.';
    else if (!s.sync.enabled) line = '동기화가 꺼져 있어요. 이 PC 기록만 보여요.';
    else if (s.sync.error) line = `동기화 문제: ${s.sync.error}`;
    else line = `동기화 · 올림 ${fmtAgo(s.sync.lastUploadAt)} · 받음 ${fmtAgo(s.sync.lastDownloadAt)}${s.sync.pending ? ` · 대기 ${s.sync.pending}개` : ''}${g.overlapMinutes ? ` · 겹친 ${g.overlapMinutes}분은 큰 값 사용` : ''}`;
    $('#syncLine').textContent = line;
  }

  if (changed('curve', g.curve)) $('#curve').innerHTML = curveSvg(g.curve);
  if (changed('mini', g.bands)) {
    $('#miniMap').innerHTML = barMap(g.bands, 320, 64, false);
    const max = Math.max(...g.bands);
    $('#miniMapHint').textContent = max > 0 ? `${BAND_LABELS[g.bands.indexOf(max)]}Hz 부근이 최근 7일 가장 높아요` : '이어폰으로 들으면 음역별 부담이 쌓여요';
  }
}

/* ---------------- 귀 지도 ---------------- */
function renderMap(s: AppState) {
  const g = s.gauge;
  if (!changed('map', [g.bands, g.bandCoverage])) return;
  $('#bigMap').innerHTML = barMap(g.bands, 340, 190, true);
  const max = Math.max(...g.bands);
  const avg = (a: number, b: number) => g.bands.slice(a, b + 1).reduce((x, y) => x + y, 0) / (b - a + 1) / (max || 1);
  $('#meter').innerHTML = ([['저음', '125~500 Hz', avg(0, 6)], ['중음', '630~2.5k', avg(7, 13)], ['고음', '3~8 kHz', avg(14, 18)]] as const)
    .map(([n, r, v]) => `<div class="r"><div><b>${n}</b><br><em>${r}</em></div><div class="track"><div class="fill" style="width:${(v * 100).toFixed(1)}%;background:${bandColor(v)}"></div></div><div class="p">${Math.round(v * 100)}</div></div>`)
    .join('');
  $('#coverTx').textContent = max > 0
    ? `전체 청취 시간의 ${Math.round(g.bandCoverage * 100)}%(파형을 받은 시간) 기준으로 그렸어요. 막대는 가장 높은 대역을 100으로 맞춘 상대값이에요.`
    : '아직 기록이 없어요.';
}

/* ---------------- 회복 ---------------- */
const T = { total: 1800, left: 1800, run: false, h: 0 as unknown as ReturnType<typeof setInterval>, minutes: 30, from: 0, warned: false };
const fmt = (sec: number) => String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
function restPct(min: number) {
  return S?.gauge.rest.find((r) => r.min === min)?.pct ?? 0;
}
function paintTimer() {
  $('#clock').textContent = fmt(T.left);
  setArc($('#timerRing'), (T.total - T.left) / T.total);
  const now = S?.gauge.safeEarPct ?? 0;
  $('#timerLbl').textContent = T.run || (T.left < T.total && T.left > 0)
    ? `지금 ${Math.round(now)}%`
    : T.left === 0 ? `지금 ${Math.round(now)}%` : `${T.minutes}분 쉬면 ${Math.round(now)}% → ${Math.round(restPct(T.minutes))}%`;
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
    notify({ type: 'rest', title: `${T.minutes}분 쉬면 ${Math.round(T.from)}%에서 ${Math.round(restPct(T.minutes))}%로 내려가요`, desc: '이어폰은 빼 두세요. 그동안 소리가 나면 알려 드릴게요.' });
  }
  T.run = true;
  btn.textContent = '일시정지';
  renderMins();
  T.h = setInterval(() => {
    T.left--;
    paintTimer();
    if (S?.live.counting && !T.warned) {
      T.warned = true;
      notify({ type: 'warn', title: '쉬는 중인데 이어폰 소리가 들려요', desc: '소리가 나는 동안은 회복 대신 다시 쌓여요.' });
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
const SEG: { id: Scenario['id']; t: string; d: string; good?: boolean }[] = [
  { id: 'now', t: '지금', d: '필터 없음' },
  { id: 'keep', t: '10년 뒤', d: '지금 습관 그대로' },
  { id: 'down', t: '10년 뒤', d: '볼륨 조금 낮추면 (−3 dB)', good: true },
];
let segCur: Scenario['id'] = 'keep';
SEG.forEach((a) => {
  const b = document.createElement('button');
  b.className = a.good ? 'good' : '';
  b.dataset.id = a.id;
  b.innerHTML = `<span class="t">${a.t}</span><span class="d">${a.d}</span>`;
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
    notify({ title: `「${f.name}」로 들어요`, desc: '파일은 이 PC 안에서만 재생돼요.' });
  } catch {
    notify({ type: 'warn', title: '이 파일은 재생할 수 없어요' });
  }
};
function renderFuture(s: AppState) {
  const iso = s.gauge.iso;
  if (!changed('future', [iso, segCur])) return;
  [...$('#seg').children].forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.id === segCur));
  const sc = iso.scenarios.find((x) => x.id === segCur) ?? null;
  lab.setScenario(sc);
  $('#eq').innerHTML = iso.scenarios.length ? eqSvg(iso.scenarios, segCur) : `<div class="empty">이어폰으로 들은 기록이 생기면 계산해요</div>`;
  const at4k = (id: Scenario['id']) => iso.scenarios.find((x) => x.id === id)?.points.find((p) => p.freq === 4000)?.db ?? 0;
  const NOTE: Record<Scenario['id'], string> = {
    now: '기준이 되는 원음이에요.',
    keep: iso.lex8h == null ? '' : at4k('keep') < 0.5
      ? '지금 수준이면 ISO 1999 식으로는 10년 뒤 소음으로 인한 변화가 거의 없어요. (노화로 인한 변화는 따로예요)'
      : `4 kHz가 약 ${at4k('keep').toFixed(1)} dB 깎여요. 심벌즈와 자음이 먼저 흐려집니다.`,
    down: iso.lex8h == null ? '' : `같은 10년인데 4 kHz 변화가 ${at4k('down').toFixed(1)} dB예요. 바꿀 수 있는 부분이에요.`,
  };
  $('#eqnote').textContent = NOTE[segCur];
  if (iso.lex8h == null) {
    $('#isoHint').textContent = '이어폰으로 들은 기록이 쌓이면 계산해요';
    $('#isoTbl').innerHTML = '';
  } else {
    $('#isoHint').innerHTML = `최근 기록으로 어림한 주간 노출 L<sub>EX,8h</sub> = ${iso.lex8h.toFixed(1)} dB. 성인 집단 통계식을 쓴 시나리오이고 실제 청력을 잰 값이 아니에요.`;
    const keep = iso.scenarios.find((x) => x.id === 'keep')!.points;
    const down = iso.scenarios.find((x) => x.id === 'down')!.points;
    $('#isoTbl').innerHTML = `<tr><th>주파수</th>${keep.map((p) => `<th>${p.freq >= 1000 ? p.freq / 1000 + 'k' : p.freq}</th>`).join('')}</tr>
      <tr><td>그대로</td>${keep.map((p) => `<td>${p.db.toFixed(1)}</td>`).join('')}</tr>
      <tr><td>−3 dB</td>${down.map((p) => `<td>${p.db.toFixed(1)}</td>`).join('')}</tr>`;
  }
}

/* ---------------- 리포트 ---------------- */
function renderReport(s: AppState) {
  const g = s.gauge;
  if (changed('heat', [g.heat, g.heatDays])) {
    $('#heat').innerHTML = heatHtml(g.heat, g.heatDays.length ? g.heatDays : ['', '', '', '', '', '', '']);
  }
  if (changed('apps', g.apps)) {
    const COL = ['var(--hot)', 'var(--amber)', 'var(--teal)', 'var(--blue)'];
    $('#stack').innerHTML = g.apps.length ? g.apps.map((c, i) => `<div style="width:${c.pct}%;background:${COL[i % 4]}"></div>`).join('') : '';
    $('#stackLg').innerHTML = g.apps.map((c, i) => `<span><i style="background:${COL[i % 4]}"></i>${esc(c.label)} ${Math.round(c.pct)}%</span>`).join('');
    $('#stackHint').textContent = g.apps.length ? `최근 7일 부담의 ${Math.round(g.apps[0].pct)}%가 ${g.apps[0].label}에서 왔어요` : '아직 기록이 없어요';
  }
  if (changed('vol', g.volumeTrend)) $('#vol').innerHTML = volSvg(g.volumeTrend);
}

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
  $('#pMail').textContent = u ? `${u.email ?? ''}${u.provider === 'google' ? ' · Google' : ''}` : '이 PC 안에서만 기록해요';
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
  if (!outs.length) { box.innerHTML = `<div class="empty">아직 확인한 출력 장치가 없어요</div>`; return; }
  const ff = (n: number | null) => (n === 3 ? '헤드폰' : n === 5 ? '헤드셋' : n === 1 ? '스피커' : n === 9 ? '디스플레이(HDMI)' : n === 2 ? '라인 출력' : '알 수 없음');
  box.innerHTML = outs.map(([id, o]) => `<div class="outcard" data-out="${esc(id)}">
    <div class="n">${esc(o.name)}${id === s.live.output.id ? ' · 지금 사용 중' : ''}</div>
    <div class="m">윈도우가 알려 준 종류: ${ff(o.formFactor)}</div>
    <div class="inline">
      <select data-k="type"><option value="">자동</option><option value="headphones"${o.type === 'headphones' ? ' selected' : ''}>이어폰·헤드폰</option><option value="speaker"${o.type === 'speaker' ? ' selected' : ''}>스피커 (집계 제외)</option></select>
      <input data-k="ref" type="number" min="70" max="140" step="1" placeholder="${s.settings.defaultRefSplDb}" value="${o.refSplDb ?? ''}" title="볼륨 100%에서 0 dBFS가 내는 dBA (교정값)">
      <span style="font-size:12px;color:var(--dim)">dBA 기준</span>
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
    list.innerHTML = `<div class="empty">로그인하면 같은 계정의 기기 목록이 보여요</div>`;
    $('#devNote').textContent = '';
    return;
  }
  list.innerHTML = `<div class="empty">불러오는 중…</div>`;
  const r = await api.listDevices();
  if (!r.ok) { list.innerHTML = `<div class="empty">${esc(r.error)}</div>`; return; }
  const ICON_DEV = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>';
  const PHONE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>';
  list.innerHTML = r.data.length
    ? r.data.map((d) => `<div class="row"><div class="lft"><div class="devic">${d.platform === 'windows' || d.platform === 'mac' ? ICON_DEV : PHONE}</div><div><div class="n">${esc(d.name)}</div><div class="m">${esc(d.platform ?? '')} · 마지막 ${d.last_seen_at ? new Date(d.last_seen_at).toLocaleString('ko-KR') : '–'}</div></div></div></div>`).join('')
    : `<div class="empty">등록된 기기가 없어요</div>`;
  $('#devNote').textContent = '휴대폰 · 태블릿 앱이 나오면 같은 계정으로 로그인해 여기에 추가돼요.';
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
  if (r.ok) { $('#profile').hidden = true; notify({ title: '탈퇴했어요', desc: '서버의 계정과 기록을 지웠어요.' }); }
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
  if (wasSignedIn === false && ss.signedIn) notify({ title: `${ss.user?.name ?? ''}님, 환영해요`, desc: '이제 다른 기기 기록과 합쳐서 계산해요.' });
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
  go('home');
  render(s);
});
