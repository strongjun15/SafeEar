/* 링 이어 붙이기 전환 — 작은 링이 오늘 화면의 큰 링 자리로 날아가 앉고, 진짜 링이 0%부터 차오른다.
   사용: 소개 화면의 「시작하기」(intro.ts), 앱을 켤 때의 시작 화면(splash.ts) */

export interface RingMorphHooks {
  /** 링이 날아가 앉을 자리 (오늘 탭의 큰 링). 오늘 탭이 아니면 null */
  ringTarget(): HTMLElement | null;
  /** true: 오늘 링을 숨기고 0%로 / false: 보이며 0 → 실제 값으로 차오름 + 숫자 세기 */
  holdRing(on: boolean): void;
  /** 오늘 화면의 제목 · 카드 · 탭 막대가 차례로 떠오름 */
  enterHome(): void;
}

const EASE_FILL = 'cubic-bezier(.22,1,.36,1)';
export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 링 SVG (뷰박스 160, 반지름 64, 굵기 15). 색은 --sc, 채움은 --off(0 = 꽉 참, 100 = 빔) */
export const ringSvg = (cls = '') =>
  `<svg class="iring ${cls}" viewBox="0 0 160 160"><circle class="trk" cx="80" cy="80" r="64"/><circle class="arc" cx="80" cy="80" r="64" pathLength="100"/></svg>`;

/** 덮개(overlay)를 걷어 내며 src 링을 오늘 링으로 날린다. 날릴 수 없으면 false (호출한 쪽이 다른 방법으로 닫기) */
export function flyRing(o: { src: SVGElement; overlay: HTMLElement; fadeEls: Iterable<Element>; hooks: RingMorphHooks; done(): void }): boolean {
  const tgt = o.hooks.ringTarget();
  if (reduceMotion() || !tgt || !tgt.offsetWidth) return false;
  const a = o.src.getBoundingClientRect(), b = tgt.getBoundingClientRect();
  if (!a.width) return false;
  const off = parseFloat(getComputedStyle(o.src.querySelector('.arc')!).strokeDashoffset) || 0;

  o.overlay.style.pointerEvents = 'none';
  o.hooks.holdRing(true);

  const fly = document.createElement('div');
  fly.className = 'ifly';
  fly.style.cssText = `left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px;--off:${off}`;
  fly.innerHTML = o.src.outerHTML;
  document.body.appendChild(fly);
  o.src.style.visibility = 'hidden';

  // 링 말고는 먼저 사라지고, 검은 바탕이 걷히며 오늘 화면이 드러남
  for (const e of o.fadeEls) e.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(6px)' }], { duration: 200, easing: 'ease-out', fill: 'forwards' });
  o.overlay.animate([{ backgroundColor: getComputedStyle(o.overlay).backgroundColor }, { backgroundColor: 'transparent' }], { duration: 520, delay: 140, easing: 'ease-out', fill: 'forwards' });
  window.setTimeout(() => o.hooks.enterHome(), 160);

  // 링 바깥 지름(뷰박스 160 중 143)이 오늘 링 지름과 같아지게
  const scale = b.width / (a.width * (143 / 160));
  const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const timing = { duration: 700, delay: 120, easing: EASE_FILL, fill: 'forwards' as const };
  const mv = fly.animate([{ transform: 'none' }, { transform: `translate(${dx}px,${dy}px) scale(${scale})` }], timing);
  fly.querySelector('.arc')?.animate([{ strokeDashoffset: off }, { strokeDashoffset: 0 }], timing);

  void mv.finished.then(() => {
    o.hooks.holdRing(false);
    const rp = document.createElement('div');
    rp.className = 'iripple';
    rp.style.cssText = `left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px`;
    document.body.appendChild(rp);
    void rp.animate([{ transform: 'scale(1)', opacity: 0.6 }, { transform: 'scale(1.3)', opacity: 0 }], { duration: 850, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }).finished.then(() => rp.remove());
    void fly.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: 'ease-out', fill: 'forwards' }).finished.then(() => fly.remove());
    o.src.style.visibility = '';
    o.overlay.style.pointerEvents = '';
    o.done();
  });
  return true;
}
