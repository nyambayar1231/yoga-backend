import { connectDB, disconnectDB, syncIndexes } from '../lib/db.ts';
import { AppError } from '../lib/errors.ts';
import { User } from '../models/user.ts';
import { createUser, setPassword } from '../features/user/user.service.ts';

const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').toLowerCase().trim();
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Secret@1234';

/** Pass --force (or SEED_FORCE=1) to reset the password of an existing admin. */
const force = process.argv.includes('--force') || process.env.SEED_FORCE === '1';

/**
 * Creates the first administrator - a login and nothing else.
 *
 * An admin holds no teacher profile. Administration is not teaching: nothing in
 * the school is filed under an admin, so there is no record for the reference
 * to name. An administrator who also teaches is given a teacher account of
 * their own through POST /api/teachers.
 */
async function seedAdmin(): Promise<void> {
  await connectDB();
  await syncIndexes();
  console.log('Connected to MongoDB');

  const existing = await User.findOne({ email: ADMIN_EMAIL }).exec();

  if (existing) {
    // Promoting a student's login would leave it holding a studentId it may no
    // longer have, and hands their account admin rights by accident.
    if (existing.role === 'student') {
      throw new AppError(
        409,
        'EMAIL_BELONGS_TO_STUDENT',
        `${ADMIN_EMAIL} is a student login - choose a different SEED_ADMIN_EMAIL`,
      );
    }

    existing.role = 'admin';
    existing.isActive = true;

    // A teacher being promoted keeps neither reference: the profile stays in
    // place for whoever teaches under it next.
    existing.set('studentId', undefined);
    existing.set('teacherId', undefined);

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
  });

  console.log(`Created admin ${admin.email} (id ${admin.id})`);
}

try {
  await seedAdmin();
} catch (error) {
  if (error instanceof AppError) {
    console.error(`Seed failed [${error.code}]: ${error.message}`);
  } else {
    console.error('Seed failed:', error);
  }
  process.exitCode = 1;
} finally {
  await disconnectDB();
  console.log('Disconnected');
}
