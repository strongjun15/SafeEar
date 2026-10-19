/**
 * 알림 — H.870 80%/100% 경고(3.5절), 쉬어가기 제안, 주간 리포트.
 * 문구는 원칙 2를 따른다: "안전/위험"을 단정하지 않고 관찰한 사실만 말한다.
 */
import { Notification } from 'electron';
import type { GaugeView, LiveState } from '../shared/types';
import type { SettingsStore } from './settings';
import type { VolumeHelper } from './volume';

export class Notifier {
  private warned: Record<number, boolean> = { 80: false, 100: false };
  private listenStreakMin = 0;
  private quietMin = 0;
  private lastMinute = 0;
  private lastRestAt = 0;
  private lastWeekly = '';
  private ackTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly settings: SettingsStore,
    private readonly volume: VolumeHelper,
    private readonly openUi: (tab?: string) => void,
  ) {}

  private show(title: string, body: string, tab?: string, onClick?: () => void): Notification | null {
    if (!Notification.isSupported()) return null;
    const n = new Notification({ title, body, silent: false });
    n.on('click', () => {
      onClick?.();
      this.openUi(tab);
    });
    n.show();
    return n;
  }

  /** 1초마다 호출 */
  check(g: GaugeView, live: LiveState): void {
    const s = this.settings.value;
    const pct = Math.max(g.safeEarPct, g.standardPct);
    for (const level of [80, 100]) {
      if (!this.warned[level] && pct >= level) {
        this.warned[level] = true;
        if (s.notify.warn) this.warn(level, g);
      } else if (this.warned[level] && pct < level - 5) {
        this.warned[level] = false;
      }
    }

    const minute = Math.floor(Date.now() / 60000);
    if (minute !== this.lastMinute) {
      this.lastMinute = minute;
      if (live.counting) {
        this.listenStreakMin++;
        this.quietMin = 0;
      } else if (++this.quietMin >= 3) {
        this.listenStreakMin = 0;
      }
      const after = g.rest.find((r) => r.min === 30);
      if (
        s.notify.rest &&
        this.listenStreakMin >= 45 &&
        Date.now() - this.lastRestAt > 90 * 60_000 &&
        after &&
        g.safeEarPct - after.pct >= 2
      ) {
        this.lastRestAt = Date.now();
        this.show(
          `지금 30분 쉬면 ${Math.round(g.safeEarPct)}%에서 ${Math.round(after.pct)}%로 내려가요`,
          `${this.listenStreakMin}분째 이어서 듣고 있어요. 빠른 피로가 절반 넘게 빠지는 구간이에요.`,
          'recover',
        );
      }
      this.weekly(g);
    }
  }

  private warn(level: number, g: GaugeView): void {
    const which = g.safeEarPct >= g.standardPct ? 'SafeEar 계산' : '기존 방식(등에너지) 계산';
    const n = this.show(
      `최근 7일 허용 선량의 ${level}%를 썼어요`,
      `${which} 기준이에요. 볼륨을 조금 낮추거나 쉬어 가면 내려가요.`,
      'home',
      () => this.acknowledge(),
    );
    // H.870: 100% 경고를 확인하지 않으면 볼륨을 자동으로 낮춘다 (설정에서 켠 경우만)
    if (level === 100 && n && this.settings.value.autoReduceVolume) {
      this.acknowledge();
      this.ackTimer = setTimeout(() => {
        this.ackTimer = null;
        const cur = this.volume.state.scalar;
        if (cur == null || cur < 0.05) return;
        this.volume.setVolume(cur * 0.7);
        this.show('볼륨을 30% 낮췄어요', '100% 경고를 10분 동안 확인하지 않아서 설정대로 낮췄어요.', 'home');
      }, 10 * 60_000);
    }
  }

  private acknowledge(): void {
    if (this.ackTimer) clearTimeout(this.ackTimer);
    this.ackTimer = null;
  }

  private weekly(g: GaugeView): void {
    const now = new Date();
    if (!this.settings.value.notify.weekly || now.getDay() !== 1 || now.getHours() < 9) return;
    const key = now.toDateString();
    if (this.lastWeekly === key) return;
    this.lastWeekly = key;
    const top = g.apps[0];
    this.show(
      '주간 리포트가 준비됐어요',
      `최근 7일 ${Math.round(g.safeEarPct)}% (기존 방식 ${Math.round(g.standardPct)}%)` + (top ? ` · 가장 많이 쓴 곳: ${top.label}` : ''),
      'report',
    );
  }
}
