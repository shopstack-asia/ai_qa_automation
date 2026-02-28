/**
 * UI helpers for execution failure classification.
 * Classified status (from executionMetadata.execution_status) takes precedence over DB status for display.
 */

export type ExecutionStatusDisplay =
  | "PASSED"
  | "FAILED_BUSINESS"
  | "FAILED_UNVERIFIED_DATA"
  | "FAILED_SELECTOR"
  | "FAILED"
  | "RUNNING"
  | "QUEUED"
  | "IGNORE";

export type BadgeVariant = "success" | "destructive" | "warning" | "running" | "queued" | "default";

/** Resolve display status: use classified execution_status when failed, else DB status. */
export function getExecutionDisplayStatus(
  status: string,
  executionStatus?: string | null
): string {
  if (executionStatus && executionStatus !== "PASSED") {
    return executionStatus;
  }
  return status;
}

/** Badge variant for execution status (classified or DB). FAILED_UNVERIFIED_DATA and FAILED_SELECTOR use warning. */
export function executionStatusBadgeVariant(displayStatus: string): BadgeVariant {
  switch (displayStatus) {
    case "PASSED":
      return "success";
    case "FAILED_BUSINESS":
      return "destructive";
    case "FAILED_UNVERIFIED_DATA":
      return "warning";
    case "FAILED_SELECTOR":
      return "warning";
    case "FAILED":
      return "destructive";
    case "RUNNING":
      return "running";
    case "QUEUED":
      return "queued";
    case "IGNORE":
      return "default";
    default:
      return "default";
  }
}

/** Short label for failed status (e.g. for tooltips). */
export function executionStatusLabel(displayStatus: string): string {
  switch (displayStatus) {
    case "FAILED_BUSINESS":
      return "Business assertion failed";
    case "FAILED_UNVERIFIED_DATA":
      return "Assertion failed on unverified AI-simulated data";
    case "FAILED_SELECTOR":
      return "Selector / element not found";
    case "FAILED":
      return "Execution error";
    default:
      return displayStatus;
  }
}
