# Candidate System Implementation Guide

## Overview
This document describes the implementation of a candidate-based hiring system for the travel marketplace, replacing the previous approach where guides were hired before proposal submission.

## Key Changes

### 1. Database Schema Updates Required

The following database changes are needed:

#### `jobs` table:
- Add `released_at` timestamp column (nullable, set when itinerary is published)
  ```sql
  ALTER TABLE jobs ADD COLUMN released_at TIMESTAMP WITH TIME ZONE;
  ```
  Note: `released_at` is NULL until the itinerary containing the job is published. For Tour Library jobs, this starts the 24-hour exclusive window for the tour owner.

#### `job_applications` table:
- Add `is_candidate` boolean column (defaults to false)
  ```sql
  ALTER TABLE job_applications ADD COLUMN is_candidate BOOLEAN DEFAULT FALSE;
  ```
- Note: `offer_status` is a text column (not an enum), so it can accept new values like 'candidate' and 'hired' without schema changes. The application code will handle these new status values.

### 2. Job Types and Behavior

#### Tour Library Jobs
- **Automatic Candidate Assignment**: When a job is created from a tour library, the tour owner is automatically set as a candidate
- **24-Hour Exclusive Window**: Only the tour owner can bid for the first 24 hours after the itinerary is published (not from job creation)
- **Before Publication**: Only the tour owner can apply to Tour Library jobs before the itinerary is published
- **After 24 Hours**: All guides can bid on the job (24 hours after publication)
- **Email Notification**: Tour owner receives email when job is created, all guides receive email when itinerary is published and when 24-hour window expires

#### Direct Agent Jobs
- **Manual Candidate Selection**: Agent can select one guide as a candidate from multiple bidders
- **Candidate Management**: Agent can remove a candidate and select a different one
- **Multiple Bids**: Multiple guides can bid, but only one can be a candidate at a time

### 3. Workflow

#### Before Proposal Approval (Draft Status)
1. Job is created (with candidate assigned for tour library jobs)
2. Guides bid on the job (subject to 24-hour window for tour library jobs)
3. Agent selects candidate for direct jobs OR tour owner is auto-candidate for tour library jobs
4. Candidate's profile appears in PDF export
5. Proposal is submitted to client with candidate information

#### After Proposal Approval (Published Status)
1. When itinerary status changes to "published", all candidates are automatically converted to "hired"
2. `offer_status` changes from "candidate" to "hired"
3. `hire_id` is set to the candidate's user ID
4. Hiring history record is created
5. Job can proceed as scheduled

### 4. API Endpoints

#### New Endpoints

**POST `/api/jobs/candidate`**
- Selects a candidate for a direct agent job
- Body: `{ job_id: string, applicant_id: string }`
- Only agents can use this endpoint
- Automatically removes candidate status from other applications

**DELETE `/api/jobs/candidate?jobId=xxx&applicantId=xxx`**
- Removes candidate status from a guide
- Only agents can use this endpoint

**POST `/api/jobs/release-notifications`**
- Checks for jobs that have passed the 24-hour window
- Sends email notifications to all guides
- Should be called by a scheduled job/cron (recommended: every hour)

#### Updated Endpoints

**POST `/api/jobs`**
- For tour library jobs, automatically creates candidate application for tour owner
- Note: `released_at` is NOT set at creation time - it's set when the itinerary is published

**POST `/api/applications`**
- Now checks if itinerary is published (released_at is set) for tour library jobs
- Before publication: Only tour owner can apply
- After publication: Checks 24-hour window - only tour owner can apply within 24 hours of publication
- After 24 hours: All guides can apply

**PATCH `/api/itineraries/[id]`**
- When status changes to "published":
  - Sets `released_at` timestamp for all Tour Library jobs (starts 24-hour window)
  - Converts all candidates to hired
  - Creates hiring history records
  - Sends notifications to all guides about published Tour Library jobs

