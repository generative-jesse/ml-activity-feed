import { createClient } from '@supabase/supabase-js'

export function getSupabaseClient(url?: string, key?: string) {
  const supabaseUrl = url || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = key || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) return null

  return createClient(supabaseUrl, supabaseKey)
}

// Schema for reference — run in Supabase SQL editor
export const SUPABASE_SCHEMA = `
-- RaffleML schema
-- Run this in Supabase → SQL Editor

create table if not exists feed_configs (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  label text,
  poll_interval integer default 30,
  headers jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists feed_records (
  id uuid primary key default gen_random_uuid(),
  feed_url text not null,
  data jsonb not null,
  collected_at timestamptz default now()
);

create index if not exists idx_feed_records_url on feed_records(feed_url);
create index if not exists idx_feed_records_collected on feed_records(collected_at desc);

-- Row-level security (optional)
alter table feed_configs enable row level security;
alter table feed_records enable row level security;
`
