alter table public.analysis_history
  add column prompt_version text;

drop index if exists public.analysis_history_cache_key_idx;

create unique index analysis_history_cache_key_idx
  on public.analysis_history (user_id, folder_id, type, notes_signature, prompt_version)
  where notes_signature is not null and prompt_version is not null;
