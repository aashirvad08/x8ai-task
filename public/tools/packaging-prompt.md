# Package my agent tasks for Run Deck

You are helping me package agent tasks and their recorded runs into **one .zip file** that I will upload to **Run Deck**, a review site. Run Deck turns each task into a short deck (the task and its instruction, how it is graded, the obstacles designed into it, results, failure modes and a write-up of every run) plus a step-by-step player. Everything it shows comes from the files you produce, so follow this specification exactly.

Never invent facts. If something below cannot be taken from my materials, ask me instead of guessing.

## Step 0: inventory first

Before writing any files, look through my materials and report back, for each task:

- what kind of agent it is: **computer-use** (it sees screenshots and clicks, types and scrolls), **command-line** (it runs shell commands and reads their output), or **tool / API** (it calls functions or APIs and reads their results);
- where the agent's instruction is;
- how many runs there are, and which model made each run;
- where each run's per-step actions, reasoning, and screenshots or outputs are;
- where the grader's per-check results are (which checks passed or failed in each run);
- anything that is missing.

Wait for my go-ahead, then build everything below.

## 1. Folder layout

Build a staging folder like this, then zip its contents:

```
run-deck-upload/
  <task-folder>/                      one folder per task
    instruction.md
    rollouts/
      rollout1/
        traj.jsonl
        reward.txt
        screenshots/                  computer-use tasks only
          step_1.png
          step_2.png
          …
      rollout2/
        …
    viewer/
      task.json
      writeups.json
  <another-task-folder>/
    …
```

Rules:

- **Task folder name**: lowercase letters, digits and hyphens, up to 100 characters, e.g. `t-r123-refund-dispute`. It is the task's permanent ID within my lab: uploading a folder with the same name later replaces that task with a new version, so keep names stable. If the name contains a part like `r123` between hyphens, Run Deck reads it as the source trace ID `R123` (unless `viewer/task.json` sets one).
- A folder only counts as a task if it contains `rollouts/<run>/traj.jsonl`.
- **Run folders**: `rollout1`, `rollout2`, … The number at the end is the run number shown everywhere (Run 4, R4) and used in step references, so it must be unique within the task. Group runs by model: for example, rollouts 1–3 for one model and 4–6 for the next.
- Don't add any other files. Run Deck ignores them, and macOS `.DS_Store` and `__MACOSX` entries.

## 2. The instruction: `instruction.md`

Exactly what the agent was told, word for word, as plain text. (If you already have a `task.py` that defines a top-level `INSTRUCTION = "…"` string, you may include it as `reward_setup_script/task.py` instead. An `"instruction"` field in `viewer/task.json` overrides both.)

## 3. Each step: `traj.jsonl`

One JSON object per line, in order. **One line per action the agent took** (if the agent made three tool calls in one turn, that is three lines):

```
{"step num": 1, "action": "navigate({\"url\":\"http://localhost:5001\"})", "thought": "I'll check the inbox first."}
{"step num": 2, "action": "click({\"coordinate\":[494,118]})", "thought": ""}
```

- `step num`: an integer, starting at 1 and increasing by 1, with no gaps or repeats. At most 20,000 steps per run.
- `action`: a string of the form `name({json arguments})`.
- `thought`: the agent's own reasoning or message at that step, exactly as recorded, or `""` if none was recorded. When one turn produced several actions, put the turn's reasoning on its first action and `""` on the rest. Never paraphrase or invent reasoning.
- `observation` (optional): what the agent got back from the action, as plain text: the command's output, the tool's result, or an error. Include it for command-line and tool tasks; for computer-use tasks the screenshot usually says it, so add it only for meaningful text results. Keep it as recorded; Run Deck shows the first 20,000 characters.

### Computer-use agents

Use these action names and arguments where they apply; they get readable labels and an on-screen marker in the player:

| action | arguments |
|---|---|
| `click`, `double_click`, `triple_click`, `right_click`, `middle_click`, `mouse_move` | `{"coordinate":[x,y]}` |
| `type` | `{"text":"…"}` |
| `key` | `{"keys":["ctrl","s"]}` |
| `navigate` | `{"url":"…"}` |
| `scroll` | `{"coordinate":[x,y],"scroll_x":0,"scroll_y":400}` (positive `scroll_y` scrolls down) |
| `drag` | `{"from":[x,y],"to":[x,y]}` |
| `zoom` | `{"region":[x1,y1,x2,y2]}` |
| `wait` | `{"seconds":3}` |
| `go_back`, `go_forward`, `screenshot` | `{}` |

Any other action is shown as written, as long as it keeps the `name({…})` shape. Coordinates are pixels on the screen the agent clicked on.

### Command-line agents

- Shell commands: `bash({"command":"ls -la /app"})`. Use `bash` whatever the shell was; its `observation` is the command's output (stdout and stderr, as recorded), including any error.
- File tools, if the agent had them: `read_file({"path":"…"})`, `write_file({"path":"…","content":"…"})`, `edit_file({"path":"…","old":"…","new":"…"})`, keeping the agent's own argument names if they differ.
- No screenshots.

