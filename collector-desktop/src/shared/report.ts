import { mergeRecords, weeklyAllowance, type HearingMode, type MergeInput } from '@safeear/core';
import type { ReportView } from './types';

export type ReportRecord = MergeInput & { app_name?: string | null; content_label?: string | null; volume_index?: number | null };
export const localDateKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function durationText(seconds: number): string {
  const value = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(value / 3600), minutes = Math.floor(value % 3600 / 60), remainder = value % 60;
  return [hours ? `${hours}시간` : '', minutes ? `${minutes}분` : '', remainder || (!hours && !minutes) ? `${remainder}초` : ''].filter(Boolean).join(' ');
}

export function buildReport(records: ReportRecord[], date: string, view: 'day' | 'week', mode: HearingMode = 2): ReportView {
  const endDay = new Date(`${date}T00:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(endDay.getTime()) || localDateKey(endDay) !== date) throw new Error('날짜를 다시 확인해 주세요.');
  const start = new Date(endDay);
  if (view === 'week') start.setDate(start.getDate() - 6);
  const end = new Date(endDay); end.setDate(end.getDate() + 1);
  const selected = records.filter(r => { const time = new Date(r.minute_start).getTime(); return time >= start.getTime() && time < end.getTime(); });
  const labels = view === 'day' ? Array.from({ length: 24 }, (_, i) => `${i}시`) : Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start); d.setDate(d.getDate() + i); return d.toLocaleDateString('ko-KR', { weekday: 'short' });
  });
  const totals = new Array<number>(labels.length).fill(0);
  const burdenTotals = new Array<number>(labels.length).fill(0);
  const dailyAllowance = weeklyAllowance(mode) / 7;
  for (const m of mergeRecords(selected).values()) {
    const d = new Date(m.minute * 60000);
    const i = view === 'day' ? d.getHours() : Math.round((new Date(d).setHours(0, 0, 0, 0) - start.getTime()) / 86400000);
    if (i >= 0 && i < totals.length) { totals[i] += m.listenSeconds; burdenTotals[i] += m.kurt / dailyAllowance * 100; }
  }
  const names: Record<string, string> = { music: '음악', video: '영상', game: '게임', call: '통화', browser: '브라우저', other: '기타' };
  const byApp = new Map<string, number>();
  const volumes = new Map<string, { total: number; count: number }>();
  for (const r of selected) {
    if (r.output_type === 'speaker') continue;
    const label = r.app_name || names[r.content_label ?? 'other'] || '기타';
    byApp.set(label, (byApp.get(label) ?? 0) + (r.dose_kurt ?? r.dose_eeh));
    if (r.volume_index != null) {
      const d = new Date(r.minute_start), key = `${d.getMonth() + 1}/${d.getDate()}`;
      const v = volumes.get(key) ?? { total: 0, count: 0 }; v.total += r.volume_index; v.count++; volumes.set(key, v);
    }
  }
  const dose = [...byApp.values()].reduce((a, b) => a + b, 0);
  return { burdenTotals, start: localDateKey(start), end: date, labels, totals, apps: [...byApp].map(([label, value]) => ({ label, pct: dose > 0 ? value / dose * 100 : 0 })).sort((a, b) => b.pct - a.pct), volumeTrend: [...volumes].map(([day, v]) => ({ day, avg: v.total / v.count })) };
}
