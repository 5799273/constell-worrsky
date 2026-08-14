create function public.set_notes_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_notes_updated_at
  before update on public.notes
  for each row
  execute function public.set_notes_updated_at();

create function public.create_default_folders_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.folders (user_id, name, color_key)
  values
    (new.id, '#001', 2),
    (new.id, '#002', 4),
    (new.id, '#003', 5);

  return new;
end;
$$;

create trigger create_default_folders_for_new_user
  after insert on auth.users
  for each row
  execute function public.create_default_folders_for_new_user();
