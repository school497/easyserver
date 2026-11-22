-- EasyServer: one unified database for remote server control + the plugin store.
--
-- Identity model
--   * Every server agent signs in with Supabase anonymous auth. Its auth uid owns its `servers` row.
--   * Every client app signs in too (anonymous by default, can be upgraded to email + 2FA).
--   * A client gains access to a server ONLY by claiming the 6-letter pairing code the server shows.
--   * Clients never talk to servers directly: they insert rows in `commands`, the agent executes
--     them and writes the result back. Realtime pushes every change both ways.

create extension if not exists pgcrypto with schema extensions;

-- ───────────────────────────── Servers ─────────────────────────────
create table public.servers (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 64),
  hostname      text,
  platform      text,               -- darwin | linux | win32
  arch          text,               -- arm64 | x64
  agent_version text,
  public_key    jsonb,              -- agent's ECDH P-256 public JWK, used for end-to-end encrypted uploads
  settings      jsonb not null default '{}'::jsonb,
  started_at    timestamptz,        -- when the agent process last started (service run time)
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index servers_owner_idx on public.servers(owner_id);

create table public.server_members (
  server_id  uuid not null references public.servers(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'admin' check (role in ('admin')),
  created_at timestamptz not null default now(),
  primary key (server_id, user_id)
);
create index server_members_user_idx on public.server_members(user_id);

-- Is the caller the agent that owns this server?
create or replace function public.is_server_owner(sid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.servers s where s.id = sid and s.owner_id = (select auth.uid()));
$$;

-- If the caller turned on two-factor auth, their session must be aal2 to manage servers.
create or replace function public.mfa_satisfied()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = (select auth.uid()) and f.status = 'verified');
$$;

-- Is the caller a paired client of this server?
create or replace function public.is_server_member(sid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.mfa_satisfied()
     and exists (select 1 from public.server_members m where m.server_id = sid and m.user_id = (select auth.uid()));
$$;

create or replace function public.can_view_server(sid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_server_owner(sid) or public.is_server_member(sid);
$$;

alter table public.servers enable row level security;
create policy "servers: view own or paired" on public.servers for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_server_member(id));
create policy "servers: agent creates" on public.servers for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "servers: agent updates" on public.servers for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "servers: agent deletes" on public.servers for delete to authenticated
  using (owner_id = (select auth.uid()));

alter table public.server_members enable row level security;
create policy "members: view" on public.server_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_server_owner(server_id));
-- A client can remove a server from its list; the agent can revoke any client.
create policy "members: leave or revoke" on public.server_members for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_server_owner(server_id));
-- No insert policy: membership is only ever created by claim_pairing_code().

