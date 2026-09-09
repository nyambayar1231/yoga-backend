import mongoose from 'mongoose';

export function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set (load it from .env)');
  }
  return uri;
}

export async function connectDB(uri: string = getMongoUri()): Promise<typeof mongoose> {
  await mongoose.connect(uri);
  return mongoose;
}

/**
 * Brings every model's indexes in line with its schema. Correctness depends on
 * some of them - attendance uniqueness, one login per profile - so they are
 * built explicitly at boot rather than left to autoIndex.
 */
export async function syncIndexes(): Promise<void> {
  await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()));
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
