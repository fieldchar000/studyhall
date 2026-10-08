-- Studyhall cloud schema: social features, sign-up rules, storage.
-- Applied by scripts/cloud-setup.cjs AFTER the generated personal-table SQL.
-- Safe to re-run: everything is "if not exists" / "create or replace" / "drop policy if exists".
-- Every table has Row Level Security; permissions are enforced here, in the database.

-- =====================================================================
-- Tables
-- =====================================================================

-- Public-ish identity: what friends and server co-members can see about you.
create table if not exists public.user_directory (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (length(display_name) between 1 and 40),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Friendship is symmetric and only created by redeeming an invite (no search, no requests).
create table if not exists public.friendships (
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create table if not exists public.servers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 60),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.server_members (
  server_id uuid not null references public.servers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','mod','member')),
  joined_at timestamptz not null default now(),
  primary key (server_id, user_id)
);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  name text not null check (length(name) between 1 and 40),
  kind text not null default 'text' check (kind in ('text','study_room')),
  sort int not null default 0,
  room_key text not null default replace(gen_random_uuid()::text, '-', ''), -- unguessable video room name
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  body text not null check (length(body) <= 4000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists messages_channel_time on public.messages (channel_id, created_at desc);

-- Per user, per channel: unread marker and mute.
create table if not exists public.channel_states (
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  primary key (channel_id, user_id)
);

-- Invite codes: sign-up is only possible with one. Friend invites befriend the creator;
-- server invites add you to the server. Expiring, with a use limit.
create table if not exists public.invites (
  code text primary key,
  kind text not null check (kind in ('friend','server')),
  created_by uuid references auth.users(id) on delete cascade, -- null = bootstrap invite (first user)
  server_id uuid references public.servers(id) on delete cascade,
  max_uses int not null default 1 check (max_uses between 1 and 50),
  use_count int not null default 0,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Sharing a module (read-only) or a note (view or edit) with a friend.
create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in ('module','note')),
  resource_id text not null,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  shared_with uuid not null references auth.users(id) on delete cascade,
  permission text not null default 'view' check (permission in ('view','edit')),
  created_at timestamptz not null default now(),
  unique (resource_type, resource_id, shared_with)
);

-- "Who's studying now": one row per user, refreshed every minute while the app is open.
create table if not exists public.presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'online' check (status in ('online','focusing','break')),
  focus_ends_at timestamptz,
  last_seen timestamptz not null default now()
);

