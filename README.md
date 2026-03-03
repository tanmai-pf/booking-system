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
              │  │  - Time check    │  │
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
├── main.ts                         # Bootstrap, pipes, filters
├── app.module.ts                   # Root module, DB config
├── common/
│   ├── logger.service.ts           # Custom centralized logger
│   ├── guards/                     # AuthGuard (JWT decode), AdminGuard
│   ├── decorators/                 # @CurrentUser() decorator
│   ├── filters/                    # Global exception filter
│   └── interceptors/               # Logging interceptor
├── location/
│   ├── location.entity.ts          # Location tree entity (closure-table)
│   ├── location-department.entity.ts # Dept allocation per room
│   ├── location.service.ts         # Location + department CRUD
│   ├── location.controller.ts      # REST endpoints (admin only)
│   └── dto/
├── booking/
│   ├── booking.entity.ts           # Booking entity
│   ├── booking.service.ts          # Booking CRUD + all validations
│   ├── booking.controller.ts       # REST endpoints
│   └── dto/
└── config/
    └── database.config.ts
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
      5. Check day is within open days (Mon-Fri etc)
      6. Check time is within open hours (9AM-6PM etc)
      7. Query overlapping bookings → reject if any exist
      8. Save booking
  → Response 201 / 4xx error
```

## Database Design

```
┌──────────────────────────────────┐
│           locations              │
├──────────────────────────────────┤
│ id          UUID (PK)            │
│ name        VARCHAR              │  "Meeting Room 1"
│ code        VARCHAR (UNIQUE)     │  "A-01-01"
│ bookable    BOOLEAN              │  true/false
│ parentId    UUID (FK → self)     │  tree parent
│ createdAt   TIMESTAMP            │
│ updatedAt   TIMESTAMP            │
└──────────┬───────────────────────┘
           │ 1:N
           ▼
┌──────────────────────────────────┐
│     location_departments         │
├──────────────────────────────────┤
│ id          UUID (PK)            │
│ locationId  UUID (FK)            │  → locations.id
│ department  VARCHAR              │  "EFM", "FSS", "AVS"
│ capacity    INT                  │  10, 50, 5
│ openDays    VARCHAR              │  "Mon-Fri", "Mon-Sat", "Always"
│ openStart   TIME (nullable)      │  09:00
│ openEnd     TIME (nullable)      │  18:00
│ createdAt   TIMESTAMP            │
│ updatedAt   TIMESTAMP            │
└──────────┬───────────────────────┘
           │ 1:N
           ▼
┌──────────────────────────────────┐
│           bookings               │
├──────────────────────────────────┤
│ id              UUID (PK)        │
│ locationDeptId  UUID (FK)        │  → location_departments.id
│ attendees       INT              │
│ startTime       TIMESTAMPTZ      │
│ endTime         TIMESTAMPTZ      │
│ bookedBy        VARCHAR          │  from JWT sub (user id)
│ status          ENUM             │  CONFIRMED | CANCELLED
│ createdAt       TIMESTAMP        │
│ updatedAt       TIMESTAMP        │
└──────────────────────────────────┘

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
6. Time slots cannot overlap (one booking per time slot per department)
