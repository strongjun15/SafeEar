# Landing and marketing page checklist

Run after the page is built, before it is called done. The general checklist in `SKILL.md` still applies; this covers what is specific to persuasion surfaces.

Marketing pages are where fabrication pressure and template pressure are both highest. Half of this list is about honesty.

## Content honesty

- [ ] Every number on the page is real and sourced. No invented user counts, uptime figures, growth rates, or benchmark comparisons.
- [ ] Every logo is a real customer who has agreed to appear.
- [ ] Every testimonial is a real quote from a real named person.
- [ ] No fabricated ratings, awards, certifications, or compliance badges.
- [ ] No placeholder copy anywhere — no lorem ipsum, no "Your Company", no "Feature One".
- [ ] Screenshots show the actual product with plausible data, not a mock of a product that does not exist.
- [ ] Claims that would be legally consequential (security, compliance, guarantees) are ones the company can support.

If a section structurally needs proof and no proof exists, remove the section. An empty "trusted by" strip is worse than no strip.

## The first screen

- [ ] A visitor learns what the product is within one sentence, without scrolling.
- [ ] The product is shown, not described — a screenshot, an embed, a terminal session, a code block.
- [ ] One primary action, visually dominant.
- [ ] The headline says what it does, not how it feels. Adjectives are load-bearing or absent — see the `human-writing` skill.
- [ ] Nothing above the fold exists only for atmosphere.

## Structure

- [ ] The layout strategy was chosen from `references/layout-strategies.md` and named in the direction.
- [ ] If it is hero plus three cards, all three conditions in that file hold. Otherwise it was rejected.
- [ ] Sections are not all the same shape. Vary the rhythm: full-bleed, contained, split, list.
- [ ] Feature groups reflect what matters, not what makes a symmetric grid. Three items because there are three, not because three fits.
- [ ] The page has one argument with an order. Sections cannot be shuffled without loss.
- [ ] Pricing is legible without opening a modal or contacting sales, unless the model genuinely requires it.

## Visual

- [ ] No decorative gradient standing in for a color system.
- [ ] No blobs, aurora washes, or floating geometry that organize nothing.
- [ ] Cards, if present, contain things that belong together — not every paragraph in its own box.
- [ ] Illustration and iconography come from one set with one weight and one metaphor.
- [ ] The direction's signature move is visible on the page and not only in the hero.
- [ ] Substitution test: replacing the name and logo with a competitor's would look wrong.

## Behavior

- [ ] Motion is within the direction's budget and honors reduced-motion.
- [ ] No scroll-reveal that delays reading, and no entrance animation on load.
- [ ] Find-in-page works — nothing important is hidden behind a scroll trigger or an unopened accordion.
- [ ] Carousels, if any, are for supplementary content and have manual controls.
- [ ] Forms follow `references/accessibility.md`: real labels, specific errors, autocomplete attributes.
- [ ] Cookie or consent UI does not block content and defaults to the privacy-preserving option.

## Performance and reach

- [ ] Largest image is sized and formatted for the slot; hero media is not a multi-megabyte PNG.
- [ ] Fonts subset and preloaded; no layout jump when they land.
- [ ] The page is readable and the primary action reachable with JavaScript slow or failed.
- [ ] Checked at 375px, 768px, and 1280px+ — reorganized per viewport, not scaled down.
- [ ] Contrast verified on the hero, on any image overlay, on the primary button, and in dark mode if supported.

## Final

- [ ] Someone who has never seen the product can say what it does and who it is for after ten seconds.
- [ ] Every deviation from a conditional default has a written reason in the direction.
- [ ] You can name the one thing on this page a visitor would remember.
