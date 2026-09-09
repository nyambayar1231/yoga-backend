import { connectDB, disconnectDB } from '../lib/db.ts';
import { User } from '../models/user.ts';
import { createUser, setPassword, UserError } from '../features/user/user.service.ts';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'nyambayarlucky@gmail.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Secret@1234';

/** Pass --force (or SEED_FORCE=1) to reset the password of an existing admin. */
const force = process.argv.includes('--force') || process.env.SEED_FORCE === '1';

async function seedAdmin(): Promise<void> {
  await connectDB();
  console.log('Connected to MongoDB');

  // Make sure the unique email index exists before we rely on it.
  await User.syncIndexes();

  const existing = await User.findByEmail(ADMIN_EMAIL);

  if (existing) {
    existing.role = 'admin';
    existing.isActive = true;
    await existing.save();

    if (force) {
      await setPassword(existing.id, ADMIN_PASSWORD);
      console.log(`Admin ${ADMIN_EMAIL} already existed - role and password reset`);
    } else {
      console.log(
        `Admin ${ADMIN_EMAIL} already exists (id ${existing.id}) - password left as is. Re-run with --force to reset it.`,
      );
    }
    return;
  }

  const admin = await createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    role: 'admin',
    isActive: true,
  });

  console.log(`Created admin ${admin.email} (id ${admin.id})`);
}

try {
  await seedAdmin();
} catch (error) {
  if (error instanceof UserError) {
    console.error(`Seed failed [${error.code}]: ${error.message}`);
  } else {
    console.error('Seed failed:', error);
  }
  process.exitCode = 1;
} finally {
  await disconnectDB();
  console.log('Disconnected');
}
