-- Facebook patterns — scam recruitment ads collected and analyzed from Facebook groups
-- Extension: adds pattern corpus for cross-reference and matching

create table if not exists facebook_patterns (
  id                  uuid primary key default gen_random_uuid(),
  post_url            text unique not null,
  post_content        text not null,
  tone_description    text,
  tone_keywords       text[],                       -- Array of fraud keywords
  image_urls          text[],                       -- Array of image URLs
  image_descriptions  text[],                       -- Array of descriptions
  location_text       text,
  location_latitude   numeric,
  location_longitude  numeric,
  location_region     text,
  scraped_at          timestamptz,                  -- When the post was scraped
  post_date           timestamptz,                  -- Extracted from post relative date
  created_at          timestamptz not null default now()
);

create index if not exists idx_facebook_patterns_location on facebook_patterns (location_region);
create index if not exists idx_facebook_patterns_date on facebook_patterns (post_date);
create index if not exists idx_facebook_patterns_post_url on facebook_patterns (post_url);

-- Enable RLS for consistency with schema
alter table facebook_patterns enable row level security;
