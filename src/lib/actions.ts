// Turns a recorded action such as `click({"coordinate":[750,710]})` into a verb, a short detail and a mark to draw.

export type ActionGroup = "pointer" | "keyboard" | "navigate" | "wait" | "view" | "terminal" | "files" | "other";

export type Overlay =
  | { kind: "point"; x: number; y: number; label: string }
  | { kind: "drag"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "region"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "scroll"; x: number; y: number; dx: number; dy: number };

export type ParsedAction = {
  name: string;
  args: Record<string, unknown>;
  verb: string;
  detail: string;
  group: ActionGroup;
  overlay?: Overlay;
};

const VERBS: Record<string, [string, ActionGroup]> = {
  click: ["Click", "pointer"],
  left_click: ["Click", "pointer"],
  double_click: ["Double-click", "pointer"],
  triple_click: ["Triple-click", "pointer"],
  right_click: ["Right-click", "pointer"],
  middle_click: ["Middle-click", "pointer"],
  drag: ["Drag", "pointer"],
  left_click_drag: ["Drag", "pointer"],
  mouse_move: ["Move pointer", "pointer"],
  scroll: ["Scroll", "pointer"],
  type: ["Type", "keyboard"],
  key: ["Press", "keyboard"],
  navigate: ["Open", "navigate"],
  go_back: ["Back", "navigate"],
  go_forward: ["Forward", "navigate"],
  tabs: ["Tabs", "navigate"],
  wait: ["Wait", "wait"],
  screenshot: ["Look at screen", "view"],
  zoom: ["Zoom in", "view"],
  // Command-line agents
  bash: ["Run", "terminal"],
  shell: ["Run", "terminal"],
  sh: ["Run", "terminal"],
  terminal: ["Run", "terminal"],
  run_command: ["Run", "terminal"],
  execute_command: ["Run", "terminal"],
  read_file: ["Read file", "files"],
  view_file: ["Read file", "files"],
  write_file: ["Write file", "files"],
  create_file: ["Write file", "files"],
  edit_file: ["Edit file", "files"],
  str_replace_editor: ["Edit file", "files"],
  final_answer: ["Final answer", "other"],
};

// Filters for the step list, in the order they are offered.
export const ACTION_GROUPS: { id: ActionGroup; label: string }[] = [
  { id: "pointer", label: "Pointer" },
  { id: "keyboard", label: "Typing" },
  { id: "navigate", label: "Navigation" },
  { id: "wait", label: "Waits" },
  { id: "view", label: "Looking" },
  { id: "terminal", label: "Commands" },
  { id: "files", label: "Files" },
  { id: "other", label: "Other calls" },
];

const point = (v: unknown): [number, number] | null =>
  Array.isArray(v) && v.length >= 2 && typeof v[0] === "number" && typeof v[1] === "number" ? [v[0], v[1]] : null;

const clip = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);

export function parseAction(raw: string): ParsedAction {
  const m = /^\s*([a-zA-Z_]+)\s*\(([\s\S]*)\)\s*$/.exec(raw);
  const name = m ? m[1] : raw.split("(")[0] || "action";
  let args: Record<string, unknown> = {};
  if (m && m[2].trim()) {
    try {
      args = JSON.parse(m[2]);
    } catch {
      args = { raw: m[2] };
    }
  }
  const [verb, group] = VERBS[name] ?? [name.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), "other" as const];
  let detail = "";
  let overlay: Overlay | undefined;
  const at = point(args.coordinate);

  switch (name) {
    case "type":
      detail = `"${clip(String(args.text ?? ""), 160)}"`;
      break;
    case "key":
      detail = (Array.isArray(args.keys) ? args.keys : [args.keys ?? args.key ?? args.text]).filter(Boolean).join(" + ");
      break;
    case "navigate":
      detail = String(args.url ?? "");
      break;
    case "wait":
      detail = args.seconds === undefined ? "" : `${args.seconds}s`;
      break;
    case "bash":
    case "shell":
    case "sh":
    case "terminal":
    case "run_command":
    case "execute_command":
      detail = String(args.command ?? args.cmd ?? args.input ?? args.raw ?? (Object.keys(args).length ? JSON.stringify(args) : ""));
      break;
    case "read_file":
    case "view_file":
    case "write_file":
    case "create_file":
    case "edit_file":
    case "str_replace_editor":
      detail = String(args.path ?? args.file_path ?? args.file ?? (Object.keys(args).length ? clip(JSON.stringify(args), 140) : ""));
      break;
    case "tabs":
      detail = [args.action, args.index ?? args.url].filter((v) => v !== undefined && v !== null).join(" ");
      break;
    case "scroll": {
      const dy = Number(args.scroll_y ?? 0);
      const dx = Number(args.scroll_x ?? 0);
      detail = [dy > 0 ? "down" : dy < 0 ? "up" : dx > 0 ? "right" : dx < 0 ? "left" : "", dy || dx ? `${Math.abs(dy || dx)}px` : ""]
        .filter(Boolean)
        .join(" ");
      if (at) overlay = { kind: "scroll", x: at[0], y: at[1], dx, dy };
      break;
    }
    case "drag":
    case "left_click_drag": {
      const from = point(args.from ?? args.start_coordinate);
      const to = point(args.to ?? args.coordinate);
      if (from && to) {
        overlay = { kind: "drag", x1: from[0], y1: from[1], x2: to[0], y2: to[1] };
        detail = `(${from.join(", ")}) to (${to.join(", ")})`;
      }
      break;
    }
    case "zoom": {
      const r = args.region;
      if (Array.isArray(r) && r.length === 4) {
        overlay = { kind: "region", x1: r[0], y1: r[1], x2: r[2], y2: r[3] };
        detail = `region ${r.join(", ")}`;
      }
      break;
    }
    default:
      if (at) detail = `at (${at.join(", ")})`;
      else if (Object.keys(args).length) detail = clip(JSON.stringify(args), 140);
  }
  if (at && !overlay && group === "pointer") overlay = { kind: "point", x: at[0], y: at[1], label: verb };
  return { name, args, verb, detail, group, overlay };
}
