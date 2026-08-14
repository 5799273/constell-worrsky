create table public.beta_participants (
  user_id uuid primary key references auth.users (id) on delete cascade,
  beta_started_at timestamptz not null default now(),
  beta_ends_at timestamptz not null default (now() + interval '14 days'),
  day7_completed boolean not null default false,
  day14_completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.beta_analysis_sources (
  analysis_id uuid primary key references public.analysis_history (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  folder_id uuid not null references public.folders (id) on delete cascade,
  note_ids uuid[] not null,
  source_signature text not null,
  created_at timestamptz not null default now()
);

create table public.beta_analysis_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  analysis_id uuid references public.analysis_history (id) on delete set null,
  analysis_type text not null check (analysis_type in ('T', 'F', 'common')),
  created_at timestamptz not null default now()
);

create table public.beta_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  feedback_stage text not null check (feedback_stage in ('instant', 'day7', 'day14')),
  analysis_id uuid references public.analysis_history (id) on delete set null,
  analysis_type text check (analysis_type in ('T', 'F', 'common')),
  folder_id uuid references public.folders (id) on delete set null,
  agreement_percent integer check (agreement_percent between 0 and 100 and agreement_percent % 10 = 0),
  desired_answer_percent integer check (desired_answer_percent between 0 and 100 and desired_answer_percent % 10 = 0),
  understood_percent integer check (understood_percent between 0 and 100 and understood_percent % 10 = 0),
  t_satisfaction_percent integer check (t_satisfaction_percent between 0 and 100 and t_satisfaction_percent % 10 = 0),
  f_satisfaction_percent integer check (f_satisfaction_percent between 0 and 100 and f_satisfaction_percent % 10 = 0),
  common_satisfaction_percent integer check (common_satisfaction_percent between 0 and 100 and common_satisfaction_percent % 10 = 0),
  reason text,
  liked_text text,
  improvement_text text,
  misunderstood_text text,
  comparison_text text,
  reuse_situation_text text,
  continued_use_text text,
  one_line_description text,
  recommendation_score integer check (recommendation_score between 0 and 10),
  share_analysis_data boolean not null default false,
  shared_notes jsonb,
  shared_ai_response text,
  prompt_version text,
  model text,
  created_at timestamptz not null default now(),
  constraint beta_feedback_shared_data_consent check (
    share_analysis_data or (shared_notes is null and shared_ai_response is null)
  )
);

create unique index beta_feedback_once_per_analysis_idx
  on public.beta_feedback (user_id, feedback_stage, analysis_id)
  where feedback_stage = 'instant';
create unique index beta_feedback_once_per_stage_idx
  on public.beta_feedback (user_id, feedback_stage)
  where feedback_stage in ('day7', 'day14');
create index beta_feedback_admin_filter_idx on public.beta_feedback (feedback_stage, analysis_type, created_at desc);
create index beta_feedback_created_at_idx on public.beta_feedback (created_at desc);

alter table public.beta_participants enable row level security;
alter table public.beta_analysis_sources enable row level security;
alter table public.beta_analysis_usage enable row level security;
alter table public.beta_feedback enable row level security;

create policy "Users can view own beta participation" on public.beta_participants for select using (auth.uid() = user_id);
create policy "Users can join beta" on public.beta_participants for insert with check (auth.uid() = user_id);
create policy "Users can update own beta participation" on public.beta_participants for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can view own beta analysis sources" on public.beta_analysis_sources for select using (auth.uid() = user_id);
create policy "Users can create own beta analysis sources" on public.beta_analysis_sources for insert with check (auth.uid() = user_id);
create policy "Users can view own beta analysis usage" on public.beta_analysis_usage for select using (auth.uid() = user_id);
create policy "Users can create own beta analysis usage" on public.beta_analysis_usage for insert with check (auth.uid() = user_id);
create policy "Users can view own beta feedback" on public.beta_feedback for select using (auth.uid() = user_id);
create policy "Users can create own beta feedback" on public.beta_feedback for insert with check (auth.uid() = user_id);

grant select, insert, update on public.beta_participants to authenticated;
grant select, insert on public.beta_analysis_sources to authenticated;
grant select, insert on public.beta_analysis_usage to authenticated;
grant select, insert on public.beta_feedback to authenticated;
