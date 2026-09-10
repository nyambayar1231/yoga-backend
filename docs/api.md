# High School Management System — API

Implements [architecture.md](./architecture.md). All paths are under `/api`.

## Conventions

- **Auth** — `POST /api/auth/login` sets an httpOnly cookie; every other route needs it.
- **Lists** — `?limit=&skip=` (limit max 200) and return `{ data, total, limit, skip }`.
  `total` is the full match count, so a truncated page is obvious.
- **Errors** — `{ code, error, details? }` with the HTTP status carrying the meaning
  (400 validation, 401 not signed in, 403 not allowed, 404 missing, 409 conflict).
- **Deletion** — `DELETE` deactivates (`isActive: false`). Nothing is physically removed,
  so enrolment history stays valid.
- **Dates** — ISO 8601 in and out, stored as UTC `Date`. `schoolYear` is the exception: a
  label of the form `2026-2027`.

## Roles

| | student | teacher | admin |
|---|---|---|---|
| own profile / own enrolments | read | — | — |
| classes, teachers | read | read | read |
| students, class registers, all enrolments | — | read | read |
| students, teachers, classes, enrolments | — | — | full |

Who the classes and teachers are is not sensitive, so any signed-in user may list them. The
register — which named student is in which class — is staff only.

An admin can do everything a teacher can. An admin holds **no** teacher profile — nothing in
the school is filed under an administrator. An administrator who also teaches is created as a
teacher in their own right through `POST /teachers`, with their own login.

A login points at exactly the profile its role implies: `users.studentId` for a student,
`users.teacherId` for a teacher, neither for an admin.

## Endpoints

### Auth
```
POST   /auth/login              { email, password }
POST   /auth/logout
GET    /auth/me
POST   /auth/change-password    { currentPassword, newPassword }
```

### Users — admin only
```
GET    /users                   ?role=&isActive=
POST   /users                   { email, password?, role, studentId?, teacherId? }
GET    /users/:id
PATCH  /users/:id
PUT    /users/:id/password      { password }        # admin reset
DELETE /users/:id                                   # deactivate
```

`role: 'student'` requires `studentId`, `role: 'teacher'` requires `teacherId`, and
`role: 'admin'` accepts neither. Changing a role clears the reference the old role used; the
profile itself stays put.

### Students
```
GET    /students                ?search=&isActive=          staff
POST   /students                profile + accountEmail       admin — creates the login too
GET    /students/:id                                         staff, or the student themselves
PATCH  /students/:id                                         admin
DELETE /students/:id                                         admin — deactivate
GET    /students/:id/enrollments ?schoolYear=&isActive=      staff, or the student themselves
```

Profile fields: `firstName`, `lastName`, `dateOfBirth?`, `gender?`, `phone?`, `email?`,
`guardian?` (`{ name, phone, relation? }`), `enrolledAt?` — the date they joined the school,
defaulting to now. `accountEmail` is the login; it is also stored on the profile when no
separate `email` is given.

`GET /students/:id/enrollments` is the student's class history, newest first, with the class
resolved on each row.

### Teachers
```
GET    /teachers                ?search=&isActive=           any signed-in user
GET    /teachers/:id
POST   /teachers                profile + accountEmail       admin — creates the login too
PATCH  /teachers/:id                                         admin
DELETE /teachers/:id                                         admin — deactivate
```

Profile fields: `firstName`, `lastName`, `phone?`, `bio?`, `subjects?` (up to 20 strings).
`search` matches first name, last name or subject.

### Classes
```
GET    /classes                 ?grade=&section=&isActive=
GET    /classes/:id
POST   /classes                 { grade, section }                     admin
PATCH  /classes/:id             { grade?, section?, isActive? }        admin
DELETE /classes/:id                                                    admin — deactivate
GET    /classes/:id/students    ?schoolYear=&isActive=   the register — staff
POST   /classes/:id/students    { studentId, schoolYear }              admin — enrol
```

`grade` is 1–5 and `section` is `a` or `b`, so the school's classes are `1a`, `1b`, `2a`,
`2b`, `3a`, `3b`, `4a`, `4b`, `5a`, `5b`. `name` (`"3a"`) is derived from the two on every
write and is never accepted from the caller.

`GET /classes/:id/students` returns the enrolments of that class with the student resolved on
each row. It defaults to `isActive=true` — who is in the class now, rather than everyone ever.
Pass `isActive=false` for the ones who left, or `schoolYear=2026-2027` for a given year.

### Enrollments
```
GET    /enrollments             ?studentId=&classId=&schoolYear=&isActive=   staff
GET    /enrollments/:id                                  staff, or the student enrolled
PATCH  /enrollments/:id         { isActive }             admin
DELETE /enrollments/:id                                  admin — remove from the class
```

Create through `POST /classes/:id/students`. `GET /enrollments` resolves both sides, so it is
the view that answers "who is where".

`PATCH` with `isActive: true` puts a student back into a class they left, and runs the same
one-class-per-year check as a fresh enrolment — so it can return 409.

## Rules the backend enforces

- Email is unique across logins; passwords are bcrypt-hashed and never returned.
- Inactive accounts cannot authenticate.
- A login points at the profile its role implies, and at most one login per profile.
  An admin holds neither reference.
- One class group per grade and section: `1a` cannot be created twice.
- A class's `name` always matches its `grade` and `section`.
- One enrolment record per student per class (unique index). Putting a student back into a
  class they left revives that row instead of adding a second one.
- A student is in at most one active class per school year; a second one is a 409.
- A student's identity comes from the token, never from a `studentId` in the request.
