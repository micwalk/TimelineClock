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
* rendering of spans as just rectangles
* first class spans

Done:
* favorite -> span not always working (stars now go through the same favorite path as the label star)
* Snooze name: Snooze 2: Snooze 1: Test Alarm (snoozes are named from the original alarm)
* Settings Screen: glow, how long alarms ring, auto-snooze when unanswered, Test alarm under Dev. Gear lives in the Agenda tab bar.
* SVG rendering of icons (Heroicons)
* reduce usage of Date.now: drawing uses the engine frame's `now`; actions use `engine.sample()`
* Cursor wouldn't snap onto a newly created instant (focus-history bug) + taps ignored after a touch drag
