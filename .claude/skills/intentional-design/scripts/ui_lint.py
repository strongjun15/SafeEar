#!/usr/bin/env python3
"""Flag countable visual tells in CSS, HTML, JSX/TSX, Vue and Svelte files.

Findings only, no score. Everything here is a literal, checkable pattern; the
judgment calls in SKILL.md (is this focal point right, does this layout suit
the task) cannot be linted and are left to the reviewer.

A finding is a candidate, not a verdict. Several of these patterns are
legitimate under a stated design direction — see the exceptions section of
SKILL.md.

Standard library only. Python 3.8+.

    python ui_lint.py src/
    python ui_lint.py app/globals.css --json
    python ui_lint.py src/ --strict          # exit 1 when findings exist

Skipped: comments, node_modules, build output, minified files, and any line
carrying a `ui-lint: ignore` marker.
"""

import argparse
import json
import os
import re
import sys

EXTS = {".css", ".scss", ".sass", ".less", ".html", ".htm",
        ".jsx", ".tsx", ".js", ".ts", ".vue", ".svelte", ".astro"}

SKIP_DIRS = {"node_modules", ".git", "dist", "build", ".next", "out",
             "vendor", "coverage", ".venv", "__pycache__"}

IGNORE = re.compile(r"ui-lint:\s*ignore")

# (regex, category, message, note about when it is legitimate)
RULES = [
    (r"transition\s*:\s*all\b", "motion",
     "transition: all animates properties you did not choose",
     "never; name the properties"),

    (r"transition\s*:[^;]*\b(width|height|top|left|right|bottom|margin|padding)\b",
     "motion", "transition on a layout property forces reflow",
     "rare; prefer transform"),

    (r":hover[^{]*\{[^}]*transform\s*:\s*(scale|translate)", "motion",
     "hover transform on an element",
     "direct-manipulation affordances only"),

    (r"animation[^;]*infinite", "motion", "infinite animation",
     "spinners and genuine progress only"),

    (r"outline\s*:\s*(none|0)\b", "a11y",
     "focus outline removed",
     "only with a replacement indicator on the same selector"),

    (r"user-select\s*:\s*none", "a11y", "text selection disabled",
     "drag handles and controls, not content"),

    (r"font-size\s*:\s*(?:0?\.[0-5]\d*rem|[0-9]px|1[01]px)\b", "type",
     "font-size below 12px",
     "never for text a user must read"),

    (r"linear-gradient|radial-gradient|conic-gradient", "color",
     "gradient",
     "brand identity, data scales, or low-opacity depth on large surfaces"),

    (r"backdrop-filter\s*:", "surface", "backdrop blur",
     "overlays above real content: media chrome, sheets, palettes"),

    (r"border-radius\s*:\s*(?:1[6-9]|[2-9]\d|\d{3,})px", "shape",
     "border-radius at or above 16px",
     "art-directed direction, or genuine pills and avatars"),

    (r"box-shadow\s*:[^;]*\b(?:[3-9]\d|\d{3,})px", "surface",
     "shadow blur or offset at or above 30px",
     "modals and large floating surfaces"),

    (r"!important", "system", "!important",
     "third-party overrides and reduced-motion resets"),

    (r"z-index\s*:\s*(?:\d{4,})", "system", "z-index above 999",
     "never; use a layer scale"),

    (r"\bwidth\s*:\s*\d{3,}px", "layout", "hard-coded pixel width",
     "fixed-size media and controls"),

    (r"(?<![-\w])#[0-9a-fA-F]{3,8}\b", "system", "literal color value",
     "inside the token file itself"),

    (r"\b(?:lorem ipsum|dolor sit amet)\b", "content", "placeholder copy",
     "explicitly labelled wireframes only"),

    (r">\s*(?:Your Company|Company Name|Feature (?:One|Two|Three)|Lorem)\b",
     "content", "placeholder content in markup",
     "explicitly labelled wireframes only"),

    (r"(?:Trusted by|Loved by|Used by)\s+(?:\d[\d,+kKmM]*\s+)?(?:teams|companies|developers|engineers)",
     "content", "social-proof claim - verify it is real and cleared",
     "real, named, cleared customers"),

    (r"(?:\d[\d,.]*\s*(?:\+|k|K|M|million)?\s*(?:happy\s+)?(?:users|customers|downloads)\b)",
     "content", "usage figure - verify the number is real",
     "real, sourced numbers"),

    (r"placeholder\s*=\s*[\"'][^\"']+[\"'](?![^>]*aria-label)", "a11y",
     "input with a placeholder - confirm it also has a visible label",
     "never as the only label"),

    (r"<img(?![^>]*\balt=)[^>]*>", "a11y", "img without alt",
     'decorative images still need alt=""'),

    (r"<div[^>]*onClick", "a11y", "click handler on a div",
     "never; use a button"),

    (r"<(?:div|span)[^>]*\brole=[\"']button[\"'](?![^>]*tabIndex)", "a11y",
     "role=button without tabIndex",
     "never"),

    (r"[\U0001F300-\U0001FAFF]", "content", "emoji in source",
     "user content and deliberate copy, not product iconography"),
]

