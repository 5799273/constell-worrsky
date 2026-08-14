create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text,
  created_at timestamptz not null default now()
);

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  color_key integer not null,
  created_at timestamptz not null default now()
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  folder_id uuid not null references public.folders (id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.analysis_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  folder_id uuid not null references public.folders (id) on delete cascade,
  type text not null check (type in ('T', 'F', 'common')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.folders enable row level security;
alter table public.notes enable row level security;
alter table public.analysis_history enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can create own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users can delete own profile"
  on public.profiles for delete
  using (auth.uid() = id);

create policy "Users can view own folders"
  on public.folders for select
  using (auth.uid() = user_id);

create policy "Users can create own folders"
  on public.folders for insert
  with check (auth.uid() = user_id);

create policy "Users can update own folders"
  on public.folders for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own folders"
  on public.folders for delete
  using (auth.uid() = user_id);

create policy "Users can view own notes"
  on public.notes for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.folders
      where folders.id = notes.folder_id
        and folders.user_id = auth.uid()
    )
  );

create policy "Users can create own notes"
  on public.notes for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.folders
      where folders.id = notes.folder_id
        and folders.user_id = auth.uid()
    )
  );

create policy "Users can update own notes"
  on public.notes for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.folders
      where folders.id = notes.folder_id
        and folders.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.folders
      where folders.id = notes.folder_id
        and folders.user_id = auth.uid()
    )
  );

create policy "Users can delete own notes"
  on public.notes for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.folders
      where folders.id = notes.folder_id
        and folders.user_id = auth.uid()
    )
  );

create policy "Users can view own analysis history"
  on public.analysis_history for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.folders
      where folders.id = analysis_history.folder_id
        and folders.user_id = auth.uid()
    )
  );

create policy "Users can create own analysis history"
  on public.analysis_history for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.folders
      where folders.id = analysis_history.folder_id
        and folders.user_id = auth.uid()
    )
  );

create policy "Users can update own analysis history"
  on public.analysis_history for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.folders
      where folders.id = analysis_history.folder_id
        and folders.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.folders
      where folders.id = analysis_history.folder_id
        and folders.user_id = auth.uid()
    )
  );

create policy "Users can delete own analysis history"
  on public.analysis_history for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.folders
      where folders.id = analysis_history.folder_id
        and folders.user_id = auth.uid()
    )
  );

create index folders_user_id_created_at_idx
  on public.folders (user_id, created_at);

create index notes_folder_id_created_at_idx
  on public.notes (folder_id, created_at);

create index analysis_history_folder_id_created_at_idx
  on public.analysis_history (folder_id, created_at desc);
