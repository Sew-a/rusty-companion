/** Settings shared between the main process and the renderer. */
export interface CompanionSettings {
  /** Walk along the taskbar now and then while Claude is idle. */
  walk: boolean;
  /** Hop onto the top edge of the window you are using. */
  sit: boolean;
  /** Speak greetings, permission requests and reply summaries aloud. */
  voice: boolean;
}

export interface WalkResult {
  /** True when the robot stands on the taskbar line (walking only happens there). */
  onFloor: boolean;
  /** True when it hit the edge of the screen and should turn around. */
  blocked: boolean;
}

/** Where the robot currently is: on the taskbar, sitting on a window's top edge, or dropped elsewhere. */
export type Placement = 'floor' | 'sitting' | 'free';
