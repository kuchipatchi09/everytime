export type TimerPresetId = "pomodoro" | "standard" | "custom" | "stopwatch";

export type TimerPhase = "focus" | "shortBreak" | "longBreak";

export interface TimerPreset {
  id: TimerPresetId;
  name: string;
  focusMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  isStopwatch?: boolean;
}

export type AmbientSoundType = "none" | "rain" | "white" | "brown";

export interface TimerState {
  presetId: TimerPresetId;
  phase: TimerPhase;
  totalSeconds: number;
  remainingSeconds: number;
  elapsedSeconds: number;
  isRunning: boolean;
  pomodoroRound: number;
}
