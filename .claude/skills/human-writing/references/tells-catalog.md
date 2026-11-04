# Tells catalog

Worked rewrites for the patterns named in `SKILL.md`, plus the longer vocabulary list that does not fit inline. This file demonstrates and extends; it does not restate the rules.

Every pair below keeps the original claim. If a rewrite drops a fact, it is a bad rewrite regardless of how much better it reads.

Example spans are fenced so `scripts/slop_scan.py` skips them.

---

## Worked rewrites

### Adjective pair, one word load-bearing

```
before: A simple yet powerful CLI for managing secrets.
after:  A CLI for managing secrets. One binary, no daemon.
```

The pair claimed two things and proved neither. The rewrite proves both by naming the mechanism.

### Unmeasured hype

```
before: Our robust, enterprise-grade pipeline seamlessly handles massive scale.
after:  The pipeline processes 40k events/sec on three nodes and retries failed
        batches for 24 hours.
```

If the numbers are not available, cut to what is observable and mark the gap: `[TK: throughput]`.

### Verb inflation

```
before: We leveraged caching to facilitate a reduction in response times.
after:  We added a cache. Response times dropped from 800ms to 90ms.
```

Two inflated verbs collapsed into one plain one, and the nominalization ("a reduction in") became a verb.

### Negation flip

```
before: This isn't just a linter — it's a complete code intelligence platform.
after:  It lints, and it also resolves imports across packages to find dead code.
```

Valid only where readers actually expect a linter and the correction is the point. Here it was not; the rewrite states the capability.

### Rhetorical transition

```
before: So what does this mean for your team? It means faster reviews.
after:  Reviews get shorter because the diff arrives pre-annotated.
```

### Stacked hedges

```
before: This may potentially help reduce errors to some extent in certain cases.
after:  This catches type errors at build time. It does not catch runtime shape
        mismatches from external APIs.
```

The hedge became a stated limitation, which is more useful and more honest.

### Scene-setting opener

```
before: In today's fast-paced digital landscape, data security has never been
        more important. That's why we built Vault Sync.
after:  Vault Sync replicates secrets between clusters without writing them to
        disk.
```

Delete the first paragraph, check what was lost. Here: nothing.

### Summary close

```
before: In conclusion, by following these steps you can significantly improve
        your deployment process and ship with confidence.
after:  If a deploy fails after step 4, the rollback is `deploy --revert`; the
        previous image stays cached for 7 days.
```

Replace the restatement with the thing the reader needs next.

### Tricolon of abstractions

```
before: The result is a faster, smarter, and more efficient workflow.
after:  The result is one command instead of four.
```

### Bullets holding prose

```
before:
  - The migration runs in two phases.
  - The first phase copies rows in batches of 5,000.
  - The second phase swaps the table alias.

after:
  The migration runs in two phases: the first copies rows in batches of 5,000,
  the second swaps the table alias.
```

Three sentences that read in sequence were never a list.

### Bolded lead-in bullets

```
before:
  - **Speed:** It's really fast.
  - **Security:** Your data is safe.
  - **Simplicity:** Easy to use.

after:
  - Cold start under 50ms.
  - Secrets stay in memory; nothing is written to disk.
  - One config file, no plugins.
```

The bold labels were carrying no information the bullet did not already carry. If the labels are the scannable index into long entries, keep them — that is the reference-document exception.

### Elegant variation

```
before: Deploy the service. The platform then validates the config, and the
        solution restarts affected pods.
after:  Deploy the service. The service validates the config, then restarts
        affected pods.
```

Three names for one thing read as padding and creates genuine ambiguity about whether they are the same thing.

### False inclusivity

```
before: Whether you're a solo developer or a Fortune 500 team, our tool scales
        with you.
after:  Built for teams running more than about fifty services. Below that, the
        setup cost is not worth it.
```

Naming one reader is a stronger claim than including everyone, and it is falsifiable.

### Passive voice hiding the actor

```
before: An error was introduced during the release and customers were affected.
after:  The release script skipped the migration step, so 1,400 accounts saw
        stale balances for 22 minutes.
```

Blameless does not mean actorless. Name the system.

---

## Extended vocabulary

Flag on sight, then decide. Presence is not automatically a defect; density is the signal. Each of these is a common replacement target, with the plain form after the arrow.

**Nouns and noun phrases**
landscape, realm, tapestry, ecosystem (when not literal), journey, game-changer, powerhouse, treasure trove, deep dive, key takeaway, testament to, cornerstone, backbone (metaphorical), paradigm shift, holistic approach, value proposition, best-in-class solution.

**Verbs**
delve into → examine · unlock → enable · harness → use · showcase → show · boast → have · underscore → show · highlight (as "prove") → show · ensure (where "make sure" or a stronger verb fits) · empower → let · streamline → simplify or name the step removed · elevate → improve · foster → cause or support · spearhead → lead · curate → select.

**Adjectives**
seamless, robust, powerful, comprehensive, cutting-edge, state-of-the-art, innovative, revolutionary, game-changing, unparalleled, world-class, bespoke, meticulous, vibrant, rich (of features), intuitive, effortless, transformative, pivotal, crucial, vital, essential (when everything is essential).

**Connective and framing phrases**
It's worth noting that · It's important to remember · That said (repeatedly) · Moreover / Furthermore / Additionally opening consecutive paragraphs · At its core · In essence · Think of it as · Imagine a world where · Let's dive in · Here's why that matters · The bottom line · When it comes to · In the realm of · plays a crucial role in · stands as a · serves as a · has never been more important · navigate the complexities of.

**Constructions**
- "not only X but also Y" where Y is a restatement of X.
- "from X to Y, everything is Z" as a false-range gesture.
- A question as a section heading, answered in the first line of the section.
- The em dash used as a general-purpose joint several times per paragraph — see the exception in `SKILL.md`; the fix is varied punctuation, not comma substitution.
- Sentence-final "and more." Either the list is complete or the category is wrong.
- Parenthetical asides that add a synonym rather than information.
- A closing line that begins "Whether you..." or "So the next time you...".

---

## Rewriting method

1. Mark every span that matches something above. Do not rewrite yet.
2. Where several marks fall in one sentence, write one replacement sentence for all of them. Sequential single-tell fixes produce stilted text.
3. Check the replacement against the original for dropped facts, dropped qualifiers, and changed strength of claim.
4. Read the paragraph aloud. If the rhythm is now uniform, the fixes over-corrected — restore one longer sentence.
5. Leave anything you cannot improve. An untouched mediocre sentence beats a rewrite that loses a fact.