-- One shared Pomodoro per study-room channel.
create table if not exists public.shared_timers (
  channel_id uuid primary key references public.channels(id) on delete cascade,
  phase text not null default 'focus' check (phase in ('focus','break')),
  running boolean not null default false,
  ends_at timestamptz,
  remaining_ms int not null default 1500000,
  focus_min int not null default 25 check (focus_min between 1 and 180),
  break_min int not null default 5 check (break_min between 1 and 60),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Who is in a study room's video call right now (for the 6-person soft cap).
create table if not exists public.room_participants (
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_seen timestamptz not null default now(),
  primary key (channel_id, user_id)
);

-- =====================================================================
-- Helper functions (SECURITY DEFINER = run with the table owner's rights,
-- so policies can call them without recursive RLS checks). All check auth.uid().
-- =====================================================================

create or replace function public.is_member(p_server uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from server_members where server_id = p_server and user_id = auth.uid())
$$;

create or replace function public.member_role(p_server uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from server_members where server_id = p_server and user_id = auth.uid()
$$;

create or replace function public.channel_server(p_channel uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select server_id from channels where id = p_channel
$$;

create or replace function public.is_friend(p_other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from friendships
    where (user_a = auth.uid() and user_b = p_other) or (user_b = auth.uid() and user_a = p_other)
  )
$$;

create or replace function public.shares_server(p_other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from server_members a join server_members b on a.server_id = b.server_id
    where a.user_id = auth.uid() and b.user_id = p_other
  )
$$;

create or replace function public.shared_module_ids() returns setof text
language sql stable security definer set search_path = public as $$
  select resource_id from shares where resource_type = 'module' and shared_with = auth.uid()
$$;

create or replace function public.shared_note_ids(p_edit boolean) returns setof text
language sql stable security definer set search_path = public as $$
  select resource_id from shares
  where resource_type = 'note' and shared_with = auth.uid() and (not p_edit or permission = 'edit')
$$;

-- =====================================================================
-- Row Level Security
-- =====================================================================

alter table public.user_directory enable row level security;
alter table public.friendships enable row level security;
alter table public.servers enable row level security;
alter table public.server_members enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;
alter table public.channel_states enable row level security;
alter table public.invites enable row level security;
alter table public.shares enable row level security;
alter table public.presence enable row level security;
alter table public.shared_timers enable row level security;
alter table public.room_participants enable row level security;

-- user_directory: you, your friends and people in your servers. Only display_name is editable.
drop policy if exists "directory read" on public.user_directory;
create policy "directory read" on public.user_directory for select to authenticated
  using (id = auth.uid() or public.is_friend(id) or public.shares_server(id));
drop policy if exists "directory edit own" on public.user_directory;
create policy "directory edit own" on public.user_directory for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.user_directory from anon, authenticated;
grant update (display_name) on public.user_directory to authenticated;

-- friendships: see and remove your own (created only via invites).
drop policy if exists "friends read" on public.friendships;
create policy "friends read" on public.friendships for select to authenticated using (auth.uid() in (user_a, user_b));
drop policy if exists "friends remove" on public.friendships;
create policy "friends remove" on public.friendships for delete to authenticated using (auth.uid() in (user_a, user_b));
revoke insert, update on public.friendships from anon, authenticated;

-- servers: members see them; owner/mods rename; owner deletes. Created via create_server().
drop policy if exists "servers read" on public.servers;
create policy "servers read" on public.servers for select to authenticated using (public.is_member(id));
drop policy if exists "servers rename" on public.servers;
create policy "servers rename" on public.servers for update to authenticated
  using (public.member_role(id) in ('owner','mod')) with check (public.member_role(id) in ('owner','mod'));
drop policy if exists "servers delete" on public.servers;
create policy "servers delete" on public.servers for delete to authenticated using (owner_id = auth.uid());
revoke insert on public.servers from anon, authenticated;
revoke update on public.servers from anon, authenticated;
grant update (name) on public.servers to authenticated;

-- server_members: members see the list; you can leave (not as owner); the owner can kick.
drop policy if exists "members read" on public.server_members;
create policy "members read" on public.server_members for select to authenticated using (public.is_member(server_id));
drop policy if exists "members leave or kick" on public.server_members;
create policy "members leave or kick" on public.server_members for delete to authenticated using (
  (user_id = auth.uid() and role <> 'owner')
  or (public.member_role(server_id) = 'owner' and user_id <> auth.uid())
);
revoke insert, update on public.server_members from anon, authenticated;

-- channels: members read; owner/mods manage.
drop policy if exists "channels read" on public.channels;
create policy "channels read" on public.channels for select to authenticated using (public.is_member(server_id));
drop policy if exists "channels manage" on public.channels;
create policy "channels manage" on public.channels for all to authenticated
  using (public.member_role(server_id) in ('owner','mod'))
  with check (public.member_role(server_id) in ('owner','mod'));

-- messages: members read and post as themselves. Deleting goes through delete_message().
drop policy if exists "messages read" on public.messages;
create policy "messages read" on public.messages for select to authenticated
  using (public.is_member(public.channel_server(channel_id)));
drop policy if exists "messages post" on public.messages;
create policy "messages post" on public.messages for insert to authenticated
  with check (author_id = auth.uid() and deleted_at is null and public.is_member(public.channel_server(channel_id)));
revoke update, delete on public.messages from anon, authenticated;

-- channel_states: only your own.
drop policy if exists "channel state own" on public.channel_states;
create policy "channel state own" on public.channel_states for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_member(public.channel_server(channel_id)));

-- invites: see the ones you made (or, for mods, your server's); revoke them. Created via create_invite().
drop policy if exists "invites read" on public.invites;
create policy "invites read" on public.invites for select to authenticated
  using (created_by = auth.uid() or (server_id is not null and public.member_role(server_id) in ('owner','mod')));
drop policy if exists "invites revoke" on public.invites;
create policy "invites revoke" on public.invites for update to authenticated
  using (created_by = auth.uid() or (server_id is not null and public.member_role(server_id) in ('owner','mod')));
revoke insert, delete on public.invites from anon, authenticated;
revoke update on public.invites from anon, authenticated;
grant update (revoked_at) on public.invites to authenticated;

-- shares: owner and recipient see them; only the owner of the module/note can share it, and only with a friend.
drop policy if exists "shares read" on public.shares;
create policy "shares read" on public.shares for select to authenticated using (owner_id = auth.uid() or shared_with = auth.uid());
drop policy if exists "shares create" on public.shares;
create policy "shares create" on public.shares for insert to authenticated with check (
  owner_id = auth.uid() and public.is_friend(shared_with) and (
    (resource_type = 'module' and permission = 'view'
      and exists (select 1 from public.modules m where m.id = resource_id and m.owner_id = auth.uid()::text))
    or (resource_type = 'note'
      and exists (select 1 from public.notes n where n.id = resource_id and n.owner_id = auth.uid()::text))
  )
);
drop policy if exists "shares remove" on public.shares;
create policy "shares remove" on public.shares for delete to authenticated using (owner_id = auth.uid() or shared_with = auth.uid());
revoke update on public.shares from anon, authenticated;

-- presence: friends can see each other; you write your own.
drop policy if exists "presence read" on public.presence;
create policy "presence read" on public.presence for select to authenticated using (user_id = auth.uid() or public.is_friend(user_id));
drop policy if exists "presence write" on public.presence;
create policy "presence write" on public.presence for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- shared_timers: any member of the channel's server can see and drive it.
drop policy if exists "timers members" on public.shared_timers;
create policy "timers members" on public.shared_timers for all to authenticated
  using (public.is_member(public.channel_server(channel_id)))
  with check (public.is_member(public.channel_server(channel_id)));

-- room_participants: members see who's in the call; joining goes through room_join() (enforces the cap).
drop policy if exists "rooms read" on public.room_participants;
create policy "rooms read" on public.room_participants for select to authenticated
  using (public.is_member(public.channel_server(channel_id)));
drop policy if exists "rooms leave" on public.room_participants;
create policy "rooms leave" on public.room_participants for delete to authenticated using (user_id = auth.uid());
revoke insert, update on public.room_participants from anon, authenticated;

-- Nothing social is visible to signed-out (anon) users.
revoke all on public.user_directory, public.friendships, public.servers, public.server_members, public.channels,
  public.messages, public.channel_states, public.invites, public.shares, public.presence, public.shared_timers,
  public.room_participants from anon;

-- =====================================================================
-- Sharing: let friends read shared modules (and their weeks/files/assessments/notes)
-- and read or edit shared notes. These add to the "own rows" policies on personal tables.
-- =====================================================================

drop policy if exists "shared read" on public.modules;
create policy "shared read" on public.modules for select to authenticated using (id in (select public.shared_module_ids()));
drop policy if exists "shared read" on public.weeks;
create policy "shared read" on public.weeks for select to authenticated using (module_id in (select public.shared_module_ids()));
drop policy if exists "shared read" on public.materials;
create policy "shared read" on public.materials for select to authenticated using (module_id in (select public.shared_module_ids()));
drop policy if exists "shared read" on public.assessments;
create policy "shared read" on public.assessments for select to authenticated using (module_id in (select public.shared_module_ids()));
drop policy if exists "shared read" on public.notes;
create policy "shared read" on public.notes for select to authenticated
  using (id in (select public.shared_note_ids(false)) or module_id in (select public.shared_module_ids()));
drop policy if exists "shared edit" on public.notes;
create policy "shared edit" on public.notes for update to authenticated
  using (id in (select public.shared_note_ids(true))) with check (id in (select public.shared_note_ids(true)));

-- =====================================================================
-- Sign-up: only with a valid invite code, username + password, no email.
-- The app signs up with <username>@users.studyhall.app and sends
-- {username, display_name, invite_code} as user metadata. These triggers
-- reject anything else, so signing up from outside the app doesn't work either.
-- =====================================================================

create or replace function public.before_user_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_code text := upper(coalesce(new.raw_user_meta_data->>'invite_code', ''));
  v_username text := lower(coalesce(new.raw_user_meta_data->>'username', ''));
  v_inv invites%rowtype;
begin
  if v_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Username must be 3-20 letters, numbers or _';
  end if;
  if exists (select 1 from user_directory where username = v_username) then
    raise exception 'That username is taken';
  end if;
  select * into v_inv from invites where code = v_code for update;
  if not found or v_inv.revoked_at is not null or v_inv.use_count >= v_inv.max_uses
     or (v_inv.expires_at is not null and v_inv.expires_at < now()) then
    raise exception 'Invite code is invalid or used up';
  end if;
  update invites set use_count = use_count + 1 where code = v_code;
  return new;
end $$;

create or replace function public.after_user_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_code text := upper(coalesce(new.raw_user_meta_data->>'invite_code', ''));
  v_inv invites%rowtype;
  v_name text := left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), new.raw_user_meta_data->>'username'), 40);
