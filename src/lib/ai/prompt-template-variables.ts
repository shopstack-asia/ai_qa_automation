/**
 * Variable names that can be used in the User prompt template for AI test case generation.
 * Use {{name}} in the template; they are replaced when generating (see generate-test-case-from-ticket.ts).
 */
export const PROMPT_TEMPLATE_VARIABLES = [
  { name: "{{title}}", description: "Ticket title" },
  { name: "{{description}}", description: "Ticket description" },
  { name: "{{acceptance_criteria}}", description: "Ticket acceptance criteria" },
  { name: "{{application}}", description: "Application name from ticket" },
  { name: "{{application_name}}", description: "Same as {{application}}" },
  { name: "{{allowed_test_types}}", description: "JSON array e.g. [\"API\",\"E2E\"]" },
  { name: "{{allowed_types}}", description: "Same as {{allowed_test_types}}" },
] as const;
