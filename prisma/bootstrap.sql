-- Neon/PostgreSQL identity. Only the server can set an actor on its private connection.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='farmsave_authenticated') then create role farmsave_authenticated nologin nosuperuser nobypassrls; end if;
 if not exists(select 1 from pg_roles where rolname='farmsave_anonymous') then create role farmsave_anonymous nologin nosuperuser nobypassrls; end if;
 execute format('grant farmsave_authenticated, farmsave_anonymous to %I',current_user);
end $$;
create function public.current_actor() returns uuid language sql stable as $$ select nullif(current_setting('farmsave.user_id',true),'')::uuid $$;
create table public.app_users (
 id uuid primary key default gen_random_uuid(), email text unique, password_hash text,
 email_verified_at timestamptz, session_version integer not null default 0 check(session_version>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(email is null or email=lower(trim(email)))
);
create table public.account_tokens (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references app_users on delete cascade,
 token_hash text not null unique, kind text not null check(kind in ('verify','reset')),
 expires_at timestamptz not null, used_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index account_tokens_user on account_tokens(user_id,kind);
