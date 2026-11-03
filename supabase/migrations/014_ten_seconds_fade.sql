-- Perfekte 10: the running time now fades out after 3 seconds (client side). Update the task text to match.
update game_private.tasks
set definition = jsonb_set(definition, '{description}', '"Start din egen timer. Stopp så nær 10 sekunder som mulig. Tiden forsvinner etter 3 sekunder."')
where id = 'ten_seconds';
