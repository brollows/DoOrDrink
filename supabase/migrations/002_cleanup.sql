create extension if not exists pg_cron;

select cron.schedule(
  'do-or-drink-expiry',
  '* * * * *',
  $$delete from game_private.sessions where expires_at <= now() + interval '1 minute';$$
);
