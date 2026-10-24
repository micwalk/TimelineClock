# Twilight times — proposal

**Status (2026-10-24): proposed, not built** (GitHub #31). Waiting on the owner's go-ahead (Key Principle 10).

Civil (−6°), nautical (−12°) and astronomical (−18°) twilight, at dawn and at dusk: six more
times a day near each sunrise and sunset. The concern is chip clutter: with all of them as chips,
up to 8 chips sit within about 90 minutes at each end of the day. And no new series or groups:
the twilights should ride on what sunrise and sunset already have.

## 1. Engine: widen `SunEvent`

`sunDay` (domain/sun.ts) already computes all six crossings for the sky gradient; sunrise and
sunset are the same crossing at −0.833°. So twilights are more values of the existing type, not a
parallel system:

```ts
type SunEvent = 'astronomicalDawn' | 'nauticalDawn' | 'civilDawn' | 'sunrise'
              | 'sunset' | 'civilDusk' | 'nauticalDusk' | 'astronomicalDusk'
```

Everything keyed on `SunEvent` then covers them with no other change:

- virtual instants (`sun:civilDusk@<ms>`), held by a tap, kept with their `sun` anchor (`isAtSun`)
- an alarm on one follows that crossing; ⟳ makes a sun series anchored to it ("civil dusk daily")
- the Alarm picker can take "civil dusk" (`parseSunWord`)
- `settings.sunEvents` (which events show) just holds more values
- one visibility group (`SUN_GROUP`): one zoom strip for all of it
- names in config/labels ("Civil dusk", …)

Polar days: a crossing may not happen (astronomical twilight never ends in June above ~48°N);
the code already treats a missing time as `null` ("—").

## 2. Timeline: twilight on demand, as implied spans

Twilight is a period, so show it as the app's **implied spans** (temporary, from context), only
while a sunrise or sunset is **selected or focused**:

- **One lane** from the sunset to the deepest twilight enabled (civil by default), with the other
  crossings as **Marks** (short axis lines, no chip) along it. The lane chip names it and its
  length ("Civil twilight 28m"). Sunrise mirrors it: the lane runs from dawn into the sunrise.
- No chips: nothing joins the chips' overlap layout, so nothing crowds.
- Zoom gating comes for free: zoomed out a half-hour lane is a few pixels and lane labels fold or
  drop (labelGroups). If that isn't enough, show it only below ~1 day on screen.
- A tap on a Mark holds that crossing as a virtual instant (alarm, ⟳), as a tap on a sunset chip
  does today.
- Deselect and it is gone: nothing stored, the default timeline unchanged.

Alternative considered: three nested lanes (civil, nautical, astronomical), the way a
stopwatch's laps sit inside its whole run. More to read at a glance, more clutter; start with one
lane and Marks.

## 3. Always-on, for those who want it

The Groups tab's Sunrise and Sunset rows become one **Sun** row (keeping the part-of-day reading:
"since sunset 2h · sunrise in 9h"). Its sliders open, besides the zoom strip, mirrored toggles
for which crossings show:

```
Astro · Nautical · Civil · [Sunrise]  …  [Sunset] · Civil · Nautical · Astro
```

Twilights default **off**. Switched on, a twilight shows as a **Mark only** (never a Label), so
even always-on it adds no chips; selecting its sunset still shows the lane. Possibly a dimmer
`--c-sun` tint for twilight marks so sunrise and sunset stay the brightest.

## Open questions

- One lane plus Marks, or three nested lanes?
- Selected only, or also focused? (Proposed: both, like the other implied lanes.)
- Should the Sun row's reading follow the finest twilight switched on ("civil dusk in 12m")?
