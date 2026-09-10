/**
 * Shared schema options. Every model gets timestamps and the same JSON shape:
 * `id` instead of `_id`, no `__v`, plus whatever the model wants hidden.
 *
 * The return type is inferred on purpose - Mongoose's SchemaOptions is
 * parameterised by the schema it belongs to, so a shared annotation would not
 * fit every model.
 */
export function schemaOptions(hidden: readonly string[] = []) {
  return {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform(_doc: unknown, ret: Record<string, unknown>) {
        delete ret._id;
        delete ret.__v;
        for (const field of hidden) delete ret[field];
        return ret;
      },
    },
  };
}
