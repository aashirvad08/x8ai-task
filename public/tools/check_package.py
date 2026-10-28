#!/usr/bin/env python3
"""Checks a Run Deck task package before it is zipped and uploaded.

Usage: python3 check_package.py <staging-folder>

Prints one line per task, then every warning and error. Exits with status 1 if there are errors.
Run Deck's upload page applies the same rules, so a package that passes here uploads cleanly.
"""
import json
import re
import sys
from pathlib import Path

REF = re.compile(r"\[\[(?:r(\d+):)?(\d+)(?:\s*[-–]\s*(\d+))?\]\]", re.I)
SHOT = re.compile(r"step_(\d+)\.(png|webp|jpe?g)", re.I)
ACTION = re.compile(r"\s*[A-Za-z_][\w.-]*\s*\(.*\)\s*$", re.S)
KINDS = {"hidden-evidence", "timing-window", "irreversible-action", "restraint",
         "privacy-boundary", "decoy", "gated-process", "derived-answer"}
STATUSES = {"draft", "verified", "reviewed"}
MODALITIES = {"gui", "terminal", "tool"}
MAX_SHOT = 8 * 1024 * 1024
MAX_OBSERVATION = 20_000
MAX_LINE = 1_000_000
MAX_STEPS = 20_000
MAX_RUNS = 60

errors, warnings = [], []


def load(path, what):
    try:
        v = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(v, dict):
            raise ValueError("expected an object")
        return v
    except Exception as e:
        errors.append(f"{what}: not valid JSON ({e})")
        return None


def python_instruction(src):
    m = re.search(r"^INSTRUCTION\s*=\s*[rRuU]?(\"\"\"|''')(.*?)\1", src, re.S | re.M) \
        or re.search(r"^INSTRUCTION\s*=\s*[rRuU]?([\"'])((?:\\.|(?!\1).)*)\1", src, re.M)
    return m.group(2).strip() if m else None


root = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
tasks = sorted({p.parents[2] for p in root.glob("**/rollouts/*/traj.jsonl")})
if not tasks:
    errors.append("No tasks found: each task needs <task-folder>/rollouts/<run>/traj.jsonl")
names = [t.name for t in tasks]
for n in sorted({n for n in names if names.count(n) > 1}):
    errors.append(f"Two tasks are named {n}; task folder names must be unique in a package")

