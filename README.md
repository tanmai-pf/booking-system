# Building Location & Booking System

REST API for managing hierarchical building locations and room bookings.

## Tech Stack

- NestJS + TypeScript
- TypeORM + PostgreSQL
- class-validator for DTO validation

## Setup

```bash
npm install
```

Create a `.env` file:

```
DATABASE_URL=postgresql://user:password@host:5432/dbname
NODE_ENV=development
PORT=3000
```

Run:

```bash
npm run start:dev
```

## Authentication

All endpoints require a Bearer token. JWT is decoded (not verified) to get user info. No secret or user table — data lives in the token.

- **Location CRUD** requires `role: "admin"`
- **Booking endpoints** require `department` in the request body, validated against the room's allocated departments

### Sample Tokens

| User | Role | Token |
|------|------|-------|
| Admin | admin | `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhZG1pbiIsIm5hbWUiOiJBZG1pbiIsInJvbGUiOiJhZG1pbiJ9.` |
| Alice | user | `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ1c2VyMSIsIm5hbWUiOiJBbGljZSBOZ3V5ZW4ifQ.` |
| Bob | user | `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ1c2VyMiIsIm5hbWUiOiJCb2IgVHJhbiJ9.` |
| Charlie | user | `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ1c2VyMyIsIm5hbWUiOiJDaGFybGllIExlIn0.` |

## System Design

```
                    ┌──────────────┐
                    │    Client    │
                    └──────┬───────┘
                           │ HTTP + Bearer JWT
                           ▼
              ┌────────────────────────┐
              │     NestJS Application │
              │                        │
              │  ┌──────────────────┐  │
              │  │  ValidationPipe  │  │  ← DTO validation
              │  └────────┬─────────┘  │
              │           ▼            │
              │  ┌──────────────────┐  │
              │  │ LoggingInterceptor│  │  ← Request/response logging
              │  └────────┬─────────┘  │
              │           ▼            │
              │  ┌──────────────────┐  │
              │  │   AuthGuard      │  │  ← Decode JWT, extract user
              │  │   AdminGuard     │  │  ← role=admin for locations
              │  └────────┬─────────┘  │
              │           ▼            │
              │  ┌──────────────────┐  │
              │  │   Controllers    │  │
              │  │  - Location      │  │  ← Admin only
              │  │  - Booking       │  │  ← Any authenticated user
              │  └────────┬─────────┘  │
              │           ▼            │
              │  ┌──────────────────┐  │
              │  │    Services      │  │  ← Business logic
              │  │  - Location CRUD │  │
              │  │  - Booking CRUD  │  │
              │  │  - Dept matching │  │
              │  │  - Capacity check│  │
              │  │  - Schedule check│  │
              │  │  - Duplicate chk │  │
              │  │  - Overlap check │  │
              │  └────────┬─────────┘  │
              │           ▼            │
              │  ┌──────────────────┐  │
              │  │ ExceptionFilter  │  │  ← Global error handling
              │  └────────┬─────────┘  │
              └───────────┼────────────┘
                          │ TypeORM
                          ▼
              ┌────────────────────────┐
              │     PostgreSQL         │
              │  - locations (tree)    │
              │  - location_departments│
              │  - bookings            │
              └────────────────────────┘
```

### Module Structure

```
src/
├── main.ts                              # Bootstrap, pipes, filters, logger
├── app.module.ts                        # Root module, TypeORM + DB config
├── common/
│   ├── logger.service.ts                # Custom centralized logger (AppLogger)
│   ├── guards/
│   │   └── auth.guard.ts                # AuthGuard (JWT decode), AdminGuard
│   ├── decorators/
│   │   └── current-user.decorator.ts    # @CurrentUser() param decorator
│   ├── filters/
│   │   └── http-exception.filter.ts     # Global exception filter
│   └── interceptors/
│       └── logging.interceptor.ts       # Request/response logging
├── location/
│   ├── location.module.ts               # Location module
│   ├── location.entity.ts               # Location tree entity (closure-table)
│   ├── location-department.entity.ts    # Dept allocation per room
│   ├── location.service.ts              # Location + department CRUD
│   ├── location.controller.ts           # REST endpoints (admin only)
│   └── dto/
│       ├── create-location.dto.ts
│       ├── update-location.dto.ts
│       ├── create-location-department.dto.ts
│       └── update-location-department.dto.ts
└── booking/
    ├── booking.module.ts                # Booking module
    ├── booking.entity.ts                # Booking entity
    ├── booking.service.ts               # Booking CRUD + all validations
    ├── booking.controller.ts            # REST endpoints
    └── dto/
        ├── create-booking.dto.ts
        └── update-booking.dto.ts
```

