# Color systems

`SKILL.md` sets the rules: roles before hues, one accent on the primary action, contrast floors that are never traded away, and color never carrying meaning alone. This file is how to build the system that satisfies them.

---

## Roles first

Name the roles, then assign hues. A system with fewer roles and consistent use always reads more intentional than a large palette applied loosely.

Minimum viable set:

- `bg` — the page ground
- `surface` — raised or inset panels, cards, menus
- `border` — separators and control outlines
- `text` — primary reading color
- `text-muted` — secondary, still above the contrast floor
- `accent` — the primary action, and only that
- `accent-contrast` — text drawn on the accent
- `success`, `warning`, `danger`, `info` — semantic states
- `focus` — the focus indicator, which may be the accent but must be visible on every surface it lands on

Anything beyond this needs a reason. Chart series are the common legitimate addition; see below.

## Building the ramps

Work in a perceptual space (OKLCH or LCH) so that steps look evenly spaced rather than measuring evenly spaced.

1. **Neutrals.** Build 9–11 steps from near-white to near-black. Give them a slight temperature — a few percent of the accent's hue, or a deliberate warm or cool cast. Fully desaturated grays are the visual equivalent of an unset default.
2. **Accent.** Choose the hue from the direction, not from habit. Build 5–7 steps: subtle background tint, hover tint, border, base, hover, active, and a text-safe dark step.
3. **Semantics.** Do not reuse the accent for success or info if the accent is already the action color — a user cannot tell "clickable" from "healthy". Build each semantic with at least three steps: tint background, border, and text-safe.
4. **Charts.** A categorical set is a separate problem. Order it so adjacent series differ in lightness as well as hue, cap it at 6–8, and check it against the common color-vision deficiencies. Sequential and diverging scales are separate again; do not build one from the categorical set.

## Contrast

The floors in `SKILL.md` are absolute: 4.5:1 for text, 3:1 for large text, icons, and control boundaries. Beyond meeting them:

- Check the pairs you actually ship: muted text on surface, accent text on accent background, semantic text on semantic tint, placeholder on input, disabled on surface, focus ring on every surface it can appear over.
- Disabled controls are exempt from the text floor in the specification but still need to be perceivable. Reduce opacity and add a non-color signal rather than fading to invisibility.
- Contrast against the *adjacent* color, not against white. A border between two mid-tone surfaces is the case people miss.
- A white-on-accent button that passes at 16px may fail at 13px. Check at the size you use.

## Dark mode

A dark theme is a second system, not an inversion.

- Elevate with lighter surfaces, not shadows. Shadows are nearly invisible on dark grounds.
- Reduce saturation of the accent; a hue that reads correct on white will vibrate on near-black.
- Never use pure black as the ground or pure white as text. Both cause halation at normal brightness.
- Semantic hues need separate values — the light-mode danger red usually fails contrast on dark.
- Images and screenshots need a treatment: a border, a subtle scrim, or a dark-mode variant. Bright screenshots on a dark page are the loudest thing on screen.
- Test both themes at the same time in the same session. Bugs live in the theme you built second.

## Using color as signal

- The accent belongs to the primary action. If it also appears on links, active nav, chart series, and section headings, it has stopped carrying meaning.
- Semantic color is for state, not for category. Green for "one of our product tiers" trains the user wrong.
- Pair every semantic color with text or an icon shape. A red dot alone is invisible to a meaningful share of users and ambiguous to everyone else.
- Selection reads most clearly as an inversion or a solid tint, not as a thin colored border.
- Hover changes should be perceptible without being loud: one step on the ramp, not a hue change.

## Palette failure modes

- Indigo-to-violet as the entire identity, with a gradient standing in for a color system.
- Twelve accent shades, six of them used once.
- A "brand color" that fails contrast, then gets darkened per component until three versions of it exist.
- Semantic colors chosen from a framework's defaults while the neutrals are custom, so the two systems do not share a temperature.
- Charts colored by picking pleasant hues one at a time, producing a set with no lightness ordering.
- Hard-coded hex values scattered next to a token file.
- Opacity used to make text lighter. It changes contrast unpredictably over different surfaces; use a defined color step.
- Light and dark themes that share a single accent value.

## Recording the decision

In the design direction, write the palette as roles with counts, not as a list of pretty colors:

```
Neutrals: 10 steps, warm-shifted 4% toward the accent hue.
Accent: one, teal, used for primary action and focus only.
Semantics: four, each with tint / border / text steps.
Charts: 6 categorical, lightness-ordered, CVD-checked.
Total hues on screen at once: 3.
```

That last number is the one worth watching. Most intentional-looking interfaces hold two or three.
