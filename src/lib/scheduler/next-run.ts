/**
 * Compute next run time from cron expression. Used when creating/updating schedules.
 */

import cronParser from "cron-parser";

export function getNextRunFromCron(cronExpression: string): Date {
  const interval = cronParser.parseExpression(cronExpression);
  return interval.next().toDate();
}

export function validateCronExpression(cronExpression: string): boolean {
  try {
    cronParser.parseExpression(cronExpression);
    return true;
  } catch {
    return false;
  }
}
