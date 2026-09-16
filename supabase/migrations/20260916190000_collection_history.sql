create table public.collection_history (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references public.devices(id) on delete set null,
  ip inet not null,
  vendor text not null,
  vendor_label text,
  identity text,
  uptime text,
  client_count integer not null default 0,
  clients jsonb not null default '[]'::jsonb,
  collected_at timestamptz not null default now()
);

create index collection_history_collected_at_idx on public.collection_history (collected_at desc);
create index collection_history_ip_collected_at_idx on public.collection_history (ip, collected_at desc);

alter table public.collection_history enable row level security;

grant all on public.collection_history to service_role;
