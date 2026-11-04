#!/usr/bin/env python3
"""Flag countable writing tells in Markdown or plain text.

Findings only. There is deliberately no score: a number invites tuning the
text against the scanner instead of fixing it, and the judgment calls in
SKILL.md cannot be counted anyway. Everything here is a literal, checkable
pattern; everything meaning-dependent is left to the reader.

Standard library only. Python 3.8+.

    python slop_scan.py DRAFT.md
    python slop_scan.py DRAFT.md --json
    python slop_scan.py DRAFT.md --strict     # exit 1 if anything is found

Skipped so the scanner does not fire on writing *about* these patterns:
fenced code blocks, inline code spans, quoted example spans, link targets,
rewrite lines containing an arrow, and catalog lines that list four or more
terms from one category.
"""

import argparse
import json
import re
import sys

HYPE = [
    "seamless", "seamlessly", "robust", "powerful", "comprehensive",
    "cutting-edge", "state-of-the-art", "innovative", "revolutionary",
    "game-changing", "game-changer", "unparalleled", "world-class",
    "best-in-class", "transformative", "effortless", "effortlessly",
    "meticulous", "meticulously", "unlock the potential", "next-generation",
]

VERBS = [
    "leverage", "leverages", "leveraging", "leveraged", "utilize", "utilizes",
    "utilizing", "utilized", "facilitate", "facilitates", "delve into",
    "delves into", "harness", "harnesses", "showcase", "showcases",
    "underscore", "underscores", "spearhead", "spearheads", "empower",
    "empowers", "streamline", "streamlines",
]

IDIOM = [
    "move the needle", "at the end of the day", "unlock value", "double down",
    "synergy", "synergies", "low-hanging fruit", "circle back", "value prop",
    "value proposition", "paradigm shift", "holistic approach", "deep dive",
    "key takeaway", "the bottom line", "boil the ocean",
]

INTENSIFIERS = ["very", "really", "truly", "incredibly", "extremely", "highly"]

FRAMING = [
    "it's worth noting", "it is worth noting", "it's important to note",
    "it is important to note", "in today's", "in the modern era",
    "in an era where", "has never been more important", "in the realm of",
    "when it comes to", "at its core", "in essence", "let's dive in",
    "here's why that matters", "imagine a world", "think of it as",
    "in conclusion", "to sum up", "navigating the complexities",
    "navigate the complexities", "plays a crucial role", "stands as a",
    "serves as a", "a testament to", "and more.",
]

FRAMES = [
    (r"\b(?:it'?s|it is|this is)\s+not\s+just\b", "negation flip"),
    (r"\b(?:isn'?t|aren'?t|wasn'?t)\s+just\b", "negation flip"),
    (r"\bnot\s+only\b[^.!?]{0,80}\bbut\s+also\b", "not only / but also"),
    (r"\bwhether\s+you'?re\s+a\b", "false inclusivity"),
    (r"\bexcited\s+to\s+(?:announce|share)\b", "announcement opener"),
    (r"\bhere'?s\s+the\s+thing\b", "manufactured intimacy"),
    (r"\blet'?s\s+be\s+honest\b", "manufactured intimacy"),
    (r"\b(?:may|might|could)\s+potentially\b", "stacked hedge"),
    (r"\bhope\s+this\s+(?:email|message)\s+finds\s+you\s+well\b", "dead opener"),
    (r"\bvarious\s+(?:improvements|bug\s*fixes|updates)\b", "empty changelog"),
]

CATEGORIES = [
    ("hype", HYPE),
    ("inflated-verb", VERBS),
    ("corporate-idiom", IDIOM),
    ("intensifier", INTENSIFIERS),
    ("framing-phrase", FRAMING),
]

FENCE = re.compile(r"^\s*(```|~~~)")
INLINE_CODE = re.compile(r"`[^`]*`")
QUOTED = re.compile(r"\"[^\"]*\"|“[^”]*”")
LINK_TARGET = re.compile(r"\]\([^)]*\)|https?://\S+")
CHECKBOX = re.compile(r"^\s*[-*]\s*\[[ xX]\]\s*")
BULLET = re.compile(r"^\s*(?:[-*+]|\d+\.)\s+")
BOLD_LEAD = re.compile(r"^\s*[-*+]\s+\*\*[^*]{1,40}\*\*[:.]?\s*(.*)$")
HEADING_EMOJI = re.compile(r"^#{1,6}\s*[\U0001F300-\U0001FAFF☀-➿]")
HASHTAG = re.compile(r"(?:^|\s)#[A-Za-z][A-Za-z0-9_]{2,}")
SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")


def mask(line):
    """Blank out spans that are examples rather than prose."""
    line = INLINE_CODE.sub(lambda m: " " * len(m.group(0)), line)
    line = LINK_TARGET.sub(lambda m: " " * len(m.group(0)), line)
    line = QUOTED.sub(lambda m: " " * len(m.group(0)), line)
    return line


