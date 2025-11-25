import { Vector2 } from '../types';

export const add = (v1: Vector2, v2: Vector2): Vector2 => ({ x: v1.x + v2.x, y: v1.y + v2.y });
export const sub = (v1: Vector2, v2: Vector2): Vector2 => ({ x: v1.x - v2.x, y: v1.y - v2.y });
export const mult = (v: Vector2, n: number): Vector2 => ({ x: v.x * n, y: v.y * n });
export const div = (v: Vector2, n: number): Vector2 => ({ x: v.x / n, y: v.y / n });
export const mag = (v: Vector2): number => Math.sqrt(v.x * v.x + v.y * v.y);
export const normalize = (v: Vector2): Vector2 => {
  const m = mag(v);
  return m === 0 ? { x: 0, y: 0 } : div(v, m);
};
export const dist = (v1: Vector2, v2: Vector2): number => mag(sub(v1, v2));
export const angleBetween = (v1: Vector2, v2: Vector2): number => Math.atan2(v2.y - v1.y, v2.x - v1.x);

export const dot = (v1: Vector2, v2: Vector2): number => v1.x * v2.x + v1.y * v2.y;

export const limit = (v: Vector2, max: number): Vector2 => {
  const mSquared = v.x * v.x + v.y * v.y;
  if (mSquared > max * max && mSquared > 0) {
    const m = Math.sqrt(mSquared);
    return { x: (v.x / m) * max, y: (v.y / m) * max };
  }
  return v;
};

// Wraps angle to [-PI, PI] range using math instead of loops to prevent freezing
export const normalizeAngle = (angle: number): number => {
  if (!Number.isFinite(angle)) return 0;
  return angle - (2 * Math.PI) * Math.floor((angle + Math.PI) / (2 * Math.PI));
};

export const randomRange = (min: number, max: number) => Math.random() * (max - min) + min;

export const wrapPosition = (pos: Vector2, bounds: number): Vector2 => {
  return pos;
};

export const clampPosition = (pos: Vector2, radius: number): Vector2 => {
  const d = mag(pos);
  if (d > radius) {
    const n = normalize(pos);
    return mult(n, radius);
  }
  return pos;
};

// Predict where the target will be when a projectile at speed `projSpeed` reaches it
export const predictTargetPosition = (shooterPos: Vector2, targetPos: Vector2, targetVel: Vector2, projSpeed: number): Vector2 => {
  const distance = dist(shooterPos, targetPos);
  const timeToImpact = distance / projSpeed;
  return add(targetPos, mult(targetVel, timeToImpact));
};