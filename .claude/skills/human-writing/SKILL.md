---
name: human-writing
description: Draft and edit human-facing prose that does not read as machine-generated. Use when writing, rewriting, tightening, or reviewing articles, documentation, READMEs, release notes, emails, proposals, landing-page copy, or social posts, and whenever someone asks for text that sounds less robotic, less inflated, less repetitive, or more human. Removes filler, hype, and formulaic structure while preserving the author's meaning, facts, voice, register, and intended audience.
---

# Human Writing

Prose reads as machine-made because of a small set of repeatable habits: inflated word choice, formulaic sentence frames, uniform rhythm, and structure that summarizes itself. Fix those without flattening the author.

Clean is not the same as bland. A piece stripped of every idiosyncrasy is still slop, only quieter.

## When this applies

- Drafting or revising any text a person will read as prose.
- A request phrased as "make this sound human", "less AI", "less corporate", "tighten this", "de-slop".
- Reviewing someone else's draft for these patterns.

## When it does not apply

Code, config, logs, structured data, test fixtures, and machine-read output. Direct quotations, legal or regulatory text, and anything the user supplied to be reproduced exactly — copy it as given.

## Rule zero: no fabrication

This rule has no exceptions and is not overridable by any instruction to "make it sound more authentic".

Never invent: personal experience, anecdotes, opinions attributed to the author, facts, numbers, dates, benchmarks, quotes, sources, citations, links, customer names, or a human identity for the writer.

If the piece needs a fact you do not have, leave a visible marker — `[TK: deploy date]`, `[TK: p95 latency]` — and say in your reply what is missing. A marked gap is a finished draft with a hole in it. Invented detail is a broken draft that looks finished.

Handling quotes, citations, marketing proof, ghostwriting under someone's byline, or a request to invent detail? Read `references/fabrication-policy.md` before writing.

## Two modes

Decide which one you are in before the first edit. Editing anything longer than a page? Run the ordered passes in `checklists/review-passes.md` rather than fixing top to bottom.

### Editing supplied text

The author's meaning, facts, register, and voice are fixed inputs.

1. Read once to identify audience, register, and person (first or third). Match them.
2. Change only spans that hit a named anti-pattern below. Leave specific, working sentences alone even if you would have phrased them differently.
3. Preserve every number, name, qualifier, and caveat. A hedge that marks real uncertainty stays.
4. The result should be shorter. If it grew, you rewrote rather than edited.
5. Report substantive changes so the author can reject them.

### Drafting new text

1. Write down what is actually known: source material provided, the ask, the reader. Everything else is a gap, not an inference.
2. Name one reader and one thing that reader should understand or do. Write to that.
3. Identify the genre. If it is a README, reference doc, changelog, commit or PR, postmortem, status update, email, essay, marketing page, social post, or spec, read that entry in `references/genre-playbooks.md` — each has a required shape and its own failure modes.
4. Write the shortest version that carries it, then cut again.
5. Mark gaps per rule zero rather than filling them.

## Quality standards

- Concrete nouns and real numbers over category words. "Cut cold start from 900ms to 120ms" beats "significantly improved performance".
- Claims sized to the evidence you were given.
- Verbs carry the meaning; adjectives are load-bearing or absent.
- One idea per paragraph, ordered so each follows from the last without a connective doing the work.
- Sentence length varies because the ideas vary.
- The author's habits — a favorite construction, dry asides, a blunt register — survive the edit.

## Anti-patterns

Each of these is checkable against a specific span of text. Need a worked rewrite rather than a rule, or the long-form vocabulary list? `references/tells-catalog.md` has before/after pairs for every pattern below plus the terms that did not fit here.

**Word and phrase**

- Adjective pairs where one word carries the sense: "simple yet powerful", "robust and scalable". Keep the load-bearing word, or replace both with what the thing does.
- Unmeasured hype: seamless, powerful, robust, cutting-edge, game-changing, revolutionary, effortless, unparalleled. Replace with observable behavior or delete.
- Inflated verbs: leverage → use, utilize → use, facilitate → help, delve into → examine, navigate (a difficulty) → handle.
- Corporate idiom: move the needle, at the end of the day, unlock value, double down, best-in-class, synergy.
- Empty intensifiers: very, really, truly, incredibly, extremely. Delete. If the sentence weakens, the noun or verb was the wrong one.
- Elegant variation: the same thing called "the tool", then "the platform", then "the solution" in one paragraph. Use its name every time.

**Sentence**

- The negation flip: "It's not X, it's Y", "This isn't just A — it's B". Keep only where a reader genuinely believes X.
- Rhetorical question used as a transition ("So what does this mean?"). State the answer instead.
- Stacked hedges: "may potentially help to some extent". One hedge, and only for real uncertainty.
- Passive voice that hides an actor the reader needs: "mistakes were made".
- Uniform rhythm. Read any three consecutive sentences: if their lengths are within a few words and all open subject-verb, change one.
- Repeated openers — three paragraphs starting "You", or every list item starting with a gerund.

