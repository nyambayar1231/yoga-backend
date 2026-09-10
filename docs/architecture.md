# High School Management System — Architecture

## 1. Overview

This project is a management system for a small high school.

The system manages:

- School users and authentication
- Students
- Teachers
- Classes (`1a`, `1b`, `2a` … `5b`)
- Class enrolment — which student is in which class, in which school year

The backend uses:

- Node.js
- TypeScript
- MongoDB
- MongoDB Atlas
- Mongoose

The application should favor **simple, maintainable architecture** over premature abstraction.

### Not in the system yet

Lessons/timetable, attendance and grading are deliberately out of scope for now. They are
the obvious next collections, but classes come first: nothing else can be modelled until
there is a class to hang it off. When they are added, they follow the same rules as
everything below — a separate collection, referenced, never an array on the student.

---

# 2. Core Architectural Principles

## 2.1 Separate authentication from business data

The `users` collection is responsible primarily for:

- Authentication
- Authorization
- Role

Business/profile information belongs in:

- `students`
- `teachers`

Do not put the complete student or teacher profile inside `users`.

---

## 2.2 A class is a group of students, not a lesson

A class such as:

```text
3a
```

is a group: grade 3, section A. It is the register, not the timetable.

Therefore:

- `classes` = which groups the school runs
- `enrollments` = who is in each group

A class does not have a date, a time, or a subject. When lessons are added later they will
be their own collection referencing `classes`, in the same way that `enrollments` does.

Do not create a class per subject or per term:

```text
3a Mathematics       <- NOT a class
3a Autumn Term       <- NOT a class
```

There is one `3a`. What happens inside it is modelled separately.

---

## 2.3 Model many-to-many relationships explicitly

A class holds many students.

A student moves through many classes over the years — 1a, then 2a, then 3a.

Therefore:

```text
Student <-> Class
```

is represented by the `enrollments` collection.

This is why a student does not simply carry a `classId`. A single field would be overwritten
every time the student moved up a grade, and the record of where they were last year would be
gone. A row per (student, class) keeps that history.

Do not store a list of every class a student has been in directly inside the student document.

---

## 2.4 Avoid unbounded arrays

MongoDB documents should not contain arrays that grow indefinitely.

For example, avoid:

```ts
{
  name: "3a",
  studentIds: [
    "...",
    "...",
    "...",
    // the whole register, growing every year
  ]
}
```

Use a separate collection instead.

---

# 3. Collections

The initial database consists of these collections:

```text
users
students
teachers

classes
enrollments
```

Future functionality may introduce additional collections, but new collections should only be
introduced when there is a clear architectural reason.

---

# 4. Entity Relationships

High-level relationship:

```text
                         ┌──────────────┐
                         │    users     │
                         └──────┬───────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
             ┌─────────────┐        ┌─────────────┐
             │  students   │        │  teachers   │
             └──────┬──────┘        └─────────────┘
                    │
                    │
                    ▼
            ┌───────────────┐        ┌─────────────┐
            │  enrollments  │───────►│   classes   │
            └───────────────┘        └─────────────┘
```

An admin appears in `users` only. They have no profile document, because nothing in the
school is filed under an administrator.

---

# 5. Users

Collection:

```text
users
```

Purpose:

> Authentication and authorization.

Example document:

```ts
{
  _id: ObjectId,

  email: string,

  passwordHash: string,

  role: "admin" | "teacher" | "student",

  studentId?: ObjectId,

  teacherId?: ObjectId,

  isActive: boolean,

  createdAt: Date,

  updatedAt: Date
}
```

## Relationships

For a student user:

```text
users.studentId -> students._id
```

For a teacher user:

```text
users.teacherId -> teachers._id
```

An admin has neither reference.

The rule is symmetric and strict: a login points at exactly the profile its role implies, and
at nothing else. Changing a role clears the reference the old role used. The profile itself is
left in place — it belongs to the school, not to the login.

---

## 5.1 User roles

There are three roles:

```text
admin
teacher
student
```

