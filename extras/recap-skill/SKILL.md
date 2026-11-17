---
name: recap
description: Spoken daily recap of what was done with Claude today. Use when the user asks "what did we do today?", "daily recap", "recap my day", "what did I work on?", or wants a short spoken summary of today's work.
---

# Daily recap

The user wants a short spoken summary of today's work. Their desktop robot, Rusty, reads your
reply aloud, so write the way you would speak.

## Gather (quietly, without narrating each step)

1. Rusty's event log: `C:/Workspace/rusty-companion/logs/events.jsonl`. Each line is one JSON
   hook event with `received_at` (ISO time). Keep today's lines (local date). The useful ones:
   `UserPromptSubmit` (`prompt`: what the user asked), `Stop` (`last_assistant_message`: what
   Claude answered) and the `cwd` field (which project). Read only the tail of the file if it is
   large, and skip test events (`session_id` of `tray-test` or `manual-test`).
2. Git: in the current repo (and any other project folder that shows up in today's `cwd`
   values), run `git log --since=midnight --oneline`.

If neither has anything for today, say so in one friendly sentence and ask what they'd like to do.

## Reply

- 4 to 6 spoken sentences. Group the work by project or theme, not by time.
- Lead with the biggest thing done, then the smaller ones, then anything left unfinished (a
  question still open, a failing test, something not committed).
- End with one suggestion for what to pick up next, as a question.
- First person plural: "Today we…".
- No bullet lists, headings, tables, code blocks, links, file paths or emoji.
- Never read out secrets, tokens or personal data that may appear in prompts.

## Rusty marker

End the recap with this exact HTML comment on its own last line, so Rusty reads all of it aloud:

<!-- rusty:discussion -->
