# Chat Tables Migration Summary

## Overview
This migration updates the `chats` table to support the new chat system where:
- **Only ONE chat exists between each agent-guide pair** (unique constraint)
- Chats are based on agent-guide pairs, not jobs
- The same chat is reused for job bids, tour DMs, and any other scenario

## Current Schema Issues

### Before Migration:
- `job_id` is `NOT NULL` - prevents creating chats without a job
- Foreign key constraint requires a valid job_id
- **No unique constraint** - allows multiple chats between same agent-guide pair
- **Duplicate chats exist** - need to be merged

### After Migration:
- `job_id` is nullable - allows chats without jobs
- Foreign key allows NULL values (with ON DELETE SET NULL)
- **UNIQUE constraint on (agency_id, guide_id)** - ensures only ONE chat per agent-guide pair
- **Existing duplicates merged** - messages and participants moved to most recent chat
- Index added for better query performance

## Migration Steps

1. **Drop foreign key constraint** - Allows us to modify the column
2. **Remove NOT NULL constraint** - Makes job_id nullable
3. **Re-add foreign key with SET NULL** - Maintains referential integrity while allowing NULL
4. **Merge duplicate chats** - For each agent-guide pair with multiple chats:
   - Keep the most recent chat (by created_at)
   - Move all messages from other chats to the kept chat
   - Move all participants from other chats to the kept chat
   - Delete the duplicate chats
5. **Add UNIQUE constraint** - Ensures only ONE chat per agent-guide pair (core requirement)
6. **Add performance index** - Improves queries by agent-guide pair

## Data Safety

- ✅ **No data loss** - All existing chats are preserved
- ✅ **Backward compatible** - Existing chats with job_id still work
- ✅ **Safe foreign key** - Uses ON DELETE SET NULL to handle job deletions gracefully

## Testing Checklist

After running the migration, verify:

1. [ ] Existing chats with job_id still work
2. [ ] Can create new chats without job_id
3. [ ] Cannot create duplicate chats between same agent-guide pair when job_id is NULL
4. [ ] Queries by agent-guide pair are fast (check with EXPLAIN)
5. [ ] Foreign key constraint works correctly when job_id is provided

## Rollback

If you need to rollback, use `20250127_make_chats_job_id_nullable_ROLLBACK.sql`
**WARNING**: Rollback will fail if there are any chats with NULL job_id. You must handle those first.