### Student

Students have access to their own information and permitted student functionality.

Example permissions:

```text
profile:read-own
enrollment:read-own
```

### Teacher

Teachers can perform teaching-staff operations.

Example permissions:

```text
student:read
class:read
enrollment:read
```

### Admin

Administrators have full administrative capabilities.

Admin can:

- Create teachers
- Edit teachers
- Deactivate teachers
- Create students
- Edit students
- Deactivate students
- Create classes
- Edit classes
- Deactivate classes
- Enrol students into a class
- Remove students from a class

An admin can do everything a teacher can. An admin is **not** given a teacher profile: an
administrator who also teaches is created as a teacher in their own right, through
`POST /api/teachers`.

---

# 6. Students

Collection:

```text
students
```

Purpose:

> Store the student's business/profile information.

Example:

```ts
{
  _id: ObjectId,

  firstName: string,

  lastName: string,

  dateOfBirth?: Date,

  gender?: "male" | "female" | "other",

  phone?: string,

  email?: string,

  guardian?: {
    name: string,
    phone: string,
    relation?: string
  },

  enrolledAt: Date,     // when they joined the school

  isActive: boolean,

  createdAt: Date,

  updatedAt: Date
}
```

`enrolledAt` is the date the student joined the school. It is not the date they joined a
class — that lives on the enrolment row.

Additional student fields can be added as the school's requirements become clearer.

Do not store the student's class directly in this document.

Do not store class history directly in this document.

---

# 7. Teachers

Collection:

```text
teachers
```

Purpose:

> Store teacher profile information.

Example:

```ts
{
  _id: ObjectId,

  firstName: string,

  lastName: string,

  phone?: string,

  bio?: string,

  subjects?: string[],

  isActive: boolean,

  createdAt: Date,

  updatedAt: Date
}
```

`subjects` is what the teacher teaches — `["mathematics", "physics"]`. It is descriptive:
the system does not yet schedule anyone against it.

The teacher's authentication account is stored separately in `users`.

Relationship:

```text
users.teacherId -> teachers._id
```

---

# 8. Classes

Collection:

```text
classes
```

Purpose:

> Define a class group the school runs.

The school runs grades 1 to 5, each split into sections `a` and `b`:

```text
1a  1b
2a  2b
3a  3b
4a  4b
5a  5b
```

Example:

```ts
{
  _id: ObjectId,

  grade: number,          // 1 - 5

  section: "a" | "b",

  name: string,           // "3a" - derived from grade + section

  isActive: boolean,

  createdAt: Date,

  updatedAt: Date
}
```

Example:

```json
{
  "grade": 3,
  "section": "a",
  "name": "3a"
}
```

`name` is derived, never supplied by the caller. It is written on every save from `grade` and
`section`, so it cannot drift away from the two fields it comes from. It is stored rather than
computed on read so it can be indexed, searched and sorted.

This does NOT contain a date, a time, a subject or a list of students.

---

# 9. Enrollments

Collection:

```text
enrollments
```

Purpose:

> Represent the relationship between a student and a class.

This is a many-to-many relationship:

```text
Student
  |
  | many
  |
Enrollment
  |
  | many
  |
Class
```

Example:

```ts
{
  _id: ObjectId,

  studentId: ObjectId,

  classId: ObjectId,

  schoolYear: string,     // "2026-2027"

  enrolledAt: Date,

  isActive: boolean,

  createdAt: Date,

  updatedAt: Date
}
```

Relationships:

```text
enrollments.studentId
    ->
students._id
```

```text
enrollments.classId
    ->
classes._id
```

`schoolYear` is written as the two calendar years it spans: `2026-2027`. It is a string
rather than a date because a school year is a label, not an instant, and the school talks
about it that way.

---

## 9.1 Enrollment uniqueness

A student should only have one enrolment record for a particular class.

Create a compound unique index:

```ts
{
  studentId: 1,
  classId: 1
}
```

with:

```ts
unique: true
```

