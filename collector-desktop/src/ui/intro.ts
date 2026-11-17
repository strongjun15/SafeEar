/* 사용법 소개 화면 (7장)
   기준: docs/ONBOARDING_BRIEF.md + 팀 기획안(각 장 A안)
   - 처음: 회원가입·로그인을 마치거나 「로그인 없이 사용」을 처음 고른 직후 한 번
   - 다시 보기: 프로필 · 설정 → 앱 정보 → 소개 보기 (마지막 버튼이 「닫기」) */

import { flyRing, reduceMotion, ringSvg, type RingMorphHooks } from './morph';

/** 휴대폰·태블릿 앱이 나오면 true로. 그 전에는 다른 기기를 "PC"로만 말한다 (기획안 3장 7 출시 조건). */
const MOBILE_READY = false;

export type IntroMode = 'first' | 'replay';
/** 마지막 장: A 로그인 + 동기화 켜짐, B 로그인 없이 사용, C 로그인했지만 동기화 꺼짐 */
export type IntroLast = 'A' | 'B' | 'C';

interface Page {
  color: 'mint' | 'sky' | 'aqua' | 'dusk';
  art: string;
  title: string;
  body: string;
}

/* ---------- 그림 ---------- */
const WAVE = [38, 62, 48, 80, 56, 92, 70, 44, 66, 86, 52, 74, 96, 60, 42, 78, 58, 88, 50, 68, 36, 82, 64, 46, 72, 54, 40, 30];
const art2 = `<div class="a2">
  <div class="bars">${WAVE.map((h, i) => `<i style="--h:${h}%;--d:${(i * 0.07).toFixed(2)}s"></i>`).join('')}</div>
  <div class="nums"><span style="--d:1.9s">62</span><span style="--d:2.02s">0.8</span><span style="--d:2.14s">14</span></div>
</div>`;

const art3 = `<div class="a3">${ringSvg()}<div class="c"><b>30</b><small>%</small></div></div><div class="a3s">여유로워요</div>`;

const BANDS = [34, 46, 58, 66, 72, 70, 64, 80, 94, 86, 52, 38];
const HIGH = new Set([7, 8, 9]);
const art4 = `<div class="a4">
  <div class="bars">${BANDS.map((h, i) => `<i class="${HIGH.has(i) ? 'hi' : ''}" style="--h:${h}%;--d:${(0.15 + i * 0.07).toFixed(2)}s"></i>`).join('')}</div>
  <div class="ax"><span>낮은 소리</span><span>높은 소리</span></div>
</div>`;

const CLOCK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/></svg>';
const art5 = `<div class="a5">
  <svg viewBox="0 0 280 160">
    <rect class="rest" x="150" y="10" width="122" height="140" rx="14"/>
    <path class="p1" pathLength="100" d="M8 138 C 60 130 112 86 150 40"/>
    <path class="p2" pathLength="100" d="M150 40 C 178 72 220 104 272 116"/>
  </svg>
  <div class="tm">${CLOCK}15분</div>
</div>`;

const PLAY = '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>';
const art6 = `<div class="a6">
  <p><span class="nb n1">10</span>년 뒤, 평소보다 <span class="nb n2">5</span>dB 크게 들었을 때</p>
  <div class="pl">${PLAY}</div>
</div>`;

const ICON = {
  phone: '<svg viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.5h2"/></svg>',
  tablet: '<svg viewBox="0 0 24 24"><rect x="4" y="2.5" width="16" height="19" rx="2.2"/><path d="M11 18.5h2"/></svg>',
  desktop: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  laptop: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="10" rx="1.6"/><path d="M2.5 19h19"/></svg>',
};
const art7 = () => {
  const icons = MOBILE_READY ? [ICON.phone, ICON.tablet, ICON.desktop] : [ICON.laptop, ICON.desktop, ICON.laptop];
  // 아이콘 중심 (상자 280×230 기준) → 링 중심 (140, 112)
  const at = [[40, 26], [140, 26], [240, 26]];
  return `<div class="a7">
    ${icons.map((ic, i) => `<div class="dv" style="left:${at[i][0] - 22}px;top:${at[i][1] - 22}px">${ic}</div>`).join('')}
    ${at.map(([x, y], i) => `<i class="dot" style="--x:${x - 4}px;--y:${y + 16}px;--d:${(0.3 + i * 0.14).toFixed(2)}s"></i>`).join('')}
    <div class="rg">${ringSvg()}</div>
    <div class="rp"><span></span><span></span><div class="mini">${[40, 64, 52, 88, 70, 30, 58].map((h) => `<b style="height:${h}%"></b>`).join('')}</div></div>
  </div>`;
};

