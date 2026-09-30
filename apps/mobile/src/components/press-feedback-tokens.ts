export const PRESS_FEEDBACK_MS = 80;
export const PRESS_FEEDBACK_DIM_OPACITY = 0.85;

export function pressFeedbackDuration(reduceMotion: boolean): 0 | typeof PRESS_FEEDBACK_MS {
  return reduceMotion ? 0 : PRESS_FEEDBACK_MS;
}