Putting a student back into a class they left revives the existing row rather than adding a
second one. Their history stays a single row per class they have actually been in.

---

## 9.2 One class at a time

A student sits in one class per school year.

An attempt to enrol a student who already has an **active** enrolment in a different class in
the same school year is a conflict (409), not a second row. Move them out of the old class
first. This is enforced in the service, because no single index can express it.

Enrolling the same student into the same class in a **later** school year updates the existing
row — held down to one by the unique index above.

---

# 10. MongoDB Indexes

Indexes should be created based on actual query patterns.

Initial indexes:

## Users

```ts
UserSchema.index(
  { email: 1 },
  { unique: true }
);

UserSchema.index(
  { studentId: 1 },
  { unique: true, sparse: true }
);

UserSchema.index(
  { teacherId: 1 },
  { unique: true, sparse: true }
);
```

Email should be normalized to lowercase before storage.

The two profile indexes are sparse, so the many users with neither reference do not collide
with each other on null.

---

## Students

```ts
StudentSchema.index({
  lastName: 1,
  firstName: 1
});

StudentSchema.index(
  { email: 1 },
  { sparse: true }
);
```

The email index is not unique. Siblings share a parent's address, and refusing to register a
real pupil is the worse failure.

Do not create a unique index unless the business requirement guarantees uniqueness.

---

## Teachers

```ts
TeacherSchema.index({
  lastName: 1,
  firstName: 1
});
```

---

## Classes

```ts
ClassSchema.index(
  { name: 1 },
  { unique: true }
);

ClassSchema.index(
  { grade: 1, section: 1 },
  { unique: true }
);
```

There is one `3a`. Both indexes say so; the compound one is the pair the application actually
reasons about, and the one on `name` protects the derived field.

---

## Enrollments

Most important index:

```ts
EnrollmentSchema.index(
  {
    studentId: 1,
    classId: 1
  },
  {
    unique: true
  }
);
```

For the class register:

```ts
EnrollmentSchema.index({
  classId: 1,
  schoolYear: 1
});
```

For a student's class history:

```ts
EnrollmentSchema.index({
  studentId: 1,
  enrolledAt: -1
});
```

---

# 11. Authorization Rules

Authorization must be enforced on the backend.

Do not rely only on the frontend to hide buttons or pages.

The backend must validate:

```text
Who is the user?
What role do they have?
What resource are they trying to access?
Are they allowed to perform this operation?
```

---

## 11.1 Student access

A student should generally only be able to access their own data.

For example:

```text
student A
    ↓
can read student A's enrolments
```

but:

```text
student A
    X
cannot read student B's enrolments
```

Never rely on the client to send the correct `studentId`.

The backend should derive the student identity from the authenticated user.

---

## 11.2 Teacher access

Teacher access should be defined according to the school's business rules.

At minimum, teachers can:

- View students
- View classes
- View class registers

Teachers do not create or edit students, teachers or classes. That is administration.

If the school later requires teachers to only see the students they actually teach, enforce
that relationship in the backend. Do not assume that having the `teacher` role means
unrestricted access to every student.

---

## 11.3 Admin access

Admins have full management access.

Admins can manage:

```text
users
students
teachers
classes
enrollments
```

An admin is also allowed to perform teacher-level operations.

---

# 12. Deletion Strategy

Prefer **soft deletion/deactivation** for important business entities.

For example:

```ts
isActive: false
```

instead of immediately deleting:

- Students
- Teachers
- Classes
- Enrollments

This preserves historical information.

For example, if a teacher leaves the school, their profile should remain so that anything
recorded against them still resolves to a person.

Therefore:

```text
Teacher
isActive = false
```

is preferable to:

```text
DELETE teacher
```

Removing a student from a class is the same: the enrolment is deactivated, not deleted. It is
the record of where that student used to be.

---

# 13. Historical Data

Historical records should remain valid even if the related entity becomes inactive.

For example:

```text
Teacher Sarah
    ↓
leaves the school
    ↓
isActive = false
```

