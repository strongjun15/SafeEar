# Design direction library

Step 1 of `SKILL.md` asks for a direction. A direction is not a mood board word — it is a set of constraints tight enough that two people building from it produce similar screens.

Pick one, adapt it, or write your own using the same fields. Never ship "modern and clean"; that is the absence of a direction.

Each entry below gives the constraints that follow from the direction. Where a constraint conflicts with a conditional default in `SKILL.md`, the direction wins and the reason is already written for you.

---

## Operational console

**For:** engineers, analysts, operators who live in the tool all day and know the domain.
**Character:** dense, quiet, keyboard-first. Deliberately not welcoming — familiarity beats onboarding.
**Constraints:** neutral surfaces with a single accent reserved for the primary action; borders rather than shadows; radius small or none; text 13–14px with tabular numerals; row height tight; no page-level hero; every list has a keyboard path; empty states explain the filter, not the product.
**Signature move:** the command palette and the shortcut hints beside menu items.
**Fails when:** the audience is occasional. Density without familiarity reads as hostile.

## Records workspace

**For:** people who create, edit, and retrieve structured records — CRM, admin, back office.
**Character:** clerical and legible, comfortable for eight-hour use.
**Constraints:** master–detail or table-plus-inspector layout; one accent for save/submit; semantic color only for record state; generous field labels above inputs, never placeholder-as-label; validation inline and specific; table sorting and column visibility persisted.
**Signature move:** an inspector panel that keeps context while editing.
**Fails when:** treated as a marketing surface. Hero sections and gradients here waste the fold.

## Focused instrument

**For:** one task done repeatedly — an editor, a terminal, a diffing tool, a drawing surface.
**Character:** the canvas is the interface; chrome retreats.
**Constraints:** controls at the edges or in overlays; the working surface is the largest and quietest area; toolbars monochrome until hover or active; state shown in a status bar rather than in dialogs; motion near zero except direct manipulation feedback.
**Signature move:** chrome that fades while the user works and returns on intent.
**Fails when:** the task is exploratory rather than repeated — new users need visible affordances.

## Monitoring surface

**For:** someone answering "is it healthy, and if not, where."
**Character:** scannable at a glance from across a room, precise on inspection.
**Constraints:** status hierarchy first — the worst thing on the page is the loudest; charts share one scale and one color logic; semantic colors carry meaning and are paired with shape or text; timestamps and units always visible; auto-refresh state is explicit.
**Signature move:** a single top strip that answers the healthy/unhealthy question before any chart is read.
**Fails when:** built as KPI tiles chosen for symmetry rather than for the question the viewer arrives with.

## Editorial

**For:** readers. Documentation sites, essays, research write-ups, long-form marketing.
**Character:** typographic, calm, paced.
**Constraints:** measure 60–75 characters; a real type scale with heading contrast; generous vertical rhythm; images full-measure or wider, never floated small; one accent used for links only; serif and sans pairing is legitimate here; a persistent table of contents beyond about 1,500 words.
**Signature move:** typography doing the work with almost no other decoration.
**Fails when:** applied to a tool. Reading measure and airy rhythm waste screen space in operational software.

## Utility product page

**For:** a buyer evaluating a technical product in three tabs.
**Character:** direct, evidence-led, sparse.
**Constraints:** the first screen states what it does and shows it — a real screenshot, a real command, a real code block; proof is specific and true or absent; pricing legible without a modal; one primary action repeated, not five competing ones; no logo wall unless the logos are real and cleared.
**Signature move:** the product itself above the fold instead of an illustration of it.
**Fails when:** the product is emotional rather than technical, where demonstration matters less than feeling.

## Consumer app

**For:** intermittent users on a phone, often distracted.
**Character:** warm, forgiving, obvious.
**Constraints:** one primary action per screen; targets well above the minimum; system fonts for reliability; motion that explains navigation direction; destructive actions confirmed and reversible; empty and first-run states designed as carefully as the loaded state; offline and slow-network states real, not spinners.
**Signature move:** the first-run path treated as a designed screen rather than an empty version of the main one.
**Fails when:** density is the actual requirement, as in professional mobile tools.

## Brand-forward marketing

**For:** an audience being persuaded, where feeling is part of the argument.
**Character:** art-directed. This is where personality is the point.
**Constraints:** commit to a real position — a distinctive typeface, an unusual grid, a restricted and unexpected palette, motion with intent. Then hold it on every section. Accessibility floor still applies without exception: contrast, focus, reduced-motion, real labels.
**Signature move:** whatever the one memorable thing is. If you cannot name it in a sentence, the direction is not set.
**Fails when:** the personality lives only in the hero and the rest reverts to defaults.

## Data-dense report

**For:** analysts reading tables and charts, often printing or exporting.
**Character:** typographic and quiet, print-adjacent.
**Constraints:** tabular numerals, right-aligned numbers, consistent decimal places; one chart color logic across every figure; captions and units on every figure; zebra striping only where rows are hard to track; no interaction required to read the primary content; print stylesheet considered.
**Signature move:** figures that survive being screenshotted into a document.
**Fails when:** the user needs exploration rather than reading — then it is a monitoring surface.

---

## Writing your own

Fill the same fields. The direction is finished when you can answer all of these without hedging:

- Who is on the other side, and what are they in the middle of?
- What is the one thing this screen must do?
- Three adjectives, plus one adjective it is deliberately not.
- Density: dense, balanced, or airy — and why.
- Personality: quiet, distinctive, or art-directed — and why.
- Which conditional default in `SKILL.md` does this direction override, and for what reason?
- What is the signature move a user would remember?

Two checks before you build:

1. **Substitution test.** Swap in a competitor's name and logo. If the design still fits them exactly, it is not a direction, it is a template.
2. **Opposite test.** State the opposite direction. If the opposite is obviously absurd ("hard to read", "slow"), you wrote a quality bar, not a direction. A real direction has a defensible opposite.
