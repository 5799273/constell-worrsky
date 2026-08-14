do $$
begin
  if exists (
    select 1 from public.notes
    where text is not null
       or text_ciphertext is null
       or text_nonce is null
       or text_auth_tag is null
       or encryption_key_version is null
  ) then
    raise exception 'notes encryption verification failed';
  end if;

  if exists (
    select 1 from public.analysis_history
    where content is not null
       or content_ciphertext is null
       or content_nonce is null
       or content_auth_tag is null
       or encryption_key_version is null
  ) then
    raise exception 'analysis_history encryption verification failed';
  end if;
end;
$$;

alter table public.notes
  alter column text_ciphertext set not null,
  alter column text_nonce set not null,
  alter column text_auth_tag set not null,
  alter column encryption_key_version set not null,
  drop column text;

alter table public.analysis_history
  alter column content_ciphertext set not null,
  alter column content_nonce set not null,
  alter column content_auth_tag set not null,
  alter column encryption_key_version set not null,
  drop column content;
