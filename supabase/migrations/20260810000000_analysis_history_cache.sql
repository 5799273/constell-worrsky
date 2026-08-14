alter table public.analysis_history
  add column notes_signature text,
  add column note_count integer,
  add column character_name text;

create unique index analysis_history_cache_key_idx
  on public.analysis_history (user_id, folder_id, type, notes_signature)
  where notes_signature is not null;