def is_catalog_line(line, hits):
    """A line enumerating four or more terms from one category, or one
    mapping a word to its replacement, is a reference list, not prose."""
    if "→" in line or "->" in line:
        return True
    by_cat = {}
    for h in hits:
        by_cat[h["category"]] = by_cat.get(h["category"], 0) + 1
    return any(n >= 4 for n in by_cat.values())


def strip_fences(lines):
    """Return (lineno, text) for lines outside fenced blocks."""
    out, inside = [], False
    for i, raw in enumerate(lines, 1):
        if FENCE.match(raw):
            inside = not inside
            continue
        if not inside:
            out.append((i, raw.rstrip("\n")))
    return out


def scan_terms(lineno, text):
    found = []
    low = text.lower()
    for cat, terms in CATEGORIES:
        for term in terms:
            pat = r"\b" + re.escape(term) + (r"\b" if term[-1].isalnum() else "")
            for m in re.finditer(pat, low):
                found.append({"line": lineno, "category": cat,
                              "match": text[m.start():m.end()]})
    for pat, label in FRAMES:
        for m in re.finditer(pat, low):
            found.append({"line": lineno, "category": "formulaic-frame",
                          "match": text[m.start():m.end()], "note": label})
    return found


def scan_structure(units, raw):
    """units: list of (lineno, text) already masked and fence-stripped."""
    found = []
    paras, current = [], []
    for lineno, text in units:
        if not text.strip():
            if current:
                paras.append(current)
                current = []
            continue
        if BULLET.match(text):
            if current:
                paras.append(current)
            paras.append([(lineno, text)])
            current = []
            continue
        current.append((lineno, text))
    if current:
        paras.append(current)

    for para in paras:
        first = para[0][0]
        body = " ".join(t for _, t in para)

        dashes = body.count("—")
        if dashes >= 3:
            found.append({"line": first, "category": "punctuation",
                          "match": "%d em dashes in one block" % dashes})

        bangs = body.count("!")
        if bangs >= 2:
            found.append({"line": first, "category": "punctuation",
                          "match": "%d exclamation marks in one block" % bangs})

        sents = [s for s in SENTENCE_SPLIT.split(body) if s.strip()]
        counts = [len(s.split()) for s in sents]
        for i in range(len(counts) - 2):
            window = counts[i:i + 3]
            if min(window) >= 8 and max(window) - min(window) <= 2:
                found.append({"line": first, "category": "rhythm",
                              "match": "3 consecutive sentences of %s words"
                                       % "/".join(str(c) for c in window)})
                break

    openers, run = None, []
    for lineno, text in units:
        stripped = CHECKBOX.sub("", BULLET.sub("", text)).strip()
        if not stripped:
            continue
        word = re.sub(r"[^a-z]", "", stripped.split(" ")[0].lower())
        if word and word == openers:
            run.append(lineno)
        else:
            openers, run = word, [lineno]
        if len(run) == 3:
            found.append({"line": run[0], "category": "rhythm",
                          "match": "3 consecutive blocks opening with '%s'" % word})
            run = []

    for lineno, text in units:
        m = BOLD_LEAD.match(raw.get(lineno, text))
        if m and len(m.group(1).split()) < 8:
            found.append({"line": lineno, "category": "formatting",
                          "match": "bold label carrying a short bullet"})
        if HEADING_EMOJI.match(text):
            found.append({"line": lineno, "category": "formatting",
                          "match": "emoji in heading"})
        if HASHTAG.search(text) and not text.lstrip().startswith("#"):
            found.append({"line": lineno, "category": "formatting",
                          "match": "hashtag in prose"})
    return found


def scan(source):
    units = strip_fences(source.splitlines())
    masked = [(n, mask(t)) for n, t in units]
    raw = dict(units)

    findings = []
    for lineno, text in masked:
        hits = scan_terms(lineno, text)
        if hits and is_catalog_line(text, hits):
            continue
        findings.extend(hits)
    findings.extend(scan_structure(masked, raw))
    findings.sort(key=lambda f: (f["line"], f["category"]))
    return findings


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("path")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--strict", action="store_true",
                    help="exit 1 when findings exist")
    args = ap.parse_args()

    with open(args.path, encoding="utf-8") as fh:
        findings = scan(fh.read())

    if args.json:
        print(json.dumps(findings, indent=2, ensure_ascii=False))
    elif not findings:
        print("%s: no countable tells found." % args.path)
        print("Judgment calls (padding, register, invented detail) are not "
              "covered here. Run the SKILL.md checklist.")
    else:
        for f in findings:
            note = (" [%s]" % f["note"]) if f.get("note") else ""
            print("%s:%d  %-16s %s%s"
                  % (args.path, f["line"], f["category"], f["match"], note))
        print("\n%d findings. Each is a candidate, not a verdict — see the "
              "exceptions section of SKILL.md." % len(findings))

    return 1 if (args.strict and findings) else 0


if __name__ == "__main__":
    sys.exit(main())
