import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, addDays } from "../../lib/dates.js";

export const overviewQuerySchema = z.object({
  preset: z.enum(["this_week", "last_week", "last_2_weeks", "custom"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  centerId: z.string().optional(),
  departmentId: z.string().optional(),
  userId: z.string().optional(),
});

export type OverviewQuery = z.infer<typeof overviewQuerySchema>;

export function parseRangeQuery(query: Record<string, string | undefined>): { startDate: Date; endDate: Date } {
  const preset = query.preset;
  const now = new Date();

  if (preset === "this_week" || !preset && !query.startDate && !query.endDate) {
    return { startDate: startOfWeek(now), endDate: endOfWeek(now) };
  }
  if (preset === "last_week") {
    const start = addDays(startOfWeek(now), -7);
    return { startDate: start, endDate: endOfDay(addDays(start, 6)) };
  }
  if (preset === "last_2_weeks") {
    const start = addDays(startOfWeek(now), -7);
    return { startDate: start, endDate: endOfWeek(now) };
  }

  if (!query.startDate || !query.endDate) {
    throw AppError.badRequest("startDate and endDate are required for a custom range");
  }
  const startDate = startOfDay(new Date(query.startDate));
  const endDate = endOfDay(new Date(query.endDate));
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw AppError.badRequest("Invalid startDate or endDate");
  }
  if (startDate > endDate) {
    throw AppError.badRequest("startDate must be before endDate");
  }
  return { startDate, endDate };
}
