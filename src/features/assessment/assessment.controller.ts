import { Hono } from 'hono';
import type { AppEnv } from '../../lib/auth.ts';
import { idParam, page, validate } from '../../lib/http.ts';
import { requireAuth } from '../../middleware/auth.ts';
import { requireStaff } from '../../middleware/authorization.ts';
import { assessmentQuery, assessmentUpdateBody } from './assessment.schema.ts';
import {
  assertAssessmentAccess,
  assertAssessmentAuthor,
  countAssessments,
  listAssessments,
  requireAssessmentById,
  updateAssessment,
} from './assessment.service.ts';

export const assessmentController = new Hono<AppEnv>();

assessmentController.use('*', requireAuth);

/**
 * Browsing across members is a staff view. A member reads their own history
 * through GET /api/members/:id/assessments.
 */
assessmentController.get('/', requireStaff, validate('query', assessmentQuery), async (c) => {
  const { limit, skip, ...filter } = c.req.valid('query');

  const [assessments, total] = await Promise.all([
    listAssessments(filter, { limit, skip }),
    countAssessments(filter),
  ]);

  return c.json(page(assessments, total, { limit, skip }));
});

assessmentController.get('/:id', validate('param', idParam), async (c) => {
  const assessment = await requireAssessmentById(c.req.valid('param').id);
  assertAssessmentAccess(c.get('user'), assessment);
  return c.json(assessment);
});

assessmentController.patch(
  '/:id',
  requireStaff,
  validate('param', idParam),
  validate('json', assessmentUpdateBody),
  async (c) => {
    const assessment = await requireAssessmentById(c.req.valid('param').id);
    assertAssessmentAuthor(c.get('user'), assessment);

    return c.json(await updateAssessment(assessment.id, c.req.valid('json')));
  },
);