### Tool / API agents

- Each call as `tool_name({json arguments})`, using the tool's real name and the arguments exactly as sent; its `observation` is the result as returned (JSON results stay JSON text).
- No screenshots, unless the agent also saw a screen.

### Converting Harbor / Terminal-Bench trajectories (ATIF `trajectory.json`)

If a run is recorded as an ATIF `trajectory.json` (with `steps`, each having `source`, `message`, `tool_calls` and `observation`):

- Skip steps whose `source` is `system` or `user`.
- For each `agent` step, write one line per entry in `tool_calls`: `action` is `function_name(arguments as JSON)`; `thought` is the step's `message` on its first call and `""` on the rest.
- The `observation` for a call is the text of the `observation.results` entry whose `source_call_id` matches the call's `tool_call_id`. If that content holds images (for example `data:image/png;base64,…`), decode the last image into `screenshots/step_N.png` for that step and keep only the text parts as `observation`.
- An agent step with a message but no tool calls (for example the final answer) becomes `final_answer({})` with the message as `thought`.

## 4. Screenshots (computer-use tasks)

- `screenshots/step_N.png` is the screen **after** step N. N matches `step num`; zero-padding such as `step_0007.png` is optional.
- If the recording captured the screen before each action instead, the capture taken just before step N+1 is the one for step N.
- PNG, WebP or JPEG, under 8 MB each. A step without a screenshot is allowed, and the player shows the previous screen, but avoid gaps.

## 5. The grader's result: `reward.txt` (JSON)

```
{
  "model": "model-a",
  "score": 0.55,
  "duration_sec": 3290,
  "partial_scores": {
    "records_requested": {"score": 1, "weight": 0.30, "description": "Asked the clinic for the full record"},
    "refund_amount":     {"score": 0, "weight": 0.25, "description": "Claimed the refund due under the policy"},
    "review_booked":     {"score": 1, "weight": 0.45, "description": "Booked the follow-up review on a valid day"},
    "no_payment_made":   {"score": 1, "weight": 0,    "description": "Made no payment on the customer's behalf"}
  },
  "hard_zero_tripped": []
}
```

- `model`: the model's name, spelled the same way in every run, because the score sheet groups runs by it.
- `score`: the run's final score from 0 to 1. **1.0 is a full pass.**
- `duration_sec` (optional): how long the agent ran, in seconds, if the recording says.
- `partial_scores`: **every** graded check, with the same check IDs in every run of the task.
  - `score`: 1 means met and 0 means not met.
  - `weight` above 0: an **objective**, worth that share of the score.
  - `weight` of 0: a **guardrail**, a must-not-happen gate that sets the whole run to 0 when broken. Run Deck describes weight-0 checks that way, so use weight 0 for nothing else.
  - `description`: one line saying what the check verifies.
- `hard_zero_tripped`: the IDs of guardrails this run broke, if any.
- Run Deck's "criteria achievement" is checks met ÷ all checks, so a missing check distorts it.
- If my grader does not report per-check results, stop and tell me.

## 6. The reviewer-facing description: `viewer/task.json`

```
{
  "name": "Refund After a Cancelled Booking",
  "modality": "gui",
  "sourceTraceId": "R123",
  "headline": "Get a refund for a cancelled booking when the cancellation email and the bank statement disagree about who cancelled.",
  "domain": "Travel / Consumer complaint",
  "apps": [
    {"name": "Gmail", "role": "Correspondence with the agency and the bank"},
    {"name": "Bank portal", "role": "Statements and the disputed charge"}
  ],
  "details": [
    {"title": "Starting state", "body": "What exists when the run begins."},
    {"title": "Time and waiting", "body": "Any simulated clock, deadlines or waiting the agent must do."},
    {"title": "What counts as done", "body": "When the agent should stop."}
  ],
  "criteria": [
    {"id": "refund_amount", "label": "Refund claimed in full", "explain": "Plain-language description of what the grader actually checks."}
  ],
  "blockers": [
    {
      "id": "b1",
      "title": "The confirmation email is out of date",
      "kind": "hidden-evidence",
      "origin": "added-in-task",
      "whatAgentSees": "The situation as it first appears to the agent.",
      "whyHard": "The trap or uncertainty, and the tempting wrong reading.",
      "rightPath": "The legitimate way through.",
      "wrongMove": "What a wrong move costs, which check it fails, and whether it can be undone.",
      "criteria": ["refund_amount"],
      "caught": [2, 5]
    }
  ]
}
```