### 5. PDF Export Changes

The PDF now displays:
- **Candidates** (before proposal approval): Guides with `offer_status = "candidate"` or `is_candidate = true`
- **Hired Guides** (after proposal approval): Guides with `offer_status = "hired"` or `offer_status = "completed"`

Updated in: `components/pdf/PdfContent.tsx`

### 6. Email Notifications

#### New Email Function
`sendJobReleasedNotificationEmail()` in `lib/mailer.ts`
- Sent to all guides when a tour library job's 24-hour exclusive window expires
- Notifies guides that the job is now open for all to bid

#### Existing Email Function
`sendTourAddedNotificationEmail()` in `lib/mailer.ts`
- Already exists, sent to tour owner when their tour is added to an itinerary

### 7. UI Components That May Need Updates

The following components may need UI updates to show candidate status:

1. **`components/guide/GuideProfileCard.tsx`**
   - Should display "Candidate" badge for candidates
   - Should allow agents to select/remove candidates (for direct jobs)

2. **`app/agent/bids/page.tsx`** and **`app/agency/bids/page.tsx`**
   - Should show candidate status in the bids list
   - Should provide UI to select candidate (for direct jobs)

3. **`components/guide/BidsClient.tsx`**
   - Should pass candidate status to GuideProfileCard

### 8. Scheduled Job Setup

Set up a cron job or scheduled task to call `/api/jobs/release-notifications` periodically (recommended: every hour).

Example cron expression:
```
0 * * * * curl -X POST https://your-domain.com/api/jobs/release-notifications
```

Or use a service like:
- Vercel Cron Jobs
- AWS EventBridge
- Google Cloud Scheduler
- Your hosting provider's cron service

### 9. Migration Steps

1. **Run Database Migrations**:
   ```sql
   -- Add released_at to jobs (nullable - set when itinerary is published)
   ALTER TABLE jobs ADD COLUMN IF NOT EXISTS released_at TIMESTAMP WITH TIME ZONE;
   
   -- For existing published itineraries, set released_at for their Tour Library jobs
   -- (This is optional - only if you want to backfill data)
   -- UPDATE jobs SET released_at = (SELECT updated_at FROM itineraries WHERE itineraries.id = jobs.itinerary_id AND itineraries.status = 'published') 
   -- WHERE jobs.tour_id IS NOT NULL AND jobs.released_at IS NULL;
   
   -- Add is_candidate to job_applications
   ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS is_candidate BOOLEAN DEFAULT FALSE;
   
   -- Note: offer_status is a text column, so no schema changes needed for new values
   -- The application code will handle 'candidate' and 'hired' status values
   ```

2. **Deploy Code Changes**: Deploy all updated files

3. **Set Up Scheduled Job**: Configure cron job for release notifications

4. **Test Workflow**:
   - Create a tour library job and verify candidate is auto-assigned
   - Create a direct agent job and verify candidate selection works
   - Test 24-hour window enforcement
   - Test proposal approval workflow
   - Verify PDF shows candidates correctly

### 10. Backward Compatibility

- Existing jobs without `released_at` will default to creation time
- Existing applications without `is_candidate` will default to false
- PDF will continue to show "completed" status guides (hired) for backward compatibility
- The system gracefully handles missing fields

### 11. Future Enhancements

Consider these future improvements:
- UI for agents to see candidate status clearly
- Notification when a guide is selected as candidate
- Dashboard showing all candidates across jobs
- Analytics on candidate selection rates
- Ability to have multiple candidates (if business logic changes)

## Summary

This implementation provides a rational, long-term approach to the hiring workflow that:
- Separates candidate selection from final hiring
- Supports both tour library and direct agent jobs
- Implements fair 24-hour exclusive bidding for tour owners
- Automatically converts candidates to hired upon proposal approval
- Maintains backward compatibility with existing data

The system is designed to be flexible and can accommodate future changes to the business logic.

