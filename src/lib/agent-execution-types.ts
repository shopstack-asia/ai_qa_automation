/**
 * Types for execution.agent_execution (runtime snapshot per execution).
 * NOT stored on TestCase.
 */

export type ResolutionStatus = "RESOLVED" | "UNRESOLVED" | "BROKEN" | "PENDING_RUNTIME";

export interface AgentExecutionAssertion {
  type: string;
  selector: string | null;
  value: unknown;
}

export type ResolvedFrom = "strict" | "knowledge" | "ai" | "ai_runtime";

export interface AgentExecutionStep {
  stepIndex: number;
  semantic_key: string;
  action: string;
  resolved_selector: string | null;
  resolution_status: ResolutionStatus;
  assertion: AgentExecutionAssertion | null;
  last_verified_at: string | null; // ISO datetime
  /** How selector was resolved; used by worker for auto-save when "ai" and validation passes */
  resolved_from?: ResolvedFrom;
}

export interface AgentExecution {
  steps: AgentExecutionStep[];
}
