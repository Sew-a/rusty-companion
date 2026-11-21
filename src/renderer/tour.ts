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

/** The showreel (tray "Showreel (30 s)"): every move in about half a minute, each one narrated
 *  in a few words so the speech keeps up. Made for recording demo videos. */
export const REEL: TourStep[] = [
  { mood: 'greet', bubble: "Hi, I'm Rusty! Watch this.", seconds: 2.6 },
  { mood: 'thinking', bubble: "I'm thinking.", seconds: 2.4 },
  { mood: 'researching', bubble: "Now I'm taking notes.", seconds: 2.7 },
  { mood: 'working', bubble: "I'm hammering on your code!", seconds: 2.8 },
  { mood: 'browsing', bubble: 'Checking the browser.', seconds: 2.4 },
  { mood: 'running', bubble: "A bug? I'm on it!", seconds: 2.7 },
  { mood: 'permission', bubble: 'I need your OK!', seconds: 2.6 },
  { mood: 'happy', bubble: 'Done! The tests pass.', seconds: 2.7 },
  { mood: 'dancing', bubble: 'Long task? I dance!', seconds: 3.6 },
  { mood: 'sipping', bubble: 'Coffee break.', seconds: 3.4 },
  { mood: 'walking', bubble: 'Now a little stroll.', seconds: 3.2 },
  { mood: 'bye', bubble: 'See you soon!', seconds: 2.4 },
];
