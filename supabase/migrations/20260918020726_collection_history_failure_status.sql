alter table public.collection_history
  add column if not exists status text not null default 'success',
  add column if not exists error_message text;

alter table public.collection_history
  add constraint collection_history_status_check
  check (status in ('success', 'failure'));

create index if not exists collection_history_status_collected_at_idx
  on public.collection_history (status, collected_at desc);
