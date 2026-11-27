---
name: timeline-clock-import
description: Write a JSON file that the Timeline Clock app imports (Settings › Data › Import…). It can hold moments, stretches of time, alarms, countdowns, repeating alarms, todos and groups. Use this whenever someone asks you to export, convert or plan something "into Timeline Clock" or "as a Timeline Clock backup".
---

# Writing a Timeline Clock import file

Timeline Clock is a clock app built around one scrolling, zoomable timeline with a Now line.
Everything on it is one of these:

- an **instant**: a moment, drawn as a line with a named chip;
- a **span**: the stretch between two instants, drawn as a lane with its length;
- **alarms** on an instant;
- **todos**;
- **repeating series** (repeating alarms or todos);
- **groups** of all these.

The app reads one JSON file, a backup in the format described below. Your job is to write that
file. The user then imports it on their own device. Nothing is sent anywhere: the app keeps all
data locally.

The person you are helping imports it like this:

1. Open **Settings › Data › Import…** and pick the file.
2. Tick **Instants and spans**. Leave **Settings** unticked: your file has none.
3. Choose **Combine with current data**.
4. For each group in the file, choose where it goes, then tap **Import**.

So always write a file meant to be *combined* with what they already have. Never write one that
would replace their data.

## Before you write: what you need to know

- **Their time zone** (an IANA name such as `America/Chicago`). Every time in the file is an
  absolute moment, so "7:30 AM" means nothing until you know where. If you don't know it, ask.
- **The current date and time.** You need it to tell the past from the future: alarms only make
  sense ahead, and some fields want "now". If you aren't sure of it, ask.
- **A name for the group** everything goes into, such as "Lisbon trip" or "Half marathon
  training". Pick one from the request if it's obvious. With everything in one group, the user
  can switch it off or delete it as a whole.

If you can run code, compute timestamps with it rather than by hand. In Python:
`int(datetime(2026, 12, 13, 7, 30, tzinfo=ZoneInfo("America/New_York")).timestamp() * 1000)`.
Daylight saving matters: the same zone has different UTC offsets in summer and winter.

## The file

```text
{
  "format": "timeline-clock-backup",   // exactly this
  "version": 1,                         // exactly 1
  "exportedAt": "2026-11-27T01:00:00.000Z",  // when you wrote it (ISO 8601); informational
  "data": {
    "collections": [ … ],   // groups (optional; see Groups)
    "instants": [ … ],      // required (may be [])
    "spans": [ … ],         // required (may be [])
    "todos": [ … ],         // optional
    "groups": [ … ]         // optional: repeating series (yes, "groups" here means series)
  }
}
```

- Write plain JSON: no comments, no trailing commas, UTF-8. Emoji in names are fine.
- Leave out `settings`. It holds the user's own preferences, and importing it would overwrite
  them.
- `data.groups` holds **repeating series**. **Groups** (the folders the user sees) are in
  `data.collections`. The names are historical; don't mix them up.

## Times, dates and ids

- **Moments** (`tsEpochMs`, `createdAt`, `closedAt`) are integers: milliseconds since
  1970-01-01T00:00:00Z. Round them to whole seconds or minutes, as a person would.
- **Lengths and offsets** (`offsetMs`, `durationMs`, `extraMs`) are milliseconds. For reference:
  1 minute = 60000, 1 hour = 3600000, 1 day = 86400000.
- **Series** use the device's local wall clock instead: `time` is `"HH:MM"` (24-hour,
  zero-padded) and dates are `"YYYY-MM-DD"`. The app works out each occurrence in the user's
  zone, daylight saving included.
- **Ids** are strings that are unique within their kind. Use the app's prefixes with your own
  readable suffix:
  - `i_` for instants
  - `s_` for spans
  - `a_` for alarms
  - `t_` for todos
  - `g_` for series
  - `c_` for groups

  For example `i_race`, `a_race_1h`. Avoid characters other than letters, digits, `_` and `-`.
  Never start an id with `v:`, `sun:`, `dst:` or `season:`: the app computes instants with those
  ids itself.
- **A repeated id updates.** When you combine a file, a record whose id is already on the device
  replaces the copy there. To change something you exported earlier, export it again with the same
  ids. To add new things, use new ids.

## Instants

```json
{
  "instants": [
    { "id": "i_coffee", "tsEpochMs": 1795615920000, "label": "Coffee with Sam ☕", "createdAt": 1795615920000 }
  ]
}
```