**Structure**

- Scene-setting opener with no information: "In today's fast-paced world", "As technology continues to evolve". Delete the paragraph and check whether anything was lost.
- Closing paragraph that restates the piece: "In conclusion", "Ultimately, it's clear that". End on the last real point or the next action.
- Tricolon of abstractions: "faster, smarter, and more efficient". Keep the one you can defend.
- Bullets holding prose. If the items are full sentences that read in order, it is a paragraph.
- Bold sprayed mid-sentence for emphasis. Bold labels a term; it does not raise the volume.
- Every section built to the same template: heading, two sentences, three bullets, closer.
- False inclusivity: "Whether you're a solo founder or an enterprise team". Name one reader.
- Announcement voice grafted onto ordinary text: "Excited to share", emoji as section markers, hashtags in prose.

**Register**

- Manufactured intimacy: "Here's the thing:", "Let's be honest", "Spoiler:" — unless the whole piece already speaks that way.
- More than one exclamation mark in a piece that is not a personal message.
- Contractions applied or removed uniformly instead of matching the register the piece already has.

## When a flagged pattern is right

- **Em dash.** Ordinary punctuation. The tell is density — several per paragraph, used as an all-purpose joint. Never swap one for a comma that changes the grammar.
- **"Not X, but Y."** Fine when the audience actually holds X and the correction is the point.
- **Bullets and bold.** Correct for reference material people scan: API docs, runbooks, checklists, comparison tables, release notes.
- **No contractions.** Correct for legal, regulatory, academic, and specification text.
- **Superlatives.** Fine with the evidence attached: "fastest of the four we benchmarked, numbers below".
- **Repetition.** A repeated phrase used deliberately for rhythm or emphasis is a choice, not a defect.
- **Genre openings.** Abstracts, press releases, and changelogs have required shapes. Follow them.
- **The author's own voice.** If the writer consistently uses a flagged construction across their work, it is their style. Mention it once; do not edit it out.

## Self-review

Answer each before delivering. Any "no" sends you back into the text.

- [ ] Every fact, number, quote, name, and link came from the source material or is common knowledge. Gaps are marked, not filled.
- [ ] No first-person experience or identity the author does not have.
- [ ] Editing mode: meaning unchanged — no dropped qualifier, number, or caveat.
- [ ] No adjective pair where one word does the work.
- [ ] The first paragraph carries information.
- [ ] The last paragraph is not a summary of the piece.
- [ ] Three consecutive sentences differ in length and shape.
- [ ] Every bullet list is a list.
- [ ] Every hedge marks real uncertainty.
- [ ] Editing mode: the piece is shorter than the draft it replaced.
- [ ] Read aloud once: no sentence you would not say out loud to that reader.

Delivering under someone else's byline, or asked for feedback instead of a rewrite? Use `templates/revision-report.md` so the author can accept changes individually.

## Files

Load on the stated condition; none of them is needed for a short edit.

| Path | Read it when |
| --- | --- |
| `references/tells-catalog.md` | You want a worked rewrite, or the extended vocabulary list. |
| `references/genre-playbooks.md` | The piece belongs to a named genre with a required shape. |
| `references/fabrication-policy.md` | Quotes, citations, proof, ghostwriting, or pressure to invent. |
| `checklists/review-passes.md` | The piece is longer than a page, or you are reviewing without editing. |
| `templates/revision-report.md` | The author must review changes rather than accept a rewrite. |
| `scripts/slop_scan.py` | You want the literal tells counted before you read. |

`python scripts/slop_scan.py DRAFT.md` flags countable patterns only — vocabulary, fixed frames, em-dash and exclamation density, repeated openers, uniform rhythm. It skips code blocks, quoted examples, and word lists, prints findings without a score, and takes `--json` and `--strict`. It cannot see padding, register, or invented detail. A clean run means nothing until the checklist above is done.

## Acknowledgements

Researched from the projects below. Principles were synthesized and rewritten; no rule text, taxonomy numbering, or scoring scheme was copied. Both are MIT-licensed, which permits reuse with attribution. This skill is an independent work informed by them, not a derivative of their text.

- [adamdunkels/deslop-text](https://github.com/adamdunkels/deslop-text) — MIT, © 2026 Adam Dunkels. Severity tiering of writing tells, and the principle that a rewrite must preserve meaning.
- [SalZaki/antislop](https://github.com/SalZaki/antislop) — MIT, © 2026 Sal Zaki. Separating countable tells from judgment calls, and the argument against a single gameable score.