### Booking Request Flow

```
POST /bookings (with Bearer token)
  → AuthGuard: decode JWT → { sub, name }
  → BookingService.create()
      1. Find location → must have bookable=true
      2. Find department allocation → dto.department must match
      3. Check attendees ≤ capacity
      4. Reject if start time is in the past
      5. Reject duplicate (same user + dept + start time)
      6. Check day is within open days (Mon-Fri etc)
      7. Check time is within open hours (9AM-6PM etc)
      8. Check overlap across all departments in the room
      9. Save booking
  → Response 201 / 4xx error
```

## Database Design

```
┌──────────────────────────────────────┐
│           locations                  │
├──────────────────────────────────────┤
│ id          UUID (PK)                │
│ name        VARCHAR                  │  "Meeting Room 1"
│ code        VARCHAR (UNIQUE)         │  "A-01-01"
│ bookable    BOOLEAN DEFAULT false    │  true/false
│ parentId    UUID (FK → self)         │  ON DELETE CASCADE
│ createdAt   TIMESTAMP                │
│ updatedAt   TIMESTAMP                │
└──────────┬───────────────────────────┘
           │ 1:N
           ▼
┌──────────────────────────────────────┐
│  locations_closure (auto-generated)  │  ← TypeORM closure-table for tree
├──────────────────────────────────────┤
│ id_ancestor    UUID (FK)             │
│ id_descendant  UUID (FK)             │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│     location_departments             │
├──────────────────────────────────────┤
│ id          UUID (PK)                │
│ locationId  UUID (FK)                │  → locations.id ON DELETE CASCADE
│ department  VARCHAR                  │  "EFM", "FSS", "AVS"
│ capacity    INT                      │  10, 50, 5
│ openDays    VARCHAR                  │  "Mon-Fri", "Mon-Sat", "Always"
│ openStart   TIME (nullable)          │  09:00
│ openEnd     TIME (nullable)          │  18:00
│ createdAt   TIMESTAMP                │
│ updatedAt   TIMESTAMP                │
└──────────┬───────────────────────────┘
           │ 1:N
           ▼
┌──────────────────────────────────────┐
│           bookings                   │
├──────────────────────────────────────┤
│ locationDeptId  UUID (FK)            │  → location_departments.id ON DELETE CASCADE
│ id              UUID (PK)            │
│ attendees       INT                  │
│ startTime       TIMESTAMPTZ          │
│ endTime         TIMESTAMPTZ          │
│ bookedBy        VARCHAR              │  user id from JWT (sub)
│ status          ENUM                 │  CONFIRMED | CANCELLED
│ createdAt       TIMESTAMP            │
│ updatedAt       TIMESTAMP            │
└──────────────────────────────────────┘
```

### Why `location_departments` is a separate table

Room A-01-02 has two departments with different rules:

| Name | Number | Department | Capacity | Open Time |
|------|--------|------------|----------|-----------|
| Meeting Room 2 | A-01-02 | FSS | 50 | Mon-Fri |
| Meeting Room 2 | A-01-02 | AVS | 5 | Mon-Sat |

A separate table lets each department have its own capacity and schedule for the same room.

## API

### Locations (Admin only)

- `POST /locations` — create location
- `GET /locations/tree` — get full tree
- `GET /locations/:id` — get location
- `GET /locations/:id/descendants` — get subtree
- `PATCH /locations/:id` — update location
- `DELETE /locations/:id` — delete (cascades)
- `POST /locations/:id/departments` — add department
- `PATCH /locations/departments/:deptId` — update department
- `DELETE /locations/departments/:deptId` — remove department

### Bookings (Authenticated users)

- `POST /bookings` — create booking (dept in request body, validates capacity + time + overlap)
- `GET /bookings` — list current user's bookings
- `GET /bookings/department/:department` — list bookings by department (admin only)
- `GET /bookings/:id` — get booking
- `PATCH /bookings/:id` — update booking
- `DELETE /bookings/:id` — cancel booking

## Booking Validation Rules

1. Location must have `bookable = true`
2. Department (from request body) must be allocated to the room
3. Attendees must not exceed capacity
4. Start time must not be in the past
5. Time must be within open days/hours
6. No duplicate booking (same user, same department, same start time)
7. Time slots cannot overlap across all departments in the same room
