alter table public.profiles
  add column wrapped_dek text,
  add column dek_nonce text,
  add column dek_auth_tag text,
  add column dek_key_version integer;

alter table public.notes
  alter column text drop not null,
  add column text_ciphertext text,
  add column text_nonce text,
  add column text_auth_tag text,
  add column encryption_key_version integer;

alter table public.analysis_history
  alter column content drop not null,
  add column content_ciphertext text,
  add column content_nonce text,
  add column content_auth_tag text,
  add column encryption_key_version integer;

create function public.ensure_user_encryption_key(
  p_wrapped_dek text,
  p_dek_nonce text,
  p_dek_auth_tag text,
  p_dek_key_version integer
)
returns table (
  wrapped_dek text,
  dek_nonce text,
  dek_auth_tag text,
  dek_key_version integer
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.profiles (id, wrapped_dek, dek_nonce, dek_auth_tag, dek_key_version)
  values (auth.uid(), p_wrapped_dek, p_dek_nonce, p_dek_auth_tag, p_dek_key_version)
  on conflict (id) do update
    set wrapped_dek = excluded.wrapped_dek,
        dek_nonce = excluded.dek_nonce,
        dek_auth_tag = excluded.dek_auth_tag,
        dek_key_version = excluded.dek_key_version
    where profiles.wrapped_dek is null;

  return query
    select p.wrapped_dek, p.dek_nonce, p.dek_auth_tag, p.dek_key_version
    from public.profiles p
    where p.id = auth.uid();
end;
$$;

grant execute on function public.ensure_user_encryption_key(text, text, text, integer)
to authenticated;
