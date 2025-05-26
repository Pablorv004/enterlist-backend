# Prisma Naming Conventions and Database Mapping

## Overview

This project uses Prisma ORM with a PostgreSQL database. There are some important naming conventions to be aware of when working with the codebase:

### Table Names vs. Model Names

- **Database tables** use **plural names** (e.g., `users`, `playlists`, `songs`)
- **Prisma models** use **singular names** (e.g., `User`, `Playlist`, `Song`)
- The `@@map` directive in each model maps the singular Prisma model to the plural database table

### Enum Naming

- **Database enums** use **snake_case** (e.g., `user_role`, `submission_status`)
- When importing these enums from the Prisma client, you must use the **snake_case** version:

```typescript
import { user_role, submission_status } from '@prisma/client';
```

- Use them in your code consistently with the snake_case format:

```typescript
@IsEnum(user_role)
role: user_role;

@Roles(user_role.admin)
```

## Common Enums

The project uses the following enums:

1. `user_role` - User roles in the system
   - `playlist_maker`
   - `artist`
   - `admin`

2. `submission_status` - Status of song submissions
   - `pending`
   - `approved`
   - `rejected`

3. `payment_method_type` - Types of payment methods
   - `card`
   - `paypal`

4. `transaction_status` - Status of payment transactions
   - `pending`
   - `processing`
   - `succeeded`
   - `failed`

## Important Notes

- When pulling new database schema changes, the Prisma schema will reflect the actual database column names and types.
- After pulling, always run `npx prisma generate` to ensure the client is updated.
- Maintain consistency in using snake_case for enum imports and references throughout the codebase.
