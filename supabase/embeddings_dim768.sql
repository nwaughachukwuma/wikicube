-- 1. column
alter table public.chunks drop column embedding;
alter table public.chunks add column embedding vector(768);

-- 2. index
drop index if exists idx_chunks_embedding;
create index idx_chunks_embedding on public.chunks 
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);


-- 3. function
-- Drop and recreate match_chunks with 768 dimensions
create or replace function match_chunks(
  query_embedding vector(768),
  p_wiki_id uuid,
  match_count int default 8,
  match_threshold float default 0.7
)
returns table (
  id uuid,
  content text,
  source_type text,
  source_file text,
  feature_id uuid,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    c.id,
    c.content,
    c.source_type,
    c.source_file,
    c.feature_id,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  where c.wiki_id = p_wiki_id
    and 1 - (c.embedding <=> query_embedding) > match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
end;
$$;