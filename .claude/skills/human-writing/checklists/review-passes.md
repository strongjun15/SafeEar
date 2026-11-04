# Review passes

The checklist in `SKILL.md` is the final gate. This file is the working procedure that gets you there: ordered passes, each with one job. Doing them at once produces rewrites that lose facts.

Never more than five passes. If a sixth seems necessary, the piece needs restructuring, not editing.

---

## Editing supplied text

### Pass 1 — Inventory (read only, change nothing)

Write down, before touching the text:

- Reader and register, inferred from the text itself.
- Person and tense.
- Every number, name, date, and citation, in order. This becomes your preservation list.
- Every qualifier that limits a claim ("in most cases", "on Linux", "for paid plans").
- Two or three constructions that look like the author's habits rather than defects.

### Pass 2 — Mark

Annotate spans that match a named pattern. Do not rewrite. Mark severity as you go:

- **Blocking** — anything that misleads: a claim stronger than the evidence, a dropped condition, invented detail already present in the draft.
- **Strong** — instant tells: hype adjectives, adjective pairs, scene-setting opener, summary close, negation flip.
- **Weak** — rhythm, repeated openers, and padding mild enough that the author may reasonably keep it.

### Pass 3 — Rewrite

Sentence by sentence, blocking first. One replacement per sentence, even when it carries three marks. After each replacement, check it against the preservation list from pass 1.

Stop rewriting a span if you cannot improve it without changing meaning.

### Pass 4 — Structure

Now look at the whole:

- Does the first paragraph carry information?
- Does the last paragraph do anything but summarize?
- Is any bullet list actually prose, or any prose block actually a list?
- Do sections vary in shape, or is every one built to the same template?
- Is the piece shorter than what you started with? If not, you rewrote instead of edited.

### Pass 5 — Read aloud

Literally, or sub-vocally. Catches what the eye passes over:

- Sentences you would not say to that reader.
- Three sentences in a row with the same length and shape.
- A word repeated in adjacent sentences that you did not notice on screen.
- Rhythm that got uniform because pass 3 over-corrected. Restore one long sentence.

### Then

Run the `SKILL.md` checklist. Produce a revision report using `templates/revision-report.md` if the author needs to review changes rather than accept them wholesale.

---

## Drafting new text

### Pass 1 — Establish the known

- List the source material you were given, by name.
- For each fact you can state, note where it came from.
- Write down what the piece needs and you do not have. These become `[TK: ...]` markers, not inferences. See `references/fabrication-policy.md`.
- Name the genre and open `references/genre-playbooks.md` for its required shape.

### Pass 2 — Reader and point

One sentence each, written down:

- The single reader. Not a segment — one person with a job and a constraint.
- What they should understand or do after reading.

If either takes more than a sentence, the piece is trying to do two things. Split it or cut one.

### Pass 3 — Skeleton

Order the points so each follows from the last without a connective doing the work. Test: delete every "Moreover", "Additionally", "That said". If the sequence breaks, the order is wrong, not the connectives.

### Pass 4 — Draft fast, then cut

Write the shortest version that carries the point. Then remove:

- Any sentence that only prepares the reader for the next sentence.
- Any paragraph whose deletion loses nothing — including the opener.
- Any adjective that survives only because it sounds right.

### Pass 5 — Read as the reader

Read it once as the person named in pass 2, with their constraint in mind. Ask: where do they stop reading, and what do they still not know?

### Then

Run the `SKILL.md` checklist, then re-read the gap markers and list them for the author.

---

## Reviewing someone else's draft without editing it

When asked for feedback rather than a rewrite:

1. Report blocking issues first, with the span quoted and the reason.
2. Give one worked rewrite per pattern, not per instance — the author can apply it to the rest.
3. Separate "this misleads" from "this is a stylistic tell". Authors get to keep their tells.
4. Say what is working. Not as encouragement — so the author does not edit it out in the next pass.
5. Cap the report. Twelve findings that get acted on beat forty that get skimmed.
