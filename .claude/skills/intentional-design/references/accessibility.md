# Accessibility

The absolute standards in `SKILL.md` are the floor and are never overridden. This file is how to meet them and how to check that you did.

Two framings worth keeping: accessibility is mostly correct markup plus considered states, and every accessibility defect is also a usability defect for someone using the product normally.

---

## Markup

- Use the element that means what you mean. `<button>` for actions, `<a href>` for navigation, `<input>` with a `<label>`, `<table>` for tabular data with `<th scope>`. A `div` with a click handler is missing keyboard operation, focus, role, and state.
- One `<h1>` per page, headings in order, no level skipped for size reasons. Size comes from the class, not the tag.
- Landmarks: `<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>`. One `<main>`. Multiple `<nav>` elements need distinguishing labels.
- Lists for lists. Screen readers announce item counts, which is real navigational information.
- ARIA is the fallback, not the starting point. A native control with correct markup beats a div with five ARIA attributes.

## Names and labels

- Every control has an accessible name. A visible `<label>` is best; `aria-label` is acceptable for icon-only controls.
- Placeholder is not a label. It disappears on input, usually fails contrast, and is invisible to some assistive technology.
- Icon-only buttons need a name that says the action: "Delete invoice", not "Trash".
- Link text stands alone. Several "Read more" links in one page are indistinguishable in a link list.
- Names in the accessible name must start with the visible text, or voice-control users cannot invoke them by name.
- Decorative images get `alt=""`. Informative images get alt text describing the information, not the picture. Complex figures get a longer description nearby.

## Keyboard

- Everything operable by pointer is operable by keyboard, in an order that matches the visual order.
- The focus indicator is visible on every surface. Two-pixel outline with an offset works on most grounds; check it on the accent, on dark surfaces, and on images.
- `:focus-visible` for the styled ring, so pointer users are not shown focus rings on click, but never remove focus styling outright.
- No keyboard traps. Every overlay closes with Escape and returns focus to the element that opened it.
- Modals move focus in on open and constrain it while open. Non-modal popovers do not trap, but must be dismissible.
- Provide a skip link to `<main>` when navigation is long.
- Custom widgets follow the expected key patterns: arrows within a composite (menu, tabs, listbox, grid), Tab to leave it, Home/End where a list has ends, Escape to dismiss.
- Do not add positive `tabindex`. Reorder the DOM instead.

## States

Every interactive element needs each of these designed, and several need a non-visual equivalent:

| State | Visual | Non-visual |
| --- | --- | --- |
| Hover | Perceptible tint change | none required |
| Focus | Visible ring | native focus |
| Active | Brief feedback | none required |
| Selected | Inversion or solid tint | `aria-selected` or `aria-current` |
| Disabled | Reduced emphasis, still perceivable | `disabled`, and say why nearby |
| Loading | Skeleton matching the target shape | `aria-busy`, and announce completion |
| Empty | Explains what belongs here and how to add it | ordinary content |
| Error | Adjacent, specific, persistent | `aria-invalid`, `aria-describedby`, live region |

Disabled controls that give no reason are a common trap. Either explain the condition next to the control, or leave it enabled and explain on attempt.

## Forms

- Label above or beside the input, always visible.
- Required state indicated in text as well as with an asterisk.
- Errors summarized at the top with links to fields, and repeated inline next to each field.
- Error text says what to do: "Password needs at least 12 characters", not "Invalid input".
- Validate on blur and on submit, not on every keystroke.
- Group related controls with `<fieldset>` and `<legend>` — radio sets especially.
- Autocomplete attributes on personal-data fields.
- Never rely on color alone to mark an invalid field.

## Motion and time

- Honor `prefers-reduced-motion`; see `references/motion.md`.
- Nothing flashes more than three times per second.
- Auto-playing content over five seconds has a pause control.
- Time limits are adjustable or extendable. Sessions that expire silently lose work.

## Content structure

- Reading order in the DOM matches the visual order. CSS reordering with grid or flex breaks this quietly.
- Tables have headers with scope, and captions where the table's purpose is not obvious from context.
- Data conveyed in a chart is also available as text or a table.
- Language declared on `<html>`, and on any inline passage in another language.
- Zoom to 200% without loss of content or function; 400% for reflow at narrow widths.

## Checking

Automated tooling catches perhaps a third of it. Run it anyway, then do the manual pass:

1. **Tab through the whole screen.** Can you reach and operate everything? Is the order sensible? Is focus always visible?
2. **Unplug the mouse for one full task.** Complete the primary flow with the keyboard only.
3. **Zoom to 200%.** Then narrow the window to 320px.
4. **Force high-contrast or forced-colors mode.** Backgrounds set with images and borders set with shadows disappear here.
5. **Turn on a screen reader for the primary flow.** VoiceOver, NVDA, or Narrator. The first time is slow; do it anyway.
6. **Check contrast on the pairs listed in `references/color-systems.md`,** not just body text on background.
7. **Simulate reduced motion.** Confirm the interface still communicates every state change.

Report what you actually ran. "Accessible" without a list of checks performed is a claim, not a result.

## Frequent defects

- Focus outline removed globally in a reset.
- Click handlers on `div` and `span`.
- Icon-only navigation with no accessible names.
- Modal that leaves focus behind it, so Tab walks the page underneath.
- Toast notifications that are never announced and disappear before they can be read.
- Custom select that intercepts arrow keys but implements none of the expected behavior.
- Skeleton loaders that announce nothing, so a screen reader user hears silence.
- Contrast checked on the design mock but not on the disabled, hover, and dark-mode variants.
- `aria-label` on an element that already has a visible label, producing two different names.
