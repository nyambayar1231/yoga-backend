# Yoga Studio CMS — API

Implements [architecture.md](./architecture.md). All paths are under `/api`.

## Conventions

- **Auth** — `POST /api/auth/login` sets an httpOnly cookie; every other route needs it.
- **Lists** — `?limit=&skip=` (limit max 200) and return `{ data, total, limit, skip }`.
  `total` is the full match count, so a truncated page is obvious.
- **Errors** — `{ code, error, details? }` with the HTTP status carrying the meaning
  (400 validation, 401 not signed in, 403 not allowed, 404 missing, 409 conflict).
- **Deletion** — `DELETE` deactivates (`isActive: false`). Nothing is physically removed,
  so attendance and assessment history stays valid.
- **Dates** — ISO 8601 in and out, stored as UTC `Date`.

## Roles

| | member | instructor | admin |
|---|---|---|---|
| own profile / attendance / assessments | read | — | — |
| book and cancel own place | yes | — | — |
| members, rosters, assessments | — | read/write | read/write |
| own classes (roster, check-in, cancel) | — | yes | yes |
| members, instructors, class types, sessions | — | — | full |

An instructor is scoped to the sessions they teach: rosters, check-ins and cancellations
for anyone else's class are 403.

An admin may also hold an instructor profile (`users.instructorId`), which is what lets an
admin who teaches be assigned to a session or recorded as the author of an assessment. The
seed creates one for the first admin. A member login never carries an instructor profile.

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
POST   /users                   { email, password?, role, memberId?, instructorId? }
GET    /users/:id
PATCH  /users/:id
PUT    /users/:id/password      { password }        # admin reset
DELETE /users/:id                                   # deactivate
```

### Members
```
GET    /members                 ?search=&isActive=          staff
POST   /members                 profile + accountEmail       admin — creates the login too
GET    /members/:id                                          staff, or the member themselves
PATCH  /members/:id                                          admin
DELETE /members/:id                                          admin — deactivate
GET    /members/:id/attendance  ?status=                     staff, or the member themselves
GET    /members/:id/assessments ?type=&from=&to=             staff, or the member themselves
POST   /members/:id/assessments { instructorId?, type, data?, notes? }   staff
```

### Instructors
```
GET    /instructors             ?search=&isActive=           any signed-in user
GET    /instructors/:id
POST   /instructors             profile + accountEmail       admin — creates the login too
PATCH  /instructors/:id                                      admin
DELETE /instructors/:id                                      admin — deactivate
```

### Class types
```
GET    /class-types             ?search=&category=&isActive=
GET    /class-types/:id
POST   /class-types             { name, category, durationMinutes, capacity, description? }  admin
PATCH  /class-types/:id                                                                      admin
DELETE /class-types/:id                                                                      admin
```

### Class sessions
```
GET    /class-sessions          ?from=&to=&classTypeId=&instructorId=&status=
GET    /class-sessions/:id                          adds occupiedSeats / freeSeats
POST   /class-sessions          { classTypeId, instructorId, startAt, endAt?, capacity? }  admin
PATCH  /class-sessions/:id                                                                 admin
POST   /class-sessions/:id/cancel                   admin or the session's instructor
POST   /class-sessions/:id/complete                 admin or the session's instructor
GET    /class-sessions/:id/attendance               roster — admin or the session's instructor
POST   /class-sessions/:id/attendance               { memberId } for staff; members omit it
```

`endAt` defaults to `startAt` plus the class type's duration; `capacity` defaults to the class
type's. Capacity is copied onto the session, so editing the catalogue never resizes a class
people have already booked.

### Attendance
```
GET    /attendance/:id
PATCH  /attendance/:id          { status: registered | attended | cancelled | no_show }
```
Staff running the class move a booking through its lifecycle. A member may only cancel, and
only their own — nobody marks themselves as attended.

### Assessments
```
GET    /assessments             ?memberId=&instructorId=&type=&from=&to=    staff
GET    /assessments/:id                                     staff, or the member assessed
PATCH  /assessments/:id                                     admin or the authoring instructor
```
Create through `POST /members/:id/assessments`. An instructor is recorded as the author of
their own assessments automatically and cannot file one under anyone else. An admin may name
the instructor, and falls back to their own instructor profile if they have one.

## Rules the backend enforces

- Email is unique across logins; passwords are bcrypt-hashed and never returned.
- Inactive accounts cannot authenticate.
- A login points at the profile its role implies, and at most one login per profile.
- An instructor cannot teach two scheduled sessions that overlap.
- One attendance record per member per session (unique index), capacity checked on every
  booking, and capacity cannot be lowered below the people already booked.
- A member's identity comes from the token, never from a `memberId` in the request.
