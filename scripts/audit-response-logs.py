#!/usr/bin/env python3
import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

UI_BREAK_PATTERNS = {
    "boxed": re.compile(r"\\boxed\s*\{"),
    "bracket_display": re.compile(r"\\\[|\\\]"),
    "paren_inline": re.compile(r"\\\(|\\\)"),
    "single_dollar_line": re.compile(r"(?m)^\s*\$(?!\$)\s*$"),
    "raw_latex_outside_display": re.compile(
        r"\\(?:frac|sqrt|int|sum|lim|begin|left|right|cdot)\b"
    ),
}

NEMANJA_MARKERS = [
    "kalk",
    "so",
    "now",
    "remember",
    "board",
    "what do we",
    "there we go",
    "that's it",
    "keep in mind",
    "does that make sense",
]

FAILURE_TAXONOMY = {
    "SAN": "Sanitizer Leak",
    "DISC": "Discrepancy",
    "RAG": "RAG Route",
    "UI": "UI Breaking",
    "LOGIC": "Math/Answer Logic",
    "REQ": "Request Failure",
    "UNK": "Uncategorized",
}


def code_for_failure(failure: str) -> str:
    text = failure.lower()
    if any(token in text for token in ["prose inside display math", "raw latex outside", "broken step", "placeholder"]):
        return "SAN"
    if any(token in text for token in ["boxed", "bracket", "paren", "single_dollar", "unsupported", "unbalanced", "empty_display"]):
        return "UI"
    if any(token in text for token in ["mismatch", "final answer", "logic"]):
        return "DISC"
    if "rag" in text or "grounding" in text or "lecture" in text:
        return "RAG"
    return "UNK"


def strip_display_math(text: str) -> str:
    return re.sub(r"\$\$[\s\S]*?\$\$", "", text)


def final_answer(text: str) -> str:
    match = re.search(r"(?:##\s*)?Final Answer\s*:?\s*([\s\S]*)", text, re.I)
    if not match:
        return ""
    answer = match.group(1)
    math_blocks = re.findall(r"\$\$([\s\S]*?)\$\$", answer)
    if math_blocks:
        answer = math_blocks[-1]
    else:
        first_paragraph = answer.split("\n\n", 1)[0]
        trailing_value = re.search(
            r"(?:is|equals|gives|result\s+is)\s*:?\s*(-?\d+(?:\.\d+)?)\s*\.?\s*$",
            first_paragraph,
            re.I,
        )
        equation = re.search(
            r"(?:[a-z]\s*=\s*)?(?:[a-z]\s*)?[a-z]\s*[+\-]\s*\d+(?:\.\d+)?",
            first_paragraph,
            re.I,
        )
        numbers = re.findall(r"-?\d+(?:\.\d+)?", first_paragraph)
        if trailing_value:
            answer = trailing_value.group(1)
        elif equation:
            answer = equation.group(0)
        elif numbers and len(first_paragraph) > 30:
            answer = numbers[-1]
        else:
            answer = first_paragraph
    answer = re.sub(r"\$\$", "", answer)
    answer = re.sub(r"\s+", " ", answer).strip()
    return answer[:500]


def normalize_answer(answer: str) -> str:
    normalized = answer.lower()
    normalized = normalized.replace("\\left", "").replace("\\right", "")
    normalized = normalized.replace("\\,", "").replace(" ", "")
    normalized = normalized.replace("{", "").replace("}", "")
    normalized = normalized.replace("\\quad", "")

    matrix_match = re.search(r"(?:[a-z]{1,3}=)?(\\beginbmatrix[\s\S]*?\\endbmatrix)", normalized)
    if matrix_match:
        return matrix_match.group(1)

    y_equation = re.search(r"y=x[+-]\d+(?:\.\d+)?", normalized)
    if y_equation:
        return y_equation.group(0)

    normalized = normalized.replace("f'(x)=", "")
    normalized = normalized.replace("y=", "")

    ordered_triple = re.search(r"(?:x=)?(-?\d+(?:\.\d+)?),?(?:y=)?(-?\d+(?:\.\d+)?),?(?:z=)?(-?\d+(?:\.\d+)?)", normalized)
    if ordered_triple and ("x=" in normalized or "(x,y,z)" in normalized):
        return ",".join(ordered_triple.groups())

    if "mean" in normalized and ("variance" in normalized or "standarddeviation" in normalized):
        return ",".join(re.findall(r"-?\d+(?:\.\d+)?", normalized))

    if "z-score" in normalized or normalized.startswith("z="):
        decimals = re.findall(r"-?\d+\.\d+", normalized)
        if decimals:
            return decimals[-1]
        rhs = re.search(r"z=(-?\d+(?:\.\d+)?)", normalized)
        if rhs:
            return rhs.group(1)

    if "sum" in normalized or "\\sum" in normalized:
        numbers = re.findall(r"-?\d+(?:\.\d+)?", normalized)
        if numbers:
            return numbers[-1]

    value_phrase = re.search(r"(?:value|price|finalprice|equals|is)(?:[^-0-9]*)(-?\d+(?:\.\d+)?)\.?$", normalized)
    if value_phrase:
        return value_phrase.group(1)

    simple_rhs = re.search(r"=(-?\d+(?:\.\d+)?)\.?$", normalized)
    if simple_rhs and normalized.count("=") == 1:
        return simple_rhs.group(1)

    return normalized


