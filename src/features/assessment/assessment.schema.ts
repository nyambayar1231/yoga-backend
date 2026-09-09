import { z } from 'zod';
import { dateInput, objectId, optionalText, pagination } from '../../lib/http.ts';

/**
 * Shared by POST /api/members/:id/assessments and the flat assessment routes,
 * so both accept exactly the same body.
 */
export const assessmentBody = z.object({
  /** Required for an admin, who has no instructor profile of their own. */
  instructorId: objectId.optional(),
  assessmentDate: dateInput.optional(),
  type: z.string().trim().min(1).max(100),
  data: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().trim().max(4000).optional(),
});

export const assessmentUpdateBody = assessmentBody.omit({ instructorId: true }).partial();

export const assessmentQuery = pagination.extend({
  memberId: objectId.optional(),
  instructorId: objectId.optional(),
  type: optionalText,
  from: dateInput.optional(),
  to: dateInput.optional(),
});
