-- Run this once in Supabase → SQL Editor → New query → Run
create table if not exists app_data (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);
-- Lock the table down: only the server (service role) can read/write.
alter table app_data enable row level security;