def ui_breaks(text: str):
    outside = strip_display_math(text)
    failures = []
    for name, pattern in UI_BREAK_PATTERNS.items():
        target = outside if name == "raw_latex_outside_display" else text
        if pattern.search(target):
            failures.append(name)
    if text.count("$$") % 2:
        failures.append("unbalanced_display_fences")
    if any(not match.strip() for match in re.findall(r"\$\$([\s\S]*?)\$\$", text)):
        failures.append("empty_display_block")
    return failures


def add_failure(code_counter, detail_counter, examples, code, detail, entry):
    code_counter[code] += 1
    detail_counter[code][detail] += 1
    if len(examples[code]) < 8:
        examples[code].append(
            {
                "id": entry.get("id"),
                "mode": entry.get("mode"),
                "category": entry.get("category"),
                "prompt": entry.get("prompt"),
                "detail": detail,
            }
        )


def persona_density(text: str) -> int:
    lower = text.lower()
    return sum(lower.count(marker) for marker in NEMANJA_MARKERS)


def grounding_hits(entry) -> int:
    expected = entry.get("expectedGroundingKeywords") or []
    if not expected:
        return 0
    lower = (entry.get("output") or "").lower()
    return sum(1 for keyword in expected if keyword.lower() in lower)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("path", nargs="?", default="scripts/response_logs.json")
    parser.add_argument("--json", action="store_true", help="print machine-readable JSON")
    args = parser.parse_args()

    path = Path(args.path)
    entries = json.loads(path.read_text(encoding="utf-8"))

    ui_counter = Counter()
    failure_counter = Counter()
    failure_details = defaultdict(Counter)
    failure_examples = defaultdict(list)
    persona_scores = defaultdict(list)
    grounding_missing = []
    grouped = defaultdict(dict)

    for entry in entries:
        output = entry.get("output") or ""
        for failure in ui_breaks(output):
            ui_counter[failure] += 1
            add_failure(failure_counter, failure_details, failure_examples, code_for_failure(failure), failure, entry)
        for failure in entry.get("failures") or []:
            add_failure(failure_counter, failure_details, failure_examples, code_for_failure(failure), failure, entry)
        mode = entry.get("mode", "unknown")
        persona_scores[mode].append(persona_density(output))
        if entry.get("expectedGroundingKeywords") and grounding_hits(entry) == 0:
            grounding_missing.append(entry.get("id") or entry.get("prompt"))
            add_failure(
                failure_counter,
                failure_details,
                failure_examples,
                "RAG",
                "missing expected grounding keyword",
                entry,
            )
        key = (entry.get("pass"), entry.get("prompt"))
        grouped[key][mode] = normalize_answer(final_answer(output))

    mismatches = []
    by_category = Counter()
    category_totals = Counter()
    for key, modes in grouped.items():
        pure = modes.get("pure")
        if not pure:
            continue
        for mode, answer in modes.items():
            if mode == "pure" or not answer:
                continue
            category = next(
                (
                    entry.get("category", "uncategorized")
                    for entry in entries
                    if (entry.get("pass"), entry.get("prompt")) == key
                ),
                "uncategorized",
            )
            category_totals[category] += 1
            if answer != pure:
                mismatches.append({"key": key, "mode": mode, "pure": pure, "other": answer, "category": category})
                by_category[category] += 1
                add_failure(
                    failure_counter,
                    failure_details,
                    failure_examples,
                    "DISC",
                    "Nemanja/Pure Logic final answer mismatch",
                    {
                        "id": None,
                        "mode": mode,
                        "category": category,
                        "prompt": key[1],
                    },
                )

    mismatch_rate = (len(mismatches) / max(1, sum(category_totals.values()))) * 100
    persona_summary = {
        mode: {
            "count": len(scores),
            "average": round(sum(scores) / max(1, len(scores)), 3),
            "min": min(scores) if scores else 0,
            "max": max(scores) if scores else 0,
        }
        for mode, scores in persona_scores.items()
    }

    summary = {
        "entries": len(entries),
        "ui_breaks": dict(ui_counter),
        "failure_taxonomy": FAILURE_TAXONOMY,
        "failures_by_code": {
            code: {
                "label": FAILURE_TAXONOMY.get(code, "Uncategorized"),
                "count": failure_counter.get(code, 0),
                "details": dict(failure_details.get(code, {})),
                "examples": failure_examples.get(code, []),
            }
            for code in FAILURE_TAXONOMY
            if failure_counter.get(code, 0)
        },
        "mismatch_count": len(mismatches),
        "mismatch_rate_percent": round(mismatch_rate, 3),
        "mismatch_by_category": dict(by_category),
        "persona_density": persona_summary,
        "grounding_missing_count": len(grounding_missing),
        "grounding_missing_examples": grounding_missing[:20],
        "requires_targeted_expansion": [
            category
            for category, total in category_totals.items()
            if total and (by_category[category] / total) > 0.03
        ],
    }

    if args.json:
        print(json.dumps(summary, indent=2))
    else:
        print(json.dumps(summary, indent=2))
        if summary["requires_targeted_expansion"]:
            print("\nTargeted expansion needed for:", ", ".join(summary["requires_targeted_expansion"]))


if __name__ == "__main__":
    main()
