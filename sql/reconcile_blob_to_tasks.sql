-- Recover tasks that exist in the frozen fallback blob
-- (app_data.todoist_task_cache) but are missing from public.tasks.
--
-- WHEN TO RUN: only if a task is believed lost. It was run once at the
-- 2026-07-26 cutover and found zero drift (blob and table were identical at
-- 335/335). It is safe to run at any time, including repeatedly.
--
-- WHY IT CANNOT DESTROY ANYTHING: there is no UPDATE in it. It is INSERT ...
-- ON CONFLICT (id) DO NOTHING, so a row that already exists in public.tasks is
-- skipped entirely — an older blob copy can never overwrite a newer live edit.
-- That property is structural, not a matter of care: to break it, someone would
-- have to add an UPDATE or a DO UPDATE clause.
--
-- It also never deletes. Tasks created after the blob was frozen are absent
-- from the blob and are simply left alone.
--
-- Run STEP 1 first and read it. Only run STEP 2 if step 1 shows work to do.

-- ─── STEP 1: report (read-only, changes nothing) ─────────────────────────────
with blob as (select jsonb_array_elements(value) t from app_data where key='todoist_task_cache')
select
  (select count(*) from blob)                                       as blob_tasks,
  (select count(*) from public.tasks)                               as table_rows,
  (select count(*) from blob b
     where not exists (select 1 from public.tasks x where x.id = b.t->>'id'))
                                                                    as would_be_inserted,
  (select count(*) from public.tasks x
     where not exists (select 1 from blob b where b.t->>'id' = x.id))
                                                                    as newer_than_blob_left_alone,
  -- Divergences are REPORTED, never applied. If a task's content differs, the
  -- live row wins and you decide by hand — guessing is how data gets lost.
  (select count(*) from blob b join public.tasks x on x.id = b.t->>'id'
     where coalesce(b.t->>'content','') <> coalesce(x.content,''))   as content_differs_review_manually;

-- ─── STEP 2: insert-only recovery ────────────────────────────────────────────
-- parent_id is carried over ONLY when the parent already exists, so a missing
-- parent cannot fail the whole insert; such a task arrives top-level and
-- visible rather than not at all. Re-parent it by hand afterwards if needed.
insert into public.tasks (
  id, content, priority, due_date, is_completed, completed_at, parent_id,
  description, project_id, project_name, section_id, section_name, category,
  consequence, reversibility, compounding, effort, pinned
)
select
  t->>'id',
  t->>'content',
  coalesce((t->>'priority')::smallint, 1),
  (t->'due'->>'date')::date,
  coalesce((t->>'is_completed')::boolean, false),
  (t->>'completed_at')::timestamptz,
  case when exists (select 1 from public.tasks p where p.id = t->>'parent_id')
       then t->>'parent_id' else null end,
  t->>'description',
  t->>'project_id',
  t->>'_projectName',
  t->>'section_id',
  t->>'_sectionName',
  t->>'_category',
  (t->>'consequence')::smallint,
  (t->>'reversibility')::smallint,
  (t->>'compounding')::smallint,
  t->>'effort',
  coalesce((t->>'pinned')::boolean, false)
from app_data, lateral jsonb_array_elements(value) t
where key = 'todoist_task_cache'
on conflict (id) do nothing;

-- ─── STEP 3: confirm ─────────────────────────────────────────────────────────
select count(*) as table_rows_after, count(*) filter (where deleted_at is null) as live_rows
from public.tasks;
