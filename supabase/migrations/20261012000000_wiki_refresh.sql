-- Wiki freshness: record which commit each wiki was generated from, and let a
-- refresh build its pages alongside the live ones. Readers only see features
-- whose generation matches wikis.generation, so a refresh goes live with a
-- single update of the wiki row and a failed one leaves the old pages intact.
alter table public.wikis
  add column if not exists generation int not null default 0,
  add column if not exists source_commit_sha text,
  add column if not exists latest_commit_sha text,
  add column if not exists generated_at timestamptz,
  add column if not exists checked_at timestamptz,
  add column if not exists refresh_started_at timestamptz,
  add column if not exists refresh_error text;

-- Earliest possible generation time for wikis built before this migration.
-- updated_at would overstate it (reindexing bumps it), making stale wikis
-- look fresh; created_at errs towards checking them.
update public.wikis
  set generated_at = created_at
  where generated_at is null and status = 'done';

alter table public.features
  add column if not exists generation int not null default 0;

-- Slugs only need to be unique within a generation
drop index if exists idx_features_wiki_slug;
create unique index if not exists idx_features_wiki_generation_slug
  on public.features(wiki_id, generation, slug);
