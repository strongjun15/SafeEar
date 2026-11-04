# Application screen checklist

For dashboards, consoles, records workspaces, and any screen inside a product people use repeatedly. The general checklist in `SKILL.md` still applies.

The failure mode here is not ugliness — it is a screen that looks organized and does not support the actual task.

## The task

- [ ] You can state the user's job on this screen in one sentence, and the layout follows from it.
- [ ] The first thing the eye lands on is the thing the user came for.
- [ ] The primary action is reachable without scrolling, on the smallest supported viewport.
- [ ] Frequency drives prominence: what is done daily is one click away; what is done yearly can be buried.
- [ ] Nothing on the screen exists because the layout had a gap.

## Dashboards specifically

- [ ] Each metric answers a question the viewer actually arrives with. Metrics chosen because they were available are removed.
- [ ] The health question — is anything wrong, and where — is answerable before any chart is read.
- [ ] Every figure carries units, a time range, and a freshness indicator.
- [ ] Charts share one color logic and one scale convention across the screen.
- [ ] Chart data is also available as text or a table.
- [ ] Comparison is possible where it matters: previous period, threshold, or target shown alongside the number.
- [ ] The tile grid is not four across because four across looks tidy.

## Tables and lists

- [ ] Columns are ordered by what people scan first; identity leftmost.
- [ ] Numbers right-aligned, tabular figures, consistent decimals.
- [ ] Sorting, filtering, and column choices persist across reloads and are reflected in the URL where linkable.
- [ ] Row actions are reachable by keyboard, not hover-only.
- [ ] Long values truncate with a way to see the full value; nothing important is silently cut.
- [ ] Selection state is unambiguous, and bulk actions say how many items they affect.
- [ ] Pagination or virtualization matches how people find records again.

## States

Verified in the running product, not in a mock:

- [ ] Empty — explains what belongs here and how to add it, with the action present.
- [ ] First run — differs from empty; a new account is not a broken account.
- [ ] One item, and thousands of items.
- [ ] Loading — skeleton shaped like the incoming content, announced to assistive technology.
- [ ] Partial failure — one widget fails while the rest of the screen still works.
- [ ] Error — specific, adjacent to the cause, with a retry path.
- [ ] Permission-limited — a user who cannot do something sees why, not a dead control.
- [ ] Stale data — the user can tell the difference between old and current.

## Content resilience

- [ ] Long names, long email addresses, and long numbers do not break the layout.
- [ ] Text that will be translated has room to grow; nothing is sized to an English string.
- [ ] Dates, times, currencies, and numbers are formatted for the locale, with time zones stated.
- [ ] Zero, negative, and null render deliberately — not as an empty cell that reads as a bug.

## Interaction

- [ ] The whole primary flow is completable with the keyboard.
- [ ] Destructive actions are confirmed or undoable, and the confirmation names the specific item.
- [ ] Nothing important lives only behind hover.
- [ ] Forms follow `references/accessibility.md`.
- [ ] Motion is within the budget for this direction; in an operational context that usually means almost none.

## System

- [ ] Every spacing, radius, color, and duration value comes from tokens.
- [ ] Existing components were reused; new ones were added only where nothing fit.
- [ ] Density matches the rest of the product — this screen does not look imported.
- [ ] One containment treatment per surface. Not border plus shadow plus tint.
- [ ] Dark mode, if supported, was built and checked rather than inverted.

## Final

- [ ] Accessibility pass from `references/accessibility.md` was actually run, and you can list which checks.
- [ ] Every deviation from a conditional default has a written reason.
- [ ] Someone who does this job daily would not need to be told where anything is on the second visit.