for task in tasks:
    T = task.name
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", T) or len(T) > 100:
        warnings.append(f"{T}: use lowercase letters, digits and hyphens in task folder names (up to 100)")
    vt = (load(task / "viewer/task.json", f"{T}/viewer/task.json") if (task / "viewer/task.json").exists() else {}) or {}

    instruction = (vt.get("instruction") or "").strip()
    if not instruction and (task / "instruction.md").exists():
        instruction = (task / "instruction.md").read_text(encoding="utf-8").strip()
    py = task / "reward_setup_script/task.py" if (task / "reward_setup_script/task.py").exists() else task / "task.py"
    if not instruction and py.exists():
        instruction = python_instruction(py.read_text(encoding="utf-8")) or ""
        if not instruction:
            errors.append(f"{T}: couldn't read a top-level INSTRUCTION string from task.py; add instruction.md instead")
    if not instruction:
        errors.append(f"{T}: no instruction (instruction.md)")

    runs, steps_of, shots_of, checks, observations = {}, {}, {}, None, 0
    run_dirs = [rd for rd in sorted((task / "rollouts").iterdir()) if (rd / "traj.jsonl").exists()]
    if len(run_dirs) > MAX_RUNS:
        errors.append(f"{T}: {len(run_dirs)} runs; the limit is {MAX_RUNS} per task")
    for rd in run_dirs:
        m = re.search(r"(\d+)$", rd.name)
        if not m:
            errors.append(f"{T}/{rd.name}: run folder names must end in a number (rollout1, rollout2, …)")
            continue
        n = int(m.group(1))
        if n in runs:
            errors.append(f"{T}: two run folders end in {n}")
        where = f"{T}/rollouts/{rd.name}"
        steps = []
        for i, line in enumerate((rd / "traj.jsonl").read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip():
                continue
            if len(line) > MAX_LINE:
                errors.append(f"{where}/traj.jsonl line {i}: longer than 1 MB")
                continue
            try:
                d = json.loads(line)
            except Exception:
                errors.append(f"{where}/traj.jsonl line {i}: not JSON")
                continue
            s = d.get("step num") if isinstance(d, dict) else None
            if not isinstance(s, int) or isinstance(s, bool):
                errors.append(f"{where}/traj.jsonl line {i}: \"step num\" must be an integer")
                continue
            if not isinstance(d.get("action"), str) or not ACTION.match(d["action"]):
                warnings.append(f"{where} step {s}: action should look like name({{...}})")
            if not isinstance(d.get("thought", ""), str):
                errors.append(f"{where} step {s}: \"thought\" must be a string")
            obs = d.get("observation")
            if obs is not None and not isinstance(obs, str):
                errors.append(f"{where} step {s}: \"observation\" must be a string")
            elif obs:
                observations += 1
                if len(obs) > MAX_OBSERVATION:
                    warnings.append(f"{where} step {s}: observation is {len(obs)} characters; only the first {MAX_OBSERVATION} are shown")
            steps.append(s)
        if steps != list(range(1, len(steps) + 1)):
            errors.append(f"{where}: \"step num\" must run 1, 2, 3, … with no gaps or repeats")
        if len(steps) > MAX_STEPS:
            errors.append(f"{where}: {len(steps)} steps; the limit is {MAX_STEPS} per run")
        if not steps:
            errors.append(f"{where}/traj.jsonl: no steps")
        steps_of[n] = set(steps)

        shots = {}
        if (rd / "screenshots").is_dir():
            for f in (rd / "screenshots").iterdir():
                mm = SHOT.fullmatch(f.name)
                if not mm:
                    if f.name != ".DS_Store":
                        warnings.append(f"{where}/screenshots/{f.name}: not named step_N.png|webp|jpg, ignored")
                    continue
                shots[int(mm.group(1))] = f
                if f.stat().st_size > MAX_SHOT:
                    errors.append(f"{where}/screenshots/{f.name}: over 8 MB")
        shots_of[n] = shots
        extra = sorted(set(shots) - set(steps))
        if extra:
            warnings.append(f"{where}: screenshots for steps not in traj.jsonl, e.g. {extra[:5]}")

        rf = rd / "reward.txt" if (rd / "reward.txt").exists() else rd / "reward.json"
        if not rf.exists():
            errors.append(f"{where}: missing reward.txt")
            runs[n] = None
            continue
        rw = load(rf, f"{where}/reward.txt") or {}
        runs[n] = rw.get("model")
        if not isinstance(rw.get("model"), str) or not rw.get("model"):
            errors.append(f"{where}/reward.txt: needs \"model\"")
        if not isinstance(rw.get("score"), (int, float)) or not 0 <= rw["score"] <= 1:
            errors.append(f"{where}/reward.txt: \"score\" must be a number from 0 to 1")
        ps = rw.get("partial_scores")
        if not isinstance(ps, dict) or not ps:
            errors.append(f"{where}/reward.txt: needs \"partial_scores\" with every graded check")
            continue
        for k, v in ps.items():
            if not isinstance(v, dict) or not isinstance(v.get("score"), (int, float)) or not isinstance(v.get("weight"), (int, float)):
                errors.append(f"{where}/reward.txt: check {k!r} needs numeric \"score\" and \"weight\"")
        if checks is None:
            checks = set(ps)
        elif set(ps) != checks:
            errors.append(f"{where}/reward.txt: checks differ from other runs: {sorted(set(ps) ^ checks)}")
        for h in rw.get("hard_zero_tripped") or []:
            if h not in ps:
                errors.append(f"{where}/reward.txt: hard_zero_tripped names unknown check {h!r}")
    checks = checks or set()

    modality = vt.get("modality")
    if modality is not None and modality not in MODALITIES:
        errors.append(f"{T}/viewer/task.json: \"modality\" must be gui, terminal or tool")
    if modality not in MODALITIES:
        modality = "gui" if any(shots_of.values()) or not observations else "terminal"
    if modality == "gui":
        for n, shots in shots_of.items():
            missing = sorted(steps_of.get(n, set()) - set(shots))
            if missing:
                warnings.append(f"{T}/rollouts run {n}: {len(missing)} step(s) without a screenshot, e.g. {missing[:5]}")
    elif not observations:
        warnings.append(f"{T}: a {modality} task with no \"observation\" on any step; the player will have no output to show")

    if not vt:
        warnings.append(f"{T}: no viewer/task.json; the deck will show only the instruction, grading and runs")
    else:
        for k in ("name", "headline"):
            if not vt.get(k):
                warnings.append(f"{T}/viewer/task.json: missing \"{k}\"")
        labelled = {c.get("id") for c in vt.get("criteria", [])}
        for c in sorted(labelled - checks, key=str):
            errors.append(f"{T}/viewer/task.json: criteria id {c!r} is not a check in reward.txt")
        for c in sorted(checks - labelled):
            warnings.append(f"{T}/viewer/task.json: check {c!r} has no label")
        for b in vt.get("blockers", []):
            bid = b.get("id", "?")
            for f in ("id", "title", "kind", "origin", "whatAgentSees", "whyHard", "rightPath", "wrongMove", "criteria", "caught"):
                if f not in b:
                    errors.append(f"{T}/viewer/task.json: blocker {bid} is missing \"{f}\"")
            if b.get("kind") not in KINDS:
                warnings.append(f"{T}/viewer/task.json: blocker {bid} kind {b.get('kind')!r} is not a standard kind")
            if b.get("origin") not in ("source-trace", "added-in-task"):
                errors.append(f"{T}/viewer/task.json: blocker {bid} origin must be source-trace or added-in-task")
            for c in b.get("criteria", []):
                if c not in checks:
                    errors.append(f"{T}/viewer/task.json: blocker {bid} guards unknown check {c!r}")
            for r in b.get("caught", []):
                if r not in runs:
                    errors.append(f"{T}/viewer/task.json: blocker {bid} caught run {r}, which doesn't exist")

    wp = task / "viewer/writeups.json"
    if not wp.exists():
        warnings.append(f"{T}: no viewer/writeups.json")
        w = {}
    else:
        w = load(wp, f"{T}/viewer/writeups.json") or {}

    def check_refs(text, where, default=None):
        for mm in REF.finditer(text or ""):
            r = int(mm.group(1)) if mm.group(1) else default
            if r is None:
                errors.append(f"{where}: {mm.group(0)} needs a run number, e.g. [[r4:{mm.group(2)}]]")
                continue
            if r not in steps_of:
                errors.append(f"{where}: {mm.group(0)} refers to run {r}, which doesn't exist")
                continue
            for s in {int(mm.group(2)), int(mm.group(3) or mm.group(2))}:
                if s not in steps_of[r]:
                    errors.append(f"{where}: {mm.group(0)}: run {r} has no step {s}")

    fallback = (w.get("review") or {}).get("status")
    if fallback is not None and fallback not in STATUSES:
        errors.append(f"{T}/viewer/writeups.json: review.status must be draft or verified")
    hidden = 0
    for i, f in enumerate(w.get("failureModes", []), 1):
        where = f"{T} failure mode {i}"
        for k in ("title", "summary", "rollouts", "criteria", "attribution", "severity"):
            if k not in f:
                errors.append(f"{where}: missing \"{k}\"")
        check_refs(f.get("summary"), where)
        for r in f.get("rollouts", []):
            if r not in runs:
                errors.append(f"{where}: run {r} doesn't exist")
        for c in f.get("criteria", []):
            if c not in checks:
                errors.append(f"{where}: unknown check {c!r}")
        if f.get("attribution") not in ("model", "environment", "mixed"):
            errors.append(f"{where}: attribution must be model, environment or mixed")
        if f.get("severity") not in ("critical", "major", "minor"):
            errors.append(f"{where}: severity must be critical, major or minor")
        hidden += (f.get("status") or fallback or "draft") == "draft"
    seen = set()
    for r in w.get("rollouts", []):
        n = r.get("rollout")
        where = f"{T} write-up for run {n}"
        if n not in runs:
            errors.append(f"{where}: no such run")
            continue
        if n in seen:
            errors.append(f"{where}: written twice")
        seen.add(n)
        for k in ("title", "body", "keyMoments"):
            if not r.get(k):
                errors.append(f"{where}: missing \"{k}\"")
        check_refs(r.get("body"), where, default=n)
        for km in r.get("keyMoments", []):
            if km.get("step") not in steps_of[n]:
                errors.append(f"{where}: key moment step {km.get('step')} doesn't exist")
            if km.get("tone") not in ("good", "bad", "neutral"):
                errors.append(f"{where}: key moment tone must be good, bad or neutral")
        hidden += (r.get("status") or fallback or "draft") == "draft"
    if w:
        for n in sorted(set(runs) - seen):
            warnings.append(f"{T}: run {n} has no write-up")
    if hidden:
        warnings.append(f"{T}: {hidden} write-up(s) are drafts and will be hidden")

    per_model = {}
    for n, m in runs.items():
        per_model.setdefault(m or "?", []).append(n)
    print(f"{T} ({modality}): " + ", ".join(f"{m} runs {sorted(v)}" for m, v in per_model.items())
          + f"; {sum(len(s) for s in steps_of.values())} steps; {sum(len(s) for s in shots_of.values())} screenshots;"
          + f" {observations} observations; {len(w.get('failureModes', []))} failure modes; {len(seen)} run write-ups")

for m in warnings:
    print("WARN ", m)
for m in errors:
    print("ERROR", m)
print(f"\n{len(tasks)} task(s), {len(errors)} error(s), {len(warnings)} warning(s)")
sys.exit(1 if errors else 0)