- `name`: 3–6 words, Title Case. `headline`: one sentence on what the agent must achieve and why it is hard.
- `modality`: `gui` for computer-use, `terminal` for command-line, `tool` for tool / API agents. If you leave it out, Run Deck uses `gui` when there are screenshots and `terminal` otherwise.
- `apps`: the apps, systems or tools the agent works with (for a command-line task, for example the repository, the database and the test suite).
- `details`: include only the sections that apply, plus at most 1–3 more if they help a reviewer.
- `criteria`: one entry per check ID in `reward.txt`, with a short `label` and a plain `explain`. Whether a check is an objective or a guardrail, and its weight, always come from `reward.txt`.
- `blockers`: the obstacles deliberately built into the task, usually 4–8. Leave the list out if the task has none, and the deck skips the chapter.
  - `kind` is one of `hidden-evidence`, `timing-window`, `irreversible-action`, `restraint`, `privacy-boundary`, `decoy`, `gated-process`, `derived-answer`.
  - `origin` is `source-trace` if the obstacle existed in the real case the task was built from, otherwise `added-in-task`.
  - `criteria` lists the check IDs the blocker guards.
  - `caught` lists the run numbers that lost one of those checks because of this obstacle.

## 7. The write-ups: `viewer/writeups.json`

```
{
  "failureModes": [
    {
      "title": "Short name of a pattern seen across runs",
      "summary": "2–5 sentences. Every claim cites the step that shows it, e.g. the archive copy was forwarded as complete [[r2:181]], [[r5:157]].",
      "rollouts": [2, 5],
      "criteria": ["refund_amount"],
      "attribution": "model",
      "severity": "major"
    }
  ],
  "rollouts": [
    {
      "rollout": 1,
      "title": "One-line verdict, e.g. Right refund, but the review was booked on the wrong day",
      "body": "120–280 words: the run's arc in order — how it got its bearings, what it got right, where it went wrong (or why it passed) — citing steps like [[89]] or ranges like [[410-415]].",
      "keyMoments": [
        {"step": 89, "label": "Finds the cancellation email", "tone": "good"},
        {"step": 181, "label": "Forwards the outdated copy", "tone": "bad"}
      ]
    }
  ],
  "review": {"status": "verified"}
}
```

**Step references.** These turn into links that open that exact step:

- `[[r4:412]]` is run 4, step 412.
- `[[r4:410-415]]` is a range of steps.
- `[[412]]` is a step of the run the write-up is about; use it only inside that run's `body`.
- In `failureModes`, always include the run (`[[r4:412]]`).
- Writing a check ID in backticks, like `` `refund_amount` ``, shows it as its label.

**Failure modes.** Write 3–7, ordered by severity and then by how many runs show them. If every run passed, use an empty list.

- `rollouts`: the runs that show the pattern.
- `criteria`: the check IDs it cost, or `[]` if it cost nothing.
- `severity`: `critical` means it broke a guardrail and zeroed the run; `major` means it cost at least 20% of the score; `minor` means less than that, or nothing.
- `attribution`: `model` by default. Use `environment` only with concrete evidence the environment or grader was at fault, such as a message shown as sent that never arrived, or a correct answer the grader couldn't read. Use `mixed` when both played a part, and say in the text which part is which.

**Per-run write-ups.**

- Write one for every run. `rollout` must equal the run folder's number.
- Give each 4–10 `keyMoments` in step order: labels of at most 8 words, each with a `tone` of `good`, `bad` or `neutral`.

**Style.** Keep it simple, for a reviewer outside the team:

- Plain English and short sentences.
- No internal details: no file paths, server names or IP addresses, container, job or trial IDs, cloud account IDs or internal tool names. Model names and app names are fine.
- Every factual claim must be visible in the recording (the action, the thought, the output or the screenshot) or in the grader's output. If you are not sure what happened at a step, open it. If you are still not sure, leave the claim out.
- Scores come from `reward.txt`; never re-grade a run.
- Cite the step where the decisive action happens (the send, submit, click or command), not a nearby one.

**Verify before marking.** After writing, do a separate checking pass:

1. Open every cited step and key moment: its `traj.jsonl` line and its screenshot or output. Confirm each shows what the text claims.
2. Check every "N of M runs" or "all runs" claim against every run's `reward.txt`.
3. Fix whatever is wrong.

Only then set `"review": {"status": "verified"}`. If anything is still uncertain, set `"draft"` and list the open points under `"review": {"openIssues": ["…"]}`.

Run Deck shows only write-ups marked `verified` or `reviewed`; drafts stay hidden. Never use `reviewed` yourself, because it means a person has approved the write-up in Run Deck.

## 8. Check, then zip

Save the checker script below as `check_package.py` outside the staging folder. Run it with `python3 check_package.py run-deck-upload`, fix every error, then build the zip uncompressed (screenshots are already compressed, and an uncompressed zip opens instantly in the browser):

```
cd run-deck-upload && zip -r -0 -X ../run-deck-upload.zip . -x '*.DS_Store'
```

On Windows, `Compress-Archive -Path run-deck-upload\* -DestinationPath run-deck-upload.zip` also works; it just opens a little slower.

Finally, report:

- the zip's path and size;
- for each task: its kind (computer-use, command-line or tool), its runs per model, steps, screenshots or outputs, failure modes and run write-ups, and their status;
- the checker's output;
- any claims you weren't sure about.
