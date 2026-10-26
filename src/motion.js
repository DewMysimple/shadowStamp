export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const lerp = (from, to, amount) => from + (to - from) * amount;
export const damp = (from, to, dt, response = 0.1) => lerp(from, to, -Math.expm1(-dt / response));
export const ease = (t) => 1 - Math.pow(1 - clamp(t), 3);

/** One reversible progress value; retargeting always begins at the current pose. */
export class FocusMotion {
  value = 0;
  target = 0;
  from = 0;
  elapsed = 0;
  duration = 0;

  retarget(target, duration) {
    this.from = this.value;
    this.target = clamp(target);
    this.duration = Math.max(0.001, duration * Math.abs(this.target - this.from));
    this.elapsed = 0;
  }

  update(dt) {
    if (this.value === this.target) return this.value;
    this.elapsed += Math.max(0, dt);
    const t = clamp(this.elapsed / this.duration);
    this.value = t === 1 ? this.target : lerp(this.from, this.target, ease(t));
    return this.value;
  }

  get settled() { return this.value === this.target; }
}
