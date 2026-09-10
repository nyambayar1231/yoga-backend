import { z } from 'zod';
import { objectId } from '../../lib/http.ts';
import { SCHOOL_YEAR_PATTERN } from '../../models/enrollment.ts';

/** '2026-2027'. Shared so the class roster and /enrollments agree on the shape. */
export const schoolYear = z
  .string()
  .trim()
  .regex(SCHOOL_YEAR_PATTERN, 'must look like 2026-2027');

/** Body of POST /classes/:id/students - the class comes from the URL. */
export const enrollBody = z.object({
  studentId: objectId,
  schoolYear,
});
