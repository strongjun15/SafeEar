/** node:test용 아주 작은 expect 도우미 (외부 의존성 없이) */
import assert from 'node:assert/strict';

function matchers(actual: unknown, negate: boolean) {
  const check = (ok: boolean, msg: string) => assert.ok(negate ? !ok : ok, (negate ? 'NOT ' : '') + msg);
  return {
    toBe: (e: unknown) => check(Object.is(actual, e), `${String(actual)} === ${String(e)}`),
    toBeNull: () => check(actual === null, `${String(actual)} === null`),
    toBeGreaterThan: (e: number) => check((actual as number) > e, `${String(actual)} > ${e}`),
    toBeLessThan: (e: number) => check((actual as number) < e, `${String(actual)} < ${e}`),
    /** vitest와 같은 정의: |a − e| < 10^(−digits) / 2 */
    toBeCloseTo: (e: number, digits = 2) =>
      check(Math.abs((actual as number) - e) < Math.pow(10, -digits) / 2, `${String(actual)} ≈ ${e} (${digits}자리)`),
  };
}

export function expect(actual: unknown) {
  return Object.assign(matchers(actual, false), { not: matchers(actual, true) });
}
