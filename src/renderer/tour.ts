import type { Mood } from './stateMachine';

export interface TourStep {
  mood: Mood;
  bubble?: string;
  seconds: number;
}

/** The guided tour ("Show me around" in the tray): every state the robot can be in, explained. */
export const TOUR: TourStep[] = [
  { mood: 'greet', bubble: "Hi Sev! I'm Rusty. Let me show you what I can do.", seconds: 4.5 },
  { mood: 'thinking', bubble: 'When you send Claude a prompt, I think…', seconds: 3.5 },
  { mood: 'thinking', seconds: 3 }, // thought cloud with dots
  { mood: 'working', bubble: 'When Claude edits files or runs commands, I get busy.', seconds: 4 },
  { mood: 'browsing', bubble: 'When Claude uses the browser, I point at it.', seconds: 4 },
  { mood: 'researching', bubble: 'When Claude digs into research, I take notes.', seconds: 4.5 },
  { mood: 'running', bubble: 'When you ask for a bug fix, I sprint!', seconds: 4 },
  { mood: 'permission', bubble: 'If Claude needs your OK, I wave and ask.', seconds: 4 },
  { mood: 'talking', bubble: 'While Claude writes, I show you what it says.', seconds: 4 },
  { mood: 'happy', bubble: 'When Claude is done, I tell you the result!', seconds: 4 },
  { mood: 'dancing', bubble: 'After a long task, I dance.', seconds: 4.8 },
  { mood: 'error', bubble: 'If something breaks, I get a bit sad.', seconds: 3.5 },
  { mood: 'walking', bubble: "When it's quiet, I go for a little walk.", seconds: 5 },
  { mood: 'resting', bubble: 'When I get tired, I sit down and relax.', seconds: 4 },
  { mood: 'sleep', bubble: 'After a long break, I take a nap.', seconds: 3.5 },
  {
    mood: 'greet',
    bubble: "That's the tour! Click a window and I'll sit on top of it. Drag me anywhere.",
    seconds: 5,
  },
];
