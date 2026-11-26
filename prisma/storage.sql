-- S3-compatible object storage metadata. Object bytes stay in a private bucket.
create table public.stored_files (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references profiles,
 listing_id uuid references produce_listings, purpose text not null check(purpose in ('document','crop_image')),
 object_key text not null unique, original_name text not null check(length(original_name)<=254),
 mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png')),
 size_bytes integer not null check(size_bytes between 1 and 5242880),
 state text not null default 'pending' check(state in ('pending','ready','rejected','deleting')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(purpose<>'crop_image' or (listing_id is not null and mime_type<>'application/pdf'))
);
create index stored_files_owner on stored_files(owner_id,state);
create index stored_files_listing on stored_files(listing_id,state);
alter table stored_files enable row level security;
create policy file_read on stored_files for select to farmsave_authenticated using(active_user() and (owner_id=current_actor() or has_role('admin') or (purpose='crop_image' and state='ready' and exists(select 1 from produce_listings l where l.id=listing_id))));
create policy file_create on stored_files for insert to farmsave_authenticated with check(active_user() and owner_id=current_actor() and (listing_id is null or can_listing(listing_id)));
create policy file_update on stored_files for update to farmsave_authenticated using(active_user() and owner_id=current_actor()) with check(owner_id=current_actor() and (listing_id is null or can_listing(listing_id)));
create policy file_delete on stored_files for delete to farmsave_authenticated using(active_user() and owner_id=current_actor());
grant select,insert,update,delete on stored_files to farmsave_authenticated;
create trigger touch_updated before update on stored_files for each row execute function touch_updated();
create trigger audit_write after insert or update or delete on stored_files for each row execute function audit_change();
revoke all on app_users,account_tokens from farmsave_authenticated,farmsave_anonymous;
revoke execute on function current_actor() from public;
grant execute on function current_actor() to farmsave_authenticated,farmsave_anonymous;
