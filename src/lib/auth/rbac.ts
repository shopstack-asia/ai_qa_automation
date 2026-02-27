/**
 * RBAC: admin, manager, qa.
 * Permissions checked in API routes and UI.
 */

import { Role } from "@prisma/client";

export const PERMISSIONS = {
  MANAGE_USERS: "manage_users",
  MANAGE_SCHEDULE: "manage_schedule",
  MANAGE_GLOBAL_CONFIG: "manage_global_config",
  TRIGGER_EXECUTION: "trigger_execution",
  VIEW_REPORTS: "view_reports",
  CREATE_TEST_CASES: "create_test_cases",
  EDIT_TEST_CASES: "edit_test_cases",
  VIEW_EXECUTION_RESULTS: "view_execution_results",
  CREATE_PROJECT: "create_project",
  EDIT_APPLICATION: "edit_application",
  EDIT_ENVIRONMENT: "edit_environment",
} as const;

const ROLE_PERMISSIONS: Record<Role, readonly string[]> = {
  admin: [
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.MANAGE_SCHEDULE,
    PERMISSIONS.MANAGE_GLOBAL_CONFIG,
    PERMISSIONS.TRIGGER_EXECUTION,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.CREATE_TEST_CASES,
    PERMISSIONS.EDIT_TEST_CASES,
    PERMISSIONS.VIEW_EXECUTION_RESULTS,
    PERMISSIONS.CREATE_PROJECT,
    PERMISSIONS.EDIT_APPLICATION,
    PERMISSIONS.EDIT_ENVIRONMENT,
  ],
  manager: [
    PERMISSIONS.TRIGGER_EXECUTION,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.CREATE_TEST_CASES,
    PERMISSIONS.EDIT_TEST_CASES,
    PERMISSIONS.VIEW_EXECUTION_RESULTS,
    PERMISSIONS.CREATE_PROJECT,
    PERMISSIONS.EDIT_APPLICATION,
    PERMISSIONS.EDIT_ENVIRONMENT,
  ],
  qa: [
    PERMISSIONS.EDIT_TEST_CASES,
    PERMISSIONS.VIEW_EXECUTION_RESULTS,
  ],
};

export function hasPermission(role: Role, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function getPermissionsForRole(role: Role): string[] {
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}
