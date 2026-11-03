-- Position scoring is capped: 1st gets 10, 2nd 9, ... 9th 2, and everyone further down who made it gets 1.
-- No answer (or not making it) still gives 0. Ties share the best position, as before.
-- Used by Bånn i bøtta, Kjenn kompisen, Skritteller, Snap-streak, Hvor mange?, Mim det!, Perfekte 10 and Nest mest.
-- Same award_round as 010_wavelength.sql apart from the points.

create or replace function game_private.position_points(p_place integer) returns integer
language sql immutable set search_path = '' as $$ select greatest(11-p_place,1) $$;

create or replace function game_private.award_round(p_round uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r game_private.rounds; item record; points_value integer; task jsonb;
  is_challenge boolean; method text; first_count integer; second_count integer; minority text;
  shown_steps integer; fasit text[]; reps text[]; map_words text[]; map_index integer[]; found integer; i integer; top jsonb; top_value numeric;
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
  elsif method='words' then
    -- Group words that are equal or one typo apart (two for long words), most written first.
    reps:='{}'; map_words:='{}'; map_index:='{}';
    for item in select u.word,count(distinct q.player_id) as writers
      from game_private.responses q cross join unnest(q.words) as u(word)
      where q.round_id=r.id group by u.word order by writers desc,u.word
    loop
      found:=null;
      for i in 1..cardinality(reps) loop
        if game_private.same_word(item.word,reps[i]) then found:=i; exit; end if;
      end loop;
      if found is null then reps:=reps||item.word; found:=cardinality(reps); end if;
      map_words:=map_words||item.word; map_index:=map_index||found;
    end loop;
    -- Top five groups written by at least two players; each player counts once per group.
    select coalesce(jsonb_agg(jsonb_build_object('word',reps[t.idx],'count',t.writers,'players',t.players) order by t.writers desc,t.idx),'[]'::jsonb) into top
      from (select m.idx,count(distinct q.player_id) as writers,jsonb_agg(distinct q.player_id) as players
        from game_private.responses q cross join unnest(q.words) as u(word)
        join unnest(map_words,map_index) as m(word,idx) on m.word=u.word
        where q.round_id=r.id group by m.idx having count(distinct q.player_id)>=2
        order by writers desc,m.idx limit 5) t;
    update game_private.rounds set top_words=top where id=r.id;
    update game_private.responses q set points=2*(select count(*) from jsonb_array_elements(top) e where e->'players' ? q.player_id::text)
      where q.round_id=r.id;
  elsif method='highest' then
    -- The highest number drinks; the rest are ranked from the top, so the second highest wins.
    select max(choice::numeric) into top_value from game_private.responses where round_id=r.id and choice is not null;
    update game_private.responses set drinks=coalesce(choice::numeric=top_value,false) where round_id=r.id;
    for item in select player_id,rank() over(order by choice::numeric desc) as place
      from game_private.responses where round_id=r.id and choice is not null and not drinks
    loop
      points_value := game_private.position_points(item.place::integer);
      update game_private.responses set points=points_value,rank=item.place where round_id=r.id and player_id=item.player_id;
    end loop;
  elsif method='wavelength' then
    -- Guessers: 1 point per answer like the performer's, until the first different one.
    -- Performer: 1 point per guesser who matched every question, only when all questions were played.
    shown_steps:=r.wl_step+case when r.wl_shown then 1 else 0 end;
    select answers into fasit from game_private.responses where round_id=r.id and player_id=r.performer_id;
    update game_private.responses set points=game_private.wl_streak(answers,fasit,shown_steps)
      where round_id=r.id and player_id is distinct from r.performer_id;
    if shown_steps=(task->'answer'->>'questions')::integer then
      update game_private.responses set points=(select count(*) from game_private.responses o where o.round_id=r.id
        and o.player_id<>r.performer_id and game_private.wl_streak(o.answers,fasit,shown_steps)=shown_steps)
        where round_id=r.id and player_id=r.performer_id;
    end if;
    if fasit[1] is not null then update game_private.players set completed=true where id=r.performer_id; end if;
  elsif method='mime' then
    -- The fastest correct guess wins with position scoring; the performer scores once they have started.
    for item in select player_id,rank() over(order by actual) as place from game_private.responses
      where round_id=r.id and player_id is distinct from r.performer_id and finished and actual is not null
    loop
      points_value := game_private.position_points(item.place::integer);
      update game_private.responses set points=points_value,rank=item.place where round_id=r.id and player_id=item.player_id;
    end loop;
    if r.performer_id is not null and r.started_at is not null then
      update game_private.responses set points=case when r.transferred then 10 else 5 end where round_id=r.id and player_id=r.performer_id;
      update game_private.players set completed=true where id=r.performer_id;
    end if;
  else
    for item in
      select player_id, rank() over(order by
        case when is_challenge then abs(guess-greatest((task->'answer'->>'min')::numeric,least(r.actual,(task->'answer'->>'max')::numeric))) else abs(actual-(task->'answer'->>'target')::numeric) end) as place
      from game_private.responses where round_id=r.id and player_id is distinct from r.performer_id
        and (case when is_challenge then guess is not null and r.actual is not null else finished and actual<(task->'answer'->>'timeout')::numeric end)
    loop
      points_value := game_private.position_points(item.place::integer);
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

revoke execute on function game_private.position_points(integer) from public, anon, authenticated;
