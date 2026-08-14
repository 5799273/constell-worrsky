alter table public.analysis_history
  add column is_saved boolean not null default false;

create index analysis_history_saved_created_at_idx
  on public.analysis_history (user_id, is_saved, created_at desc);
