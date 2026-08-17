create table public.service_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  feedback_type text not null check (feedback_type in ('오류 / 불편', '사용성', '기능 제안', '기타')),
  rating smallint not null check (rating between 1 and 5),
  content text not null check (char_length(content) between 1 and 5000),
  route text,
  device_type text,
  viewport text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index service_feedback_created_at_idx on public.service_feedback (created_at desc);
alter table public.service_feedback enable row level security;
create policy "Users can create own service feedback" on public.service_feedback for insert with check (auth.uid() = user_id);
create policy "Users can view own service feedback" on public.service_feedback for select using (auth.uid() = user_id);
grant select, insert on public.service_feedback to authenticated;

alter table public.analysis_feedback add column if not exists reasons jsonb not null default '[]'::jsonb;
alter table public.analysis_feedback add column if not exists updated_at timestamptz not null default now();
alter table public.analysis_feedback add column if not exists rating_score smallint check (rating_score between 1 and 5);
alter table public.analysis_feedback add column if not exists evaluation_key text;
create unique index analysis_feedback_evaluation_key_idx on public.analysis_feedback (evaluation_key);
create policy "Users can update own analysis feedback" on public.analysis_feedback for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant update on public.analysis_feedback to authenticated;
