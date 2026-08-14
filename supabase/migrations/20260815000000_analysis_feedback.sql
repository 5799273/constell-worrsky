create table public.analysis_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  analysis_id uuid references public.analysis_history (id) on delete set null,
  analysis_type text not null check (analysis_type in ('T', 'F', 'common')),
  rating text not null check (rating in ('helpful', 'unclear', 'not_helpful')),
  selected_paragraphs jsonb not null check (
    jsonb_typeof(selected_paragraphs) = 'array'
    and jsonb_array_length(selected_paragraphs) > 0
  ),
  comment text,
  created_at timestamptz not null default now()
);

create index analysis_feedback_created_at_idx
  on public.analysis_feedback (created_at desc);
create index analysis_feedback_type_rating_idx
  on public.analysis_feedback (analysis_type, rating, created_at desc);

alter table public.analysis_feedback enable row level security;

create policy "Users can view own analysis feedback"
  on public.analysis_feedback for select
  using (auth.uid() = user_id);

create policy "Users can create own analysis feedback"
  on public.analysis_feedback for insert
  with check (auth.uid() = user_id);

grant select, insert on public.analysis_feedback to authenticated;

