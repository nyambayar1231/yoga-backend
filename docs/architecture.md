# Yoga Studio CMS — Architecture

## 1. Overview

This project is a small Yoga/Pilates studio CMS.

The system manages:

- Studio users and authentication
- Members
- Instructors
- Class types
- Scheduled class sessions
- Member attendance
- Member assessments

The backend uses:

- Node.js
- TypeScript
- MongoDB
- MongoDB Atlas
- Mongoose

The application should favor **simple, maintainable architecture** over premature abstraction.

---

# 2. Core Architectural Principles

## 2.1 Separate authentication from business data

The `users` collection is responsible primarily for:

- Authentication
- Authorization
- Role

Business/profile information belongs in:

- `members`
- `instructors`

Do not put the complete member or instructor profile inside `users`.

---

## 2.2 Separate class definitions from scheduled sessions

A class such as:

```text
Yoga 101
```

is a reusable class definition.

A scheduled occurrence such as:

```text
Yoga 101
September 10, 2026
10:30 AM
Instructor: Sarah
```

is a class session.

Therefore:

- `classTypes` = what the class is
- `classSessions` = when the class happens

Do not create separate class types for different times.

For example, these should NOT be separate class types:

```text
Yoga 101 Morning
Yoga 101 Afternoon
Yoga 101 Evening
```

Instead:

```text
classTypes
  Yoga 101

classSessions
  Yoga 101 - 10:30
  Yoga 101 - 12:30
  Yoga 101 - 19:00
```

---

## 2.3 Model many-to-many relationships explicitly

Members can attend many class sessions.

Class sessions can have many members.

Therefore:

```text
Member <-> ClassSession
```

is represented by the `attendance` collection.

Do not store a huge array of all attended classes directly inside the member document.

---

## 2.4 Avoid unbounded arrays

MongoDB documents should not contain arrays that grow indefinitely.

For example, avoid:

```ts
{
  memberId: "...",
  attendedClasses: [
    "...",
    "...",
    "...",
    // potentially thousands
  ]
}
```

Use a separate collection instead.

---

# 3. Collections

The initial database consists of these collections:

```text
users
members
instructors

classTypes
classSessions
attendance

assessments
```

Future functionality may introduce additional collections, but new collections should only be introduced when there is a clear architectural reason.

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
             ┌─────────────┐       ┌──────────────┐
             │   members   │       │ instructors  │
             └──────┬──────┘       └──────┬───────┘
                    │                     │
                    │                     │
                    │              ┌──────▼───────┐
                    │              │ classSessions│
                    │              └──────┬───────┘
                    │                     │
                    └────────┐    ┌───────┘
                             ▼    ▼
                        ┌────────────┐
                        │ attendance │
                        └────────────┘


members ────────────────┐
                        ▼
                  ┌─────────────┐
instructors ──────►│ assessments │
                  └─────────────┘


classSessions ──────► classTypes
```

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

  role: "admin" | "instructor" | "member",

  memberId?: ObjectId,

  instructorId?: ObjectId,

  isActive: boolean,

  createdAt: Date,

  updatedAt: Date
}
```

## Relationships

For a member user:

```text
users.memberId -> members._id
```

For an instructor user:

```text
users.instructorId -> instructors._id
```

An admin does not require either reference.

---

## 5.1 User roles

There are three roles:

```text
admin
instructor
member
```

### Member

Members have access to their own information and permitted member functionality.

Example permissions:

```text
assessment:read-own
attendance:read-own
profile:read-own
```

### Instructor

Instructors can perform instructor-level operations.

Example permissions:

```text
member:read
assessment:create
assessment:read
assessment:update
classSession:read
attendance:read
attendance:update
```

### Admin

Administrators have full administrative capabilities.

Admin can:

- Create instructors
- Edit instructors
- Deactivate instructors
- Create members
- Edit members
- Deactivate members
- Create class types
- Edit class types
- Create class sessions
- Edit class sessions
- Cancel class sessions
- Manage attendance
- View assessments

An admin should also be capable of performing instructor-level operations.

---

# 6. Members

Collection:

```text
members
```

Purpose:

> Store the member's business/profile information.

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

  emergencyContact?: {
    name: string,
    phone: string
  },

  joinedAt: Date,

  isActive: boolean,

  createdAt: Date,

  updatedAt: Date
}
```

Additional member fields can be added as the studio's requirements become clearer.

Do not store attendance history directly in this document.

Do not store assessment history directly in this document.

---

# 7. Instructors

Collection:

```text
instructors
```

Purpose:

> Store instructor/teacher profile information.

Example:

```ts
{
  _id: ObjectId,

  firstName: string,

  lastName: string,

  phone?: string,

  bio?: string,

  specialties?: string[],

  isActive: boolean,

  createdAt: Date,

  updatedAt: Date
}
```

The instructor's authentication account is stored separately in `users`.

Relationship:

```text
users.instructorId -> instructors._id
```

---

# 8. Class Types

Collection:

```text
classTypes
```

Purpose:

> Define the type/category of class offered by the studio.

Example:

```ts
{
  _id: ObjectId,

  name: string,

  description?: string,

  category: "yoga" | "pilates" | "other",

  durationMinutes: number,

  capacity: number,

  isActive: boolean,

  createdAt: Date,

  updatedAt: Date
}
```

Example:

```json
{
  "name": "Yoga 101",
  "category": "yoga",
  "durationMinutes": 60,
  "capacity": 20
}
```

This does NOT contain a specific date or time.

---

# 9. Class Sessions

Collection:

```text
classSessions
```

Purpose:

> Represent an actual scheduled occurrence of a class.

Example:

```ts
{
  _id: ObjectId,

  classTypeId: ObjectId,

  instructorId: ObjectId,

  startAt: Date,

  endAt: Date,

  capacity: number,

  status: "scheduled" | "cancelled" | "completed",

  createdAt: Date,

  updatedAt: Date
}
```

Relationships:

```text
classSessions.classTypeId
    ->
classTypes._id
```

and:

```text
classSessions.instructorId
    ->
instructors._id
```

Example:

```json
{
  "classTypeId": "Yoga 101",
  "instructorId": "Sarah",
  "startAt": "2026-09-10T10:30:00",
  "endAt": "2026-09-10T11:30:00",
  "capacity": 20,
  "status": "scheduled"
}
```

---

# 10. Attendance

Collection:

```text
attendance
```

Purpose:

> Represent the relationship between a member and a class session.

This is a many-to-many relationship:

```text
Member
  |
  | many
  |
Attendance
  |
  | many
  |
ClassSession
```

Example:

```ts
{
  _id: ObjectId,

  memberId: ObjectId,

  classSessionId: ObjectId,

  status: "registered" | "attended" | "cancelled" | "no_show",

  checkedInAt?: Date,

  createdAt: Date,

  updatedAt: Date
}
```

Relationships:

```text
attendance.memberId
    ->
members._id
```

```text
attendance.classSessionId
    ->
classSessions._id
```

---

## 10.1 Attendance uniqueness

A member should only have one attendance record for a particular class session.

Create a compound unique index:

```ts
{
  memberId: 1,
  classSessionId: 1
}
```

with:

```ts
unique: true
```

This prevents duplicate registrations.

---

# 11. Assessments

Collection:

```text
assessments
```

Purpose:

> Store an instructor's evaluation/progress assessment for a member.

A member can have many assessments.

An instructor can create many assessments.

Example:

```ts
{
  _id: ObjectId,

  memberId: ObjectId,

  instructorId: ObjectId,

  assessmentDate: Date,

  type: string,

  data: Record<string, unknown>,

  notes?: string,

  createdAt: Date,

  updatedAt: Date
}
```

Relationships:

```text
assessments.memberId
    ->
members._id
```

```text
assessments.instructorId
    ->
