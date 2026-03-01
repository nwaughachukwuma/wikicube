-- Enable pgvector extension
create extension if not exists vector with schema extensions;

-- Wikis table
create table if not exists public.wikis (
  id uuid default gen_random_uuid() primary key,
  owner text not null,
  repo text not null,
  default_branch text not null default 'main',
  overview text not null default '',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner, repo)
);

-- Features table
create table if not exists public.features (
  id uuid default gen_random_uuid() primary key,
  wiki_id uuid not null references public.wikis(id) on delete cascade,
  slug text not null,
  title text not null,
  summary text not null default '',
  markdown_content text not null default '',
  entry_points jsonb not null default '[]',
  citations jsonb not null default '[]',
  sort_order int not null default 0
);

create index if not exists idx_features_wiki_id on public.features(wiki_id);
create unique index if not exists idx_features_wiki_slug on public.features(wiki_id, slug);

-- Chunks table with vector embeddings
create table if not exists public.chunks (
  id uuid default gen_random_uuid() primary key,
  wiki_id uuid not null references public.wikis(id) on delete cascade,
  feature_id uuid references public.features(id) on delete set null,
  content text not null,
  source_type text not null default 'wiki',
  source_file text,
  embedding vector(1536)
);

create index if not exists idx_chunks_wiki_id on public.chunks(wiki_id);

-- IVFFlat index for fast similarity search
-- Note: only effective after inserting some rows; recreate if needed
create index if not exists idx_chunks_embedding on public.chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- RPC function for semantic search
create or replace function match_chunks(
  query_embedding vector(1536),
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

-- Row level security (allow all for now via service role)
alter table public.wikis enable row level security;
alter table public.features enable row level security;
alter table public.chunks enable row level security;

-- Policies: allow read for anon, write for service role
create policy "Allow public read on wikis" on public.wikis for select using (true);
create policy "Allow public read on features" on public.features for select using (true);
create policy "Allow public read on chunks" on public.chunks for select using (true);

-- Auth: add visibility + indexed_by to wikis
alter table public.wikis
  add column if not exists visibility text not null default 'public'
    check (visibility in ('public', 'private')),
  add column if not exists indexed_by uuid references auth.users(id) on delete set null;

create index if not exists idx_wikis_indexed_by on public.wikis(indexed_by);

-- Wiki chats table (persisted chat messages per session)
create table if not exists public.wiki_chats (
  id uuid default gen_random_uuid() primary key,
  wiki_id uuid not null references public.wikis(id) on delete cascade,
  session_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_wiki_chats_wiki_id on public.wiki_chats(wiki_id);
create index if not exists idx_wiki_chats_session_id on public.wiki_chats(session_id);
create index if not exists idx_wiki_chats_user_id on public.wiki_chats(user_id);

alter table public.wiki_chats enable row level security;
-- Users can only see their own chat messages
create policy "Users read own chats" on public.wiki_chats
  for select using (user_id = auth.uid());