begin
  select * into v_inv from invites where code = v_code;
  insert into user_directory (id, username, display_name, is_admin)
  values (new.id, lower(new.raw_user_meta_data->>'username'), v_name, v_inv.created_by is null);
  -- An invite from a person makes you friends; a server invite adds you to the server.
  if v_inv.created_by is not null and v_inv.created_by <> new.id then
    insert into friendships (user_a, user_b)
    values (least(v_inv.created_by, new.id), greatest(v_inv.created_by, new.id)) on conflict do nothing;
  end if;
  if v_inv.kind = 'server' and v_inv.server_id is not null then
    insert into server_members (server_id, user_id, role) values (v_inv.server_id, new.id, 'member') on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists studyhall_before_signup on auth.users;
create trigger studyhall_before_signup before insert on auth.users for each row execute function public.before_user_signup();
drop trigger if exists studyhall_after_signup on auth.users;
create trigger studyhall_after_signup after insert on auth.users for each row execute function public.after_user_signup();

-- =====================================================================
-- RPC functions the app calls
-- =====================================================================

-- Keep-alive target for the GitHub Action (any API call counts as activity).
create or replace function public.ping() returns text language sql stable as $$ select 'ok' $$;

-- Sign-up. Supabase's sign-up endpoint rejects the placeholder email domain, so accounts are
-- created here instead (the triggers above still check the invite code and username), already
-- confirmed — no email is involved at all. The app then signs in with the normal password login.
create or replace function public.signup_with_invite(p_username text, p_password text, p_display_name text, p_code text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid := gen_random_uuid();
  v_user text := lower(trim(coalesce(p_username, '')));
  v_email text := lower(trim(coalesce(p_username, ''))) || '@users.studyhall.invalid';
begin
  if length(coalesce(p_password, '')) < 8 then raise exception 'Password must be at least 8 characters'; end if;
  if octet_length(p_password) > 72 then raise exception 'Password is too long (72 characters max)'; end if; -- bcrypt limit
  if exists (select 1 from auth.users where email = v_email) then raise exception 'That username is taken'; end if;
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf', 10)), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('username', v_user, 'display_name', left(trim(coalesce(p_display_name, '')), 40), 'invite_code', upper(trim(coalesce(p_code, '')))),
    now(), now(), '', '', '', '', '', '', '', '');
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', v_id::text, now(), now(), now());
  return v_id;