COMPILED = [(re.compile(p, re.IGNORECASE | re.DOTALL), c, m, n)
            for p, c, m, n in RULES]

BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)
HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
LINE_COMMENT = re.compile(r"(?m)^\s*//.*$")

TOKENISH = re.compile(r"tokens?|variables?|theme|palette|globals", re.I)


def strip_comments(text):
    """Replace comments with spaces, preserving line numbers."""
    def blank(m):
        return re.sub(r"[^\n]", " ", m.group(0))
    text = BLOCK_COMMENT.sub(blank, text)
    text = HTML_COMMENT.sub(blank, text)
    text = LINE_COMMENT.sub(blank, text)
    return text


def line_of(text, index):
    return text.count("\n", 0, index) + 1


def scan_text(text, path):
    cleaned = strip_comments(text)
    lines = text.splitlines()   # originals: the ignore marker lives in a comment
    is_token_file = bool(TOKENISH.search(os.path.basename(path)))

    findings = []
    for pattern, category, message, note in COMPILED:
        if is_token_file and message == "literal color value":
            continue
        for m in pattern.finditer(cleaned):
            lineno = line_of(cleaned, m.start())
            raw = lines[lineno - 1] if lineno <= len(lines) else ""
            if IGNORE.search(raw):
                continue
            findings.append({
                "file": path, "line": lineno, "category": category,
                "message": message, "legitimate_when": note,
            })
    return findings


def collapse(findings, cap=5):
    """Report at most `cap` instances per message per file, then a count."""
    seen, out = {}, []
    for f in sorted(findings, key=lambda f: (f["file"], f["line"])):
        key = (f["file"], f["message"])
        seen[key] = seen.get(key, 0) + 1
        if seen[key] <= cap:
            out.append(f)
    extra = {k: v - cap for k, v in seen.items() if v > cap}
    return out, extra


def walk(target):
    if os.path.isfile(target):
        yield target
        return
    for root, dirs, files in os.walk(target):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            if os.path.splitext(name)[1].lower() in EXTS and ".min." not in name:
                yield os.path.join(root, name)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("path")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--cap", type=int, default=5,
                    help="max instances reported per message per file")
    args = ap.parse_args()

    findings = []
    for path in walk(args.path):
        try:
            with open(path, encoding="utf-8", errors="replace") as fh:
                findings.extend(scan_text(fh.read(), path))
        except OSError as exc:
            print("skipped %s (%s)" % (path, exc), file=sys.stderr)

    if args.json:
        print(json.dumps(findings, indent=2, ensure_ascii=False))
        return 1 if (args.strict and findings) else 0

    shown, extra = collapse(findings, args.cap)
    if not shown:
        print("No countable visual tells found in %s." % args.path)
        print("Layout fit, hierarchy and honesty are not lintable. "
              "Run the checklist in SKILL.md.")
        return 0

    current = None
    for f in shown:
        if f["file"] != current:
            current = f["file"]
            print("\n%s" % current)
        print("  %5d  %-8s %s" % (f["line"], f["category"], f["message"]))
        print("         legitimate when: %s" % f["legitimate_when"])

    for (path, message), n in sorted(extra.items()):
        print("\n%s: %d more instances of \"%s\"" % (path, n, message))

    print("\n%d findings. Each is a candidate, not a verdict - check the "
          "exceptions section of SKILL.md before changing anything."
          % len(findings))
    return 1 if args.strict else 0


if __name__ == "__main__":
    sys.exit(main())
