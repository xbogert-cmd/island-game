/** Game time. One in-game day lasts 12 real minutes at 1x speed. */
export class Clock {
  minutes = 6 * 60; // Day 1, 06:00
  speed = 1;
  static readonly REAL_SECONDS_PER_DAY = 720;

  tick(dt: number) { this.minutes += dt * this.speed * (1440 / Clock.REAL_SECONDS_PER_DAY); }
  get day() { return Math.floor(this.minutes / 1440) + 1; }
  get hour() { return (this.minutes % 1440) / 60; }
  get label() { const m = Math.floor(this.minutes % 1440); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
  /** 0 at full day, 1 at full night. */
  get night() { const h = this.hour; return h < 5 || h > 20.5 ? 1 : h < 6.5 ? (6.5 - h) / 1.5 : h > 19 ? (h - 19) / 1.5 : 0; }
}
