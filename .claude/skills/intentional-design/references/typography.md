# Typography

Type carries most of the information in most interfaces, so it is also where "generic" is decided. This file covers building a scale, choosing families, and the numeric decisions `SKILL.md` leaves open.

`SKILL.md` sets the rule (one family unless the direction calls for a pairing, a limited set of steps, contrast from the absolute standards). This is how to execute it.

---

## Build the scale before writing components

Pick a base size from the direction, then generate steps by ratio and round to whole pixels. Store them as tokens; never type a font size inline.

| Direction | Base body | Ratio | Typical steps |
| --- | --- | --- | --- |
| Operational console, records workspace | 13–14px | 1.15–1.2 | 5–6 |
| Consumer app, general product UI | 15–16px | 1.2–1.25 | 6 |
| Editorial, documentation | 17–19px | 1.25–1.333 | 7 |
| Marketing, art-directed | 16–18px body, display steps set by hand | 1.333+ | 6 plus display |

Rules that hold across all of them:

- Six steps covers almost every interface. If you need a seventh, check whether two existing steps are doing the same job.
- Do not scale below 12px for anything a user must read. Below that, legibility is gone regardless of contrast.
- Display sizes are chosen by eye, not by ratio. A hero number or headline is allowed to break the scale if it is the only element doing so.
- One metric exception: a single hero statistic may be many times the supporting text. Keep the unit at supporting size and align optically.

## Weight and case

- Two or three weights, maximum. Regular for body, one heavier for headings and emphasis, optionally one lighter for large display only.
- Hierarchy comes from size and weight before it comes from color. Graying text to signal secondary status has a contrast cost; check it.
- Semibold at small sizes reads better than bold in most UI faces.
- All-caps only for short labels, with letter-spacing added — but note that caps-plus-tracking eyebrow labels above headings are a template tell. If you use caps, use them for column headers and status chips, not as decoration.
- Never fake weights or italics with CSS synthesis. Load the real cut or do not use it.

## Line height and measure

- Body text: 1.45–1.65. Denser interfaces sit at the low end, editorial at the high end.
- Headings: 1.1–1.25. Large display can go tighter, but check descenders on two-line headings.
- UI labels and single-line controls: 1.2–1.4, and set explicitly so buttons do not inherit body spacing.
- Reading measure: 60–75 characters. Set it with `max-width` in `ch` so it survives font changes.
- Table cells and dense lists have no measure constraint but do need consistent alignment.

## Choosing families

The safe default is one well-made sans used across the whole interface, with the scale and weights doing the work. That is a legitimate choice and not a failure of imagination.

A second family is justified when:

- The direction is editorial or brand-forward, and the pairing is part of the argument.
- The interface has both reading content and dense UI, and they want different treatment.
- Numbers need a tabular or monospaced face that the text face lacks.

When pairing: pair across categories, not within. A serif with a sans works; two humanist sans faces fight. Match x-height and apparent size, then set the sizes so they look equal rather than measure equal.

On defaults: the widely used geometric and neoprene sans faces are not bad, but shipping one without a decision is one of the clearest tells. If you use a default UI face, say in the direction that you chose it and why — legibility at 13px, wide language coverage, licensing.

**System stacks** are correct for consumer and mobile products where a font download is a real cost:

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text",
             "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```

**Monospace** for identifiers, hashes, code, and log output. Use it because the content is code-like, not because it looks technical.

## Numbers

- Tabular figures for anything in a column, a table, or a live-updating readout. `font-variant-numeric: tabular-nums`.
- Proportional figures in running prose.
- Consistent decimal places within a column. Alignment is on the decimal point.
- Units get their own smaller size and lighter weight, and never wrap away from the number.
- Do not truncate significant digits to fit; change the layout or abbreviate the scale with a label.

## Loading

- Self-host or use a first-party CDN, subset to the characters you need, and preload the one face used above the fold.
- `font-display: swap` for body text; `optional` for decorative display faces where a swap would be jarring.
- Define the fallback stack so metrics are close. A large metric shift on load is a layout jump, which is a usability defect and not a style question.
- Variable fonts are worth it when you use three or more weights.

## Failure modes specific to type

- A scale that exists in tokens but is bypassed with inline sizes in half the components.
- Headings distinguished only by color, so hierarchy disappears in high-contrast mode.
- Body copy at 14px in an editorial context because the component library defaulted to it.
- Line-height inherited into buttons and inputs, making them taller than intended.
- Placeholder text used as the label, then styled at low contrast — this breaks two absolute standards at once.
- Gradient-filled or outlined headline text.
- Letter-spacing applied to body text. It belongs on caps and large display only.
- Two typefaces chosen for variety, then used interchangeably so neither has a job.
