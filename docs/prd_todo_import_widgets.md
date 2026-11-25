# Todo bulk import, spoken quick add, and Android widgets (proposal)

Status: built (0.9.0). Owner's answers (2026-11-25): C, quick add opens the app on the
preview; D, a widget row's box ticks it done (queued); A/B, `[x]` comes in done, headings other
than days are skipped, and nesting is flattened for now (subtasks later, not groups).
Everything here is deterministic and local: no network calls and no model, just rules with unit tests in
`src/domain/todoImport.ts`.

## 1. Paste a list (text / Markdown, parsed automatically)

**Where:** the Todos tab's Add box. When you paste (or type) more than one line, the box opens a
**preview** under it, one row per todo it found, each showing what was read:

```
☑ Laundry            Today 4:00p · ⏱ 20m
☑ Call mom           Tomorrow 
☐ Taxes              ✓ done            (from "- [x] taxes")
☑ Feed cats          7:00a · ⟳ daily
[ Add 3 todos ]  Cancel
```

Untick a row to leave it out; tap a row to fix its text (it parses again). Nothing is made until
**Add N todos**. Each row goes through the same `parseTodoInput` the Add box uses today, so
"laundry 4p 20m" means the same thing in both places.

**What it reads:**
- Markdown/plain list markers: `-`, `*`, `+`, `1.`, `1)`, `☐`, `•`. A `- [ ]` item is open, and
  `- [x]` comes in as **done** (with nothing on the timeline).
- Headings (`#`, `##`, or a line ending in `:`) that are day words ("Today", "Tomorrow", "Monday",
  "Nov 28") set the day for the items under them. Any other heading is ignored (or becomes the group:
  see question B).
- Indented sub-items are flattened into separate todos. Blank lines and `---` are skipped.
- A whole line is one todo; commas inside a line stay in the name.

## 2. Spoken quick add (dictation text)

Dictation comes from the Android keyboard's mic, not our app: whatever the keyboard types goes
through a **spoken parser** that reads run-on speech:

> "buy milk tomorrow at three pm then call mom for twenty minutes and also laundry tonight"
> → Buy milk (tomorrow 3:00p) · Call mom (⏱ 20m) · Laundry (tonight)

- **Splits** on "then", "and then", "also", "next", "after that", "plus", sentence ends and new
  lines; "and" splits only when what follows it reads as a todo of its own (it has its own time or
  day, or both halves are 2 words or more and start with a verb from a short list). "salt and
  pepper" stays one todo.
- **Number words**: "three pm", "seven thirty", "half past four", "quarter to nine", "noon",
  "midnight", "twenty minutes", "an hour", "an hour and a half".
- **Phrases**: "at …", "by …", "for …" (a length), "in twenty minutes" (a time from now), "this
  evening/afternoon/morning", weekday names ("on Friday"), "every day/weekday".
- Capitalises the first letter and drops filler ("um", "remind me to", "I need to").
- It shows the same preview as §1 before adding (dictation makes mistakes, and a wrong "3 pm" vs
  "3 am" should be seen).

The same parser is used by the Add box when the text reads as speech (no line breaks, a split
word inside), so it also works with a keyboard mic in the browser.

## 3. Android widget: quick add

A 2×1 home-screen widget: "＋ Add todo" with a mic hint. A tap opens a small native dialog
(`QuickAddActivity`, over the home screen) with a text field already focused, so the keyboard
and its mic are one tap away. **Add** stores the text in a native queue (SharedPreferences),
and the page reads the queue the next time it runs (`TodoInboxPlugin.drain`) and adds the
todos through §2. See question C for whether the app opens.

## 4. Android widget: todo list with filters

A resizable list widget (`TodoListWidget`, a `RemoteViewsService`). Each widget instance has its
own settings, picked when it is placed (and later from a ⚙ in its header):
- **Status** (several allowed): Now (waiting/counting) · Scheduled · Unscheduled · Done.
- **Look ahead**: Today · 3 days · 7 days · All.

Rows show the box, name and time/length the way the Todos tab does ("4:00p · ⏱ 20m", "since
7:00a"). A tap on a row opens the app at that todo (`act.findTodo`). The widget's header (a
tap opens the Todos tab) and its ＋ are the quick add from §3.

**Data:** the page writes a snapshot of the todos (next 30 days, plus the last day's done ones)
to native storage whenever todos change, as alarms are synced now (`services/native/todoSync`).
The widget filters the snapshot itself, so it stays right across midnight and when its filters
change without the app running. What it can't know without the app: a todo added or changed
somewhere else (there is no sync).

## Native work and how it's checked

New Java: `QuickAddActivity`, `TodoInbox` (+ plugin), `TodoListWidget` (provider, service,
config activity), layouts and `appwidget-provider` XML. **Android app: install again.** This
container has no Android SDK, so the native code is only compiled by the repository's Android
workflow (the TC Preview pre-release on the PR) and checked on the phone. The parsers and the
page side get unit tests here.

## Questions for the owner

- **A.** Should a `- [x]` item come in as a done todo, or be left out?
- **B.** Should other headings be ignored, or become groups (`collectionId`), with a new group
  made if none by that name exists?
- **C.** After quick add, should the app open with the preview (you see what was read, one more
  tap to Add), or should it add in the background with no app (todos appear, and their alarms are
  armed, only the next time the app opens)?
- **D.** Should a list widget row's box mark it done from the home screen (queued like quick add,
  applied when the app next runs), or should v1 open the app only?
