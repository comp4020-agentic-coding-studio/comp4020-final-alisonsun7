// One shared atmosphere for the existing place and room. Changing it never
// moves people, removes contributions, or creates an ambient audio track.
export const WEATHERS = ["clear", "cloudy", "rain", "mist"] as const;
export type Weather = (typeof WEATHERS)[number];
export const WEATHER_LABELS: Record<Weather, string> = {
  clear: "Clear", cloudy: "Cloudy", rain: "Rain", mist: "Mist",
};

export interface Environment {
  weather: Weather;
  minuteOfDay: number; // integer anchor, 0..1439
  clockRunning: boolean;
  updatedAt: string; // server ISO timestamp for the anchor
  revision: number;
}

export interface EnvironmentUpdate {
  weather: Weather;
  minuteOfDay: number;
  clockRunning: boolean;
  revision: number; // the revision the person actually reviewed
}

export type EnvironmentResult =
  | { ok: true; environment: Environment; serverNow: string }
  | { ok: false; code: "stale"; environment: Environment; serverNow: string }
  | { ok: false; code: "no_session" | "bad_request" | "slow_down" };

// A full day takes 24 real minutes. Persist an anchor, rather than writing
// SQLite every tick, so the same clock also continues through a restart.
export const CLOCK_MINUTES_PER_SECOND = 1;
export const TIME_PRESETS = [
  { id: "dawn", label: "Dawn", minuteOfDay: 360 },
  { id: "day", label: "Afternoon", minuteOfDay: 840 },
  { id: "dusk", label: "Dusk", minuteOfDay: 1110 },
  { id: "night", label: "Night", minuteOfDay: 1320 },
] as const;

export function createDefaultEnvironment(updatedAt: string): Environment {
  return { weather: "clear", minuteOfDay: 840, clockRunning: false, updatedAt, revision: 0 };
}

const wrappedMinute = (minute: number): number => ((minute % 1440) + 1440) % 1440;

export function minuteAt(environment: Environment, serverNowMs = Date.now()): number {
  const elapsed = environment.clockRunning ? Math.max(0, serverNowMs - Date.parse(environment.updatedAt)) / 1000 : 0;
  return wrappedMinute(environment.minuteOfDay + elapsed * CLOCK_MINUTES_PER_SECOND);
}

export function formatTime(minute: number): string {
  const whole = Math.floor(wrappedMinute(minute));
  return `${Math.floor(whole / 60).toString().padStart(2, "0")}:${(whole % 60).toString().padStart(2, "0")}`;
}

export function timePhase(minute: number): "night" | "dawn" | "day" | "dusk" {
  const m = wrappedMinute(minute);
  return m < 300 || m >= 1200 ? "night" : m < 420 ? "dawn" : m < 1050 ? "day" : "dusk";
}
