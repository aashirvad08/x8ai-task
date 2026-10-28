import {
  AppWindow,
  ArrowLeft,
  ArrowRight,
  Clock,
  Eye,
  FileText,
  Globe,
  Keyboard,
  MousePointer2,
  MousePointerClick,
  Move,
  ScanSearch,
  ScrollText,
  SquareTerminal,
  Type,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ParsedAction } from "@/lib/actions";
import { cn } from "@/lib/utils";

const ICON: Record<string, LucideIcon> = {
  click: MousePointerClick,
  left_click: MousePointerClick,
  double_click: MousePointerClick,
  triple_click: MousePointerClick,
  right_click: MousePointerClick,
  middle_click: MousePointerClick,
  drag: Move,
  left_click_drag: Move,
  mouse_move: MousePointer2,
  scroll: ScrollText,
  type: Type,
  key: Keyboard,
  navigate: Globe,
  go_back: ArrowLeft,
  go_forward: ArrowRight,
  tabs: AppWindow,
  wait: Clock,
  screenshot: Eye,
  zoom: ScanSearch,
  bash: SquareTerminal,
  shell: SquareTerminal,
  sh: SquareTerminal,
  terminal: SquareTerminal,
  run_command: SquareTerminal,
  execute_command: SquareTerminal,
  read_file: FileText,
  view_file: FileText,
  write_file: FileText,
  create_file: FileText,
  edit_file: FileText,
  str_replace_editor: FileText,
};

export function ActionIcon({ name, size = 14 }: { name: string; size?: number }) {
  const Icon = ICON[name] ?? Wrench;
  return <Icon size={size} />;
}

// "Click at (750, 710)": verb in the body face, the detail in mono.
export function ActionLine({ action, compact }: { action: ParsedAction; compact?: boolean }) {
  return (
    <div className={cn("action-line", compact && "action-line-compact")}>
      <ActionIcon name={action.name} size={compact ? 12 : 14} />
      <span className="min-w-0">
        <span className="action-verb">{action.verb}</span>
        {action.detail && <span className="action-detail">{action.detail}</span>}
      </span>
    </div>
  );
}
