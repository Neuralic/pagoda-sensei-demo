# Database Migrations

This directory contains SQL migration files for database schema changes.

## Running Migrations

### Option 1: Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of the migration file
4. Run the SQL

### Option 2: Supabase CLI
If you have Supabase CLI installed:
```bash
supabase db push
```

### Option 3: Direct SQL Execution
Connect to your database and run the SQL file directly.

## Tour pricing (`public.tour`)

**Introspected schema note:** if your table has `additional_per_adult`, `additional_per_child`, `additional_per_infant` but no `max_group_size`, those three columns are **unused** by the app (group rate uses only `additional_per_person_rate`). Run **`tour_pricing_sync_public.sql`** once to add `max_group_size` and drop the redundant columns.

| File | Purpose |
|------|---------|
| **`tour_public_schema_reference.sql`** | Comments only: **legacy vs target** pricing columns (not executable DDL). |
| **`tour_pricing_sync_public.sql`** | **Production DB**: `ADD max_group_size`, `DROP` three deprecated `additional_per_*` age columns, refresh `COMMENT`s. |
| **`tour_pricing_canonical.sql`** | Greenfield / unknown state: all pricing `ADD IF NOT EXISTS` + drops + comments. |
| **`20250322_tour_pricing_optimize.sql`** | If you already have `max_group_size` and only need to **drop** the three deprecated columns + comments. |

**Revised `20250319`** no longer creates the three deprecated columns (new databases stay clean). Historical order still works for old DBs; use **`tour_pricing_sync_public.sql`** to clean up.

Related: `jobs` participant columns (`20250317`, `20250316` infants), `job_applications` per-person bid columns (`20250318`).

## Migration Files

### 20260618_itinerary_intake.sql
- **Purpose**: Advisor intake on draft itinerary creation
- **Changes**: `itineraries.build_mode` (`self` | `pagoda_build`), `itineraries.intake_data` (JSONB: budget, style, interests, travelers, requirements)
- **Option 2**: triggers admin email when advisor selects Pagoda build

### 20260603_guide_availability_calendar.sql
- **Purpose**: Guide availability calendar (brief §3.3)
- **Changes**: `profiles.guide_availability_calendar` (JSONB: `unavailableDates`, `updatedAt`)
- **Required before**: saving guide profile calendar or booking gates that read availability

### 20260521_operator_managed_guides.sql
- **Purpose**: Multi-guide operator system
- **Changes**:
  - `users.is_operator`, `users.managed_by_operator_id`
  - Extended `profiles` fields (slug, tiers, certification, bio blocks, daily rate, etc.)
  - `operator_guide_invites` for self-onboarding links
- **Public URLs**: `/g/{profile_slug}` (no login)
- **Operator signup**: `/auth/signup/operator` sets `is_operator = true`
- **Enable existing DMC**: `UPDATE users SET is_operator = true WHERE id = '...';`

### 20260520_guide_tour_assignments.sql
- **Date**: 2026-05-20
- **Purpose**: Guide-to-tour marketplace assignments within an operator (DMC) account
- **Changes**:
  - `guide_tier_enum` + `users.guide_tier` (apprentice / professional / master)
  - `profiles.marketplace_available` for agent-facing availability
  - `operator_roster` — guides an operator may assign
  - `guide_tour_assignments` — many-to-many tour ↔ roster guide (scoped by `operator_id`; `tour_id` is **bigint** to match `tour.id`)
- If the main file failed on the FK: run **`20260520_guide_tour_assignments_fix_tour_id.sql`** (earlier steps may already be applied)

### 20250127_make_chats_job_id_nullable.sql
- **Date**: 2025-01-27
- **Purpose**: 
  - Makes `job_id` nullable in the `chats` table
  - Enforces UNIQUE constraint on (agency_id, guide_id) - **only ONE chat per agent-guide pair**
  - Merges any existing duplicate chats (preserves all messages and participants)
- **Changes**:
  - Removes NOT NULL constraint from `job_id`
  - Updates foreign key constraint to allow NULL values (ON DELETE SET NULL)
  - **Merges duplicate chats**: For each agent-guide pair with multiple chats, keeps the most recent one and moves all messages/participants to it
  - **Adds UNIQUE constraint** on (agency_id, guide_id) - ensures only ONE chat per agent-guide pair
  - Adds index for agent-guide pair queries

## Important Notes

- Always backup your database before running migrations
- Test migrations in a development/staging environment first
- Review the migration SQL carefully before executing
- Existing data will be preserved - this migration only changes constraints

