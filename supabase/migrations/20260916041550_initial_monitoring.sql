create table public.devices (
  id uuid primary key default gen_random_uuid(),
  ip inet not null unique,
  vendor text not null,
  identity text,
  uptime text,
  last_collected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.client_samples (
  id bigint generated always as identity primary key,
  device_id uuid not null references public.devices(id) on delete cascade,
  radio_name text,
  mac text,
  uptime text,
  tx_rx_signal_strength text,
  tx_rx_ccq text,
  collected_at timestamptz not null
);

create index client_samples_device_collected_at_idx on public.client_samples (device_id, collected_at desc);

alter table public.devices enable row level security;
alter table public.client_samples enable row level security;

grant all on public.devices, public.client_samples to service_role;
grant usage, select on sequence public.client_samples_id_seq to service_role;
