alter table contact_messages add column consent_at text;
alter table contact_messages add column privacy_version text;
alter table contact_messages add column expires_at text;

update contact_messages
set
  consent_at = created_at,
  privacy_version = 'legacy',
  expires_at = datetime(created_at, '+12 months')
where consent_at is null;

create index if not exists idx_contact_messages_expires_at
  on contact_messages(expires_at);
