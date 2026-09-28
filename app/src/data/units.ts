/** Source engine unit conversion. 1 unit = 1 inch = 0.0254 m (community convention; player 72u = 1.83 m). */
export const U = 0.0254;
export const u2m = (u: number) => u * U;
export const m2u = (m: number) => m / U;
