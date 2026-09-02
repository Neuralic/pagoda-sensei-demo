-- Editing a tour in the Tour Library did not change itineraries that already contained it.
-- Adding a tour copies its name and description into the jobs row, and nothing ever looked at
-- the tour again — so a corrected description reached new itineraries only. The advisor's only
-- recourse was to delete the line from every itinerary and add it back, and until they did, two
-- clients could be reading two different descriptions of the same tour.
--
-- The line still needs to be editable: an advisor may reword a tour for their own client, and
-- that edit must survive the guide editing the catalogue.
--
-- So record what was copied. A field the advisor has not touched still equals the snapshot, and
-- is read live from the tour; a field they have edited no longer matches, and stays theirs. The
-- comparison is per field, so rewording the description does not also freeze the title.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS tour_field_snapshot jsonb;

COMMENT ON COLUMN jobs.tour_field_snapshot IS
  'The name/description copied from the tour when this line was created. A field still equal to its snapshot is shown live from the tour; a field that differs was edited by the advisor and is left alone. Null means the line predates this column or was not created from a tour.';

-- Backfill: existing tour-linked lines are copies, not deliberate rewrites — there was no way to
-- tell them apart before now, and measuring the data found no line whose text differed from its
-- tour for any reason other than the tour having moved on. Snapshotting their current values
-- makes them all follow their tour again, which is what the advisor expected all along.
--
-- Nothing is destroyed: jobs.name and jobs.description keep their text, and any line an advisor
-- edits from here on stops matching and becomes theirs.
UPDATE jobs
   SET tour_field_snapshot = jsonb_build_object(
         'name', name,
         'description', description
       )
 WHERE tour_id IS NOT NULL
   AND tour_field_snapshot IS NULL;