/* ---------- 글 (기획안 A안) ---------- */
function pages(last: IntroLast): Page[] {
  const mac = document.documentElement.dataset.os === 'mac';
  const me = mac ? 'Mac' : 'PC';
  const pc = mac ? '다른 컴퓨터' : '다른 PC';
  const other = MOBILE_READY ? `${pc}와 휴대폰·태블릿` : pc;
  const p7: Record<IntroLast, [string, string]> = {
    A: ['기록이 한곳에 *모여요*', `${other} 기록도 이 계정에 모여요. 리포트에서 한 주를 돌아보세요.`],
    B: ['나중에 함께 모아도 *돼요*', `지금은 이 ${me}에서만 기록해요. 원할 때 설정에서 로그인하면 다른 기기도 합칠 수 있어요.`],
    C: ['동기화를 켜면 *모여요*', `설정에서 동기화를 켜면 ${other} 기록도 이 계정에 모여요. 리포트에서 한 주를 돌아보세요.`],
  };
  return [
    { color: 'mint', art: `<div class="a1">${ringSvg()}</div>`, title: '귀에도 소리가 *쌓여요*', body: 'SafeEar는 이어폰·헤드폰으로 들은 소리가 얼마나 쌓였는지 보여 줘요.' },
    { color: 'sky', art: art2, title: '녹음은 *하지 않아요*', body: `${me} 소리를 자동으로 살펴봐요. 창을 닫아도 ${mac ? '메뉴 막대' : '알림 영역'}에서 이어지고, 숫자만 남겨요.` },
    { color: 'mint', art: art3, title: '오늘은 링 하나만 *보세요*', body: '최근 일주일 권장량 중 쓴 양을 %로 보여 줘요. 색이 짙으면 볼륨을 낮추거나 잠시 쉬어 주세요.' },
    { color: 'mint', art: art4, title: '소리의 높이도 *보여요*', body: '음역 탭에서 많이 들은 소리의 높이를 볼 수 있어요. 특히 높은 소리는 따로 보여 줘요.' },
    { color: 'aqua', art: art5, title: '쉬는 시간도 *계산해요*', body: '쉬는 시간도 계산에 들어가요. 회복 탭에서 시간별 변화를 보고 타이머를 켜 보세요.' },
    { color: 'dusk', art: art6, title: '미래의 소리를 *들어봐요*', body: '숫자를 눌러 기간과 볼륨을 바꿔 보세요. 지금 습관이 이어졌을 때의 소리를 들어봐요.' },
    { color: 'mint', art: art7(), title: p7[last][0], body: p7[last][1] },
  ];
}

const em = (t: string) => t.replace(/\*([^*]+)\*/, '<em>$1</em>');

/* ---------- 3장: 링이 단계별로 바뀜 ---------- */
const STEPS: [number, string, string][] = [
  [30, 'mint', '여유로워요'],
  [60, 'sun', '조금 지쳤어요'],
  [85, 'tang', '많이 지쳤어요'],
  [100, 'coral', '쉬어야 해요'],
];

export interface Intro {
  open(mode: IntroMode, last: IntroLast): void;
  readonly isOpen: boolean;
}

export interface IntroHooks extends RingMorphHooks {
  onClose(mode: IntroMode): void;
}

