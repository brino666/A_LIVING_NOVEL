alter table worlds add column if not exists grandfathered boolean not null default false;

-- Every world that exists at the moment this migration runs predates the
-- paywall -- grandfather all of them in one shot. Anything created after
-- this runs gets the column default of false and must subscribe.
update worlds set grandfathered = true;
