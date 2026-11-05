-- Topp 5: "Ting man ikke putter i kroppen" replaces Vorspiel. Run after 019.
--
-- Vorspiel is retired like Nest mest: kept for rounds already played, but no longer drawn in new games.
-- Games still in the lobby get the new task in its place.

insert into game_private.tasks(id,definition)
select 'top5_body', definition||'{"id":"top5_body","title":"Topp 5: Ikke i kroppen","question":"Ting man ikke putter i kroppen"}'::jsonb
from game_private.tasks where id='top5_vors'
on conflict (id) do update set definition=excluded.definition;

update game_private.tasks set definition=definition||'{"retired":true}' where id='top5_vors';
update game_private.sessions set task_order=array_replace(task_order,'top5_vors','top5_body') where status='lobby';
