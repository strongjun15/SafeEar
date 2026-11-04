---
name: intentional-design
description: Design and review user interfaces that look built for a specific product rather than generated from a template. Use when creating or restyling any UI — landing pages, dashboards, app screens, components, design systems, marketing sites — when choosing colors, typography, spacing, layout, or motion, and when someone asks for design that is less generic, more distinctive, more accessible, or "not AI-looking". Requires a stated design direction before implementation.
---

# Intentional Design

Generated interfaces converge because the model reaches for the same defaults every time: indigo gradient, centered hero, three equal cards, everything rounded, everything shadowed. The fix is not a different set of defaults. It is deciding the direction first, then holding it consistently.

Two tiers of rules follow. **Absolute standards** are never traded away. **Conditional defaults** are the sensible starting point for most products and may be broken when the direction gives a reason — written down, in one sentence.

## When this applies

- Building, restyling, or reviewing anything a user sees.
- Choosing color, type, spacing, radius, elevation, iconography, or motion.
- Requests like "make this look good", "less generic", "more polished", "design a landing page".

## When it does not apply

Backend, infrastructure, data modeling, and copy (use a writing skill for copy). Do not restyle a screen you were asked to fix a bug in.

Building or restyling? Start at Step 1. Auditing an interface that already exists? Skip to Review mode.

## Step 1 — Design direction, before any code

Write these seven lines first and put them in your output. Under ten lines total. If the codebase already has a design system, the direction is "read and extend it" — record only where and why you deviate.

Use `templates/design-direction.md` for the fill-in form and a worked example. Stuck on what a direction even looks like, or want a starting point to adapt? `references/design-directions.md` has nine of them with their constraints already worked out.

1. **Audience and context.** Who uses it, on what device, how often, under what pressure. Six hours a day at a desk is a different product from thirty seconds on a phone.
2. **Purpose.** The one job this screen does, and the one action or understanding it should produce.
3. **Visual character.** Three adjectives plus a density call (dense/balanced/airy). Add a line naming what it is deliberately *not*.
4. **Layout strategy.** Name the structure: master–detail, table with inspector, single-column editorial, canvas with floating controls, form wizard. "Hero plus three cards" is only valid if you can say why this product needs it. Choosing between structures, or tempted by the default? `references/layout-strategies.md` lists the named alternatives and the three conditions under which the default is correct.
5. **Typography.** Family or families, the size steps you will use, line-height for body and headings, measure for reading text. Building a scale, pairing two families, or setting numeric type? Read `references/typography.md` first.
6. **Color system.** Roles before hues: surface, raised surface, border, primary text, secondary text, one accent, semantic success/warning/danger. Say how many hues exist in total. Building ramps, a dark theme, or chart colors? Read `references/color-systems.md`. `templates/tokens.css` is a role-named scaffold to copy and fill.
7. **Interaction and accessibility.** Input modality, which states you must design, motion budget, and any specific requirement (keyboard-only operation, screen-reader flows, contrast target above the floor, reduced-motion behavior). Setting the motion budget or choosing durations? `references/motion.md`. Implementing or verifying any of the absolute standards? `references/accessibility.md`.

Then build. Every later decision cites one of these lines or is a mistake. Close the work by restating the direction, listing deviations with their reasons, and naming the accessibility checks you actually ran.

## Absolute standards

Never overridden, by the direction or by the user's stylistic preference. If a request conflicts, say so and offer the nearest compliant option. `references/accessibility.md` is how each one is implemented and, more importantly, how it is checked.

- Text contrast at least 4.5:1; large text, icons, and control boundaries at least 3:1.
- Every keyboard-reachable control has a visible focus indicator. Never remove an outline without replacing it.
- Touch targets at least 44×44px; pointer targets large enough to hit without care.
- Semantic elements and real labels. A placeholder is not a label.
- Color is never the only carrier of meaning — pair it with text, icon, or shape.
- `prefers-reduced-motion` is honored.
- Transitions name their properties. Never `transition: all`.
- Every interactive surface has designed hover, focus, active, disabled, loading, empty, and error behavior. "We didn't consider it" is the failure.
- The layout survives real data: long strings, zero rows, one row, thousands of rows, a failed request, a slow network.
- No fabricated proof. No invented metrics, testimonials, customer logos, ratings, avatars, or user counts — ever, including in demos.