| Field | Type | | Meaning |
|---|---|---|---|
| `id` | string | required | Unique (see Ids). |
| `tsEpochMs` | integer | required | When it is. |
| `label` | string | recommended | Its name. `""` is an unnamed instant: it reads as its time. |
| `createdAt` | integer | recommended | When it was made. This sets how far out it stays labelled as you zoom out: 4× how far ahead of `createdAt` it is, and at least 3 days. For plans, use the time you write the file. For past events, use their own `tsEpochMs`, as if captured then. |
| `favorite` | boolean | optional | Tracks its span to Now: a lane that always shows, counting down to it (ahead) or up from it (past). **Write that span too** (see Spans to Now): a favorite with alarms but no span to Now is taken for old data and stops being a favorite. Use it for the one or two things that matter, not for everything. |
| `alarms` | Alarm[] | optional | See Alarms. |
| `collectionId` | string | optional | Its group's id (see Groups). Leave it out for Default. |
| `visibility` | object | optional | Overrides when it shows as you zoom out: `{ "label": Z, "mark": Z }`. Up to `label` time on screen it has its chip; up to `mark` it is a short line on the axis; beyond that it is hidden. `Z` is one of `"hour"`, `"6h"`, `"day"`, `"3d"`, `"week"`, `"month"`, `"quarter"`, `"year"`, `"decade"`, `"century"`, `"always"`, or a number of ms. `label` must not exceed `mark`. Usually leave it out: the app's own rule (from `createdAt`, alarms and spans) is good. |
| `todo` | object | todos only | `{ "id": "t_…", "role": "at" \| "done" \| "start" \| "pause" }`: this instant belongs to that todo (see Todos). |
| `hidden` | boolean | avoid | Hidden from the timeline. Don't write it unless asked. |

**Don't write these fields:** `seriesId`, `occurrence`, `seriesEdited` (the app makes a
series' instants itself), `sun`, `virtual`, `snoozeOriginalId`, and the old `alarm`. **Don't add
fields of your own either.** The app keeps unknown fields on instants and spans as they are.

## Alarms

These go on an instant, in its `alarms` list:

```json
{
  "instants": [
    {
      "id": "i_dentist", "tsEpochMs": 1796325300000, "label": "Dentist 🦷", "createdAt": 1795741200000,
      "alarms": [
        { "id": "a_dentist_1h", "offsetMs": 3600000, "sound": "chime" },
        { "id": "a_dentist", "offsetMs": 0 }
      ]
    }
  ]
}
```

| Field | Type | | Meaning |
|---|---|---|---|
| `id` | string | required | Unique within the instant. |
| `offsetMs` | integer ≥ 0 | required | How long *before* the instant it rings: `0` is at the instant, `3600000` is an hour before (a warning). |
| `sound` | string | optional | One of four tones, `"tone1"` to `"tone4"`, or `"chime"`. A tone rings until it is answered; a chime sounds once. Leave it out for the user's default. Good fits: `chime` for warnings and gentle reminders, the default for things that must not be missed. |
| `answered` | string | history only | `"dismissed"`, `"snoozed"` or `"chimed"`: it already rang. Leave it out for alarms still to come. |

- An alarm rings at `tsEpochMs − offsetMs`. Only put alarms where that time is still ahead
  when the user imports.
- An unanswered alarm whose time has passed rings at once if it is a few minutes late; if it is
  older, it shows as missed. For past events, leave alarms out.
- Don't write `snoozeOf` or negative offsets: they are snoozes, made by the app.
- An instant with an alarm still to ring is always shown. That's the app's rule, and it isn't
  something to work around.

## Spans

A span is the stretch between two instants, both in the same file:

```json
{
  "instants": [
    { "id": "i_oven_on", "tsEpochMs": 1795646400000, "label": "Oven on", "createdAt": 1795646400000 },
    { "id": "i_oven_off", "tsEpochMs": 1795649100000, "label": "Chicken out", "createdAt": 1795649100000 }
  ],
  "spans": [
    { "id": "s_roast", "startInstantId": "i_oven_on", "endInstantId": "i_oven_off", "label": "Roast chicken", "visible": true }
  ]
}
```

| Field | Type | | Meaning |
|---|---|---|---|
| `id` | string | required | Unique. |
| `startInstantId` | string | required | The earlier instant's id, in this file. |
| `endInstantId` | string | required | The later instant's id, in this file (or `"__NOW__"`: see below). |
| `label` | string | recommended | Its name. `""` shows its length alone. |
| `visible` | boolean | recommended | `true`: its lane always shows. Without it, the lane shows only while one of its ends is selected. Write `true`. |
| `endIsNow` | `true` | favorites only | It runs to Now (see below). Leave it out otherwise. |

