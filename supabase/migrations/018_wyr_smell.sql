-- New options for one "Ville du helst …" task. Run after 017.
-- The id stays wyr_history so games already in the lobby keep it in their task list.

update game_private.tasks
set definition=jsonb_set(definition,'{options}',
  '["At du selv alltid lukter drit men kjenner ikke egen lukt","At alle andre alltid lukter drit og du kjenner det veldig godt"]'::jsonb)
where id='wyr_history';