instructors._id
```

---

## 11.1 Assessment data

Assessment fields may evolve over time.

Therefore, the assessment-specific data can be stored inside:

```ts
data: Record<string, unknown>
```

Example:

```json
{
  "data": {
    "flexibility": 8,
    "balance": 7,
    "strength": 6,
    "mobility": 9
  }
}
```

This allows assessment fields to evolve without requiring a database migration for every new assessment metric.

However, core searchable/filterable fields should remain top-level fields.

For example:

```ts
memberId
instructorId
assessmentDate
type
```

should remain top-level.

---

# 12. MongoDB Indexes

Indexes should be created based on actual query patterns.

Initial indexes:

## Users

```ts
UserSchema.index(
  { email: 1 },
  { unique: true }
);
```

Email should be normalized to lowercase before storage.

---

## Members

Potential indexes:

```ts
MemberSchema.index({
  lastName: 1,
  firstName: 1
});

MemberSchema.index({
  email: 1
});
```

If member email is guaranteed to be unique:

```ts
MemberSchema.index(
  { email: 1 },
  { unique: true }
);
```

Do not create a unique index unless the business requirement guarantees uniqueness.

---

## Instructors

```ts
InstructorSchema.index({
  lastName: 1,
  firstName: 1
});
```

---

## Class Sessions

Common queries will include:

- Find sessions by date
- Find sessions for an instructor
- Find sessions by class type

Indexes:

```ts
ClassSessionSchema.index({
  startAt: 1
});

ClassSessionSchema.index({
  instructorId: 1,
  startAt: 1
});

ClassSessionSchema.index({
  classTypeId: 1,
  startAt: 1
});
```

---

## Attendance

Most important index:

```ts
AttendanceSchema.index(
  {
    memberId: 1,
    classSessionId: 1
  },
  {
    unique: true
  }
);
```

For member attendance history:

```ts
AttendanceSchema.index({
  memberId: 1,
  createdAt: -1
});
```

For session attendance:

```ts
AttendanceSchema.index({
  classSessionId: 1
});
```

---

## Assessments

For member assessment history:

```ts
AssessmentSchema.index({
  memberId: 1,
  assessmentDate: -1
});
```

For instructor assessment history:

```ts
AssessmentSchema.index({
  instructorId: 1,
  assessmentDate: -1
});
```

---

# 13. Authorization Rules

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

## 13.1 Member access

A member should generally only be able to access their own data.

For example:

```text
member A
    ↓
can read member A's assessment
```

but:

```text
member A
    X
cannot read member B's assessment
```

Never rely on the client to send the correct `memberId`.

The backend should derive the member identity from the authenticated user.

---

## 13.2 Instructor access

Instructor access should be defined according to the studio's business rules.

At minimum, instructors can:

- View members
- View their classes
- Create assessments
- View assessments they are allowed to access
- Manage attendance for their classes

If the studio later requires instructors to only see members who attend their classes, enforce that relationship in the backend.

Do not assume that having the `instructor` role means unrestricted access to every member.

---

## 13.3 Admin access

Admins have full management access.

Admins can manage:

```text
members
instructors
classTypes
classSessions
attendance
assessments
```

An admin is also allowed to perform instructor-level operations.

---

# 14. Deletion Strategy

Prefer **soft deletion/deactivation** for important business entities.

For example:

```ts
isActive: false
```

instead of immediately deleting:

- Members
- Instructors
- Class types

This preserves historical information.

For example, if an instructor leaves the studio, old class sessions and assessments should still retain the instructor reference.

Therefore:

```text
Instructor
isActive = false
```

is preferable to:

```text
DELETE instructor
```

---

# 15. Historical Data

Historical records should remain valid even if the related entity becomes inactive.

For example:

```text
Instructor Sarah
    ↓
leaves studio
    ↓
