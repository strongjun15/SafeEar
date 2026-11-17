/* 앱을 켤 때의 시작 화면 — 검은 화면에서 링이 한 바퀴 그려진 뒤, 오늘 화면의 큰 링 자리로 날아가 앉는다.
   - 앱을 처음 띄울 때 (트레이로 숨어서 켜졌다면 창이 처음 보일 때)
   - 창을 닫았다가(트레이) 1분 넘게 지나 다시 열 때
   - 로그인 화면이 떠야 하면 건너뜀 */
import { flyRing, reduceMotion, ringSvg, type RingMorphHooks } from './morph';

const EAR = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M8 17a4 4 0 0 0 8 0c0-2 3-3 3-7a7 7 0 0 0-14 0"/><path d="M12 8a2.5 2.5 0 0 1 2.5 2.5c0 1.5-2.5 2-2.5 4"/></svg>';
const DRAW_MS = 700;

export interface Splash {
  /** 검은 덮개를 다시 씌워 둠 (다음에 보일 때 play) */
  arm(): void;
  /** 덮개가 씌워져 있으면 링을 그리고 오늘 화면으로 넘어감 */
  play(): void;
  /** 애니메이션 없이 바로 걷기 (로그인 화면이 떠야 할 때) */
  dismiss(): void;
  readonly armed: boolean;
}

export function createSplash(root: HTMLElement, hooks: RingMorphHooks): Splash {
  root.innerHTML = `<div class="sp-in"><div class="sp-ring">${ringSvg()}<div class="sp-logo">${EAR}</div></div><div class="sp-name">SafeEar</div></div>`;
  let playing = false;
  let timer = 0;

  function reset() {
    clearTimeout(timer);
    root.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    root.classList.remove('go');
    root.style.pointerEvents = '';
    playing = false;
  }
  function dismiss() {
    reset();
    root.hidden = true;
  }

  return {
    get armed() { return !root.hidden && !playing; },
    arm() {
      if (playing) return;
      reset();
      root.hidden = false;
    },
    dismiss,
    play() {
      if (root.hidden || playing) return;
      playing = true;
      if (reduceMotion()) {
        hooks.enterHome();
        void root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).finished.then(dismiss);
        return;
      }
      root.classList.add('go');
      timer = window.setTimeout(() => {
        const ok = flyRing({
          src: root.querySelector<SVGElement>('.sp-ring svg')!,
          overlay: root,
          fadeEls: root.querySelectorAll('.sp-logo, .sp-name'),
          hooks,
          done: dismiss,
        });
        if (!ok) {
          // 오늘 탭이 아닐 때: 덮개만 옅어지며 걷힘
          hooks.enterHome();
          void root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: 'ease-out', fill: 'forwards' }).finished.then(dismiss);
        }
      }, DRAW_MS + 120);
    },
  };
}
