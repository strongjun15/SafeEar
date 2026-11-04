# Motion

`SKILL.md` sets the rules: animate opacity and transform, name the properties, choose one timing band and reuse it, honor `prefers-reduced-motion`. This file is the execution detail.

Motion earns its place by explaining something — where a panel came from, that a change was accepted, that an item left the list. Motion that only decorates is the clearest tell in the whole skill, because it costs the user time on every interaction.

---

## Set the budget in the direction

| Direction | Motion budget |
| --- | --- |
| Operational console, focused instrument | Near zero. State changes are instant. Only direct-manipulation feedback moves. |
| Records workspace, monitoring | Minimal. Panel and menu transitions, row enter/exit, nothing else. |
| Consumer app | Moderate. Navigation direction, sheet and modal transitions, pull-to-refresh, success feedback. |
| Brand-forward marketing | Deliberate and art-directed, still bounded by the reduced-motion rule and the frame budget. |

Write the budget down. It is what makes "no animation here" a decision rather than an omission.

## Timing

Pick one set of durations and one or two easing curves for the whole product.

| What is moving | Duration |
| --- | --- |
| Control feedback — press, toggle, checkbox | 80–150ms |
| Small state change — tooltip, hover tint, focus ring | 100–150ms |
| Content swap — tab panel, accordion, inline expand | 180–260ms |
| Surface entering or leaving — menu, popover, sheet, modal | 200–300ms |
| Large spatial change — full-screen route, drawer across the viewport | 250–400ms |

Beyond 400ms, the motion needs a narrative reason and the user needs a way to skip it.

Easing:

- Entering: ease-out. Fast start, settled end.
- Leaving: ease-in, and shorter than the entrance — usually 70–80% of it.
- Moving between two on-screen positions: ease-in-out.
- Linear only for continuous indeterminate motion, such as a spinner or progress bar.
- Springs are appropriate for direct manipulation that the user is dragging. Avoid bounce on anything that is not physically dragged.

## What to animate

Only `opacity` and `transform`. Both are composited and do not force layout.

Common substitutions when you are tempted to animate a layout property:

- Height or max-height → animate a `transform: scaleY()` on a wrapper, or accept the instant change. Height animation on unknown content is a jank source.
- Width of a sidebar → animate `transform: translateX()` of the panel over the content, or make it instant.
- Top/left → `translate`.
- Background color → acceptable at small sizes; keep it under 150ms.
- Box-shadow → animate opacity of a pseudo-element carrying the shadow.

Never `transition: all`. It animates properties you did not consider, including ones that force layout.

## Patterns that read as intentional

- **List item removal.** Fade to 0 and collapse in one motion, 180ms, then remove from the DOM. Do not reflow the whole list.
- **Panel entrance.** Fade plus an 8–12px translate from the edge it belongs to. The direction of travel tells the user where it lives.
- **Tab change.** Indicator slides, panels cross-fade. Total under 200ms.
- **Modal.** Backdrop fades; dialog fades and rises 8px. Exit is faster.
- **Optimistic action.** Instant visual acceptance, with the correction animated only if the request fails.
- **Reordering.** Animate the positions of the items that moved, not the container.
- **Loading.** Skeletons shaped like the incoming content. A skeleton that does not match causes a second layout shift when data arrives.

## Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Blanket suppression is the floor, not the goal. Better is to keep opacity transitions, which rarely trigger vestibular symptoms, and remove movement, parallax, scale, and auto-playing motion. The interface must remain fully usable and must not lose any state feedback when motion is off.

Also: never convey information only through motion. If a row flashes to indicate an update, it also needs a persistent marker.

## Performance

- Budget 16ms per frame. Anything that reads back layout during animation (`offsetHeight`, `getBoundingClientRect`) inside a loop will miss it.
- Promote only what is currently animating. Leaving `will-change` on many elements costs memory and can make things worse.
- Animated `backdrop-filter` is expensive on low-end devices. Blur that is static is far cheaper than blur that changes.
- Test on a throttled CPU. Motion that is fine on a workstation and janky on a mid-range phone is a defect, not a preference.

## Motion failure modes

- Every card lifting or scaling on hover.
- Scroll-triggered reveal on all sections, which delays reading and breaks find-in-page.
- Entrance animation on page load, which makes a fast page feel slow.
- Hover transitions long enough that the pointer has already left.
- Bounce or spring on menus and dialogs.
- A tooltip that animates in over 300ms, so it appears after the user has moved on.
- Auto-playing carousels and looping background video with no pause control.
- Parallax that continues to move under reduced-motion settings.
- Different durations for the same interaction in different components, from copying snippets rather than using tokens.