export function createIntro(root: HTMLElement, hooks: IntroHooks): Intro {
  root.innerHTML = `
    <div class="itop"><button class="iskip" id="iSkip">건너뛰기</button></div>
    <div class="ivp" id="iVp"><div class="itrack" id="iTrack"></div></div>
    <div class="ibot">
      <div class="inav">
        <button class="iarr" id="iPrev" aria-label="이전 장"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>
        <div class="idots" id="iDots"></div>
        <button class="iarr" id="iNext" aria-label="다음 장"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button>
      </div>
      <button class="btn wide blue" id="iGo">다음</button>
    </div>
    <div class="sr" aria-live="polite" id="iLive"></div>`;
  const q = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const track = q('#iTrack'), dots = q('#iDots'), live = q('#iLive');
  const skip = q('#iSkip'), prev = q<HTMLButtonElement>('#iPrev'), next = q<HTMLButtonElement>('#iNext'), goBtn = q('#iGo');

  let idx = 0, mode: IntroMode = 'first', count = 7;
  let timers: number[] = [];
  let returnFocus: HTMLElement | null = null;

  const slides = () => Array.from(track.children) as HTMLElement[];

  function stopTimers() {
    timers.forEach((t) => clearTimeout(t));
    timers = [];
  }

  function play3(s: HTMLElement) {
    const arc = s.querySelector<SVGCircleElement>('.arc')!;
    const num = s.querySelector('.c b')!, lab = s.querySelector<HTMLElement>('.a3s')!, box = s.querySelector<HTMLElement>('.a3')!;
    const set = (k: number) => {
      const [v, c, w] = STEPS[k];
      arc.style.strokeDashoffset = String(100 - v);
      box.style.setProperty('--rc', `var(--${c})`);
      lab.style.setProperty('--rc', `var(--${c}-t)`);
      num.textContent = String(v);
      lab.textContent = w;
    };
    const loop = (k: number) => {
      set(k);
      timers.push(window.setTimeout(() => loop((k + 1) % STEPS.length), k === STEPS.length - 1 ? 2600 : 1400));
    };
    arc.style.strokeDashoffset = '100';
    timers.push(window.setTimeout(() => loop(0), 250));
  }

  function show(i: number, animate = true) {
    idx = Math.max(0, Math.min(count - 1, i));
    stopTimers();
    track.style.transitionDuration = animate ? '' : '0s';
    track.style.transform = `translateX(${-idx * 100}%)`;
    slides().forEach((s, k) => {
      const on = k === idx;
      s.classList.remove('on');
      s.inert = !on;
      s.setAttribute('aria-hidden', String(!on));
      if (on) {
        void s.offsetWidth; // 다시 들어올 때 애니메이션을 처음부터
        s.classList.add('on');
        if (k === 2) play3(s);
      }
    });
    Array.from(dots.children).forEach((d, k) => d.classList.toggle('on', k === idx));
    root.style.setProperty('--pc', `var(--${slides()[idx].dataset.c})`);
    const lastPage = idx === count - 1;
    prev.disabled = idx === 0;
    next.disabled = lastPage;
    skip.style.visibility = lastPage ? 'hidden' : '';
    goBtn.textContent = lastPage ? (mode === 'first' ? '시작하기' : '닫기') : '다음';
    live.textContent = `${count}장 중 ${idx + 1}장`;
  }

  let leaving = false;

  function hideNow() {
    root.hidden = true;
    root.style.pointerEvents = '';
    root.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    slides().forEach((s) => s.classList.remove('on'));
    leaving = false;
    hooks.onClose(mode);
    if (mode === 'replay') returnFocus?.focus();
  }

  /** 건너뛰기 · 움직임 줄이기: 소개가 옅어지고 오늘 화면이 떠오름 */
  function fadeOut() {
    if (reduceMotion()) { hooks.enterHome(); hideNow(); return; }
    root.style.pointerEvents = 'none';
    root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: 'ease-out', fill: 'forwards' });
    window.setTimeout(() => hooks.enterHome(), 120);
    window.setTimeout(hideNow, 340);
  }

  /** 시작하기: 7장의 작은 링이 오늘 화면의 큰 링 자리로 날아가 앉고, 진짜 링이 0%부터 차오름 */
  function launch() {
    const src = root.querySelector<SVGElement>('.slide.on .a7 .rg svg');
    const ok = !!src && flyRing({
      src,
      overlay: root,
      fadeEls: root.querySelectorAll('.itop, .ibot, .slide.on .ititle, .slide.on .ibody, .slide.on .a7 > :not(.rg)'),
      hooks,
      done: hideNow,
    });
    if (!ok) fadeOut();
  }

  function finish(viaStart: boolean) {
    if (leaving) return;
    leaving = true;
    stopTimers();
    if (mode === 'replay') { hideNow(); return; }
    if (viaStart) launch(); else fadeOut();
  }

  skip.onclick = () => finish(false);
  prev.onclick = () => show(idx - 1);
  next.onclick = () => show(idx + 1);
  goBtn.onclick = () => (idx === count - 1 ? finish(true) : show(idx + 1));

  document.addEventListener('keydown', (e) => {
    if (root.hidden || leaving) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); show(idx + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); show(idx - 1); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });

  // 마우스 · 손가락으로 밀어 넘기기
  const vp = q('#iVp');
  let sx = 0, sy = 0, down = false;
  vp.addEventListener('pointerdown', (e) => { down = true; sx = e.clientX; sy = e.clientY; });
  vp.addEventListener('pointerup', (e) => {
    if (!down) return;
    down = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2) show(idx + (dx < 0 ? 1 : -1));
  });
  vp.addEventListener('pointercancel', () => (down = false));

  return {
    get isOpen() { return !root.hidden; },
    open(m, last) {
      mode = m;
      returnFocus = document.activeElement as HTMLElement | null;
      const ps = pages(last);
      count = ps.length;
      track.innerHTML = ps
        .map((p, i) => `<section class="slide" data-c="${p.color}" style="--sc:var(--${p.color});--sc-t:var(--${p.color}-t)" aria-roledescription="slide" aria-label="${ps.length}장 중 ${i + 1}장">
          <div class="art" aria-hidden="true">${p.art}</div>
          <h2 class="ititle">${em(p.title)}</h2>
          <p class="ibody">${p.body}</p>
        </section>`)
        .join('');
      dots.innerHTML = ps.map((_, i) => `<button aria-label="${i + 1}장으로"></button>`).join('');
      Array.from(dots.children).forEach((d, i) => ((d as HTMLElement).onclick = () => show(i)));
      root.hidden = false;
      show(0, false);
      goBtn.focus();
    },
  };
}
