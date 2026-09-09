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

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
