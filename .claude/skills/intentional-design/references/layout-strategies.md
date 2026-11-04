# Layout strategies

Step 1 asks you to name a layout strategy. The named alternatives below exist so that "hero plus three cards" has to compete rather than arrive by default.

Choose by what the user is doing, not by what looks balanced.

---

## Application shells

**Master–detail.** A list on the left, the selected item on the right. For queues, inboxes, and anything with a working set: tickets, alerts, candidates, orders. Keep selection in the URL so a row is linkable. On mobile it becomes list → push detail, with a real back affordance.

**Table plus inspector.** A dense table as the primary surface with a right-hand panel showing the selected row. Better than master–detail when comparison across rows matters as much as the individual record. The panel must be dismissible and the table must stay usable without it.

**Canvas with floating controls.** The work surface fills the viewport; tools sit in overlays. For editors, maps, diagrams, media. This is where translucent overlay surfaces are justified — the content behind them is real. Requires a visible undo path and a keyboard escape from every overlay.

**Sidebar plus content.** Persistent navigation, single content column. Serviceable and correct for products with many unrelated sections. Note that it is the most common shell in existence, so it contributes nothing distinctive on its own — the character has to come from type, density, and detail.

**Focused single column.** No shell at all. For products with one job: a form, a reader, a single stream. Anything you would have put in a sidebar becomes a menu or a command palette.

**Split panes.** Two synchronized surfaces — source and preview, code and output, before and after. Justified only when the user genuinely looks at both. Otherwise it is two half-width panes neither of which is comfortable.

**Wizard.** Sequential steps with a visible position indicator. For rare, high-stakes, branching input: onboarding, tax-style flows, migrations. Requires resumability and back navigation that preserves entered data. Never use it for something the user does weekly.

---

## Page and marketing structures

**Demonstration-first.** The product doing its job is the first thing on screen — a screenshot at real resolution, a live embed, a terminal session, a code block that runs. Then the explanation. Strongest when the product is visual or technical.

**Problem-first narrative.** Name the failure state the reader recognizes, then the mechanism that removes it, then proof. Works when the audience does not yet know the category exists.

**Comparison-led.** A table or a two-column against the incumbent or the manual process. High-trust and unfashionable. Requires the comparison to be fair, which is why it is rare.

**Documentation-shaped.** Nav, content, and on-page contents. For developer products where the buyer is the user and reading is the evaluation.

**One-question page.** A single decision and one action. Pricing changes, plan selection, a confirmation. Everything else removed from the page, including navigation, where the action is high-stakes.

**Feed or archive.** Reverse-chronological entries with strong per-entry typography. For changelogs, blogs, release histories. The entry is the design unit; the page is just a container.

---

## When "hero plus three cards" is right

It is the correct structure when all three hold:

1. The audience is genuinely new to the category and needs one framing statement.
2. There are exactly three things worth saying, and they are peers.
3. There is one action, and everything above it is argument for taking it.

If the three items are not peers, they should not be three equal cards — weight them. If there are five, do not compress to three for symmetry.

---

## Choosing

Answer in order:

1. What does the user do here — read, monitor, decide, create, compare, complete?
2. Do they hold a working set of items, or one item at a time?
3. Is comparison across items part of the job?
4. Is the primary content the interface (canvas) or inside the interface (records)?
5. How often do they return — daily use argues for density and shortcuts, first-visit argues for explanation.

Then state the choice in one line, with the reason: "Table plus inspector, because operators triage across rows and edit one at a time."

---

## Layout failures worth naming

- **Symmetry over meaning.** Three items given equal weight because three fits the grid, when one matters more.
- **The shell that outweighs the content.** Sidebar, header, breadcrumb, toolbar, and footer around a single small table.
- **Full-width text.** Body copy running the width of a 1440px viewport.
- **Nested scroll regions.** Two independently scrolling areas with no visual boundary; the user loses the outer scrollbar.
- **Modal chains.** A modal that opens a modal. Whatever the second one is, it belongs on a page.
- **Responsive by shrinking.** A three-column dashboard squeezed to 375px instead of reorganized by priority.
- **The empty half.** A two-column layout where the second column is only populated sometimes, leaving a hole the rest of the time.
- **Infinite scroll over records people need to find again.** Pagination is addressable; infinite scroll is not.
