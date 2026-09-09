import { connectDB, disconnectDB, syncIndexes } from '../lib/db.ts';
import { AppError } from '../lib/errors.ts';
import { Instructor, type InstructorDocument } from '../models/instructor.ts';
import { User } from '../models/user.ts';
import { createUser, setPassword } from '../features/user/user.service.ts';

const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').toLowerCase().trim();
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Secret@1234';
const ADMIN_FIRST_NAME = process.env.SEED_ADMIN_FIRST_NAME ?? 'Studio';
const ADMIN_LAST_NAME = process.env.SEED_ADMIN_LAST_NAME ?? 'Admin';

/** Pass --force (or SEED_FORCE=1) to reset the password of an existing admin. */
const force = process.argv.includes('--force') || process.env.SEED_FORCE === '1';

/**
 * The admin gets an instructor profile of their own.
 *
 * An admin may do instructor-level work, but the records that work produces -
 * a session's instructorId, an assessment's author - have to name an actual
 * instructor. Without a profile the very first admin could not teach a class
 * or write an assessment without inventing another instructor to file it under.
 */
function createAdminInstructor(): Promise<InstructorDocument> {
  return Instructor.create({
    firstName: ADMIN_FIRST_NAME,
    lastName: ADMIN_LAST_NAME,
    bio: 'Studio administrator.',
  });
}

async function seedAdmin(): Promise<void> {
  await connectDB();
  await syncIndexes();
  console.log('Connected to MongoDB');

  const existing = await User.findOne({ email: ADMIN_EMAIL }).exec();

  if (existing) {
    // Promoting a member's login would leave it holding a memberId it may no
    // longer have, and hands their account admin rights by accident.
    if (existing.role === 'member') {
      throw new AppError(
        409,
        'EMAIL_BELONGS_TO_MEMBER',
        `${ADMIN_EMAIL} is a member login - choose a different SEED_ADMIN_EMAIL`,
      );
    }

    existing.role = 'admin';
    existing.isActive = true;

    // Backfill for an admin seeded before instructor profiles existed.
    if (!existing.instructorId) {
      const instructor = await createAdminInstructor();
      existing.instructorId = instructor._id;
      console.log(`Linked instructor profile ${instructor.id} to the existing admin`);
    }

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

  // Same order and rollback as createWithAccount: the profile first, then the
  // login, and undo the profile if the login cannot be created.
  const instructor = await createAdminInstructor();

  try {
    const admin = await createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: 'admin',
      instructorId: instructor.id,
    });

    console.log(`Created admin ${admin.email} (id ${admin.id})`);
    console.log(`Created instructor profile ${instructor.fullName} (id ${instructor.id})`);
  } catch (error) {
    try {
      await instructor.deleteOne();
    } catch (rollbackError) {
      console.error(`Failed to roll back instructor ${instructor.id}:`, rollbackError);
    }
    throw error;
  }
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
