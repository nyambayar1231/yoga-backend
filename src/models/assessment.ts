import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { schemaOptions } from './base.ts';

/**
 * An instructor's evaluation of a member. The metrics themselves live in `data`
 * so new ones can be recorded without a migration; anything the studio needs to
 * search or filter on stays a top-level field.
 */
export interface IAssessment {
  memberId: Types.ObjectId;
  instructorId: Types.ObjectId;
  assessmentDate: Date;
  type: string;
  data: Record<string, unknown>;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AssessmentDocument = HydratedDocument<IAssessment>;

const assessmentSchema = new Schema<IAssessment>(
  {
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    instructorId: { type: Schema.Types.ObjectId, ref: 'Instructor', required: true },
    assessmentDate: { type: Date, required: true, default: () => new Date() },
    type: { type: String, required: true, trim: true, maxlength: 100 },
    data: { type: Schema.Types.Mixed, default: {} },
    notes: { type: String, trim: true, maxlength: 4000 },
  },
  schemaOptions(),
);

assessmentSchema.index({ memberId: 1, assessmentDate: -1 });
assessmentSchema.index({ instructorId: 1, assessmentDate: -1 });

export const Assessment = model<IAssessment>('Assessment', assessmentSchema);
