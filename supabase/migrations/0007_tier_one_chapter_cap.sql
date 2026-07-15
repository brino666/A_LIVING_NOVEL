-- Tier one is 3 chapters/day, not 4. Applies to new worlds going forward
-- via the column default; existing worlds are left alone unless you also
-- run the commented UPDATE below.
alter table worlds alter column chapter_cap set default 3;

-- Uncomment to also drop every existing world still on the old default down to 3:
-- update worlds set chapter_cap = 3 where chapter_cap = 4;