isActive = false
```

Her historical classes should still contain:

```text
instructorId
```

and her historical assessments should remain available.

Do not automatically delete historical records when an instructor/member/class becomes inactive.

---

# 16. Date and Time

Store dates in MongoDB as `Date` values.

Use UTC internally where possible.

The frontend can display dates/times using the studio's local timezone.

The system should not store dates as formatted strings such as:

```text
"September 10, 2026 10:30 AM"
```

Instead store:

```ts
startAt: Date
```

and format it for display.

---

# 17. Mongoose Architecture

Keep schemas/models separate from business logic.

Recommended backend structure:

```text
src/
├── modules/
│   ├── users/
│   │   ├── user.model.ts
│   │   ├── user.service.ts
│   │   ├── user.controller.ts
│   │   └── user.routes.ts
│   │
│   ├── members/
│   │   ├── member.model.ts
│   │   ├── member.service.ts
│   │   ├── member.controller.ts
│   │   └── member.routes.ts
│   │
│   ├── instructors/
│   │   ├── instructor.model.ts
│   │   ├── instructor.service.ts
│   │   ├── instructor.controller.ts
│   │   └── instructor.routes.ts
│   │
│   ├── class-types/
│   │   ├── class-type.model.ts
│   │   ├── class-type.service.ts
│   │   ├── class-type.controller.ts
│   │   └── class-type.routes.ts
│   │
│   ├── class-sessions/
│   │   ├── class-session.model.ts
│   │   ├── class-session.service.ts
│   │   ├── class-session.controller.ts
│   │   └── class-session.routes.ts
│   │
│   ├── attendance/
│   │   ├── attendance.model.ts
│   │   ├── attendance.service.ts
│   │   ├── attendance.controller.ts
│   │   └── attendance.routes.ts
│   │
│   └── assessments/
│       ├── assessment.model.ts
│       ├── assessment.service.ts
│       ├── assessment.controller.ts
│       └── assessment.routes.ts
│
├── middleware/
│   ├── auth.ts
│   └── authorization.ts
│
├── config/
├── database/
└── app.ts
```

The exact framework structure can differ, but the separation of responsibilities should remain.

---

# 18. Service Responsibilities

Models should define the database structure.

Services should contain business logic.

For example:

```ts
attendance.service.ts
```

should contain logic such as:

```text
Register member for class
Cancel registration
Check member into class
Mark no-show
Check class capacity
Prevent duplicate registration
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

# 19. Important Business Rules

These rules should be enforced by the backend.

### User

- Email must be unique.
- Passwords must never be stored in plaintext.
- Inactive users cannot authenticate.
- Role must be one of the defined roles.

### Members

- A member can attend many class sessions.
- A member can have many assessments.
- Deactivating a member should not delete historical attendance or assessments.

### Instructors

- An instructor can teach many class sessions.
- Deactivating an instructor should not delete historical classes or assessments.

### Class Types

- A class type represents a reusable class definition.
- Multiple sessions can reference the same class type.

### Class Sessions

- A session references exactly one class type.
- A session references one instructor initially.
- A session has a start and end time.
- Cancelled sessions should remain in the database.

### Attendance

- A member cannot have duplicate attendance records for the same session.
- Capacity rules should be enforced by the backend.
- Attendance history should not be embedded inside members.

### Assessments

- Every assessment belongs to one member.
- Every assessment records the instructor who created it.
- Assessment history should not be embedded inside members.
- Historical assessments should remain available.

---

# 20. Transactions

MongoDB transactions should be used when multiple writes must succeed or fail together.

For example, creating a member and their login account may require:

```text
Create Member
    +
Create User
```

If one operation fails, the other should not remain as an orphan record.

Use a MongoDB session/transaction for operations where atomicity is important.

However, do not use transactions unnecessarily for every database operation.

---

# 21. Population vs Aggregation

Mongoose `populate()` can be used for straightforward relationships.

For example:

```ts
ClassSession.find()
  .populate("classTypeId")
  .populate("instructorId");
```

For complex reporting or dashboard queries, prefer MongoDB aggregation pipelines.

Do not blindly populate every relationship.

Only retrieve the data required by the API request.

---

# 22. API Design

The API should expose resources based on business concepts.

Example:

```text
/api/auth

/api/users

/api/members

/api/instructors

/api/class-types

/api/class-sessions

/api/attendance

/api/assessments
```

Example operations:

```text
GET    /members
GET    /members/:id
POST   /members
PATCH  /members/:id
DELETE /members/:id
```

For classes:

```text
GET    /class-types
POST   /class-types
PATCH  /class-types/:id

GET    /class-sessions
POST   /class-sessions
PATCH  /class-sessions/:id
```