Retiring a class does not touch its enrolments: who was in 3a is still true after the school
stops running a 3a.

Do not automatically delete historical records when a teacher/student/class becomes inactive.

---

# 14. Date and Time

Store dates in MongoDB as `Date` values.

Use UTC internally where possible.

The frontend can display dates using the school's local timezone.

The system should not store dates as formatted strings such as:

```text
"September 10, 2026"
```

Instead store:

```ts
enrolledAt: Date
```

and format it for display.

The one deliberate exception is `schoolYear`, which is a label (`"2026-2027"`) rather than an
instant. See section 9.

---

# 15. Mongoose Architecture

Keep schemas/models separate from business logic.

Backend structure:

```text
src/
├── models/                     # schemas only
│   ├── base.ts
│   ├── user.ts
│   ├── student.ts
│   ├── teacher.ts
│   ├── class.ts
│   └── enrollment.ts
│
├── features/                   # one folder per resource
│   ├── auth/
│   │   └── auth.controller.ts
│   ├── user/
│   │   ├── user.controller.ts
│   │   └── user.service.ts
│   ├── student/
│   │   ├── student.controller.ts
│   │   └── student.service.ts
│   ├── teacher/
│   │   ├── teacher.controller.ts
│   │   └── teacher.service.ts
│   ├── class/
│   │   ├── class.controller.ts
│   │   └── class.service.ts
│   └── enrollment/
│       ├── enrollment.controller.ts
│       ├── enrollment.schema.ts
│       └── enrollment.service.ts
│
├── middleware/
│   ├── auth.ts
│   └── authorization.ts
│
├── lib/                        # db, errors, http helpers, auth, password
├── seed/
└── app.ts
```

The exact framework structure can differ, but the separation of responsibilities should remain.

---

# 16. Service Responsibilities

Models should define the database structure.

Services should contain business logic.

For example:

```ts
enrollment.service.ts
```

should contain logic such as:

```text
Enrol a student into a class
Remove a student from a class
Prevent two active classes in the same school year
Revive a previous enrolment instead of duplicating it
```

The controller should primarily handle:

```text
HTTP request
    ↓
validation
    ↓
service
    ↓
response
```

Do not put complex business logic directly inside controllers.

---

# 17. Important Business Rules

These rules should be enforced by the backend.

### User

- Email must be unique.
- Passwords must never be stored in plaintext.
- Inactive users cannot authenticate.
- Role must be one of the defined roles.
- A login points at the profile its role implies, and at most one login per profile.
- An admin holds no profile reference.

### Students

- A student can be enrolled in many classes over time.
- A student is in at most one class per school year.
- Deactivating a student should not delete their enrolment history.

### Teachers

- Deactivating a teacher should not delete anything recorded against them.

### Classes

- A class is identified by its grade and section; `1a` exists once.
- `name` is derived from grade and section and is never supplied by the caller.
- Deactivating a class should not delete its enrolments.

### Enrollments

- A student cannot have duplicate enrolment records for the same class.
- Enrolment history should not be embedded inside students.

---

# 18. Transactions

MongoDB transactions should be used when multiple writes must succeed or fail together.

For example, creating a student and their login account requires:

```text
Create Student
    +
Create User
```

If one operation fails, the other should not remain as an orphan record.

The current implementation does not use a transaction for this, because a standalone `mongod`
does not support them and the project has to run in local development too. Instead everything
that can be checked is checked up front, and a failed account write deletes the profile again.
A profile is never left behind without its login. Use a session/transaction where atomicity
matters and the deployment supports it — but do not use transactions for every operation.

---

# 19. Population vs Aggregation

Mongoose `populate()` can be used for straightforward relationships.

For example:

```ts
Enrollment.find({ classId })
  .populate("studentId", "firstName lastName email isActive");
```

Populate the side the caller actually needs, and only the fields they need:

- A class register resolves the **student**.
- A student's history resolves the **class**.

For complex reporting or dashboard queries, prefer MongoDB aggregation pipelines.

Do not blindly populate every relationship.

