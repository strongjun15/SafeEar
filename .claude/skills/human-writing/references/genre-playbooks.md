# Genre playbooks

Register is a property of the genre, not a global setting. Each entry gives the reader, the register, the structure that genre expects, and the slop that specifically shows up there. Rules named in `SKILL.md` are not restated here.

## README

**Reader:** a developer deciding in thirty seconds whether to keep reading.
**Register:** direct, second person, contractions fine.
**Required shape:** one sentence saying what it is → install → smallest working example → link to deeper docs. Everything else is below the fold.

Genre-specific slop:

- A paragraph of positioning before the reader knows what the thing does. The first sentence names the artifact and its job: "A CLI that diffs Postgres schemas." Not "In modern development workflows, database consistency is critical."
- Feature bullets that describe categories rather than capabilities: "Powerful configuration" → "Config in TOML, env vars override file values."
- Badge rows longer than the description.
- "Why X?" sections that answer with adjectives instead of a comparison to the named alternative.

## Reference and API documentation

**Reader:** someone mid-task with an error open in another window.
**Register:** impersonal, present tense, no contractions needed either way — match the existing docs.
**Required shape:** signature → parameters with types and defaults → return → errors → one runnable example.

Genre-specific slop:

- Prose wrapped around a table that already says it.
- "Simply call the function" — delete "simply"; if it were simple the reader would not be here.
- Examples that use `foo`/`bar` when a realistic value would teach the shape of the input.
- Restating the parameter name as its description: `timeout` — "The timeout." Say the unit, the default, and what happens at zero.

## Release notes and changelog

**Reader:** an existing user deciding whether to upgrade.
**Register:** terse, past tense, one line per change.
**Required shape:** grouped by Added / Changed / Fixed / Removed / Security, breaking changes first and marked.

Genre-specific slop:

- "Various improvements and bug fixes." Name them or drop the line.
- Announcement voice on routine changes: "We're thrilled to introduce..." for a config flag.
- Marketing adjectives on a fix. "Fixed a rare race condition in the retry loop" not "Massively improved reliability."
- Omitting the migration step for a breaking change because it makes the entry longer.

## Commit messages and pull request descriptions

**Reader:** someone bisecting a regression eighteen months from now.
**Register:** imperative mood, plain, no first person.
**Required shape:** subject under ~72 characters saying what changed → blank line → why it changed, what was rejected, and how it was verified.

Genre-specific slop:

- Restating the diff in prose. The diff is already there. The body carries the reason.
- "Refactored for better readability and maintainability" with no statement of what was wrong before.
- A PR description that summarizes the code but never says how it was tested.
- Bulleted change lists auto-generated from filenames.

## Incident postmortem

**Reader:** engineers who will hit an adjacent failure, plus leadership reading for risk.
**Register:** factual, blameless, precise about time and sequence.
**Required shape:** impact with numbers and duration → timeline in wall-clock time → root cause → contributing factors → what was tried that did not work → action items with owners.

Genre-specific slop:

- Passive voice hiding the actor where the actor is a system, not a person: "the config was deployed" → "the deploy pipeline applied the config."
- Hedged root causes: "may have contributed to." Either the evidence supports it or it goes in an open-questions section.
- Action items phrased as intentions: "improve monitoring" → "add an alert on replica lag above 30s, owner X."
- A "lessons learned" paragraph that restates the timeline.

## Internal status update

**Reader:** a manager or peer team with four minutes.
**Register:** first person plural, matter-of-fact, blunt about risk.
**Required shape:** what shipped → what is blocked and on whom → what changes next week → decisions needed.

Genre-specific slop:

- Green-status language covering a slipping date. Say the new date.
- Effort described instead of outcome: "worked on the migration" → "migrated 40 of 60 tables; the remaining 20 need the lock window."
- Padding to make a light week look heavy.

## Email and outreach

**Reader:** a person who owes you nothing.
**Register:** the register you would use speaking to them; contractions almost always.
**Required shape:** why you are writing in the first sentence → context → the specific ask → the easy out.

Genre-specific slop:

- "I hope this email finds you well." Delete.
- Flattery assembled from public information: "I was really impressed by your work on..." unless you can say what specifically and why.
- Burying the ask in paragraph four.
- Two asks. Pick one.

## Blog post or essay

**Reader:** someone who chose to click and will leave at the first empty paragraph.
**Register:** the author's own; this is the genre where voice matters most.
**Required shape:** whatever the argument requires. No fixed template.

Genre-specific slop:

- Opening with a definition or a scene-setter. Open at the point of tension.
- A "why this matters" section, which usually means the argument did not carry it.
- Section headings phrased as questions the body then answers in one line.
- A closing paragraph that summarizes, then a second closing paragraph that calls to action.

## Marketing and landing copy

**Reader:** a skeptical buyer comparing three tabs.
**Register:** confident, concrete, second person.
**Required shape:** what it does → for whom → proof → the single next step.

Genre-specific slop:

- Benefit claims with no mechanism: "Ship faster." How?
- Superlatives without a comparison set.
- Three-column feature triads with parallel adjective headings.
- Testimonials, logos, user counts, or ratings that are not real. See `references/fabrication-policy.md` — this is where fabrication pressure is highest.

## Social post

**Reader:** scrolling, hostile to setup.
**Register:** the author's, compressed.
**Required shape:** the claim, then the evidence. No windup.

Genre-specific slop:

- "Excited to announce" openers, thread-numbering theatre, "a thread 🧵".
- Manufactured hooks: "Most people get this wrong."
- Hashtag rows.

## Academic, specification, and legal text

**Reader:** a reviewer checking precision and completeness.
**Register:** impersonal, no contractions, defined terms used consistently.
**Required shape:** the one the venue or standard mandates. Follow it exactly.

Genre-specific slop:

- Elegant variation, which is a defect here rather than a stylistic tic — a defined term must repeat verbatim every time.
- Hedging beyond what the evidence requires, and hedging removed where the evidence is thin. Both are errors.
- Normative keywords (MUST, SHOULD, MAY) used loosely in spec text.