Attendance:

```text
POST   /class-sessions/:id/attendance
GET    /class-sessions/:id/attendance

GET    /members/:id/attendance
```

Assessments:

```text
POST   /members/:id/assessments
GET    /members/:id/assessments
GET    /assessments/:id
PATCH  /assessments/:id
```

The exact API style may change depending on the backend framework, but resource boundaries should remain clear.

---

# 23. Example User Flow

## Admin creates an instructor

```text
Admin
  ↓
Create instructor profile
  ↓
Create user account
  ↓
users.instructorId → instructors._id
  ↓
role = instructor
```

---

## Admin creates a member

```text
Admin
  ↓
Create member profile
  ↓
Create user account
  ↓
users.memberId → members._id
  ↓
role = member
```

---

## Admin creates Yoga 101

```text
classTypes

{
  name: "Yoga 101",
  durationMinutes: 60,
  capacity: 20
}
```

---

## Admin schedules three sessions

```text
classSessions

Yoga 101
10:30
Instructor Sarah

Yoga 101
12:30
Instructor Sarah

Yoga 101
19:00
Instructor John
```

All three reference the same:

```text
classTypeId
```

---

## Member registers for a class

```text
Member
  ↓
Yoga 101 10:30 session
  ↓
attendance
```

Example:

```ts
{
  memberId,
  classSessionId,
  status: "registered"
}
```

---

## Member attends

Update:

```ts
status: "attended"
```

and:

```ts
checkedInAt: Date
```

---

## Instructor creates an assessment

```text
Instructor
  ↓
Member
  ↓
Create Assessment
  ↓
assessments
```

Example:

```ts
{
  memberId,
  instructorId,
  assessmentDate,
  type: "progress",
  data: {
    flexibility: 8,
    balance: 7,
    mobility: 9
  },
  notes: "Good progress."
}
```

---

# 24. What NOT to Do

Avoid creating one giant document:

```ts
{
  member: {...},

  classes: [...],

  attendance: [...],

  assessments: [...],

  instructors: [...]
}
```

Do not embed unlimited attendance history.

Do not embed unlimited assessment history.

Do not create separate class types for each scheduled time.

Do not store passwords in member/instructor documents.

Do not rely exclusively on frontend authorization.

Do not physically delete historical business records unless there is a strong reason.

Do not introduce microservices for this application.

Do not over-engineer the MongoDB schema before actual requirements justify it.

---

# 25. Initial Schema Summary

```text
users
├── email
├── passwordHash
├── role
├── memberId?
├── instructorId?
└── isActive

members
├── firstName
├── lastName
├── dateOfBirth?
├── gender?
├── phone?
├── email?
├── emergencyContact?
├── joinedAt
└── isActive

instructors
├── firstName
├── lastName
├── phone?
├── bio?
├── specialties?
└── isActive

classTypes
├── name
├── description?
├── category
├── durationMinutes
├── capacity
└── isActive

classSessions
├── classTypeId
├── instructorId
├── startAt
├── endAt
├── capacity
└── status

attendance
├── memberId
├── classSessionId
├── status
└── checkedInAt?

assessments
├── memberId
├── instructorId
├── assessmentDate
├── type
├── data
└── notes?
```

---

# 26. Source of Truth for Claude Code

This document is the architectural source of truth for the backend.

When implementing new features:

1. Follow the existing entity boundaries.
2. Do not introduce a new collection unless necessary.
3. Do not duplicate data without a clear reason.
4. Preserve historical records.
5. Enforce authorization on the backend.
6. Keep business logic inside services/use-cases rather than controllers.
7. Add indexes based on actual query patterns.
8. Prefer references for relationships that can grow indefinitely.
9. Keep MongoDB documents reasonably bounded.
10. Prefer simple solutions appropriate for a small studio.
11. Do not introduce unnecessary infrastructure or architectural complexity.
12. When a new requirement conflicts with this architecture, identify the conflict before changing the data model.

The architecture should evolve as requirements become clearer, but changes should be deliberate and documented.