---

# 20. API Design

The API should expose resources based on business concepts.

```text
/api/auth

/api/users

/api/students

/api/teachers

/api/classes

/api/enrollments
```

Example operations:

```text
GET    /students
GET    /students/:id
POST   /students
PATCH  /students/:id
DELETE /students/:id
```

For classes:

```text
GET    /classes
POST   /classes
PATCH  /classes/:id
```

Enrolment:

```text
POST   /classes/:id/students      enrol
GET    /classes/:id/students      the register

GET    /students/:id/enrollments  the student's class history

GET    /enrollments
DELETE /enrollments/:id           remove from class
```

See [api.md](./api.md) for the full surface.

---

# 21. Example User Flow

## Admin creates a teacher

```text
Admin
  ↓
Create teacher profile
  ↓
Create user account
  ↓
users.teacherId → teachers._id
  ↓
role = teacher
```

---

## Admin creates a student

```text
Admin
  ↓
Create student profile
  ↓
Create user account
  ↓
users.studentId → students._id
  ↓
role = student
```

---

## Admin creates the classes

```text
classes

{ grade: 1, section: "a" }   ->  1a
{ grade: 1, section: "b" }   ->  1b
{ grade: 2, section: "a" }   ->  2a
...
{ grade: 5, section: "b" }   ->  5b
```

---

## Admin enrols a student into 3a

```text
Student
  ↓
Class 3a
  ↓
enrollments
```

Example:

```ts
{
  studentId,
  classId,
  schoolYear: "2026-2027",
  isActive: true
}
```

---

## The student moves up a grade

The next year the student is enrolled into `4a`.

```text
Remove from 3a          ->  enrollments (3a).isActive = false
Enrol into 4a           ->  new row, schoolYear "2027-2028"
```

Both rows remain. The student's history reads: 3a in 2026-2027, 4a in 2027-2028.

---

# 22. What NOT to Do

Avoid creating one giant document:

```ts
{
  student: {...},

  classes: [...],

  teachers: [...]
}
```

Do not embed the register inside a class.

Do not embed class history inside a student.

Do not put a bare `classId` on the student — it destroys last year's record.

Do not create a class per subject or per term.

Do not store passwords in student/teacher documents.

Do not give an admin a teacher profile.

Do not rely exclusively on frontend authorization.

Do not physically delete historical business records unless there is a strong reason.

Do not introduce microservices for this application.

Do not over-engineer the MongoDB schema before actual requirements justify it.

---

# 23. Initial Schema Summary

```text
users
├── email
├── passwordHash
├── role            admin | teacher | student
├── studentId?      only for role student
├── teacherId?      only for role teacher
└── isActive

students
├── firstName
├── lastName
├── dateOfBirth?
├── gender?
├── phone?
├── email?
├── guardian?       { name, phone, relation? }
├── enrolledAt      joined the school
└── isActive

teachers
├── firstName
├── lastName
├── phone?
├── bio?
├── subjects?
└── isActive

classes
├── grade           1 - 5
├── section         a | b
├── name            derived: "3a"
└── isActive

enrollments
├── studentId
├── classId
├── schoolYear      "2026-2027"
├── enrolledAt
└── isActive
```

---

# 24. Source of Truth for Claude Code

This document is the architectural source of truth for the backend.

When implementing new features:

1. Follow the existing entity boundaries.
2. Do not introduce a new collection unless necessary.
3. Do not duplicate data without a clear reason.
4. Preserve historical records.
5. Enforce authorization on the backend.
6. Keep business logic inside services rather than controllers.
7. Add indexes based on actual query patterns.
8. Prefer references for relationships that can grow indefinitely.
9. Keep MongoDB documents reasonably bounded.
10. Prefer simple solutions appropriate for a small school.
11. Do not introduce unnecessary infrastructure or architectural complexity.
12. When a new requirement conflicts with this architecture, identify the conflict before
    changing the data model.

The architecture should evolve as requirements become clearer, but changes should be
deliberate and documented.
