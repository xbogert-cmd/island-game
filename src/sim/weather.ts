export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm';

const TARGET: Record<WeatherKind, { cloud: number; rain: number; wind: number; storm: number }> = {
  clear: { cloud: 0.18, rain: 0, wind: 0.15, storm: 0 },
  cloudy: { cloud: 0.6, rain: 0, wind: 0.35, storm: 0 },
  rain: { cloud: 0.85, rain: 0.6, wind: 0.45, storm: 0 },
  storm: { cloud: 1, rain: 1, wind: 1, storm: 1 },
};
const NEXT: Record<WeatherKind, [WeatherKind, number][]> = {
  clear: [['clear', 0.45], ['cloudy', 0.55]],
  cloudy: [['clear', 0.45], ['rain', 0.38], ['storm', 0.17]],
  rain: [['cloudy', 0.6], ['storm', 0.22], ['clear', 0.18]],
  storm: [['rain', 0.7], ['cloudy', 0.3]],
};
const DURATION: Record<WeatherKind, [number, number]> = { clear: [150, 320], cloudy: [90, 200], rain: [60, 150], storm: [50, 110] };

/** Weather drifts between states on its own; values ease toward the current state's targets. */
export class Weather {
  kind: WeatherKind = 'clear';
  cloud = 0.18; rain = 0; wind = 0.15; storm = 0;
  wet = 0; fog = 0; rainbow = 0;
  /** Set from the settings panel to hold one weather state. */
  locked: WeatherKind | null = null;
  /** Held by the game itself (a storm-season storm). The settings lock wins. */
  forced: WeatherKind | null = null;
  private timer = 200;
  private wasRaining = false;

  force(k: WeatherKind) { this.kind = k; this.timer = DURATION[k][1]; }

  update(dt: number, hour: number) {
    this.timer -= dt;
    if (this.locked || this.forced) { this.kind = this.locked ?? this.forced!; this.timer = 999; }
    if (this.timer <= 0) {
      let r = Math.random();
      for (const [k, p] of NEXT[this.kind]) { r -= p; if (r <= 0) { this.kind = k; break; } }
      const [a, b] = DURATION[this.kind]; this.timer = a + Math.random() * (b - a);
    }
    const t = TARGET[this.kind], e = Math.min(1, dt * 0.1);
    this.cloud += (t.cloud - this.cloud) * e; this.rain += (t.rain - this.rain) * e * 1.3;
    this.wind += (t.wind - this.wind) * e; this.storm += (t.storm - this.storm) * e;
    this.wet = Math.max(0, Math.min(1, this.wet + (this.rain > 0.15 ? dt * 0.05 * this.rain : -dt * 0.006)));
    const morning = hour > 4.5 && hour < 8.5 ? Math.sin(((hour - 4.5) / 4) * Math.PI) : 0;
    this.fog += (Math.max(morning * 0.85, this.wet * 0.3 * (this.rain < 0.1 ? 1 : 0)) - this.fog) * Math.min(1, dt * 0.05);
    // a rainbow follows rain that clears up during the day
    const day = hour > 7 && hour < 18;
    if (this.wasRaining && this.rain < 0.12 && day) this.rainbow = 1;
    this.wasRaining = this.rain > 0.35 || (this.wasRaining && this.rain > 0.12);
    this.rainbow = Math.max(0, this.rainbow - dt / 70);
  }
}