-- ───────────────────────────── Pairing ─────────────────────────────
create table public.pairing_codes (
  code       text primary key check (code ~ '^[A-Z]{6}$'),
  server_id  uuid not null references public.servers(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '15 minutes',
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
create index pairing_codes_server_idx on public.pairing_codes(server_id);
alter table public.pairing_codes enable row level security;
create policy "pairing: agent views own" on public.pairing_codes for select to authenticated
  using (public.is_server_owner(server_id));

create table public.pairing_attempts (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  succeeded  boolean not null,
  created_at timestamptz not null default now()
);
create index pairing_attempts_user_idx on public.pairing_attempts(user_id, created_at desc);
alter table public.pairing_attempts enable row level security; -- no policies: internal only

-- Agent asks for a fresh code. Letters only, no I or O so codes read clearly aloud.
create or replace function public.create_pairing_code(sid uuid)
returns table (code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  c text;
  b bytea;
  i int;
begin
  if not public.is_server_owner(sid) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.pairing_codes p where p.server_id = sid and p.claimed_at is null;
  loop
    b := extensions.gen_random_bytes(6);
    c := '';
    for i in 0..5 loop
      c := c || substr(alphabet, (get_byte(b, i) % 24) + 1, 1);
    end loop;
    begin
      insert into public.pairing_codes(code, server_id) values (c, sid);
      exit;
    exception when unique_violation then
      -- collision, try again
    end;
  end loop;
  return query select p.code, p.expires_at from public.pairing_codes p where p.code = c;
end $$;

-- Client enters the code. Rate limited to 10 failed attempts per hour per user.
create or replace function public.claim_pairing_code(input_code text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  sid uuid;
  fails int;
begin
  if uid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select count(*) into fails from public.pairing_attempts a
    where a.user_id = uid and not a.succeeded and a.created_at > now() - interval '1 hour';
  if fails >= 10 then
    raise exception 'Too many attempts. Try again in an hour.' using errcode = 'P0001';
  end if;

  update public.pairing_codes p
     set claimed_by = uid, claimed_at = now()
   where p.code = upper(trim(input_code)) and p.claimed_at is null and p.expires_at > now()
  returning p.server_id into sid;

  insert into public.pairing_attempts(user_id, succeeded) values (uid, sid is not null);
  if sid is null then
    raise exception 'That code is not valid or has expired.' using errcode = 'P0001';
  end if;

  insert into public.server_members(server_id, user_id) values (sid, uid)
    on conflict do nothing;
  return sid;
end $$;

-- ───────────────────────────── Live status ─────────────────────────────
create table public.server_status (
  server_id   uuid primary key references public.servers(id) on delete cascade,
  cpu         real,          -- 0..1
  mem_used    bigint,
  mem_total   bigint,
  disk_used   bigint,
  disk_total  bigint,
  load_avg    real,
  os_uptime   bigint,        -- seconds
  os_name     text,
  updated_at  timestamptz not null default now()
);
alter table public.server_status enable row level security;
create policy "status: view" on public.server_status for select to authenticated using (public.can_view_server(server_id));
create policy "status: agent insert" on public.server_status for insert to authenticated with check (public.is_server_owner(server_id));
create policy "status: agent update" on public.server_status for update to authenticated using (public.is_server_owner(server_id));

-- One row per minute the agent was alive. Up rate = minutes present / minutes in window.
create table public.server_heartbeats (
  server_id uuid not null references public.servers(id) on delete cascade,
  minute    timestamptz not null,
  primary key (server_id, minute)
);
alter table public.server_heartbeats enable row level security;
create policy "heartbeats: view" on public.server_heartbeats for select to authenticated using (public.can_view_server(server_id));
create policy "heartbeats: agent insert" on public.server_heartbeats for insert to authenticated with check (public.is_server_owner(server_id));
create policy "heartbeats: agent prune" on public.server_heartbeats for delete to authenticated using (public.is_server_owner(server_id));

create or replace function public.server_uptime(sid uuid)
returns table (window_hours int, ratio real)
language sql stable security invoker set search_path = '' as $$
  with first as (select min(minute) as m from public.server_heartbeats where server_id = sid)
  select w.h,
    case when (select m from first) is null then null else
      least(1.0, (select count(*) from public.server_heartbeats hb
                   where hb.server_id = sid and hb.minute > now() - make_interval(hours => w.h))::real
        / greatest(1, ceil(extract(epoch from (now() - greatest((select m from first), now() - make_interval(hours => w.h)))) / 60.0)))::real
    end
  from (values (24), (168), (720)) as w(h);
$$;

-- ───────────────────────────── Plugins on a server ─────────────────────────────
create table public.installed_plugins (
  server_id     uuid not null references public.servers(id) on delete cascade,
  plugin_id     text not null,
  name          text not null,
  version       text not null,
  source_url    text,
  manifest      jsonb not null,
  settings      jsonb not null default '{}'::jsonb,
  status        text not null default 'stopped' check (status in ('installing','stopped','starting','running','stopping','error')),
  status_detail text,
  links         jsonb not null default '[]'::jsonb,
  installed_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (server_id, plugin_id)
);
alter table public.installed_plugins enable row level security;
create policy "installed: view" on public.installed_plugins for select to authenticated using (public.can_view_server(server_id));
create policy "installed: agent insert" on public.installed_plugins for insert to authenticated with check (public.is_server_owner(server_id));
create policy "installed: agent update" on public.installed_plugins for update to authenticated using (public.is_server_owner(server_id));
create policy "installed: agent delete" on public.installed_plugins for delete to authenticated using (public.is_server_owner(server_id));

-- ───────────────────────────── Remote commands ─────────────────────────────
create table public.commands (
  id          uuid primary key default gen_random_uuid(),
  server_id   uuid not null references public.servers(id) on delete cascade,
  created_by  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type        text not null check (type ~ '^[a-z]+(\.[a-z]+)*$'),
  payload     jsonb not null default '{}'::jsonb,
  status      text not null default 'pending' check (status in ('pending','running','done','error')),
  result      jsonb,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index commands_server_pending_idx on public.commands(server_id, created_at) where status = 'pending';
create index commands_server_created_idx on public.commands(server_id, created_at desc);
alter table public.commands enable row level security;
create policy "commands: view" on public.commands for select to authenticated using (public.can_view_server(server_id));
create policy "commands: paired client sends" on public.commands for insert to authenticated
  with check (created_by = (select auth.uid()) and status = 'pending' and result is null and public.can_view_server(server_id));
create policy "commands: agent updates" on public.commands for update to authenticated
  using (public.is_server_owner(server_id)) with check (public.is_server_owner(server_id));
create policy "commands: agent prunes" on public.commands for delete to authenticated using (public.is_server_owner(server_id));

-- ───────────────────────────── Plugin store ─────────────────────────────
-- Hand-curated: add a row per plugin repo from the Supabase dashboard (Table editor).
-- github_url accepts https://github.com/owner/repo, .../tree/branch/sub/folder, or a raw manifest URL.
create table public.plugin_sources (
  id         bigint generated always as identity primary key,
  github_url text not null unique check (github_url ~ '^https://(github\.com|raw\.githubusercontent\.com)/'),
  enabled    boolean not null default true,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.plugin_sources enable row level security;
create policy "sources: anyone signed in can read enabled" on public.plugin_sources for select to authenticated using (enabled);
-- No write policies: only the dashboard / service role edits the store.

-- Install events feed the Trending row (the score itself is computed on the client).
create table public.plugin_events (
  id         bigint generated always as identity primary key,
  plugin_id  text not null,
  server_id  uuid references public.servers(id) on delete set null,
  kind       text not null check (kind in ('install','uninstall')),
  created_at timestamptz not null default now()
);
create index plugin_events_recent_idx on public.plugin_events(created_at desc);
alter table public.plugin_events enable row level security;
create policy "events: agent records" on public.plugin_events for insert to authenticated
  with check (server_id is not null and public.is_server_owner(server_id));

-- Anonymous, aggregated counts only (no server ids leak to other users).
create or replace function public.plugin_install_stats()
returns table (plugin_id text, day date, installs int, uninstalls int)
language sql stable security definer set search_path = '' as $$
  select e.plugin_id, (e.created_at at time zone 'utc')::date,
         count(*) filter (where e.kind = 'install')::int,
         count(*) filter (where e.kind = 'uninstall')::int
  from public.plugin_events e
  where e.created_at > now() - interval '30 days'
  group by 1, 2;
$$;

-- ───────────────────────────── Grants ─────────────────────────────
revoke all on function public.create_pairing_code(uuid) from public, anon;
revoke all on function public.claim_pairing_code(text) from public, anon;
revoke all on function public.plugin_install_stats() from public, anon;
revoke all on function public.server_uptime(uuid) from public, anon;
grant execute on function public.create_pairing_code(uuid) to authenticated;
grant execute on function public.claim_pairing_code(text) to authenticated;
grant execute on function public.plugin_install_stats() to authenticated;
grant execute on function public.server_uptime(uuid) to authenticated;
revoke all on function public.is_server_owner(uuid) from public, anon;
revoke all on function public.is_server_member(uuid) from public, anon;
revoke all on function public.can_view_server(uuid) from public, anon;
revoke all on function public.mfa_satisfied() from public, anon;
grant execute on function public.mfa_satisfied() to authenticated;
grant execute on function public.is_server_owner(uuid) to authenticated;
grant execute on function public.is_server_member(uuid) to authenticated;
grant execute on function public.can_view_server(uuid) to authenticated;

-- ───────────────────────────── Realtime ─────────────────────────────
alter publication supabase_realtime add table
  public.servers, public.server_members, public.server_status,
  public.installed_plugins, public.commands, public.plugin_sources;
alter table public.commands replica identity full;
alter table public.installed_plugins replica identity full;

-- ───────────────────────────── Encrypted file transfers ─────────────────────────────
-- Files are encrypted on the client with the server's public key (ECDH P-256 + AES-256-GCM)
-- before upload, so Supabase only ever stores ciphertext. The agent downloads, verifies the
-- SHA-256 of the plaintext, writes the file, then deletes the object.
create or replace function public.try_uuid(t text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin return t::uuid; exception when others then return null; end $$;

insert into storage.buckets (id, name, public, file_size_limit)
values ('transfers', 'transfers', false, 104857600)
on conflict (id) do nothing;

-- Uploads: <server_id>/<uuid> written by paired clients. Downloads: <server_id>/out/<uuid> written by the agent.
create policy "transfers: paired client uploads" on storage.objects for insert to authenticated
  with check (bucket_id = 'transfers' and public.is_server_member(public.try_uuid((storage.foldername(name))[1])));
create policy "transfers: agent stages downloads" on storage.objects for insert to authenticated
  with check (bucket_id = 'transfers' and (storage.foldername(name))[2] = 'out' and public.is_server_owner(public.try_uuid((storage.foldername(name))[1])));
create policy "transfers: paired client fetches downloads" on storage.objects for select to authenticated
  using (bucket_id = 'transfers' and (storage.foldername(name))[2] = 'out' and public.is_server_member(public.try_uuid((storage.foldername(name))[1])));
create policy "transfers: paired client clears downloads" on storage.objects for delete to authenticated
  using (bucket_id = 'transfers' and (storage.foldername(name))[2] = 'out' and public.is_server_member(public.try_uuid((storage.foldername(name))[1])));
create policy "transfers: agent or uploader reads" on storage.objects for select to authenticated
  using (bucket_id = 'transfers' and (public.is_server_owner(public.try_uuid((storage.foldername(name))[1])) or owner_id = (select auth.uid())::text));
create policy "transfers: agent or uploader deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'transfers' and (public.is_server_owner(public.try_uuid((storage.foldername(name))[1])) or owner_id = (select auth.uid())::text));