## Conditional defaults

Good for most products. Break any of them with a one-line reason tied to the direction.

- One focal point per view. If three things are equally loud, none is.
- All spacing from one scale. Grouping comes from proximity; space inside a group is smaller than space between groups.
- One type family, weight and size doing the work. A second family is a decision, not a default.
- The accent color belongs to the primary action. Everything else is neutral or semantic.
- One container treatment per surface: border, or shadow, or background tint, or nothing. Not three at once.
- Nested radii: inner radius equals outer radius minus the padding between them.
- Motion animates opacity and transform, on a timing band chosen once and reused.
- Reuse an existing component before building a new one. Consistency beats a locally better idea.
- Real content in mockups. Real product names, plausible lengths, actual numbers where you have them.

## Anti-patterns

Each is checkable by pointing at an element.

**The template**
- Indigo-to-violet gradient hero, gradient text, gradient button fills.
- Centered hero → three equal feature cards → logo strip → three pricing tiers → FAQ accordion → repeated CTA, in that order, regardless of product.
- A "Trusted by" row with no real customers behind it, or metric tiles holding invented numbers.
- A dashboard shipped as four KPI tiles, one line chart, and a table, chosen without asking what the user does there.
- Marketing hero sections inside internal tools.
- Placeholder copy — lorem ipsum, "Your Company", "Feature One" — surviving past the wireframe.

**Surface and shape**
- Glassmorphism and backdrop blur on panels with nothing meaningful behind them.
- One large radius applied to everything; pill buttons as the default shape.
- Detached floating sidebar with rounded shell and drop shadow.
- Shadow and border and radius and hover lift and gradient on the same element.
- Decorative blobs, aurora washes, grid overlays, and noise that organize nothing.
- Whitespace inflation as a premium signal: 200px section padding in a tool someone uses all day.

**Interaction**
- Scale or translate on card hover; scroll-reveal on every section; entrance animation on page load.
- Animation on a property that triggers layout (width, height, top, padding).
- Icon-only navigation with no labels and no tooltips, beyond the few universal glyphs.
- Three or more calls to action at equal weight.
- Empty states that say "No data" and nothing else.

**System**
- Mixed icon sets in one screen; emoji standing in for product icons.
- Hard-coded one-off values sitting next to a token scale.
- A colored top-border accent added to an already-rounded card.

## When a "banned" pattern is right

State the reason in your output; do not use these as blanket permission.

- **Gradient** — the brand identity is a gradient; a data-visualization scale; a low-opacity depth cue on a large surface. Not on small controls or text.
- **Glass and blur** — an overlay above real content the user should still perceive: media controls, map chrome, a mobile sheet, an OS-style palette.
- **Rounded cards everywhere** — the existing design system already does it. Match it.
- **KPI-first dashboard** — the user's actual job is monitoring those numbers. Then the numbers must be real and the layout ordered by how they are used.
- **Centered hero** — a single-purpose page with exactly one action.
- **"Trusted by"** — the customers are real, named, and have agreed to appear.
- **Placeholder copy** — an explicitly labeled wireframe or low-fidelity mock. Label it in the output.
- **Maximalism, neon, big radii, art direction** — the direction from Step 1 calls for it and holds it consistently.
- **Serif and sans together** — editorial, brand, or marketing surfaces where the contrast is the point. Operational tools stay on one family.

Nothing in the absolute list is available for exception, and fabricated proof is never justified.

## Review mode

When auditing existing UI rather than building it:

