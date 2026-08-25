select cron.schedule(
  'drift-alarm-daily',
  '23 9 * * *',
  $$
  select net.http_post(
    url:='https://project--057eec39-4362-49f7-b42a-04810d1cb105.lovable.app/api/public/hooks/drift-alarm',
    headers:='{"Content-Type": "application/json", "apikey": "sb_publishable_6mdySEErPg39L2aHjjVhpQ_smqnOt9x"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);