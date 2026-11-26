-- FarmSave Africa PostgreSQL baseline migration. This is the canonical database schema.
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

-- Ported from 202611050001_schema.sql
-- FarmSave Africa v1. Quantities never cross units without a recorded crop conversion.
create type public.app_role as enum ('farmer','buyer','transporter','coordinator','admin');
create table public.countries (id uuid primary key default gen_random_uuid(), name text not null unique, code text not null unique);
create table public.regions (id uuid primary key default gen_random_uuid(), country_id uuid not null references countries, name text not null, unique(country_id,name));
create table public.districts (id uuid primary key default gen_random_uuid(), region_id uuid not null references regions, name text not null, unique(region_id,name));
create table public.profiles (
 id uuid primary key references public.app_users on delete cascade, full_name text not null check(length(full_name) between 2 and 120),
 phone text check(length(phone)<=30), status text not null default 'active' check(status in ('active','suspended','deactivated')),
 consent_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.user_roles (id uuid primary key default gen_random_uuid(), user_id uuid not null unique references profiles on delete cascade, role app_role not null, approved_by uuid references profiles, created_at timestamptz not null default now());
create table public.role_requests (id uuid primary key default gen_random_uuid(), user_id uuid not null unique references profiles, requested_role app_role not null check(requested_role <> 'admin'), status text not null default 'pending' check(status in ('pending','approved','rejected')), created_at timestamptz not null default now());
create table public.coordinator_areas (id uuid primary key default gen_random_uuid(), coordinator_id uuid not null references profiles, district_id uuid not null references districts, unique(coordinator_id,district_id));
create table public.farmer_groups (id uuid primary key default gen_random_uuid(), name text not null, district_id uuid not null references districts, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.farmer_profiles (
 id uuid primary key default gen_random_uuid(), user_id uuid unique references profiles, full_name text not null check(length(full_name) between 2 and 120),
 phone text check(length(phone)<=30), district_id uuid not null references districts, locality text not null check(length(locality) between 2 and 120),
 created_by uuid not null references profiles, consent_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.group_memberships (id uuid primary key default gen_random_uuid(), group_id uuid not null references farmer_groups, farmer_id uuid not null references farmer_profiles, unique(group_id,farmer_id));
create table public.farms (id uuid primary key default gen_random_uuid(), farmer_id uuid not null references farmer_profiles, name text not null check(length(name) between 2 and 120), district_id uuid not null references districts, locality text not null, size_acres numeric(14,4) not null check(size_acres>0), created_by uuid not null references profiles, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.crop_categories (id uuid primary key default gen_random_uuid(), name text not null unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.crops (id uuid primary key default gen_random_uuid(), category_id uuid not null references crop_categories, name text not null unique, local_name text, units text[] not null default array['kg'] check(cardinality(units)>0), active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.crop_unit_conversions (id uuid primary key default gen_random_uuid(), crop_id uuid not null references crops, from_unit text not null, to_unit text not null, factor numeric not null check(factor>0), reviewed_by uuid not null references profiles, unique(crop_id,from_unit,to_unit), check(from_unit<>to_unit));
create table public.crop_guidance (id uuid primary key default gen_random_uuid(), crop_id uuid not null references crops, title text not null, harvesting text not null, sorting text not null, storage text not null, packaging text not null, transport text not null, risks text not null, reviewed_by uuid references profiles, reviewer_qualification text, published boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(not published or (reviewed_by is not null and length(reviewer_qualification)>5)));
create table public.farm_crops (id uuid primary key default gen_random_uuid(), farm_id uuid not null references farms, crop_id uuid not null references crops, planted_on date not null, area_acres numeric check(area_acres>0), created_by uuid not null references profiles, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.harvests (
 id uuid primary key default gen_random_uuid(), farm_crop_id uuid not null references farm_crops, expected_date date not null, expected_quantity numeric(16,3) not null check(expected_quantity>0),
 unit text not null, total_quantity numeric(16,3) not null default 0, reserved_quantity numeric(16,3) not null default 0, sold_quantity numeric(16,3) not null default 0,
 lost_quantity numeric(16,3) not null default 0, retained_quantity numeric(16,3) not null default 0,
 available_quantity numeric(16,3) generated always as (total_quantity-reserved_quantity-sold_quantity-lost_quantity-retained_quantity) stored,
 quality text not null default 'ungraded', harvested_on date, verified_by uuid references profiles,
 created_by uuid not null references profiles, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(total_quantity>=0 and reserved_quantity>=0 and sold_quantity>=0 and lost_quantity>=0 and retained_quantity>=0),
 check(total_quantity>=reserved_quantity+sold_quantity+lost_quantity+retained_quantity), check(total_quantity=0 or harvested_on is not null)
);
create table public.harvest_adjustments (id uuid primary key default gen_random_uuid(), harvest_id uuid not null references harvests, kind text not null, quantity numeric not null, unit text not null, reason text not null, performed_by uuid not null references profiles, created_at timestamptz not null default now());
create table public.produce_listings (id uuid primary key default gen_random_uuid(), harvest_id uuid not null references harvests, farmer_id uuid not null references farmer_profiles, crop_id uuid not null references crops, district_id uuid not null references districts, quantity numeric(16,3) not null check(quantity>=0), unit text not null, price numeric(16,2) not null check(price>0), quality text not null, available_on date not null, status text not null default 'active' check(status in ('active','closed')), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index one_active_listing_per_harvest on produce_listings(harvest_id) where status='active';
create table public.buyer_offers (id uuid primary key default gen_random_uuid(), listing_id uuid not null references produce_listings, buyer_id uuid not null references profiles, quantity numeric(16,3) not null check(quantity>0), unit_price numeric(16,2) not null check(unit_price>0), message text check(length(message)<=1000), status text not null default 'pending' check(status in ('pending','accepted','rejected','withdrawn')), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.orders (id uuid primary key default gen_random_uuid(), offer_id uuid not null unique references buyer_offers, farmer_id uuid not null references farmer_profiles, buyer_id uuid not null references profiles, status text not null default 'accepted' check(status in ('accepted','preparing','ready_for_collection','completed','cancelled','disputed')), buyer_confirmed boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.order_items (id uuid primary key default gen_random_uuid(), order_id uuid not null references orders, harvest_id uuid not null references harvests, listing_id uuid not null references produce_listings, quantity numeric(16,3) not null check(quantity>0), unit text not null, unit_price numeric(16,2) not null check(unit_price>0), unique(order_id,harvest_id));
create table public.transport_profiles (id uuid primary key default gen_random_uuid(), user_id uuid not null unique references profiles, vehicle_description text not null, registration_number text not null, capacity numeric not null check(capacity>0), capacity_unit text not null, service_districts uuid[] not null check(cardinality(service_districts)>0), verified boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.transport_requests (id uuid primary key default gen_random_uuid(), farmer_id uuid not null references farmer_profiles, order_id uuid references orders, harvest_id uuid not null references harvests, pickup_district_id uuid not null references districts, destination_district_id uuid not null references districts, destination_area text not null, quantity numeric(16,3) not null check(quantity>0), unit text not null, collection_date date not null, status text not null default 'requested' check(status in ('requested','quoted','assigned','picked_up','delivered','cancelled','disputed')), created_by uuid not null references profiles, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.transport_quotes (id uuid primary key default gen_random_uuid(), request_id uuid not null references transport_requests, transporter_id uuid not null references profiles, amount numeric(16,2) not null check(amount>0), notes text, status text not null default 'pending' check(status in ('pending','accepted','rejected')), created_at timestamptz not null default now(), unique(request_id,transporter_id));
create table public.deliveries (id uuid primary key default gen_random_uuid(), request_id uuid not null unique references transport_requests, quote_id uuid not null unique references transport_quotes, transporter_id uuid not null references profiles, status text not null default 'assigned' check(status in ('assigned','picked_up','delivered','cancelled','disputed')), actual_charge numeric(16,2) check(actual_charge>=0), confirmed_by uuid references profiles, picked_up_at timestamptz, delivered_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.sales (id uuid primary key default gen_random_uuid(), farmer_id uuid not null references farmer_profiles, harvest_id uuid not null references harvests, order_id uuid unique references orders, buyer_category text not null, quantity numeric(16,3) not null check(quantity>0), unit text not null, unit_price numeric(16,2) not null check(unit_price>0), sale_date date not null, confirmed boolean not null default true, created_by uuid not null references profiles, created_at timestamptz not null default now());
create table public.expenses (id uuid primary key default gen_random_uuid(), farmer_id uuid not null references farmer_profiles, harvest_id uuid references harvests, category text not null check(category in ('packaging','storage','transportation','handling','other')), amount numeric(16,2) not null check(amount>0), description text not null, expense_date date not null, created_by uuid not null references profiles, created_at timestamptz not null default now());
create table public.loss_records (id uuid primary key default gen_random_uuid(), farmer_id uuid not null references farmer_profiles, harvest_id uuid not null references harvests, quantity numeric(16,3) not null check(quantity>0), unit text not null, loss_date date not null, stage text not null, cause text not null, source text not null check(source in ('farmer_reported','coordinator_observed')), verified_by uuid references profiles, created_by uuid not null references profiles, created_at timestamptz not null default now());
create table public.baseline_surveys (id uuid primary key default gen_random_uuid(), farmer_id uuid not null references farmer_profiles, crop_id uuid not null references crops, typical_quantity numeric not null check(typical_quantity>0), loss_quantity numeric not null check(loss_quantity>=0), unit text not null, handling text not null, storage text not null, transport text not null, buyer_access text not null, reported_sales numeric not null check(reported_sales>=0), reported_costs numeric not null check(reported_costs>=0), challenges text not null, training_needs text not null, survey_date date not null, period_days integer not null check(period_days>0), pilot_phase text not null default 'pilot', source text not null check(source in ('farmer_reported','estimated','verified')), verified_by uuid references profiles, created_by uuid not null references profiles, created_at timestamptz not null default now(), check(loss_quantity<=typical_quantity), check(source<>'verified' or verified_by is not null));
create table public.followup_surveys (like baseline_surveys including defaults including constraints including indexes);
alter table followup_surveys add constraint followup_farmer_fk foreign key(farmer_id) references farmer_profiles;
alter table followup_surveys add constraint followup_crop_fk foreign key(crop_id) references crops;
alter table followup_surveys add constraint followup_creator_fk foreign key(created_by) references profiles;
alter table followup_surveys add constraint followup_verifier_fk foreign key(verified_by) references profiles;
create table public.service_requests (id uuid primary key default gen_random_uuid(), farmer_id uuid not null references farmer_profiles, kind text not null check(kind in ('packaging','storage','guidance','training')), description text not null check(length(description) between 5 and 3000), status text not null default 'submitted' check(status in ('submitted','assigned','in_progress','resolved','cancelled')), assigned_to uuid references profiles, created_by uuid not null references profiles, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.training_sessions (id uuid primary key default gen_random_uuid(), title text not null, district_id uuid not null references districts, crop_id uuid references crops, venue text not null, scheduled_at timestamptz not null, capacity integer not null check(capacity>0), created_by uuid not null references profiles, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.training_attendance (id uuid primary key default gen_random_uuid(), session_id uuid not null references training_sessions, farmer_id uuid not null references farmer_profiles, attended boolean not null default false, recorded_by uuid not null references profiles, created_at timestamptz not null default now(), unique(session_id,farmer_id));
create table public.field_reports (id uuid primary key default gen_random_uuid(), farmer_id uuid not null references farmer_profiles, observation text not null, report_date date not null, created_by uuid not null references profiles, created_at timestamptz not null default now());
create table public.notifications (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles, title text not null, message text not null, href text not null default '/workspace', read_at timestamptz, event_key text unique, created_at timestamptz not null default now());
create table public.audit_logs (id uuid primary key default gen_random_uuid(), actor_id uuid references profiles, action text not null, entity text not null, entity_id uuid, details jsonb not null default '{}', created_at timestamptz not null default now());
create table public.platform_settings (id uuid primary key default gen_random_uuid(), key text not null unique, value jsonb not null, updated_at timestamptz not null default now());
create table public.contact_messages (id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 120), email text not null check(length(email)<=254), message text not null check(length(message) between 10 and 3000), created_at timestamptz not null default now());
create table public.rate_limits (id uuid primary key default gen_random_uuid(), bucket text not null unique, count integer not null default 0, window_start timestamptz not null default now());

create index farms_farmer on farms(farmer_id);
create index farmer_district on farmer_profiles(district_id);
create index crops_category on crops(category_id);
create index farm_crop_farm on farm_crops(farm_id);
create index harvest_crop on harvests(farm_crop_id);
create index harvest_due on harvests(expected_date);
create index listing_search on produce_listings(status,crop_id,district_id,available_on);
create index offers_buyer on buyer_offers(buyer_id,status);
create index offers_listing on buyer_offers(listing_id);
create index orders_buyer on orders(buyer_id,status);
create index orders_farmer on orders(farmer_id,status);
create index transport_farmer on transport_requests(farmer_id,status);
create index quotes_request on transport_quotes(request_id);
create index delivery_transporter on deliveries(transporter_id);
create index sales_farmer on sales(farmer_id,sale_date);
create index losses_farmer on loss_records(farmer_id,loss_date);
create index expenses_farmer on expenses(farmer_id,expense_date);
create index baseline_farmer on baseline_surveys(farmer_id,crop_id,survey_date);
create index followup_farmer on followup_surveys(farmer_id,crop_id,survey_date);
create index notices_user on notifications(user_id,created_at desc);
create index audit_created on audit_logs(created_at desc);

create function public.active_user() returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select exists(select 1 from profiles where id=public.current_actor() and status='active') $$;
create function public.has_role(r app_role) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select active_user() and exists(select 1 from user_roles where user_id=public.current_actor() and role=r) $$;
create function public.in_area(d uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select has_role('admin') or (has_role('coordinator') and exists(select 1 from coordinator_areas where coordinator_id=public.current_actor() and district_id=d)) $$;
create function public.can_farmer(f uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select active_user() and exists(select 1 from farmer_profiles where id=f and ((user_id=public.current_actor() and has_role('farmer')) or in_area(district_id))) $$;
create function public.can_farm(f uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select exists(select 1 from farms where id=f and can_farmer(farmer_id)) $$;
create function public.can_harvest(h uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select exists(select 1 from harvests h1 join farm_crops fc on fc.id=h1.farm_crop_id where h1.id=h and can_farm(fc.farm_id)) $$;
create function public.order_party(o uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select active_user() and exists(select 1 from orders where id=o and (buyer_id=public.current_actor() or can_farmer(farmer_id))) $$;
create function public.request_party(r uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select active_user() and exists(select 1 from transport_requests tr where tr.id=r and (can_farmer(tr.farmer_id) or order_party(tr.order_id) or exists(select 1 from deliveries d where d.request_id=r and d.transporter_id=public.current_actor()))) $$;
create function public.eligible_transport(r uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select has_role('transporter') and exists(select 1 from transport_profiles tp join transport_requests tr on tr.pickup_district_id=any(tp.service_districts) where tr.id=r and tp.user_id=public.current_actor() and tp.verified and tr.status in ('requested','quoted')) $$;
create function public.can_listing(l uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select active_user() and exists(select 1 from produce_listings where id=l and can_farmer(farmer_id)) $$;
create function public.offered_listing(l uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select active_user() and exists(select 1 from buyer_offers where listing_id=l and buyer_id=public.current_actor()) $$;

-- Auth.js account/profile creation is an explicit Prisma transaction, not an auth-schema trigger.

create function public.touch_updated() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create function public.audit_change() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin insert into audit_logs(actor_id,action,entity,entity_id,details) values(public.current_actor(),TG_OP,TG_TABLE_NAME,coalesce(new.id,old.id),jsonb_strip_nulls(jsonb_build_object('changed_at',now(),'previous_status',to_jsonb(old)->'status','new_status',to_jsonb(new)->'status','previous_role',to_jsonb(old)->'role','new_role',to_jsonb(new)->'role'))); return coalesce(new,old); end $$;
do $$ declare t text; begin
 for t in select table_name from information_schema.columns where table_schema='public' and table_name<>'_prisma_migrations' and column_name='updated_at' loop execute format('create trigger touch_updated before update on %I for each row execute function touch_updated()',t); end loop;
 for t in select unnest(array['profiles','user_roles','farmer_profiles','farms','farm_crops','harvests','produce_listings','buyer_offers','orders','transport_profiles','transport_requests','deliveries','sales','loss_records','expenses','baseline_surveys','followup_surveys','crop_guidance','platform_settings','coordinator_areas']) loop execute format('create trigger audit_write after insert or update or delete on %I for each row execute function audit_change()',t); end loop;
 for t in select tablename from pg_tables where schemaname='public' and tablename<>'_prisma_migrations' loop execute format('alter table %I enable row level security',t); end loop;
end $$;

-- Explicit read policies. Writes to inventory, roles and workflows only through validated RPCs.
create policy profiles_read on profiles for select to farmsave_authenticated using(active_user() and (id=public.current_actor() or has_role('admin')));
create policy roles_read on user_roles for select to farmsave_authenticated using(active_user() and (user_id=public.current_actor() or has_role('admin')));
create policy requests_read on role_requests for select to farmsave_authenticated using(active_user() and (user_id=public.current_actor() or has_role('admin')));
create policy areas_read on coordinator_areas for select to farmsave_authenticated using(active_user() and (coordinator_id=public.current_actor() or has_role('admin')));
create policy farmer_read on farmer_profiles for select to farmsave_authenticated using(can_farmer(id));
create policy farm_read on farms for select to farmsave_authenticated using(can_farmer(farmer_id));
create policy farm_crop_read on farm_crops for select to farmsave_authenticated using(can_farm(farm_id));
create policy harvest_read on harvests for select to farmsave_authenticated using(can_harvest(id));
create policy adjustment_read on harvest_adjustments for select to farmsave_authenticated using(can_harvest(harvest_id));
create policy groups_read on farmer_groups for select to farmsave_authenticated using(in_area(district_id) or exists(select 1 from group_memberships gm where gm.group_id=farmer_groups.id and can_farmer(gm.farmer_id)));
create policy memberships_read on group_memberships for select to farmsave_authenticated using(can_farmer(farmer_id));
create policy guidance_read on crop_guidance for select to farmsave_authenticated using(active_user() and (published or has_role('admin')));
create policy conversions_read on crop_unit_conversions for select to farmsave_authenticated using(active_user());
create policy listings_read on produce_listings for select to farmsave_authenticated using(active_user() and (status='active' or can_farmer(farmer_id) or offered_listing(id)));
create policy offers_read on buyer_offers for select to farmsave_authenticated using(active_user() and (buyer_id=public.current_actor() or can_listing(listing_id)));
create policy orders_read on orders for select to farmsave_authenticated using(order_party(id));
create policy items_read on order_items for select to farmsave_authenticated using(order_party(order_id));
create policy transport_profile_read on transport_profiles for select to farmsave_authenticated using(active_user() and (user_id=public.current_actor() or has_role('admin')));
create policy transport_read on transport_requests for select to farmsave_authenticated using(request_party(id) or eligible_transport(id));
create policy quotes_read on transport_quotes for select to farmsave_authenticated using(active_user() and (transporter_id=public.current_actor() or request_party(request_id)));
create policy delivery_read on deliveries for select to farmsave_authenticated using(active_user() and (transporter_id=public.current_actor() or request_party(request_id)));
create policy sales_read on sales for select to farmsave_authenticated using(can_farmer(farmer_id) or order_party(order_id));
create policy expenses_read on expenses for select to farmsave_authenticated using(can_farmer(farmer_id));
create policy losses_read on loss_records for select to farmsave_authenticated using(can_farmer(farmer_id));
create policy baseline_read on baseline_surveys for select to farmsave_authenticated using(can_farmer(farmer_id));
create policy followup_read on followup_surveys for select to farmsave_authenticated using(can_farmer(farmer_id));
create policy service_read on service_requests for select to farmsave_authenticated using(can_farmer(farmer_id));
create policy training_read on training_sessions for select to farmsave_authenticated using(active_user() and (in_area(district_id) or exists(select 1 from farmer_profiles f where f.user_id=public.current_actor() and f.district_id=training_sessions.district_id)));
create policy attendance_read on training_attendance for select to farmsave_authenticated using(can_farmer(farmer_id));
create policy reports_read on field_reports for select to farmsave_authenticated using(can_farmer(farmer_id) and (has_role('coordinator') or has_role('admin')));
create policy notifications_read on notifications for select to farmsave_authenticated using(active_user() and user_id=public.current_actor());
create policy audits_read on audit_logs for select to farmsave_authenticated using(has_role('admin'));
create policy settings_read on platform_settings for select to farmsave_authenticated using(has_role('admin'));
create policy contact_read on contact_messages for select to farmsave_authenticated using(has_role('admin'));
do $$ declare t text; begin
 for t in select unnest(array['countries','regions','districts','crop_categories','crops']) loop execute format('create policy catalogue_read on %I for select to farmsave_anonymous,farmsave_authenticated using(true)',t); end loop;
end $$;

-- Column-level grants prevent mass assignment, even if policies are later broadened.
revoke all on all tables in schema public from farmsave_anonymous,farmsave_authenticated;
grant usage on schema public to farmsave_anonymous,farmsave_authenticated;
grant select on countries,regions,districts,crop_categories,crops to farmsave_anonymous,farmsave_authenticated;
grant select on all tables in schema public to farmsave_authenticated;
revoke select on rate_limits from farmsave_authenticated;


-- Ported from 202611050002_workflows.sql
create function public.assert_active() returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin if not active_user() then raise exception 'An active account is required' using errcode='42501'; end if; end $$;
create function public.require_farmer(f uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin if not can_farmer(f) then raise exception 'Farmer access denied' using errcode='42501'; end if; end $$;
create function public.notify_user(u uuid,t text,m text,h text default '/workspace',k text default null) returns void language sql security definer set search_path=public,pg_temp as $$ insert into notifications(user_id,title,message,href,event_key) select u,t,m,h,k where u is not null on conflict(event_key) do nothing $$;
create function public.check_rate(bucket_name text,max_count integer,seconds integer) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer; begin
 insert into rate_limits(bucket,count) values(bucket_name,1) on conflict(bucket) do update set count=case when rate_limits.window_start<now()-make_interval(secs=>seconds) then 1 else rate_limits.count+1 end,window_start=case when rate_limits.window_start<now()-make_interval(secs=>seconds) then now() else rate_limits.window_start end returning count into n;
 if n>max_count then raise exception 'Too many requests. Please try again later.'; end if;
end $$;
create function public.enroll_account(requested text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform assert_active();
 if requested not in ('farmer','buyer','transporter','coordinator') then raise exception 'Invalid account type'; end if;
 if exists(select 1 from user_roles where user_id=public.current_actor()) then raise exception 'Account already enrolled'; end if;
 insert into role_requests(user_id,requested_role,status) values(public.current_actor(),requested::app_role,case when requested='coordinator' then 'pending' else 'approved' end) on conflict(user_id) do nothing;
 if requested<>'coordinator' then insert into user_roles(user_id,role) values(public.current_actor(),requested::app_role) on conflict(user_id) do nothing; end if;
end $$;
create function public.update_profile(p_name text,p_phone text) returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin perform assert_active(); update profiles set full_name=p_name,phone=nullif(p_phone,'') where id=public.current_actor(); end $$;

-- All writes share one explicit, allowlisted command boundary. No dynamic SQL or arbitrary table access.
create function public.save_record(kind text,p jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid; f uuid; h harvests; fc farm_crops; d uuid; x uuid; u text; n numeric; q numeric;
begin
 perform assert_active(); perform check_rate('write:'||public.current_actor(),120,60);
 if octet_length(p::text)>65536 then raise exception 'Record payload is too large'; end if;
 if kind in ('farmer_profiles','farms') and nullif(p->>'country_id','') is not null and not exists(select 1 from districts dd join regions rr on rr.id=dd.region_id where dd.id=(p->>'district_id')::uuid and rr.country_id=(p->>'country_id')::uuid) then raise exception 'District does not belong to the selected country'; end if;
 if kind='farmer_profiles' then
  d=(p->>'district_id')::uuid;
  if not has_role('farmer') and not in_area(d) then raise exception 'Enrollment access denied'; end if;
  insert into farmer_profiles(user_id,full_name,phone,district_id,locality,created_by,consent_at) values(case when has_role('farmer') then public.current_actor() else null end,p->>'full_name',nullif(p->>'phone',''),d,p->>'locality',public.current_actor(),case when (p->>'consent')::boolean then now() else null end) returning id into result;
 elsif kind='farms' then
  f=(p->>'farmer_id')::uuid; perform require_farmer(f);
  if not exists(select 1 from farmer_profiles where id=f and district_id=(p->>'district_id')::uuid) then raise exception 'Farm district must match the authorized farmer area'; end if;
  if nullif(p->>'id','') is null then
   insert into farms(farmer_id,name,district_id,locality,size_acres,created_by) values(f,p->>'name',(p->>'district_id')::uuid,p->>'locality',(p->>'size_acres')::numeric,public.current_actor()) returning id into result;
  else update farms set name=p->>'name',locality=p->>'locality',size_acres=(p->>'size_acres')::numeric where id=(p->>'id')::uuid and farmer_id=f returning id into result; end if;
 elsif kind='farm_crops' then
  x=(p->>'farm_id')::uuid; if not can_farm(x) then raise exception 'Farm access denied'; end if;
  insert into farm_crops(farm_id,crop_id,planted_on,area_acres,created_by) values(x,(p->>'crop_id')::uuid,(p->>'planted_on')::date,nullif(p->>'area_acres','')::numeric,public.current_actor()) returning id into result;
 elsif kind='harvests' then
  select * into strict fc from farm_crops where id=(p->>'farm_crop_id')::uuid;
  if not can_farm(fc.farm_id) then raise exception 'Harvest access denied'; end if;
  u=p->>'unit'; if not exists(select 1 from crops where id=fc.crop_id and u=any(units)) then raise exception 'Unit is not configured for this crop'; end if;
  if nullif(p->>'id','') is null then
   insert into harvests(farm_crop_id,expected_date,expected_quantity,unit,created_by) values(fc.id,(p->>'expected_date')::date,(p->>'expected_quantity')::numeric,u,public.current_actor()) returning id into result;
  else
   select * into strict h from harvests where id=(p->>'id')::uuid for update;
   if not can_harvest(h.id) or h.farm_crop_id<>fc.id or h.total_quantity>0 then raise exception 'Only your unharvested plans can be edited; keep the original planting'; end if;
   update harvests set expected_date=(p->>'expected_date')::date,expected_quantity=(p->>'expected_quantity')::numeric,unit=u,verified_by=null where id=h.id returning id into result;
   insert into harvest_adjustments(harvest_id,kind,quantity,unit,reason,performed_by) values(h.id,'plan_update',0,u,'Expected harvest plan updated',public.current_actor());
  end if;
 elsif kind in ('actual_harvest','loss_records','sales','retained') then
  select * into strict h from harvests where id=(p->>'harvest_id')::uuid for update;
  if not can_harvest(h.id) then raise exception 'Harvest access denied'; end if;
  select fa.farmer_id into f from farm_crops c join farms fa on fa.id=c.farm_id where c.id=h.farm_crop_id;
  n=(p->>'quantity')::numeric; if n<=0 then raise exception 'Quantity must be greater than zero'; end if;
  if kind='actual_harvest' then
   if n<h.total_quantity or n<h.reserved_quantity+h.sold_quantity+h.lost_quantity+h.retained_quantity then raise exception 'Harvest quantity cannot decrease; record a loss or retention instead'; end if;
   update harvests set total_quantity=n,harvested_on=(p->>'harvested_on')::date,quality=p->>'quality',verified_by=null where id=h.id;
   insert into harvest_adjustments(harvest_id,kind,quantity,unit,reason,performed_by) values(h.id,'harvest',n-h.total_quantity,h.unit,p->>'reason',public.current_actor()) returning id into result;
  else
   if n>h.available_quantity then raise exception 'Quantity exceeds the unreserved harvest balance'; end if;
   if kind='loss_records' then
    update harvests set lost_quantity=lost_quantity+n where id=h.id;
    insert into loss_records(farmer_id,harvest_id,quantity,unit,loss_date,stage,cause,source,created_by) values(f,h.id,n,h.unit,(p->>'loss_date')::date,p->>'stage',p->>'cause',case when has_role('farmer') then 'farmer_reported' else 'coordinator_observed' end,public.current_actor()) returning id into result;
   elsif kind='sales' then
    update harvests set sold_quantity=sold_quantity+n where id=h.id;
    insert into sales(farmer_id,harvest_id,buyer_category,quantity,unit,unit_price,sale_date,created_by) values(f,h.id,p->>'buyer_category',n,h.unit,(p->>'unit_price')::numeric,(p->>'sale_date')::date,public.current_actor()) returning id into result;
   else update harvests set retained_quantity=retained_quantity+n where id=h.id; result=h.id;
   end if;
   insert into harvest_adjustments(harvest_id,kind,quantity,unit,reason,performed_by) values(h.id,kind,-n,h.unit,coalesce(p->>'reason',kind),public.current_actor());
   update produce_listings set quantity=least(quantity,h.available_quantity-n) where harvest_id=h.id and status='active';
  end if;
 elsif kind='produce_listings' then
  select * into strict h from harvests where id=(p->>'harvest_id')::uuid for update;
  if not can_harvest(h.id) then raise exception 'Harvest access denied'; end if;
  n=(p->>'quantity')::numeric;
  if n<=0 or n>h.available_quantity then raise exception 'Listing exceeds available harvest quantity'; end if;
  select c.crop_id,fa.farmer_id,fa.district_id into x,f,d from farm_crops c join farms fa on fa.id=c.farm_id where c.id=h.farm_crop_id;
  insert into produce_listings(harvest_id,farmer_id,crop_id,district_id,quantity,unit,price,quality,available_on) values(h.id,f,x,d,n,h.unit,(p->>'price')::numeric,h.quality,(p->>'available_on')::date)
  on conflict(harvest_id) where status='active' do update set quantity=excluded.quantity,price=excluded.price,quality=excluded.quality,available_on=excluded.available_on returning id into result;
 elsif kind='expenses' then
  f=(p->>'farmer_id')::uuid; perform require_farmer(f); x=nullif(p->>'harvest_id','')::uuid;
  if x is not null and not exists(select 1 from harvests hh join farm_crops cc on cc.id=hh.farm_crop_id join farms ff on ff.id=cc.farm_id where hh.id=x and ff.farmer_id=f) then raise exception 'Expense harvest does not belong to farmer'; end if;
  insert into expenses(farmer_id,harvest_id,category,amount,description,expense_date,created_by) values(f,x,p->>'category',(p->>'amount')::numeric,p->>'description',(p->>'expense_date')::date,public.current_actor()) returning id into result;
 elsif kind='service_requests' then
  f=(p->>'farmer_id')::uuid; perform require_farmer(f);
  insert into service_requests(farmer_id,kind,description,created_by) values(f,p->>'kind',p->>'description',public.current_actor()) returning id into result;
 elsif kind='transport_profiles' then
  if not has_role('transporter') then raise exception 'Transporter account required'; end if;
  if exists(select 1 from jsonb_array_elements_text(p->'service_districts') v where not exists(select 1 from districts where id=v.value::uuid)) then raise exception 'Unknown service district'; end if;
  insert into transport_profiles(user_id,vehicle_description,registration_number,capacity,capacity_unit,service_districts) values(public.current_actor(),p->>'vehicle_description',p->>'registration_number',(p->>'capacity')::numeric,p->>'capacity_unit',array(select jsonb_array_elements_text(p->'service_districts')::uuid))
  on conflict(user_id) do update set vehicle_description=excluded.vehicle_description,registration_number=excluded.registration_number,capacity=excluded.capacity,capacity_unit=excluded.capacity_unit,service_districts=excluded.service_districts,verified=false returning id into result;
 elsif kind='transport_requests' then
  f=(p->>'farmer_id')::uuid; perform require_farmer(f);
  select hh.* into strict h from harvests hh join farm_crops cc on cc.id=hh.farm_crop_id join farms ff on ff.id=cc.farm_id where hh.id=(p->>'harvest_id')::uuid and ff.farmer_id=f;
  x=nullif(p->>'order_id','')::uuid; n=(p->>'quantity')::numeric;
  if x is not null then
   if not exists(select 1 from order_items oi join orders o on o.id=oi.order_id where o.id=x and o.farmer_id=f and oi.harvest_id=h.id and n<=oi.quantity and o.status in ('accepted','preparing','ready_for_collection')) then raise exception 'Invalid order or quantity for transport'; end if;
  elsif n>h.available_quantity then raise exception 'Transport quantity exceeds available harvest'; end if;
  select ff.district_id into d from farm_crops cc join farms ff on ff.id=cc.farm_id where cc.id=h.farm_crop_id;
  insert into transport_requests(farmer_id,order_id,harvest_id,pickup_district_id,destination_district_id,destination_area,quantity,unit,collection_date,created_by) values(f,x,h.id,d,(p->>'destination_district_id')::uuid,p->>'destination_area',n,h.unit,(p->>'collection_date')::date,public.current_actor()) returning id into result;
 elsif kind in ('baseline_surveys','followup_surveys') then
  f=(p->>'farmer_id')::uuid; perform require_farmer(f);
  if not has_role('coordinator') and not has_role('admin') then raise exception 'Coordinator access required'; end if;
  if not exists(select 1 from crops where id=(p->>'crop_id')::uuid and (p->>'unit')=any(units)) then raise exception 'Invalid crop unit'; end if;
  insert into baseline_surveys(farmer_id,crop_id,typical_quantity,loss_quantity,unit,handling,storage,transport,buyer_access,reported_sales,reported_costs,challenges,training_needs,survey_date,period_days,pilot_phase,source,verified_by,created_by)
  values(f,(p->>'crop_id')::uuid,(p->>'typical_quantity')::numeric,(p->>'loss_quantity')::numeric,p->>'unit',p->>'handling',p->>'storage',p->>'transport',p->>'buyer_access',(p->>'reported_sales')::numeric,(p->>'reported_costs')::numeric,p->>'challenges',p->>'training_needs',(p->>'survey_date')::date,(p->>'period_days')::integer,p->>'pilot_phase',p->>'source',case when p->>'source'='verified' then public.current_actor() else null end,public.current_actor()) returning id into result;
  if kind='followup_surveys' then insert into followup_surveys select * from baseline_surveys where id=result; delete from baseline_surveys where id=result; end if;
 elsif kind='training_sessions' then
  d=(p->>'district_id')::uuid; if not in_area(d) then raise exception 'Training area access denied'; end if;
  insert into training_sessions(title,district_id,crop_id,venue,scheduled_at,capacity,created_by) values(p->>'title',d,nullif(p->>'crop_id','')::uuid,p->>'venue',(p->>'scheduled_at')::timestamptz,(p->>'capacity')::integer,public.current_actor()) returning id into result;
  perform notify_user(fp.user_id,'Training scheduled',p->>'title','/workspace/training') from farmer_profiles fp where fp.district_id=d;
 elsif kind='training_attendance' then
  f=(p->>'farmer_id')::uuid; perform require_farmer(f); x=(p->>'session_id')::uuid;
  select district_id into strict d from training_sessions where id=x for update;
  if not in_area(d) or not exists(select 1 from farmer_profiles where id=f and district_id=d) then raise exception 'Attendance access denied'; end if;
  if (select count(*) from training_attendance where session_id=x)>=(select capacity from training_sessions where id=x) and not exists(select 1 from training_attendance where session_id=x and farmer_id=f) then raise exception 'Session capacity reached'; end if;
  insert into training_attendance(session_id,farmer_id,attended,recorded_by) values(x,f,(p->>'attended')::boolean,public.current_actor()) on conflict(session_id,farmer_id) do update set attended=excluded.attended,recorded_by=public.current_actor() returning id into result;
 elsif kind='field_reports' then
  f=(p->>'farmer_id')::uuid; perform require_farmer(f); if not has_role('coordinator') and not has_role('admin') then raise exception 'Coordinator required'; end if;
  insert into field_reports(farmer_id,observation,report_date,created_by) values(f,p->>'observation',(p->>'report_date')::date,public.current_actor()) returning id into result;
 else
  if not has_role('admin') then raise exception 'Administrator access required'; end if;
  if kind='crops' then
   if nullif(p->>'id','') is not null then update crops set name=p->>'name',local_name=p->>'local_name',category_id=(p->>'category_id')::uuid,units=array(select jsonb_array_elements_text(p->'units')),active=(p->>'active')::boolean where id=(p->>'id')::uuid returning id into result;
   else insert into crops(category_id,name,local_name,units,active) values((p->>'category_id')::uuid,p->>'name',p->>'local_name',array(select jsonb_array_elements_text(p->'units')),coalesce((p->>'active')::boolean,true)) returning id into result; end if;
  elsif kind='crop_categories' then insert into crop_categories(name) values(p->>'name') returning id into result;
  elsif kind='crop_guidance' then
   if nullif(p->>'id','') is not null then
    update crop_guidance set crop_id=(p->>'crop_id')::uuid,title=p->>'title',harvesting=p->>'harvesting',sorting=p->>'sorting',storage=p->>'storage',packaging=p->>'packaging',transport=p->>'transport',risks=p->>'risks',published=(p->>'published')::boolean,reviewer_qualification=p->>'reviewer_qualification',reviewed_by=case when (p->>'published')::boolean then public.current_actor() else null end where id=(p->>'id')::uuid returning id into result;
   else insert into crop_guidance(crop_id,title,harvesting,sorting,storage,packaging,transport,risks,published,reviewed_by,reviewer_qualification) values((p->>'crop_id')::uuid,p->>'title',p->>'harvesting',p->>'sorting',p->>'storage',p->>'packaging',p->>'transport',p->>'risks',(p->>'published')::boolean,case when (p->>'published')::boolean then public.current_actor() else null end,p->>'reviewer_qualification') returning id into result; end if;
  elsif kind='countries' then insert into countries(name,code) values(p->>'name',upper(p->>'code')) returning id into result;
  elsif kind='regions' then insert into regions(name,country_id) values(p->>'name',(p->>'country_id')::uuid) returning id into result;
  elsif kind='districts' then insert into districts(name,region_id) values(p->>'name',(p->>'region_id')::uuid) returning id into result;
  elsif kind='coordinator_areas' then
   if not exists(select 1 from user_roles where user_id=(p->>'coordinator_id')::uuid and role='coordinator') then raise exception 'User must be a coordinator'; end if;
   insert into coordinator_areas(coordinator_id,district_id) values((p->>'coordinator_id')::uuid,(p->>'district_id')::uuid) returning id into result;
  elsif kind='farmer_groups' then insert into farmer_groups(name,district_id) values(p->>'name',(p->>'district_id')::uuid) returning id into result;
  elsif kind='group_memberships' then
   if not exists(select 1 from farmer_groups g join farmer_profiles fp on fp.district_id=g.district_id where g.id=(p->>'group_id')::uuid and fp.id=(p->>'farmer_id')::uuid) then raise exception 'Farmer and group districts must match'; end if;
   insert into group_memberships(group_id,farmer_id) values((p->>'group_id')::uuid,(p->>'farmer_id')::uuid) returning id into result;
  elsif kind='platform_settings' then insert into platform_settings(key,value) values(p->>'key',jsonb_build_object('value',p->>'value')) on conflict(key) do update set value=excluded.value returning id into result;
  elsif kind='crop_unit_conversions' then insert into crop_unit_conversions(crop_id,from_unit,to_unit,factor,reviewed_by) values((p->>'crop_id')::uuid,p->>'from_unit',p->>'to_unit',(p->>'factor')::numeric,public.current_actor()) returning id into result;
  else raise exception 'Unsupported record type'; end if;
 end if;
 if result is null then raise exception 'Record was not found or could not be saved'; end if;
 return result;
end $$;

create function public.submit_offer(listing uuid,qty numeric,price numeric,note text default '') returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare l produce_listings; result uuid; owner_id uuid;
begin
 if not has_role('buyer') then raise exception 'Buyer account required'; end if;
 perform check_rate('offer:'||public.current_actor(),30,60);
 select * into strict l from produce_listings where id=listing;
 if l.status<>'active' or qty<=0 or qty>l.quantity or price<=0 then raise exception 'Offer quantity or price is invalid'; end if;
 select user_id into owner_id from farmer_profiles where id=l.farmer_id;
 if owner_id=public.current_actor() then raise exception 'You cannot buy your own produce'; end if;
 insert into buyer_offers(listing_id,buyer_id,quantity,unit_price,message) values(l.id,public.current_actor(),qty,price,note) returning id into result;
 perform notify_user(owner_id,'New buyer offer','Review the quantity and proposed price.','/workspace/offers'); return result;
end $$;

create function public.decide_offer(offer uuid,accept boolean) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare b buyer_offers; l produce_listings; h harvests; result uuid;
begin
 perform assert_active();
 select * into strict b from buyer_offers where id=offer for update;
 select * into strict l from produce_listings where id=b.listing_id;
 perform require_farmer(l.farmer_id);
 if b.status<>'pending' then raise exception 'Offer has already been processed'; end if;
 if not accept then update buyer_offers set status='rejected' where id=b.id; perform notify_user(b.buyer_id,'Offer rejected','Your offer was not accepted.','/workspace/offers'); return b.id; end if;
 -- Lock the shared harvest, then re-read/lock the listing. Concurrent offers serialize here.
 select * into strict h from harvests where id=l.harvest_id for update;
 select * into strict l from produce_listings where id=b.listing_id for update;
 if l.status<>'active' or b.quantity>l.quantity or b.quantity>h.available_quantity then raise exception 'Produce is no longer available in this quantity'; end if;
 update harvests set reserved_quantity=reserved_quantity+b.quantity where id=h.id;
 update produce_listings set quantity=quantity-b.quantity where id=l.id;
 update buyer_offers set status='accepted' where id=b.id;
 insert into orders(offer_id,farmer_id,buyer_id) values(b.id,l.farmer_id,b.buyer_id) returning id into result;
 insert into order_items(order_id,harvest_id,listing_id,quantity,unit,unit_price) values(result,h.id,l.id,b.quantity,h.unit,b.unit_price);
 insert into harvest_adjustments(harvest_id,kind,quantity,unit,reason,performed_by) values(h.id,'reservation',-b.quantity,h.unit,'Accepted buyer offer',public.current_actor());
 perform notify_user(b.buyer_id,'Offer accepted','Confirm your purchase and coordinate collection.','/workspace/orders'); return result;
end $$;

create function public.transition_order(order_id uuid,target text,actual_price numeric default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders; i order_items; farmer boolean; owner_id uuid;
begin
 perform assert_active(); select * into strict o from orders where id=order_id for update;
 farmer=can_farmer(o.farmer_id);
 if not farmer and o.buyer_id<>public.current_actor() then raise exception 'Order access denied'; end if;
 -- Match delivery's request -> delivery lock order to avoid cancellation/pickup deadlocks.
 perform 1 from transport_requests tr where tr.order_id=o.id order by tr.id for update;
 if target='confirm_purchase' then
  if o.buyer_id<>public.current_actor() or o.status not in ('accepted','preparing','ready_for_collection') then raise exception 'Cannot confirm purchase'; end if;
  update orders set buyer_confirmed=true where id=o.id;
 else
  if o.status in ('completed','cancelled') then raise exception 'Order is already finalized'; end if;
  if target='disputed' then update orders set status='disputed' where id=o.id;
  elsif target='cancelled' then
   if exists(select 1 from transport_requests where transport_requests.order_id=o.id and status in ('picked_up','delivered','disputed')) then raise exception 'Dispute this order after pickup; cancellation is unavailable'; end if;
   for i in select * from order_items where order_items.order_id=o.id order by harvest_id loop
    perform 1 from harvests where id=i.harvest_id for update;
    update harvests set reserved_quantity=reserved_quantity-i.quantity where id=i.harvest_id;
    update produce_listings set quantity=quantity+i.quantity where id=i.listing_id;
    insert into harvest_adjustments(harvest_id,kind,quantity,unit,reason,performed_by) values(i.harvest_id,'released',i.quantity,i.unit,'Order cancelled',public.current_actor());
   end loop;
   update orders set status='cancelled' where id=o.id;
   update deliveries set status='cancelled' where request_id in (select id from transport_requests where transport_requests.order_id=o.id);
   update transport_requests set status='cancelled' where transport_requests.order_id=o.id;
  else
   if not farmer then raise exception 'Only the farmer may update fulfillment'; end if;
   if not ((o.status='accepted' and target='preparing') or (o.status='preparing' and target='ready_for_collection') or (o.status='ready_for_collection' and target='completed')) then raise exception 'Invalid order status transition'; end if;
   if target='completed' then
    if not o.buyer_confirmed or actual_price is null or actual_price<=0 then raise exception 'Buyer confirmation and actual price are required'; end if;
    if exists(select 1 from transport_requests where transport_requests.order_id=o.id and status not in ('delivered','cancelled')) then raise exception 'Confirm delivery or cancel transport before completing the sale'; end if;
    for i in select * from order_items where order_items.order_id=o.id order by harvest_id loop
     perform 1 from harvests where id=i.harvest_id for update;
     update harvests set reserved_quantity=reserved_quantity-i.quantity,sold_quantity=sold_quantity+i.quantity where id=i.harvest_id;
     insert into sales(farmer_id,harvest_id,order_id,buyer_category,quantity,unit,unit_price,sale_date,created_by) values(o.farmer_id,i.harvest_id,o.id,'marketplace buyer',i.quantity,i.unit,actual_price,current_date,public.current_actor());
     insert into harvest_adjustments(harvest_id,kind,quantity,unit,reason,performed_by) values(i.harvest_id,'sale',-i.quantity,i.unit,'Confirmed actual sale',public.current_actor());
    end loop;
   end if;
   update orders set status=target where id=o.id;
  end if;
 end if;
 select user_id into owner_id from farmer_profiles where id=o.farmer_id;
 perform notify_user(owner_id,'Order updated',replace(target,'_',' '),'/workspace/orders');
 perform notify_user(o.buyer_id,'Order updated',replace(target,'_',' '),'/workspace/orders');
end $$;

create function public.quote_transport(request uuid,charge numeric,note text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid; f uuid;
begin
 perform 1 from transport_requests where id=request for update;
 if not eligible_transport(request) then raise exception 'Verification and a matching service area are required'; end if;
 insert into transport_quotes(request_id,transporter_id,amount,notes) values(request,public.current_actor(),charge,note) returning id into result;
 update transport_requests set status='quoted' where id=request returning farmer_id into f;
 perform notify_user((select user_id from farmer_profiles where id=f),'Transport quotation received','Compare quotations before assigning transport.','/workspace/transport'); return result;
end $$;
create function public.assign_transport(quote uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare q transport_quotes; r transport_requests; result uuid;
begin
 select * into strict q from transport_quotes where id=quote;
 select * into strict r from transport_requests where id=q.request_id for update;
 perform require_farmer(r.farmer_id);
 if r.status not in ('requested','quoted') or q.status<>'pending' or not exists(select 1 from transport_profiles tp join profiles pr on pr.id=tp.user_id join user_roles ur on ur.user_id=pr.id where tp.user_id=q.transporter_id and tp.verified and pr.status='active' and ur.role='transporter') then raise exception 'Assignment unavailable'; end if;
 insert into deliveries(request_id,quote_id,transporter_id) values(r.id,q.id,q.transporter_id) returning id into result;
 update transport_requests set status='assigned' where id=r.id;
 update transport_quotes set status=case when id=q.id then 'accepted' else 'rejected' end where request_id=r.id;
 perform notify_user(q.transporter_id,'Transport assigned','Review your delivery assignment.','/workspace/deliveries'); return result;
end $$;
create function public.transition_delivery(delivery uuid,target text,charge numeric default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare d deliveries; r transport_requests;
begin
 perform assert_active();
 select tr.* into strict r from transport_requests tr join deliveries dd on dd.request_id=tr.id where dd.id=delivery for update of tr;
 select * into strict d from deliveries where id=delivery for update;
 if target='confirm_delivery' then
  perform require_farmer(r.farmer_id);
  if d.status<>'delivered' or d.confirmed_by is not null then raise exception 'Delivery cannot be confirmed'; end if;
  update deliveries set confirmed_by=public.current_actor() where id=d.id;
  if d.actual_charge>0 then insert into expenses(farmer_id,harvest_id,category,amount,description,expense_date,created_by) values(r.farmer_id,r.harvest_id,'transportation',d.actual_charge,'Confirmed delivery '||d.id,current_date,public.current_actor()); end if;
 elsif target in ('disputed','cancelled') then
  if not can_farmer(r.farmer_id) and d.transporter_id<>public.current_actor() then raise exception 'Delivery access denied'; end if;
  if d.status in ('delivered','cancelled') or (target='cancelled' and d.status='picked_up') then raise exception 'Use a dispute after pickup'; end if;
  update deliveries set status=target where id=d.id; update transport_requests set status=target where id=r.id;
 else
  if d.transporter_id<>public.current_actor() or not has_role('transporter') or not exists(select 1 from transport_profiles where user_id=public.current_actor() and verified) then raise exception 'Verified assigned transporter required'; end if;
  if not ((d.status='assigned' and target='picked_up') or (d.status='picked_up' and target='delivered')) then raise exception 'Invalid delivery transition'; end if;
  if target='delivered' and (charge is null or charge<0) then raise exception 'Actual transport charge is required'; end if;
  update deliveries set status=target,picked_up_at=case when target='picked_up' then now() else picked_up_at end,delivered_at=case when target='delivered' then now() else delivered_at end,actual_charge=case when target='delivered' then charge else null end where id=d.id;
  update transport_requests set status=target where id=r.id;
 end if;
 perform notify_user((select user_id from farmer_profiles where id=r.farmer_id),'Delivery updated',replace(target,'_',' '),'/workspace/deliveries');
end $$;

create function public.manage_record(kind text,record_id uuid,command text,value text default '') returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare f uuid; s service_requests; owner_id uuid;
begin
 perform assert_active();
 if kind='notifications' then update notifications set read_at=now() where id=record_id and user_id=public.current_actor();
 elsif kind='harvests' then
  if not can_harvest(record_id) or not (has_role('coordinator') or has_role('admin')) or command<>'verify' then raise exception 'Verification denied'; end if;
  update harvests set verified_by=public.current_actor() where id=record_id;
 elsif kind='loss_records' then
  select farmer_id into strict f from loss_records where id=record_id; perform require_farmer(f);
  if not (has_role('coordinator') or has_role('admin')) or command<>'verify' then raise exception 'Verification denied'; end if;
  update loss_records set verified_by=public.current_actor() where id=record_id;
 elsif kind='produce_listings' then
  select farmer_id into strict f from produce_listings where id=record_id; perform require_farmer(f);
  if command<>'close' then raise exception 'Invalid listing command'; end if;
  update produce_listings set status='closed' where id=record_id;
 elsif kind='service_requests' then
  select * into strict s from service_requests where id=record_id for update; perform require_farmer(s.farmer_id);
  if command='cancelled' and s.status in ('submitted','assigned') then update service_requests set status='cancelled' where id=s.id;
  else
   if not (has_role('coordinator') or has_role('admin')) then raise exception 'Coordinator required'; end if;
   if not ((s.status='submitted' and command='assigned') or (s.status='assigned' and command='in_progress') or (s.status='in_progress' and command='resolved')) then raise exception 'Invalid support status transition'; end if;
   update service_requests set status=command,assigned_to=coalesce(assigned_to,public.current_actor()) where id=s.id;
  end if;
  perform notify_user((select user_id from farmer_profiles where id=s.farmer_id),'Support request updated',replace(command,'_',' '),'/workspace/support');
 else
  if not has_role('admin') then raise exception 'Administrator required'; end if;
  if kind='profiles' then
   if record_id=public.current_actor() then raise exception 'An administrator cannot change their own access'; end if;
   if command='role' then
    if value not in ('farmer','buyer','transporter','coordinator','admin') then raise exception 'Invalid role'; end if;
    insert into user_roles(user_id,role,approved_by) values(record_id,value::app_role,public.current_actor()) on conflict(user_id) do update set role=excluded.role,approved_by=public.current_actor();
    update role_requests set status='approved' where user_id=record_id;
   elsif command='status' and value in ('active','suspended','deactivated') then update profiles set status=value where id=record_id;
   else raise exception 'Invalid account command'; end if;
  elsif kind='transport_profiles' and command='verify' then update transport_profiles set verified=true where id=record_id;
  elsif kind='announcements' then
   perform notify_user(id,'FarmSave announcement',value,'/workspace/notifications') from profiles where status='active';
  else raise exception 'Unsupported administrative command'; end if;
 end if;
end $$;

-- Only the public contact RPC is anonymous. The caller-supplied bucket is generated by the server action.
create function public.submit_contact(p_name text,p_email text,p_message text,p_bucket text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform check_rate('contact-global',100,3600); perform check_rate('contact:'||p_bucket,5,3600);
 if p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid email'; end if;
 insert into contact_messages(name,email,message) values(p_name,p_email,p_message);
end $$;
create function public.harvest_reminders() returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform assert_active();
 insert into notifications(user_id,title,message,href,event_key)
 select public.current_actor(),'Upcoming harvest',c.name||' expected on '||h.expected_date,'/workspace/harvests','harvest:'||h.id||':'||h.expected_date
 from harvests h join farm_crops fc on fc.id=h.farm_crop_id join farms f on f.id=fc.farm_id join farmer_profiles fp on fp.id=f.farmer_id join crops c on c.id=fc.crop_id
 where fp.user_id=public.current_actor() and h.expected_date between current_date and current_date+7 and h.total_quantity=0 on conflict(event_key) do nothing;
end $$;

-- Definer helpers are not exposed as mutation APIs. RLS predicate helpers are read-only.
revoke execute on all functions in schema public from public,farmsave_anonymous,farmsave_authenticated;
grant execute on function active_user(),has_role(app_role),in_area(uuid),can_farmer(uuid),can_farm(uuid),can_harvest(uuid),order_party(uuid),request_party(uuid),eligible_transport(uuid),can_listing(uuid),offered_listing(uuid) to farmsave_authenticated;
grant execute on function enroll_account(text),update_profile(text,text),save_record(text,jsonb),submit_offer(uuid,numeric,numeric,text),decide_offer(uuid,boolean),transition_order(uuid,text,numeric),quote_transport(uuid,numeric,text),assign_transport(uuid),transition_delivery(uuid,text,numeric),manage_record(text,uuid,text,text),harvest_reminders() to farmsave_authenticated;
grant execute on function submit_contact(text,text,text,text) to farmsave_anonymous,farmsave_authenticated;


-- Ported from 202611050004_reporting.sql
create function public.public_impact() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('farmers',(select count(*) from farmer_profiles),'trained',(select count(distinct farmer_id) from training_attendance where attended),'completed_orders',(select count(*) from orders where status='completed'))
$$;
revoke all on function public_impact() from public;
grant execute on function public_impact() to farmsave_anonymous,farmsave_authenticated;
create function public.public_contact_info() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object(
 'email',(select value->>'value' from platform_settings where key='contact_email' and value->>'value' ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 'phone',(select value->>'value' from platform_settings where key='contact_phone' and value->>'value' ~ '^[+0-9 ()-]{5,30}$'))
$$;
revoke all on function public_contact_info() from public;
grant execute on function public_contact_info() to farmsave_anonymous,farmsave_authenticated;


-- Ported from 202611050005_summaries.sql
-- Consistent timestamps on reference/junction tables as well as operational tables.
do $$ declare t text; begin
 for t in select tablename from pg_tables where schemaname='public' and tablename<>'_prisma_migrations' loop
  execute format('alter table %I add column if not exists created_at timestamptz not null default now()',t);
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='updated_at') then
   execute format('alter table %I add column updated_at timestamptz not null default now()',t);
   execute format('create trigger touch_updated before update on %I for each row execute function touch_updated()',t);
  end if;
 end loop;
end $$;

-- Invoker functions deliberately inherit the caller's RLS for every aggregate.
create function public.workspace_summary() returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not active_user() then raise exception 'Active account required'; end if;
 return jsonb_build_object(
 'farmers',(select count(*) from farmer_profiles),
 'farms',(select count(*) from farms),
 'crops',(select count(*) from farm_crops),
 'categories',(select count(*) from crop_categories),
 'upcoming',(select count(*) from harvests where total_quantity=0 and expected_date>=current_date),
 'listings',(select count(*) from produce_listings where status='active' and quantity>0),
 'offers',(select count(*) from buyer_offers where status='pending'),
 'orders',(select count(*) from orders where status in ('accepted','preparing','ready_for_collection')),
 'completed',(select count(*) from orders where status='completed'),
 'transport',(select count(*) from transport_requests where status not in ('delivered','cancelled')),
 'deliveries',(select count(*) from deliveries where status='delivered'),
 'quotes',(select count(*) from transport_quotes where status='pending'),
 'earnings',(select coalesce(sum(actual_charge),0) from deliveries where status='delivered'),
 'revenue',(select coalesce(sum(quantity*unit_price),0) from sales where confirmed),
 'costs',(select coalesce(sum(amount),0) from expenses),
 'support',(select count(*) from service_requests where status not in ('resolved','cancelled')),
 'buyers',(select count(*) from user_roles ur join profiles pr on pr.id=ur.user_id where ur.role='buyer' and pr.status='active'),
 'verified_transporters',(select count(*) from transport_profiles tp join profiles pr on pr.id=tp.user_id where tp.verified and pr.status='active'),
 'trained',(select count(distinct farmer_id) from training_attendance where attended),
 'pending_approvals',(select count(*) from role_requests where status='pending'),
 'quantities',coalesce((select jsonb_agg(x) from (
  select c.name as crop,h.unit,sum(h.total_quantity) as total,sum(h.available_quantity) as available,sum(h.reserved_quantity) as reserved,sum(h.sold_quantity) as sold,sum(h.lost_quantity) as lost,
   case when sum(h.total_quantity)>0 then round(sum(h.lost_quantity)/sum(h.total_quantity)*100,2) else null end as loss_rate
  from harvests h join farm_crops fc on fc.id=h.farm_crop_id join crops c on c.id=fc.crop_id group by c.name,h.unit order by c.name,h.unit
 ) x),'[]'::jsonb));
end $$;
revoke all on function workspace_summary() from public;
grant execute on function workspace_summary() to farmsave_authenticated;

create function public.impact_report(p jsonb default '{}') returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if not (has_role('admin') or has_role('coordinator')) then raise exception 'Report access denied'; end if;
 with scoped_farmers as (
  select fp.id from farmer_profiles fp where
   (nullif(p->>'district','') is null or fp.district_id=(p->>'district')::uuid) and
   (nullif(p->>'group','') is null or exists(select 1 from group_memberships gm where gm.farmer_id=fp.id and gm.group_id=(p->>'group')::uuid))
 ), cohort as (
  select h.*,fc.crop_id,c.name as crop,f.farmer_id from harvests h join farm_crops fc on fc.id=h.farm_crop_id join farms f on f.id=fc.farm_id join crops c on c.id=fc.crop_id
  where f.farmer_id in (select id from scoped_farmers)
   and (nullif(p->>'crop','') is null or fc.crop_id=(p->>'crop')::uuid)
   and (nullif(p->>'category','') is null or c.category_id=(p->>'category')::uuid)
   and (nullif(p->>'from','') is null or h.harvested_on>=(p->>'from')::date)
   and (nullif(p->>'to','') is null or h.harvested_on<=(p->>'to')::date)
 ), quantities as (
  select crop,unit,sum(total_quantity) as total,sum(lost_quantity) as lost,case when sum(total_quantity)>0 then round(sum(lost_quantity)/sum(total_quantity)*100,2) end as loss_rate,
   count(*) filter(where verified_by is not null) as verified_harvests,count(*) as records
  from cohort group by crop,unit
 ), comparisons as (
  select distinct on (b.farmer_id,b.crop_id,b.unit,b.period_days) b.farmer_id,c.name as crop,b.unit,b.period_days,b.source as baseline_source,f.source as followup_source,
   round(b.loss_quantity/b.typical_quantity*100,2) as baseline_rate,round(f.loss_quantity/f.typical_quantity*100,2) as followup_rate,
   case when b.loss_quantity>0 then round(((b.loss_quantity/b.typical_quantity)-(f.loss_quantity/f.typical_quantity))/(b.loss_quantity/b.typical_quantity)*100,2) end as relative_reduction,
   b.reported_sales-b.reported_costs as baseline_net_proceeds,f.reported_sales-f.reported_costs as followup_net_proceeds,
   f.reported_costs-b.reported_costs as cost_change,(f.reported_sales-f.reported_costs)-(b.reported_sales-b.reported_costs) as net_proceeds_change,
   (b.source='verified' and f.source='verified') as verified,b.survey_date as baseline_date,f.survey_date as followup_date
  from baseline_surveys b join crops c on c.id=b.crop_id
  join lateral (select * from followup_surveys fs where fs.farmer_id=b.farmer_id and fs.crop_id=b.crop_id and fs.unit=b.unit and fs.period_days=b.period_days and fs.pilot_phase=b.pilot_phase and fs.survey_date>b.survey_date order by fs.survey_date desc limit 1) f on true
  where b.farmer_id in (select id from scoped_farmers)
   and (nullif(p->>'crop','') is null or b.crop_id=(p->>'crop')::uuid)
   and (nullif(p->>'category','') is null or c.category_id=(p->>'category')::uuid)
   and (nullif(p->>'phase','') is null or b.pilot_phase=p->>'phase')
   and (nullif(p->>'from','') is null or f.survey_date>=(p->>'from')::date)
   and (nullif(p->>'to','') is null or f.survey_date<=(p->>'to')::date)
  order by b.farmer_id,b.crop_id,b.unit,b.period_days,b.survey_date desc
 ), report_sales as (
  select s.* from sales s where s.confirmed and s.farmer_id in (select id from scoped_farmers)
   and (nullif(p->>'crop','') is null and nullif(p->>'category','') is null or s.harvest_id in (select id from cohort))
   and (nullif(p->>'from','') is null or s.sale_date>=(p->>'from')::date) and (nullif(p->>'to','') is null or s.sale_date<=(p->>'to')::date)
 ), report_costs as (
  select e.* from expenses e where e.farmer_id in (select id from scoped_farmers)
   and (nullif(p->>'crop','') is null and nullif(p->>'category','') is null or e.harvest_id in (select id from cohort))
   and (nullif(p->>'from','') is null or e.expense_date>=(p->>'from')::date) and (nullif(p->>'to','') is null or e.expense_date<=(p->>'to')::date)
 ) select jsonb_build_object(
  'farmers',(select count(*) from scoped_farmers),
  'trained',(select count(distinct ta.farmer_id) from training_attendance ta join training_sessions ts on ts.id=ta.session_id where ta.attended and ta.farmer_id in (select id from scoped_farmers) and (nullif(p->>'from','') is null or ts.scheduled_at::date>=(p->>'from')::date) and (nullif(p->>'to','') is null or ts.scheduled_at::date<=(p->>'to')::date) and (nullif(p->>'crop','') is null or ts.crop_id=(p->>'crop')::uuid)),
  'revenue',(select coalesce(sum(quantity*unit_price),0) from report_sales),
  'costs',(select coalesce(sum(amount),0) from report_costs),
  'buyer_participation',(select count(distinct o.buyer_id) from orders o join report_sales s on s.order_id=o.id),
  'completed_deliveries',(select count(*) from deliveries d join transport_requests tr on tr.id=d.request_id where d.status='delivered' and tr.farmer_id in(select id from scoped_farmers)
    and (nullif(p->>'crop','') is null and nullif(p->>'category','') is null or tr.harvest_id in(select id from cohort))
    and (nullif(p->>'from','') is null or d.delivered_at::date>=(p->>'from')::date) and (nullif(p->>'to','') is null or d.delivered_at::date<=(p->>'to')::date)),
  'quantities',coalesce((select jsonb_agg(q) from quantities q),'[]'::jsonb),
  'comparisons',coalesce((select jsonb_agg(c) from comparisons c),'[]'::jsonb)
 ) into result; return result;
end $$;
revoke all on function impact_report(jsonb) from public;
grant execute on function impact_report(jsonb) to farmsave_authenticated;


-- Ported from 202611050006_administration.sql
-- Restrict deletion to unused setup records. Transactional records are immutable history.
create function public.delete_empty_record(kind text,record_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare f uuid;
begin
 perform assert_active();
 if kind='farms' then
  if not can_farm(record_id) then raise exception 'Farm access denied'; end if;
  delete from farms where id=record_id;
 elsif kind='farm_crops' then
  select farm_id into strict f from farm_crops where id=record_id;
  if not can_farm(f) then raise exception 'Farm access denied'; end if;
  delete from farm_crops where id=record_id;
 else
  if not has_role('admin') then raise exception 'Administrator required'; end if;
  case kind
   when 'crops' then delete from crops where id=record_id;
   when 'crop_categories' then delete from crop_categories where id=record_id;
   when 'crop_guidance' then delete from crop_guidance where id=record_id and not published;
   when 'coordinator_areas' then delete from coordinator_areas where id=record_id;
   when 'group_memberships' then delete from group_memberships where id=record_id;
   else raise exception 'This type of record cannot be deleted';
  end case;
 end if;
 -- Existing foreign keys prevent deletion if an operational record depends on it.
end $$;

create function public.resolve_dispute(order_ref uuid,resolution text,reason text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders; i order_items;
begin
 if not has_role('admin') then raise exception 'Administrator required'; end if;
 if length(trim(reason))<10 or length(reason)>3000 then raise exception 'Record a meaningful resolution reason'; end if;
 select * into strict o from orders where id=order_ref for update;
 if o.status<>'disputed' then raise exception 'Only disputed orders can be reviewed'; end if;
 perform 1 from transport_requests where order_id=o.id order by id for update;
 if resolution='resume' then update orders set status='preparing' where id=o.id;
 elsif resolution='returned_and_cancelled' then
  for i in select * from order_items where order_id=o.id order by harvest_id loop
   perform 1 from harvests where id=i.harvest_id for update;
   update harvests set reserved_quantity=reserved_quantity-i.quantity where id=i.harvest_id;
   update produce_listings set quantity=quantity+i.quantity where id=i.listing_id;
   insert into harvest_adjustments(harvest_id,kind,quantity,unit,reason,performed_by) values(i.harvest_id,'dispute_return',i.quantity,i.unit,reason,public.current_actor());
  end loop;
  update deliveries set status='cancelled' where request_id in (select id from transport_requests where order_id=o.id);
  update transport_requests set status='cancelled' where order_id=o.id;
  update orders set status='cancelled' where id=o.id;
 else raise exception 'Invalid dispute resolution'; end if;
 insert into audit_logs(actor_id,action,entity,entity_id,details) values(public.current_actor(),'RESOLVE_DISPUTE','orders',o.id,jsonb_build_object('resolution',resolution,'reason',reason));
 perform notify_user(o.buyer_id,'Order dispute reviewed',resolution,'/workspace/orders');
 perform notify_user((select user_id from farmer_profiles where id=o.farmer_id),'Order dispute reviewed',resolution,'/workspace/orders');
end $$;

create function public.convert_crop_quantity(crop uuid,quantity numeric,source_unit text,target_unit text) returns numeric language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare factor numeric;
begin
 if not active_user() or quantity<0 or quantity::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid conversion request'; end if;
 if source_unit=target_unit then return quantity; end if;
 select c.factor into factor from crop_unit_conversions c where c.crop_id=crop and c.from_unit=source_unit and c.to_unit=target_unit;
 if factor is null then raise exception 'No reviewed conversion exists for this crop and unit pair'; end if;
 return quantity*factor;
end $$;

-- PostgreSQL NUMERIC admits NaN. Positive CHECKs alone do not reject it.
do $$ declare r record; begin
 for r in select table_name,column_name from information_schema.columns where table_schema='public' and data_type='numeric' loop
  execute format('alter table %I add constraint %I check (%I is null or %I not in (''NaN''::numeric,''Infinity''::numeric,''-Infinity''::numeric))',r.table_name,r.table_name||'_'||r.column_name||'_finite',r.column_name,r.column_name);
 end loop;
end $$;

-- Index previously uncovered foreign-key lookups (leading-column indexes only).
do $$ declare r record; begin
 for r in select c.conrelid::regclass as tbl,a.attname,c.conkey[1] as col from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
  where c.contype='f' and c.connamespace='public'::regnamespace and cardinality(c.conkey)=1
  and not exists(select 1 from pg_index ix where ix.indrelid=c.conrelid and ix.indkey[0]=c.conkey[1])
 loop execute format('create index if not exists %I on %s(%I)',replace(r.tbl::text,'public.','')||'_'||r.attname||'_fk_idx',r.tbl,r.attname); end loop;
end $$;

revoke all on function delete_empty_record(text,uuid),resolve_dispute(uuid,text,text),convert_crop_quantity(uuid,numeric,text,text) from public;
grant execute on function delete_empty_record(text,uuid),resolve_dispute(uuid,text,text),convert_crop_quantity(uuid,numeric,text,text) to farmsave_authenticated;

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
