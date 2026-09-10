import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { schemaOptions } from './base.ts';

/**
 * 'pending' is written when the upload URL is handed out, 'ready' once S3
 * confirms an object is actually there. A row that never leaves 'pending' is
 * an upload the client started and abandoned.
 */
export const UPLOAD_STATUSES = ['pending', 'ready'] as const;
export type UploadStatus = (typeof UPLOAD_STATUSES)[number];

/**
 * A file in S3. The bytes never touch this server: the client PUTs them to a
 * presigned URL and this row records what landed.
 */
export interface IUpload {
  /** Where it lives in the bucket. Random, so it cannot be guessed. */
  key: string;
  /** What the client called it. Kept for display and downloads. */
  filename: string;
  contentType: string;
  /** Read back from S3 on confirmation, never taken from the client. */
  size?: number;
  status: UploadStatus;
  uploadedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type UploadDocument = HydratedDocument<IUpload>;

const uploadSchema = new Schema<IUpload>(
  {
    key: { type: String, required: true, unique: true },
    filename: { type: String, required: true, trim: true, maxlength: 255 },
    contentType: { type: String, required: true, trim: true, maxlength: 150 },
    size: { type: Number, min: 0 },
    status: { type: String, enum: UPLOAD_STATUSES, default: 'pending' },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  schemaOptions(),
);

// Someone's own uploads, newest first.
uploadSchema.index({ uploadedBy: 1, createdAt: -1 });
// Finds the abandoned ones, for whatever eventually sweeps them up.
uploadSchema.index({ status: 1, createdAt: 1 });

export const Upload = model<IUpload>('Upload', uploadSchema);
