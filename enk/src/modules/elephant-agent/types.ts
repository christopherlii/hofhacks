export type ElephantMode = 'reading' | 'reply' | 'compose' | 'editing' | 'reviewing' | 'unknown';

export interface NowState {
  correlation_id: string;
  timestamp: number;
  app: string;
  url: string | null;
  mode: ElephantMode;
  sender: string | null;
  sender_domain: string | null;
  subject: string | null;
  snippet: string | null;
  intent: string;
  entities: string[];
  recent_actions: string[];
  ui_targets: string[];
  confidence: 'low' | 'medium' | 'high';
}

export type ToolStepType = 'insert_text' | 'add_cc' | 'open_link' | 'create_reminder' | 'no_op';

export interface ToolStep {
  type: ToolStepType;
  args: Record<string, string | number | boolean>;
  reversible: boolean;
  verify: boolean;
}

export interface ToolPlan {
  id: string;
  summary: string;
  steps: ToolStep[];
  safe_by_default: true;
}

export interface Suggestion {
  id: string;
  label: string;
  why: string;
  preview: string;
  tool_plan: ToolPlan;
}

export type CaseOutcome = 'accepted' | 'ignored' | 'edited' | 'failed' | 'unknown';

export interface CaseRecord {
  case_id: string;
  correlation_id: string;
  timestamp: number;
  state_signature: string;
  now_state: NowState;
  intent: string;
  suggestion_label: string;
  actions_taken: ToolStep[];
  outcome: CaseOutcome;
  outcome_meta: {
    message?: string;
    verification_ok?: boolean;
    edit_distance_proxy?: number | 'unknown';
    source?: string;
  };
}

export interface RetrievedCase {
  score: number;
  record: CaseRecord;
}

export interface MemoryBrief {
  bullets: string[];
}

export interface ToolExecutionResult {
  ok: boolean;
  message: string;
  verification_ok: boolean;
  details?: Record<string, unknown>;
}