end $$;

-- There's no email, so no "forgot password": the admin (first account) can set a temporary
-- password for someone, which they can then change in Settings.
create or replace function public.admin_set_password(p_username text, p_password text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from user_directory where id = auth.uid() and is_admin) then
    raise exception 'Only the Studyhall admin can reset passwords';
  end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Password must be at least 8 characters'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf', 10)), updated_at = now()
  where email = lower(trim(p_username)) || '@users.studyhall.invalid';
  if not found then raise exception 'No such username'; end if;
end $$;

-- Before signing up: is this code usable, and what is it for? (Callable signed-out.)
create or replace function public.check_invite(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v invites%rowtype;
begin
  select * into v from invites where code = upper(trim(p_code));
  if not found or v.revoked_at is not null or v.use_count >= v.max_uses or (v.expires_at is not null and v.expires_at < now()) then
    return jsonb_build_object('valid', false);
  end if;
  return jsonb_build_object(
    'valid', true,
    'kind', v.kind,
    'inviter', (select display_name from user_directory where id = v.created_by),
    'server', (select name from servers where id = v.server_id)
  );
end $$;

create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = public as $$
  select lower(p_username) ~ '^[a-z0-9_]{3,20}$' and not exists (select 1 from user_directory where username = lower(p_username))
$$;

-- Create an invite code (friend invite, or server invite for owners/mods).
create or replace function public.create_invite(p_kind text, p_server uuid, p_max_uses int, p_expires_days int) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_code text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_kind = 'server' and coalesce(member_role(p_server), '') not in ('owner','mod') then
    raise exception 'Only server owners and mods can invite';
  end if;
  if p_kind not in ('friend','server') then raise exception 'Bad invite kind'; end if;
  v_code := upper(encode(gen_random_bytes(5), 'hex')); -- 10 characters, e.g. 3F9A0C7B21
  insert into invites (code, kind, created_by, server_id, max_uses, expires_at)
  values (v_code, p_kind, auth.uid(), case when p_kind = 'server' then p_server end,
          greatest(1, least(coalesce(p_max_uses, 1), 50)),
          now() + make_interval(days => greatest(1, least(coalesce(p_expires_days, 7), 30))));
  return v_code;
end $$;

-- Use an invite while signed in: befriend the creator, or join the server.
create or replace function public.redeem_invite(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v invites%rowtype;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into v from invites where code = upper(trim(p_code)) for update;
  if not found or v.revoked_at is not null or v.use_count >= v.max_uses or (v.expires_at is not null and v.expires_at < now()) then
    raise exception 'Invite code is invalid or used up';
  end if;
  if v.kind = 'friend' then
    if v.created_by = auth.uid() then raise exception 'That is your own invite'; end if;
    insert into friendships (user_a, user_b) values (least(v.created_by, auth.uid()), greatest(v.created_by, auth.uid()))
    on conflict do nothing;
  else
    insert into server_members (server_id, user_id, role) values (v.server_id, auth.uid(), 'member') on conflict do nothing;
  end if;
  update invites set use_count = use_count + 1 where code = v.code;
  return jsonb_build_object('kind', v.kind, 'server_id', v.server_id, 'friend_id', v.created_by);
end $$;

-- New server with you as owner and two starter channels.
create or replace function public.create_server(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into servers (name, owner_id) values (left(trim(p_name), 60), auth.uid()) returning id into v_id;
  insert into server_members (server_id, user_id, role) values (v_id, auth.uid(), 'owner');
  insert into channels (server_id, name, kind, sort) values (v_id, 'general', 'text', 0), (v_id, 'study-room', 'study_room', 1);
  return v_id;
end $$;

-- Owner promotes/demotes members (never changes the owner).
create or replace function public.set_member_role(p_server uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if member_role(p_server) <> 'owner' then raise exception 'Only the owner can change roles'; end if;
  if p_role not in ('mod','member') then raise exception 'Bad role'; end if;
  update server_members set role = p_role where server_id = p_server and user_id = p_user and role <> 'owner';
end $$;

-- Authors delete their own messages; owners and mods can delete any in their server.
create or replace function public.delete_message(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v messages%rowtype;
begin
  select * into v from messages where id = p_id;
  if not found then return; end if;
  if v.author_id <> auth.uid() and coalesce(member_role(channel_server(v.channel_id)), '') not in ('owner','mod') then
    raise exception 'Not allowed';
  end if;
  update messages set body = '', deleted_at = now() where id = p_id;
end $$;

-- Unread counts for every channel you can see.
create or replace function public.unread_counts() returns table (channel_id uuid, server_id uuid, unread int, muted boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.server_id,
    (select count(*)::int from messages m
      where m.channel_id = c.id and m.deleted_at is null and m.author_id is distinct from auth.uid()
        and m.created_at > coalesce(cs.last_read_at, sm.joined_at)),
    coalesce(cs.muted, false)
  from channels c
  join server_members sm on sm.server_id = c.server_id and sm.user_id = auth.uid()
  left join channel_states cs on cs.channel_id = c.id and cs.user_id = auth.uid()
$$;

-- Friends with their live status.
create or replace function public.friends_overview() returns table (
  user_id uuid, username text, display_name text, status text, focus_ends_at timestamptz, last_seen timestamptz
)
language sql stable security definer set search_path = public as $$
  select d.id, d.username, d.display_name,
    case when p.last_seen > now() - interval '3 minutes' then p.status else 'offline' end,
    p.focus_ends_at, p.last_seen
  from friendships f
  join user_directory d on d.id = case when f.user_a = auth.uid() then f.user_b else f.user_a end
  left join presence p on p.user_id = d.id
  where auth.uid() in (f.user_a, f.user_b)
  order by d.display_name
$$;

-- Opt-in leaderboard: focus minutes since p_since for you + friends who turned it on.
-- Only totals leave the database, never individual sessions.
create or replace function public.leaderboard(p_since text) returns table (user_id uuid, display_name text, minutes int, is_me boolean)
language sql stable security definer set search_path = public as $$
  with people as (
    select auth.uid() as id
    union
    select case when f.user_a = auth.uid() then f.user_b else f.user_a end
    from friendships f where auth.uid() in (f.user_a, f.user_b)
  )
  select pe.id, d.display_name,
    coalesce((select sum(fs.focused_seconds) / 60 from focus_sessions fs
              where fs.owner_id = pe.id::text and fs.deleted_at is null and fs.started_at >= p_since), 0)::int,
    pe.id = auth.uid()
  from people pe
  join user_directory d on d.id = pe.id
  join profiles pr on pr.id = pe.id::text
  where pr.leaderboard_opt_in = 1
  order by 3 desc
$$;

-- Join a study room's video call, enforcing the 6-person soft cap.
create or replace function public.room_join(p_channel uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_count int; v_key text;
begin
  if not is_member(channel_server(p_channel)) then raise exception 'Not a member'; end if;
  delete from room_participants where channel_id = p_channel and last_seen < now() - interval '90 seconds';
  select count(*) into v_count from room_participants where channel_id = p_channel and user_id <> auth.uid();
  if v_count >= 6 then
    return jsonb_build_object('ok', false, 'count', v_count);
  end if;
  insert into room_participants (channel_id, user_id) values (p_channel, auth.uid())
  on conflict (channel_id, user_id) do update set last_seen = now();
  select room_key into v_key from channels where id = p_channel;
  return jsonb_build_object('ok', true, 'count', v_count + 1, 'room_key', v_key);
end $$;

-- Total bytes stored by everyone (the free plan has 1 GB for the whole project).
create or replace function public.storage_used() returns bigint
language sql stable security definer set search_path = public, storage as $$
  select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects where bucket_id = 'materials'
$$;

-- Lock down: functions are callable by signed-in users only, except the three below.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.ping(), public.check_invite(text), public.username_available(text),
  public.signup_with_invite(text, text, text, text) to anon;

-- =====================================================================
-- Live updates (Realtime). Row Level Security still decides who receives what.
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['messages','presence','shared_timers','room_participants','server_members','channels','friendships','shares']
  loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- =====================================================================
-- File storage for course materials (opt-in per file). Private bucket, 50 MB per file.
-- Path: <owner id>/<material id>.<ext>
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('materials', 'materials', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "materials own files" on storage.objects;
create policy "materials own files" on storage.objects for all to authenticated
  using (bucket_id = 'materials' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'materials' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "materials shared read" on storage.objects;
create policy "materials shared read" on storage.objects for select to authenticated using (
  bucket_id = 'materials' and exists (
    select 1 from public.materials m
    where m.id = split_part(storage.filename(name), '.', 1)
      and m.module_id in (select public.shared_module_ids())
  )
);
