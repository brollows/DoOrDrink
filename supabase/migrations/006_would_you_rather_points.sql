-- Would you rather: the majority now gets 3 points, while the minority still drinks.
-- A tie gives no points and nobody drinks for their choice.

update game_private.tasks set definition=jsonb_set(definition,'{description}','"Alle velger. Flertallet får 3 poeng, mindretallet tar 3 slurker."')
  where definition->'answer'->>'method'='choice';

create or replace function game_private.award_round(p_round uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r game_private.rounds; participant_count integer; item record; points_value integer; task jsonb;
  is_challenge boolean; method text; first_count integer; second_count integer; minority text;
begin
  select * into r from game_private.rounds where id=p_round;
  if r.awarded then return; end if;
  select definition into task from game_private.tasks where id=r.task_id;
  is_challenge:=task->>'kind'='challenge';
  method:=task->'answer'->>'method';
  if method='rps' then
    -- A player who chose wins against a machine or an opponent who did not choose. Ties were replayed.
    for item in select q.player_id,q.choice,q.bot_choice,q.opponent_id,o.choice as opponent_choice
      from game_private.responses q left join game_private.responses o on o.round_id=q.round_id and o.player_id=q.opponent_id
      where q.round_id=r.id
    loop
      if item.choice is not null and (case when item.opponent_id is null then game_private.beats(item.choice,item.bot_choice)
          else item.opponent_choice is null or game_private.beats(item.choice,item.opponent_choice) end) then
        update game_private.responses set points=3 where round_id=r.id and player_id=item.player_id;
      else
        update game_private.responses set drinks=true where round_id=r.id and player_id=item.player_id;
      end if;
    end loop;
  elsif method='choice' then
    -- The majority gets 3 points and the minority drinks; a tie means neither. Not answering always means drinking.
    select count(*) filter (where choice='0'),count(*) filter (where choice='1') into first_count,second_count
      from game_private.responses where round_id=r.id;
    minority:=case when first_count<second_count then '0' when second_count<first_count then '1' end;
    update game_private.responses set
      drinks=(choice is null or coalesce(choice=minority,false)),
      points=case when minority is not null and choice is not null and choice<>minority then 3 else 0 end
      where round_id=r.id;
  else
    select count(*) into participant_count from game_private.responses where round_id=r.id and player_id is distinct from r.performer_id;
    for item in
      select player_id, rank() over(order by
        case when is_challenge then abs(guess-greatest((task->'answer'->>'min')::numeric,least(r.actual,(task->'answer'->>'max')::numeric))) else abs(actual-(task->'answer'->>'target')::numeric) end) as place
      from game_private.responses where round_id=r.id and player_id is distinct from r.performer_id
        and (case when is_challenge then guess is not null and r.actual is not null else finished and actual<(task->'answer'->>'timeout')::numeric end)
    loop
      points_value := participant_count-item.place+1;
      if item.place<=2 and participant_count>=3 then points_value:=points_value+1; end if;
      if item.place=1 and participant_count>=2 then points_value:=points_value+2; end if;
      update game_private.responses set points=points_value,rank=item.place where round_id=r.id and player_id=item.player_id;
    end loop;
    if r.performer_id is not null and r.actual is not null then
      update game_private.responses set points=case when r.transferred then 10 else 5 end where round_id=r.id and player_id=r.performer_id;
      update game_private.players set completed=true where id=r.performer_id;
    end if;
  end if;
  update game_private.players p set score=p.score+q.points from game_private.responses q where q.round_id=r.id and q.player_id=p.id;
  update game_private.rounds set awarded=true where id=r.id;
end;
$$;
