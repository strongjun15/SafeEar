# Design direction template

Fill this before writing any UI code. Keep it under ten lines of actual content — it is a decision record, not a document. Paste it into the PR description or the top of the stylesheet so the next person inherits the reasoning.

If the project already has a design system, the direction is "extend the existing system"; fill only the deviations section.

---

```markdown
## Design direction

Audience & context: <who, on what device, how often, under what pressure>
Purpose: <the one job of this screen, and the one action or understanding it produces>
Character: <three adjectives> · density <dense|balanced|airy> · deliberately not <adjective>
Layout: <named strategy> because <reason tied to the user's task>
Type: <family or families> · <n> steps from <base>px · body line-height <x> · measure <n>ch
Color: <n> neutral steps, <n> accent, <n> semantic · accent reserved for <what> · <n> hues on screen
Interaction & a11y: <input modality> · states needed: <list> · motion budget: <level> · specific requirements: <e.g. keyboard-only operation, forced-colors support>

Deviations from defaults:
- <conditional default overridden> — <reason>

Signature move: <the one thing a user would remember>
```

---

## Worked example

```markdown
## Design direction

Audience & context: support engineers triaging alerts, desktop, all day, under time pressure
Purpose: decide within seconds whether an alert needs action, and act without leaving the row
Character: dense, quiet, keyboard-first · density dense · deliberately not welcoming
Layout: table plus inspector, because operators compare across rows and edit one at a time
Type: one sans, 6 steps from 13px, body line-height 1.45, no measure constraint (tabular)
Color: 10 neutral steps (cool), 1 accent (amber, acknowledge action only), 4 semantic · 3 hues on screen
Interaction & a11y: keyboard primary, pointer secondary · states: hover, focus, selected, disabled, loading, empty, error · motion budget near zero · full operation without a mouse, forced-colors supported

Deviations from defaults:
- Radius 2px rather than the system's 8px — the row grid reads as a table, not as cards
- Zebra striping enabled — rows exceed 12 columns and tracking across them fails without it

Signature move: every row action has a single-key shortcut shown on hover and in the palette
```

---

## Filling it well

**Audience & context** is the field people skip and the one that determines everything else. "Engineers" is not an answer. "Engineers who are already annoyed, on their second screen, at 3am" is.

**Character** must include the negative. Three positive adjectives describe almost any interface; the fourth field is what makes it a choice.

**Layout** must name a strategy from `references/layout-strategies.md` or a new one described in the same terms. "Responsive grid" is a technique, not a strategy.

**Type and Color** are counts and roles, not tastes. If you cannot state the number of steps and hues, the system does not exist yet.

**Deviations** is the field that makes the conditional defaults in `SKILL.md` workable. An empty deviations list is fine and common. An unwritten deviation is the failure.

**Signature move** is the anti-template test. If you cannot name it, or if it would fit any competitor equally well, go back to `references/design-directions.md` and run the substitution test.
