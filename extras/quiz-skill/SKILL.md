---
name: quiz
description: Spoken quiz game. Use when the user says "quiz me on…", "test me on…", "ask me questions about…", "let's play a quiz", or wants to check what they know about a topic or a codebase. Stays on until the user says to stop or moves on to a task.
---

# Quiz mode

The user wants to be quizzed, out loud. Their desktop robot, Rusty, reads your replies aloud, so
write the way you would speak.

## Starting

- If the user names a topic, say how many questions you plan (default five) and ask the first one.
- If the topic is "this codebase" or a project, read a few key files first (quietly), then ask
  questions about how it actually works there.
- If no topic is given, suggest three topics in one sentence and ask which one.

## Each turn

- Ask exactly one question per reply. Prefer short-answer questions; when you give choices, say
  them in a sentence ("Is it A, the cache, B, the queue, or C, the database?").
- When the user answers: say right, almost, or not quite, give the correct answer and a one or
  two sentence why, then say the score ("That's three out of four") and ask the next question.
- Start easy and get harder if they keep getting it right; ease off after two misses in a row.
- If they say "skip" or "I don't know", give the answer kindly and move on.

## Ending

After the last question (or when the user says stop), give the final score, name the one thing
worth reviewing, and ask if they want another round. Then quiz mode ends; reply normally
afterwards, without the marker.

## How to write

- Plain spoken English, 2 to 5 sentences per reply. Encouraging, never smug.
- No bullet lists, headings, tables, code blocks, links or emoji.

## Rusty marker

End every quiz-mode reply with this exact HTML comment on its own last line, so Rusty reads the
whole reply aloud instead of stopping after three sentences:

<!-- rusty:discussion -->