- The app drops a span when either of its instants is missing from the file.
- Spans may overlap and nest. The app stacks them in lanes, with a long span outside the shorter
  ones within it.

### Spans to Now (favorites)

A favorite (`"favorite": true`) is tracked by its span to Now. Write exactly one per favorite,
with `""` as its label, and none for anything else. The app drops a span to Now whose instant
isn't a favorite.

```json
{
  "instants": [
    { "id": "i_race", "tsEpochMs": 1797165000000, "label": "Half marathon", "createdAt": 1795741200000, "favorite": true,
      "alarms": [{ "id": "a_race", "offsetMs": 0 }] }
  ],
  "spans": [
    { "id": "s_race_now", "startInstantId": "i_race", "endInstantId": "__NOW__", "label": "", "visible": true, "endIsNow": true }
  ]
}
```

## Todos

A todo is a record (`data.todos`) that holds no times. Its times are ordinary instants that point
at it through their `todo` field.

| Field | Type | | Meaning |
|---|---|---|---|
| `id` | string | required | Unique (`t_…`). |
| `label` | string | required | What to do. |
| `createdAt` | integer | recommended | When it was made (the time you write the file). |
| `status` | string | recommended | `"open"` (the default), `"done"`, or `"dropped"` (won't do). `"passed"` is set by the app. |
| `order` | integer | recommended | Its place in the Unscheduled list, smallest first (0, 1, 2…). |
| `durationMs` | integer | optional | How long it should take (at most 100 hours). Once it has a time, a planned block of that length is drawn from it. |
| `closedAt` | integer | done only | When it was done or dropped. |
| `extraMs` | integer | optional | Time already worked on it that isn't on the timeline (at most 1000 hours). It counts in how long it took. |
| `collectionId` | string | optional | Its group. Give its instants the same group. |

**Don't write these fields:** `seriesId`, `occurrence` or `startedId`. Repeating todos come
from a series (below), and `startedId` means it is being timed right now.

A todo's instants, by `todo.role`:

- **`at`**: when it is to be done. Its label is the todo's label. Give it the alarm
  `{ "offsetMs": 0 }` so it reminds at its time. A todo has at most one `at`. Write one only
  when that time is still ahead; a todo with no time simply sits in the Unscheduled list.
- **`start`**: where work on it started. Its label is `"▶ "` plus the todo's label.
- **`pause`**: where work stopped while it is still open. Its label is `"⏸ "` plus the label.
- **`done`**: where it was finished, at `closedAt`. Its label is `"✓ "` plus the label.
- A **stretch** of work is a span from a `start` to the `pause` or `done` that ends it. Its
  label is the todo's label, with `"visible": true`.
- The app writes the `was` role itself; don't use it.
- Don't favorite a todo's instants: on a todo, that means "being timed now".

```json
{
  "todos": [
    { "id": "t_shoes", "label": "Buy race shoes", "createdAt": 1795741200000, "status": "open", "order": 0, "durationMs": 3600000 },
    { "id": "t_bib", "label": "Pick up race bib", "createdAt": 1795741200000, "status": "open", "order": 1, "durationMs": 1800000 },
    { "id": "t_plan", "label": "Write race-day plan", "createdAt": 1795570500000, "status": "done", "order": 2, "closedAt": 1795572000000, "extraMs": 600000 }
  ],
  "instants": [
    { "id": "i_bib", "tsEpochMs": 1797105600000, "label": "Pick up race bib", "createdAt": 1795741200000,
      "todo": { "id": "t_bib", "role": "at" }, "alarms": [{ "id": "a_bib", "offsetMs": 0 }] },
    { "id": "i_plan_start", "tsEpochMs": 1795570500000, "label": "▶ Write race-day plan", "createdAt": 1795570500000,
      "todo": { "id": "t_plan", "role": "start" } },
    { "id": "i_plan_done", "tsEpochMs": 1795572000000, "label": "✓ Write race-day plan", "createdAt": 1795572000000,
      "todo": { "id": "t_plan", "role": "done" } }
  ],
  "spans": [
    { "id": "s_plan_1", "startInstantId": "i_plan_start", "endInstantId": "i_plan_done", "label": "Write race-day plan", "visible": true }
  ]
}
```

In this example:

- "Buy race shoes" is unscheduled, with an estimate of 1 hour.
- "Pick up race bib" is scheduled for Dec 12, 3:00 PM, with a reminder at its time.
- "Write race-day plan" was done on Nov 24: 25 minutes on the timeline plus 10 minutes worked
  elsewhere.

## Repeating series

A series is a rule. The app makes its occurrences (ordinary instants) 14 days ahead and keeps
going as days pass. **Write only the series, never its occurrences.**

```json
{
  "groups": [
    { "id": "g_easy_run", "kind": "series", "label": "Easy run 🏃", "time": "06:30",
      "repeat": { "kind": "weekly", "days": [2, 4] }, "alarms": [0], "sound": "tone3", "from": "2026-11-30", "until": "2026-12-12" },
    { "id": "g_stretch", "kind": "series", "label": "Stretch", "time": "21:00",
      "repeat": { "kind": "interval", "every": 2 }, "alarms": [], "from": "2026-11-30", "todo": { "durationMs": 900000 } }
  ]
}
```

| Field | Type | | Meaning |
|---|---|---|---|
| `id` | string | required | Unique (`g_…`). |
| `kind` | `"series"` | required | Always `"series"`. |
| `label` | string | recommended | Each occurrence's name. |
| `time` | `"HH:MM"` | required | Local wall-clock time, 24-hour, such as `"06:30"`. |
| `repeat` | object | required | Either `{ "kind": "weekly", "days": [...] }`, where days are 0–6 and **0 is Sunday** (1 is Monday … 6 is Saturday; weekdays are `[1,2,3,4,5]`, every day is `[0,1,2,3,4,5,6]`), or `{ "kind": "interval", "every": N }`: every N days (1–365), counted from `from`. |
| `alarms` | integer[] | required | Offsets in ms before each occurrence, as for alarms: `[0]` rings at its time, `[600000, 0]` rings 10 minutes before and at it, `[]` has no alarm (a repeating plain instant or todo). |
| `sound` | string | optional | As for alarms. It applies to all of the series' alarms. |
| `from` | `"YYYY-MM-DD"` | required | The first date. |
| `until` | `"YYYY-MM-DD"` | optional | The last date (inclusive). Leave it out for no end. |
| `skips` | `"YYYY-MM-DD"`[] | optional | Dates left out. |
| `paused` | boolean | optional | `true`: no occurrences are made. |
| `collectionId` | string | optional | The group of its occurrences. |
| `todo` | object | optional | Makes it a repeating todo: `{}`, or `{ "durationMs": … }` for an estimate. Each occurrence gets its own todo record, made by the app. |

Leave out `sun` (sunrise and sunset series need the user's location, so make those in the app).

## Groups

Groups are `data.collections`:

```json
{
  "collections": [{ "id": "c_training", "label": "Half marathon training" }],
  "instants": [
    { "id": "i_race", "tsEpochMs": 1797165000000, "label": "Half marathon", "createdAt": 1795741200000, "collectionId": "c_training" }
  ]
}
```

| Field | Type | | Meaning |
|---|---|---|---|
| `id` | string | required | Unique (`c_…`). `"default"` is the Default group; don't list it. |
| `label` | string | required | The group's name, as the user will see it. |
| `hidden` | boolean | avoid | `true` imports the group switched off. |

- Put every instant, todo and series of the file in your group: set `collectionId` on each one,
  including each todo's instants.
- On import, each group goes into the user's group with the same name (ignoring case) or becomes
  a new group. Things with no `collectionId` arrive in a new group called "Imported".
- A group can be switched off as a whole (Agenda › Groups), and deleting it can delete everything
  in it. That's the user's undo for your file.

## Checklist before you hand the file over

1. `format` is `"timeline-clock-backup"`, `version` is `1`, and `data` has `instants` and
   `spans`, even if empty. There is no `settings`.
2. Every time is in ms in the user's zone, with daylight saving right. Read a few of them back
   as local times.
3. Ids are unique within their kind and none starts with `v:`, `sun:`, `dst:` or `season:`.
4. Every span's two instants are in the file, and the start is before the end. Each favorite
   has exactly one span to Now, and nothing else has one.
5. Alarms ring in the future (`tsEpochMs − offsetMs` is after now), unless marked `answered`.
6. Each todo has at most one `at`, which is ahead. Each `todo.id` names a todo in the file.
   Labels follow the ▶ ⏸ ✓ pattern.
7. Series have valid `time`, `from` and `repeat`, and no occurrence instants.
8. Everything carries your group's `collectionId`, and that group is in `collections`.
9. There are no fields beyond the ones in this document.

Hand it over as a `.json` file, named something like `timeline-clock-lisbon-trip.json`. Then tell
the user in a few lines what's in it (how many of what, the group name) and how to import it:
Settings › Data › Import…, Combine.

## A complete file

This example plans a half marathon, in `America/New_York`, written on Nov 26, 2026 at 8:00 PM.
It holds:

- a past training run with its length;
- the race as a countdown, with a warning the day before;
- a repeating run on Tuesdays and Thursdays until race week;
- three todos.

```json
{
  "format": "timeline-clock-backup",
  "version": 1,
  "exportedAt": "2026-11-27T01:00:00.000Z",
  "data": {
    "collections": [{ "id": "c_training", "label": "Half marathon training" }],
    "instants": [
      { "id": "i_run_start", "tsEpochMs": 1795348800000, "label": "Long run", "createdAt": 1795348800000, "collectionId": "c_training" },
      { "id": "i_run_end", "tsEpochMs": 1795354320000, "label": "Home", "createdAt": 1795354320000, "collectionId": "c_training" },
      { "id": "i_race", "tsEpochMs": 1797165000000, "label": "Half marathon 🏅", "createdAt": 1795741200000, "collectionId": "c_training", "favorite": true,
        "alarms": [{ "id": "a_race_1d", "offsetMs": 86400000, "sound": "chime" }, { "id": "a_race", "offsetMs": 0 }] },
      { "id": "i_bib", "tsEpochMs": 1797105600000, "label": "Pick up race bib", "createdAt": 1795741200000, "collectionId": "c_training",
        "todo": { "id": "t_bib", "role": "at" }, "alarms": [{ "id": "a_bib", "offsetMs": 0 }] },
      { "id": "i_plan_start", "tsEpochMs": 1795570500000, "label": "▶ Write race-day plan", "createdAt": 1795570500000, "collectionId": "c_training",
        "todo": { "id": "t_plan", "role": "start" } },
      { "id": "i_plan_done", "tsEpochMs": 1795572000000, "label": "✓ Write race-day plan", "createdAt": 1795572000000, "collectionId": "c_training",
        "todo": { "id": "t_plan", "role": "done" } }
    ],
    "spans": [
      { "id": "s_long_run", "startInstantId": "i_run_start", "endInstantId": "i_run_end", "label": "10 mi", "visible": true },
      { "id": "s_race_now", "startInstantId": "i_race", "endInstantId": "__NOW__", "label": "", "visible": true, "endIsNow": true },
      { "id": "s_plan_1", "startInstantId": "i_plan_start", "endInstantId": "i_plan_done", "label": "Write race-day plan", "visible": true }
    ],
    "todos": [
      { "id": "t_shoes", "label": "Buy race shoes", "createdAt": 1795741200000, "status": "open", "order": 0, "durationMs": 3600000, "collectionId": "c_training" },
      { "id": "t_bib", "label": "Pick up race bib", "createdAt": 1795741200000, "status": "open", "order": 1, "durationMs": 1800000, "collectionId": "c_training" },
      { "id": "t_plan", "label": "Write race-day plan", "createdAt": 1795570500000, "status": "done", "order": 2, "closedAt": 1795572000000, "collectionId": "c_training" }
    ],
    "groups": [
      { "id": "g_easy_run", "kind": "series", "label": "Easy run 🏃", "time": "06:30", "repeat": { "kind": "weekly", "days": [2, 4] },
        "alarms": [0], "sound": "tone3", "from": "2026-11-30", "until": "2026-12-10", "collectionId": "c_training" }
    ]
  }
}
```

The times, in the example's zone (EST, UTC−5):

| Instant | Local time | `tsEpochMs` |
|---|---|---|
| Long run → Home | Sun Nov 22, 7:00 AM → 8:32 AM | 1795348800000 → 1795354320000 |
| ▶ / ✓ Write race-day plan | Tue Nov 24, 8:35 PM → 9:00 PM | 1795570500000 → 1795572000000 |
| Written (`createdAt` of plans) | Thu Nov 26, 8:00 PM | 1795741200000 |
| Pick up race bib | Sat Dec 12, 3:00 PM | 1797105600000 |
| Half marathon | Sun Dec 13, 7:30 AM | 1797165000000 |

---

## Keeping this file current

*This section is for people working on Timeline Clock. If you are writing an import file, you can
ignore it.*

This file describes what the app's import accepts: backup format version 1, checked against app
version 0.9.10. Update it in the same change as anything that alters a backup:

- the envelope (src/domain/backup.ts);
- the sanitizers that read each record (src/domain/entities.ts for instants, alarms and spans;
  todos.ts; series.ts; collections.ts);
- what an import does with the data (store/actions `importBackup`, domain/collections
  `mapImport`).

That includes a new kind of record or field that users would want an agent to write. Every JSON
example here goes through the real importer in src/domain/importSkill.test.ts. Those tests fail
when an example stops importing exactly as written, or when it uses a field the app doesn't know.
