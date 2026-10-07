Next ideas to implement:

Planned work is written up in [docs/handoffs/](docs/handoffs/): layout v2 (vertical layout,
gestures, label overlap, Agenda dock/drawer, cursor arrow) and everything else.

Bugs:
* (none open)

Feature Level (Ready to Implement)
* Alarm: fix off screen (what?!)
* editing
* Better infinite zoom (heights of bars)
* Snap cursor to timeline ticks (option)

Not sure yet, but needs improvement
* Step increments configurable in Settings (choose which steps the ± buttons offer) plus a 'Custom…' option to type any step
* rendering of spans as just rectangles
* first class spans
* Orientation switch animation: labels hide, the timeline and instant lines rotate into the
  new orientation, then labels reappear.
* Wider spans like a traditional calendar view (e.g. a named span such as 'beach' drawn as a block)
* Scroll the view without moving the cursor or changing selection/focus (a real "just looking" mode; hiding the cursor, done, is the minimal version)
* Horizontal on a landscape phone: many saved lanes still make the timeline taller than the screen; cap the lanes by the room and fold the rest
* Morph Now's drops too (the big ＋ and double-tap on the Now tag), like the Cursor ＋

Done:
* Cursor ＋ morphs into the new instant's chip with its name open, and back (replaces the "genie" save animation idea)
* Hide the cursor: the Cursor tag folds into its arrowhead
* Chips glide (springs) instead of jumping; crowded span names fold into "N spans"; spans that follow each other share a lane
* Performance pass: camera-style world layer for lines, chip geometry per frame, no layout reads in frames
* favorite -> span not always working (stars now go through the same favorite path as the label star)
* Snooze name: Snooze 2: Snooze 1: Test Alarm (snoozes are named from the original alarm)
* Settings Screen: glow, how long alarms ring, auto-snooze when unanswered, Test alarm under Dev. Gear lives in the Agenda tab bar.
* SVG rendering of icons (Heroicons)
* reduce usage of Date.now: drawing uses the engine frame's `now`; actions use `engine.sample()`
* Cursor wouldn't snap onto a newly created instant (focus-history bug) + taps ignored after a touch drag