1. Reconstruct the direction from what is on screen. If you cannot name the audience, purpose, and character, that is the primary finding.
2. List findings as: element → which rule it breaks → the smallest fix.
3. Separate absolute violations (fix now) from conditional ones (fix or justify).
4. Do not restyle wholesale. Changing everything hides which change mattered.

Run `checklists/landing-page.md` or `checklists/app-screen.md` depending on the surface — they carry the questions specific to persuasion pages and to screens people use daily.

## Self-review

- [ ] The seven direction lines exist and the build matches them.
- [ ] Contrast, focus indicators, target sizes, labels, and reduced-motion all verified — not assumed.
- [ ] Hover, focus, active, disabled, loading, empty, and error are designed for every interactive surface.
- [ ] Tested against long text, zero items, and an error state.
- [ ] One focal point; the reading order is traceable.
- [ ] Every color has a role; the accent marks the primary action.
- [ ] Every spacing and radius value comes from the scale.
- [ ] One container treatment per surface.
- [ ] Nothing on screen is decoration you cannot justify. Delete one element and check whether anything breaks.
- [ ] No fabricated numbers, logos, testimonials, or placeholder copy outside a labeled wireframe.
- [ ] Every deviation from a conditional default has its written reason.
- [ ] Checked at roughly 375px, 768px, and 1280px+ — reorganized, not just shrunk.

Building a marketing page or an application screen? Finish with the matching checklist in `checklists/` — each adds the questions this general list cannot cover.

## Files

Load on the stated condition. None of them is needed for a small styling change.

| Path | Read it when |
| --- | --- |
| `references/design-directions.md` | You need a direction, or a starting point to adapt. |
| `references/layout-strategies.md` | You are choosing a structure, or the default is tempting. |
| `references/typography.md` | You are building a type scale, pairing families, or setting numbers. |
| `references/color-systems.md` | You are building ramps, a dark theme, or chart colors. |
| `references/motion.md` | You are setting a motion budget or choosing durations. |
| `references/accessibility.md` | You are implementing or verifying the absolute standards. |
| `templates/design-direction.md` | You are writing the Step 1 direction. |
| `templates/tokens.css` | The project has no token file yet. |
| `checklists/landing-page.md` | The surface is a marketing or persuasion page. |
| `checklists/app-screen.md` | The surface is a dashboard, console, or app screen. |
| `scripts/ui_lint.py` | You want the literal tells counted before you review. |

`python scripts/ui_lint.py src/` scans CSS, HTML, and component files for countable patterns: `transition: all`, layout-property transitions, removed focus outlines, gradients, backdrop blur, large radii and shadows, hard-coded colors, click handlers on non-buttons, images without alt text, placeholder copy, and unverified proof claims. It reports findings with a note on when each is legitimate, prints no score, and takes `--json`, `--strict`, and `--cap`. It cannot see hierarchy, layout fit, or whether a number on the page is true.

## Acknowledgements

Researched from the projects below. Principles were synthesized and rewritten; no rule text, banned-pattern list, scoring rubric, or numeric spec table was copied. All three are MIT-licensed, which permits reuse with attribution. This skill is an independent work informed by them, not a derivative of their text.

- [rwcod/anti-ai-slop-ui](https://github.com/rwcod/anti-ai-slop-ui) — MIT, © 2026 rwcod. Establishing visual direction and tokens before implementation, and treating layout strategy as an explicit choice.
- [LeoStehlik/no-slop-ui](https://github.com/LeoStehlik/no-slop-ui) — MIT, © 2026 Leo Stehlik. Restraint as the baseline for operational software, and naming visual tells concretely enough to check.
- [arez-xd/ux-ui-design-taste](https://github.com/arez-xd/ux-ui-design-taste) — MIT, © 2026 Adam Reznik. Density and personality as dials set from product context, hierarchy and state coverage as review criteria.

These sources disagree in places — one treats restraint as the goal, another treats distinctiveness as the goal, and their typography rules conflict outright. That disagreement is resolved here by the absolute/conditional split: accessibility and honesty are fixed, and visual bans hold only until the design direction gives a reason to lift them.
