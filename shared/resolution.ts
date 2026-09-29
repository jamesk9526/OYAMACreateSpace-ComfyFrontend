import { z } from 'zod';

export const resolutionFields = {
  resolutionLock: z
    .object({ width: z.number().int().min(1).max(4096), height: z.number().int().min(1).max(4096) })
    .nullable()
    .default(null),
};
export type Canvas = { width: number; height: number };
export type ResolutionLimits = { min: number; max: number; step: number };
export const aspectRatios = [
  ['16:9', 16, 9],
  ['9:16', 9, 16],
  ['1:1', 1, 1],
  ['4:3', 4, 3],
  ['3:4', 3, 4],
  ['3:2', 3, 2],
  ['2:3', 2, 3],
  ['4:5', 4, 5],
  ['5:4', 5, 4],
  ['16:10', 16, 10],
  ['10:16', 10, 16],
  ['21:9', 21, 9],
  ['9:21', 9, 21],
  ['2:1', 2, 1],
  ['1:2', 1, 2],
] as const;
export function reducedRatio({ width, height }: Canvas): Canvas {
  if (![width, height].every((value) => Number.isInteger(value) && value > 0))
    return { width: 1, height: 1 };
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const divisor = gcd(width, height);
  return { width: width / divisor, height: height / divisor };
}
/** Use exact aligned ratios when possible; otherwise choose the closest aligned canvas. */
export function fitResolution(
  ratio: Canvas,
  axis: keyof Canvas,
  target: number,
  limits: ResolutionLimits,
): Canvas {
  const candidates: Canvas[] = [];
  const r = reducedRatio(ratio);
  for (let width = limits.min; width <= limits.max; width += limits.step) {
    const height = Math.round((width * r.height) / r.width / limits.step) * limits.step;
    candidates.push({ width, height: Math.max(limits.min, Math.min(limits.max, height)) });
  }
  const error = (c: Canvas) =>
    Math.abs(Math.log(c.width / c.height / (ratio.width / ratio.height)));
  const exact = candidates.filter((c) => c.width * ratio.height === c.height * ratio.width);
  const pool = exact.length ? exact : candidates;
  const requested = Number.isFinite(target)
    ? Math.max(limits.min, Math.min(limits.max, target))
    : limits.min;
  pool.sort((a, b) =>
    exact.length
      ? Math.abs(a[axis] - requested) - Math.abs(b[axis] - requested)
      : error(a) - error(b) || Math.abs(a[axis] - requested) - Math.abs(b[axis] - requested),
  );
  return pool[0];
}
