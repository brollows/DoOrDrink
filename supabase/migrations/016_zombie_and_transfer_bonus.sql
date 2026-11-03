-- Zombie replaces Nest mest, and the completion bonus grows by 1 per transfer.
-- Run after 015.
--
-- Zombie: when the host starts the step, one random player becomes the first zombie. Every bite round, each zombie
-- picks one human (a name can only be picked by one zombie). The round resolves when every zombie has picked, or
-- 16 seconds after it started (the phones show 15): zombies who did not pick bite a random free human. The game
-- stops on its own when there are at least as many zombies as humans, and goes straight to the reveal.
-- Points: the first zombie 3, bitten in bite round n gets n, survivors one more than the last bite round.
-- Every zombie drinks 2. Zombie cannot be passed on.
--
-- Completion bonus for challenges: 5 points, +1 for every time the task was passed on, at most 10.

alter table game_private.rounds add column zombie_step integer;
-- null: human. 0: the first zombie. n: bitten in bite round n.
alter table game_private.responses add column zombie_round integer;
alter table game_private.responses add column bitten_by uuid;

insert into game_private.tasks(id,definition) values ('zombie',$json${"id":"zombie","title":"Zombie","description":"Én blir trukket ut som zombie. Hver runde biter hver zombie ett menneske. Jo lenger du overlever, desto flere poeng. Alle zombier tar 2 slurker.","kind":"everyone","sips":"losers","sipCount":2,"answer":{"method":"zombie","unit":"","min":0,"max":0}}$json$)
on conflict (id) do update set definition=excluded.definition;

-- Nest mest is retired: kept for rounds already played, but no longer drawn in new games.
update game_private.tasks set definition=definition||'{"retired":true}' where id='second_highest';
update game_private.sessions set task_order=array_replace(task_order,'second_highest','zombie') where status='lobby';

create or replace function game_private.shuffled_tasks() returns text[]
language plpgsql volatile set search_path = '' as $$
declare result text[]; attempts integer:=0;
begin
  loop
    select array_agg(t.id order by random()) into result from game_private.tasks t
      cross join generate_series(1,greatest(1,coalesce((t.definition->>'repeat')::integer,1)))
      where not coalesce((t.definition->>'retired')::boolean,false);
    attempts:=attempts+1;
    exit when attempts>=50 or not exists(select 1 from generate_subscripts(result,1) i where i>1 and result[i]=result[i-1]);
  end loop;
  return result;
end;
$$;

-- Points for completing a challenge: 5, +1 per transfer, at most 10.
create or replace function game_private.completion_points(p_transfers integer) returns integer
language sql immutable set search_path = '' as $$ select least(5+coalesce(p_transfers,0),10) $$;

-- Zombie: the first zombie is drawn when the host starts the step.
create or replace function game_private.zombie_start(p_round uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r game_private.rounds; first_zombie uuid;
begin
  select * into r from game_private.rounds where id=p_round;
  if r.zombie_step is not null then return; end if;
  select player_id into first_zombie from game_private.responses where round_id=r.id order by random() limit 1;
  update game_private.responses set zombie_round=0 where round_id=r.id and player_id=first_zombie;
  update game_private.rounds set performer_id=first_zombie,zombie_step=1,started_at=clock_timestamp() where id=r.id;
  perform game_private.zombie_finish(r.id);
end;
$$;

-- Zombie: stops the game when there are at least as many zombies as humans, and goes to the reveal.
create or replace function game_private.zombie_finish(p_round uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare zombies integer; humans integer;
begin
  select count(*) filter (where zombie_round is not null),count(*) filter (where zombie_round is null) into zombies,humans
    from game_private.responses where round_id=p_round;
  if zombies>=humans then
    perform game_private.award_round(p_round);
    update game_private.rounds set phase='reveal' where id=p_round;
  end if;
end;
$$;

-- Zombie: resolves the bite round once every zombie has picked, or when the 16 seconds are up.
create or replace function game_private.zombie_resolve(p_round uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r game_private.rounds; item record; free_human uuid;
begin
  select * into r from game_private.rounds where id=p_round;
  if r.phase<>'performing' or r.awarded or r.zombie_step is null then return; end if;
  if exists(select 1 from game_private.responses where round_id=r.id and zombie_round is not null and choice is null)
    and clock_timestamp()<r.started_at+interval '16 seconds' then return; end if;
  -- Zombies who did not pick bite a random free human.
  for item in select player_id from game_private.responses where round_id=r.id and zombie_round is not null and choice is null order by random() loop
    select h.player_id into free_human from game_private.responses h where h.round_id=r.id and h.zombie_round is null
      and not exists(select 1 from game_private.responses z where z.round_id=r.id and z.choice=h.player_id::text)
      order by random() limit 1;
    exit when free_human is null;
    update game_private.responses set choice=free_human::text where round_id=r.id and player_id=item.player_id;
  end loop;
  update game_private.responses h set zombie_round=r.zombie_step,bitten_by=z.player_id
    from game_private.responses z where h.round_id=r.id and z.round_id=r.id and z.choice=h.player_id::text and h.zombie_round is null;
  update game_private.responses set choice=null where round_id=r.id;
  update game_private.rounds set zombie_step=zombie_step+1,started_at=clock_timestamp() where id=r.id;
  perform game_private.zombie_finish(r.id);
end;
$$;

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
  if method='zombie' then
    -- The first zombie 3, bitten in bite round n gets n, survivors one more than the last bite round. Every zombie drinks.
    -- Started at all: a round skipped before the first zombie was drawn gives nothing.
    if r.zombie_step is not null then
      update game_private.responses set
        points=case when zombie_round=0 then 3 when zombie_round is not null then zombie_round else r.zombie_step end,
        drinks=zombie_round is not null
        where round_id=r.id;
    end if;
  elsif method='rps' then
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
      update game_private.responses set points=game_private.completion_points(cardinality(r.declined)) where round_id=r.id and player_id=r.performer_id;
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
      update game_private.responses set points=game_private.completion_points(cardinality(r.declined)) where round_id=r.id and player_id=r.performer_id;
      update game_private.players set completed=true where id=r.performer_id;
    end if;
  end if;
  update game_private.players p set score=p.score+q.points from game_private.responses q where q.round_id=r.id and q.player_id=p.id;
  update game_private.rounds set awarded=true where id=r.id;
end;
$$;

create or replace function public.game_state(p_session uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s game_private.sessions; me game_private.players; r game_private.rounds; revealed boolean; task jsonb; seconds_left numeric;
  my_zombie boolean;
begin
  select * into s from game_private.sessions where id=p_session and expires_at>now();
  select * into me from game_private.players where session_id=p_session and user_id=auth.uid();
  if s.id is null or me.id is null then raise exception 'Spillet finnes ikke eller har utløpt.'; end if;
  select * into r from game_private.rounds where id=s.round_id;
  select definition into task from game_private.tasks where id=r.task_id;
  revealed:=r.phase in ('reveal','leaderboard','sips');
  seconds_left:=case when r.started_at is null or task->'answer'->>'method' not in ('words','mime','zombie') then null
    -- Zombie: the phones count down 15 seconds per bite round; the server allows 16.
    when task->'answer'->>'method'='zombie' then case when r.phase='performing' and r.zombie_step is not null
      then greatest(0,15-extract(epoch from clock_timestamp()-r.started_at)) else null end
    else greatest(0,(task->'answer'->>'timeout')::numeric-extract(epoch from clock_timestamp()-r.started_at)) end;
  -- Zombie: only zombies see which humans the other zombies have picked.
  my_zombie:=exists(select 1 from game_private.responses where round_id=r.id and player_id=me.id and zombie_round is not null);
  return jsonb_build_object(
    'id',s.id,'code',s.code,'hostId',s.host_id,'hostPlays',s.host_plays,'meId',me.id,'status',s.status,'expiresAt',s.expires_at,
    'playerSips',s.player_sips,'gameSips',s.game_sips,
    'selectedTasks',case when me.id=s.host_id then to_jsonb(s.task_order) else null end,
    'taskCount',case when s.status='lobby' then cardinality(game_private.plan_tasks(s.task_order,
      (select count(*)::integer from game_private.players where session_id=s.id and not spectator))) else cardinality(s.task_order) end,
    'players',(select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'score',p.score,'completed',p.completed,'spectator',p.spectator) order by p.joined_at,p.id)
      from game_private.players p where p.session_id=s.id),
    'round',case when r.id is null then null else jsonb_build_object(
      'id',r.id,'number',r.number,'taskId',r.task_id,'task',task,'phase',r.phase,'performerId',r.performer_id,
      'accepted',r.accepted,'transferred',r.transferred,'transfers',cardinality(r.declined),'awarded',r.awarded,
      'zombieStep',r.zombie_step,
      -- Server-side countdown, so every phone shows the same time left.
      'secondsLeft',seconds_left,
      -- Mim det: the word for the performer and after the reveal; the hints at 60 and 30 seconds left.
      'word',case when revealed or me.id=r.performer_id then r.word else null end,
      'wordLength',case when r.word is not null and (revealed or seconds_left<=60) then char_length(game_private.normalize_word(r.word)) else null end,
      'wlQuestions',r.wl_questions,'wlStep',r.wl_step,'wlShown',r.wl_shown,
      'firstLetter',case when r.word is not null and (revealed or seconds_left<=30) then upper(left(game_private.normalize_word(r.word),1)) else null end,
      'topWords',case when revealed then r.top_words else null end,
      'actual',case when revealed or me.id=r.performer_id then r.actual else null end,
      'responses',(select jsonb_agg(jsonb_build_object('playerId',q.player_id,
        -- A playing host only sees who has answered after answering themselves.
        'submitted',case when not me.spectator and s.host_id=me.id and r.phase='guessing' and me.id is distinct from r.performer_id
          and not exists(select 1 from game_private.responses own where own.round_id=r.id and own.player_id=me.id and own.guess is not null)
          and q.player_id<>me.id then false when task->>'kind'='challenge' then q.guess is not null else q.finished end,
        'guess',case when revealed or q.player_id=me.id then q.guess else null end,
        'actual',case when revealed or (q.player_id=me.id and task->>'kind'='challenge') then q.actual else null end,
        'startedAt',case when q.player_id=me.id then q.started_at else null end,
        'choice',case when revealed or q.player_id=me.id or (my_zombie and task->'answer'->>'method'='zombie') then q.choice else null end,
        'zombieRound',q.zombie_round,'bittenBy',q.bitten_by,
        'words',case when revealed or q.player_id=me.id then to_jsonb(q.words) else null end,
        -- Samme bølgelengde: others see '?' for an answer to the current question until its result is shown.
        'answers',case when q.answers is null then null when revealed or q.player_id=me.id then to_jsonb(q.answers)
          else (select jsonb_agg(case when u.i-1<r.wl_step or (u.i-1=r.wl_step and r.wl_shown) then to_jsonb(u.a)
            when u.a is not null then '"?"'::jsonb else 'null'::jsonb end order by u.i) from unnest(q.answers) with ordinality u(a,i)) end,
        'opponentId',q.opponent_id,
        'botChoice',case when revealed then q.bot_choice else null end,
        'tieChoice',q.tie_choice,
        'drinks',case when revealed and s.game_sips then q.drinks else false end,
        'finished',q.finished,'points',case when revealed then q.points else 0 end,
        'rank',case when revealed then q.rank else null end)) from game_private.responses q where q.round_id=r.id),
      'winners',case when revealed and s.player_sips then (select coalesce(jsonb_agg(w.player_id),'[]'::jsonb) from game_private.winners(r.id) w) else '[]'::jsonb end,
      'allocations',(select coalesce(jsonb_agg(jsonb_build_object('giverId',a.giver_id,'recipientId',a.recipient_id)),'[]'::jsonb)
        from game_private.allocations a where a.round_id=r.id)
    ) end
  );
end;
$$;

create or replace function public.game_action(p_session uuid,p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s game_private.sessions; me game_private.players; r game_private.rounds; response game_private.responses; opponent game_private.responses;
  target uuid; value numeric; elapsed numeric; host boolean; phases text[]; phase_index integer; task jsonb; is_challenge boolean;
  method text; picked text; machine text; picked_words text[]; mime_word text; fasit text[]; selected text[]; selected_order text[]; shuffle_attempt integer;
begin
  select * into s from game_private.sessions where id=p_session and expires_at>now() for update;
  select * into me from game_private.players where session_id=p_session and user_id=auth.uid();
  if s.id is null or me.id is null then raise exception 'Spillet finnes ikke eller har utløpt.'; end if;
  host:=s.host_id=me.id;
  select * into r from game_private.rounds where id=s.round_id;
  select definition into task from game_private.tasks where id=r.task_id;
  is_challenge:=task->>'kind'='challenge';
  method:=task->'answer'->>'method';
  if p_action in ('start','next','back','end','host_plays','spectator','settings','skip_round') and not host then raise exception 'Bare verten kan styre spillet.'; end if;
  if p_action='start' then
    if s.status<>'lobby' then raise exception 'Spillet har allerede startet.'; end if;
    if (select count(*) from game_private.players where session_id=s.id and not spectator)<2 then
      raise exception 'Dere må være minst to spillere.'; end if;
    update game_private.sessions set task_order=game_private.plan_tasks(s.task_order,
      (select count(*)::integer from game_private.players where session_id=s.id and not spectator)) where id=s.id;
    perform game_private.next_round(s.id);
  elsif p_action='host_plays' then
    if s.status<>'lobby' then raise exception 'Dette kan bare endres før spillet starter.'; end if;
    if jsonb_typeof(p_payload->'value') is distinct from 'boolean' then raise exception 'Ugyldig valg.'; end if;
    update game_private.sessions set host_plays=(p_payload->>'value')::boolean where id=s.id;
    update game_private.players set spectator=not (p_payload->>'value')::boolean where id=s.host_id;
  elsif p_action='spectator' then
    if s.status<>'lobby' then raise exception 'Dette kan bare endres før spillet starter.'; end if;
    if jsonb_typeof(p_payload->'value') is distinct from 'boolean' then raise exception 'Ugyldig valg.'; end if;
    target:=(p_payload->>'playerId')::uuid;
    if not exists(select 1 from game_private.players where id=target and session_id=s.id) then raise exception 'Spilleren finnes ikke.'; end if;
    update game_private.players set spectator=(p_payload->>'value')::boolean where id=target;
    if target=s.host_id then update game_private.sessions set host_plays=not (p_payload->>'value')::boolean where id=s.id; end if;
  elsif p_action='settings' then
    if s.status<>'lobby' then raise exception 'Dette kan bare endres før spillet starter.'; end if;
    if p_payload ? 'playerSips' then
      if jsonb_typeof(p_payload->'playerSips') is distinct from 'boolean' then raise exception 'Ugyldig valg.'; end if;
      update game_private.sessions set player_sips=(p_payload->>'playerSips')::boolean where id=s.id;
    end if;
    if p_payload ? 'gameSips' then
      if jsonb_typeof(p_payload->'gameSips') is distinct from 'boolean' then raise exception 'Ugyldig valg.'; end if;
      update game_private.sessions set game_sips=(p_payload->>'gameSips')::boolean where id=s.id;
    end if;
    if p_payload ? 'tasks' then
      if jsonb_typeof(p_payload->'tasks') is distinct from 'array' then raise exception 'Ugyldig oppgaveliste.'; end if;
      select coalesce(array_agg(x), '{}') into selected from jsonb_array_elements_text(p_payload->'tasks') x;
      if cardinality(selected)=0 or exists(select 1 from unnest(selected) x left join game_private.tasks t on t.id=x
        group by x,t.definition having t.definition is null or count(*)>coalesce((t.definition->>'repeat')::integer,1)) then
        raise exception 'Velg minst én oppgave, og ikke flere forekomster enn tilgjengelig.';
      end if;
      for shuffle_attempt in 1..50 loop
        selected_order:=array(select x from unnest(selected) x order by random());
        exit when not exists(select 1 from generate_subscripts(selected_order,1) i where i>1 and selected_order[i]=selected_order[i-1]);
      end loop;
      update game_private.sessions set task_order=selected_order where id=s.id;
    end if;
  elsif p_action='end' then
    update game_private.sessions set status='finished' where id=s.id;
  else
    if s.status<>'playing' or r.id is null then raise exception 'Spillet er ikke i gang.'; end if;
    if p_payload->>'roundId' is distinct from r.id::text then raise exception 'Runden er endret. Prøv igjen.'; end if;
    if p_action in ('next','back','skip_round') and p_payload->>'phase' is distinct from r.phase then raise exception 'Steget er endret. Prøv igjen.'; end if;
    select * into response from game_private.responses where round_id=r.id and player_id=me.id;
    if p_action in ('guess','timer_start','timer_stop','choose','words','mime_guess','wl_answer','bite') and response.player_id is null then raise exception 'Du deltar ikke i denne runden.'; end if;
    if p_action='skip_round' then
      -- Discard unawarded work. Points already revealed are retained.
      perform game_private.next_round(s.id);
    elsif p_action='accept' then
      if r.phase<>'assignment' or r.awarded or r.accepted or me.id is distinct from r.performer_id then raise exception 'Du kan ikke ta denne oppgaven nå.'; end if;
      update game_private.rounds set accepted=true where id=r.id;
    elsif p_action='decline' then
      if r.phase<>'assignment' or r.awarded or r.accepted or me.id is distinct from r.performer_id then raise exception 'Du kan ikke sende denne oppgaven videre nå.'; end if;
      select id into target from game_private.players where session_id=s.id and not completed
        and id<>me.id and not(id=any(r.declined)) and not spectator order by random() limit 1;
      if target is null then raise exception 'Ingen andre kan ta oppgaven. Verten kan hoppe over den.'; end if;
      update game_private.rounds set performer_id=target,transferred=true,declined=array_append(declined,me.id) where id=r.id;
    elsif p_action='guess' then
      if r.phase<>'guessing' or r.awarded or me.id=r.performer_id or response.guess is not null then raise exception 'Du kan ikke svare nå.'; end if;
      value:=(p_payload->>'value')::numeric;
      if value is null or value<(task->'answer'->>'min')::numeric or value>(task->'answer'->>'max')::numeric or value='NaN'::numeric then raise exception 'Svaret er utenfor oppgavens grenser.'; end if;
      update game_private.responses set guess=round(value,1) where round_id=r.id and player_id=me.id;
    elsif p_action='timer_start' then
      if r.phase<>'performing' or r.awarded or response.started_at is not null or response.finished then raise exception 'Timeren kan ikke startes nå.'; end if;
      if method<>'stopwatch' then raise exception 'Denne oppgaven bruker ikke stoppeklokke.'; end if;
      if is_challenge and me.id is distinct from r.performer_id then raise exception 'Bare den som har oppgaven kan ta tiden.'; end if;
      update game_private.responses set started_at=clock_timestamp() where round_id=r.id and player_id=me.id;
    elsif p_action='timer_stop' then
      if r.phase<>'performing' or r.awarded or response.started_at is null or response.finished then raise exception 'Timeren kan ikke stoppes nå.'; end if;
      if method<>'stopwatch' then raise exception 'Denne oppgaven bruker ikke stoppeklokke.'; end if;
      if is_challenge and me.id is distinct from r.performer_id then raise exception 'Bare den som har oppgaven kan ta tiden.'; end if;
      elapsed:=greatest(0,extract(epoch from clock_timestamp()-response.started_at));
      value:=(p_payload->>'value')::numeric;
      if value is null or value<0 or value='NaN'::numeric or value>elapsed+3 then raise exception 'Tiden kunne ikke bekreftes. Prøv igjen.'; end if;
      if not is_challenge then value:=case when elapsed>=(task->'answer'->>'timeout')::numeric+3 or value>=(task->'answer'->>'timeout')::numeric then (task->'answer'->>'timeout')::numeric else value end; end if;
      value:=round(value,2);
      update game_private.responses set actual=value,finished=true where round_id=r.id and player_id=me.id;
      if is_challenge then update game_private.rounds set actual=value where id=r.id; end if;
    elsif p_action='manual_result' then
      if r.phase<>'performing' or r.awarded or r.actual is not null or method<>'manual' or not is_challenge then raise exception 'Du kan ikke oppgi fasit nå.'; end if;
      if task->'answer'->>'enteredBy'='host' then
        if not host then raise exception 'Bare verten kan oppgi fasit.'; end if;
      elsif me.id is distinct from r.performer_id then raise exception 'Bare den som har oppgaven kan oppgi fasit.';
      end if;
      value:=(p_payload->>'value')::numeric;
      if value is null or value<0 or value='NaN'::numeric or value='Infinity'::numeric then raise exception 'Oppgi en gyldig verdi.'; end if;
      update game_private.rounds set actual=value where id=r.id;
      update game_private.responses set actual=value,finished=true where round_id=r.id and player_id=r.performer_id;
    elsif p_action='choose' then
      if r.phase<>'performing' or r.awarded or method not in ('rps','choice','highest') then raise exception 'Du kan ikke velge nå.'; end if;
      if response.choice is not null then raise exception 'Du har allerede valgt.'; end if;
      picked:=p_payload->>'value';
      if method='choice' then
        if picked is null or picked not in ('0','1') then raise exception 'Ugyldig valg.'; end if;
        update game_private.responses set choice=picked,finished=true where round_id=r.id and player_id=me.id;
      elsif method='highest' then
        if picked is null or picked !~ '^[0-9]{1,3}$' or picked::integer<(task->'answer'->>'min')::integer
          or picked::integer>(task->'answer'->>'max')::integer then raise exception 'Ugyldig tall.'; end if;
        update game_private.responses set choice=picked::integer::text,finished=true where round_id=r.id and player_id=me.id;
      else
        if picked is null or picked not in ('rock','paper','scissors') then raise exception 'Ugyldig valg.'; end if;
        if response.opponent_id is null then
          machine:=(array['rock','paper','scissors'])[1+floor(random()*3)::integer];
          if machine=picked then
            update game_private.responses set tie_choice=picked where round_id=r.id and player_id=me.id;
          else
            update game_private.responses set choice=picked,bot_choice=machine,tie_choice=null,finished=true where round_id=r.id and player_id=me.id;
          end if;
        else
          select * into opponent from game_private.responses where round_id=r.id and player_id=response.opponent_id;
          if opponent.choice=picked then
            -- Same hand: both choose again.
            update game_private.responses set choice=null,tie_choice=picked,finished=false where round_id=r.id and player_id in (me.id,opponent.player_id);
          else
            update game_private.responses set choice=picked,tie_choice=null,finished=true where round_id=r.id and player_id=me.id;
          end if;
        end if;
      end if;
    elsif p_action='words' then
      if r.phase<>'performing' or r.awarded or method<>'words' then raise exception 'Du kan ikke sende ord nå.'; end if;
      -- A few seconds of grace for the automatic send when the countdown ends.
      if r.started_at is null or clock_timestamp()>r.started_at+((task->'answer'->>'timeout')::numeric+3)*interval '1 second' then
        raise exception 'Tiden er ute.'; end if;
      if jsonb_typeof(p_payload->'value') is distinct from 'array' or jsonb_array_length(p_payload->'value')>(task->'answer'->>'words')::integer then
        raise exception 'Du kan skrive inntil % ord.',task->'answer'->>'words'; end if;
      select array_agg(distinct w) into picked_words from (select game_private.normalize_word(x) as w from jsonb_array_elements_text(p_payload->'value') x) s where w<>'';
      picked_words:=coalesce(picked_words,'{}');
      update game_private.responses set words=picked_words,finished=cardinality(picked_words)>0 where round_id=r.id and player_id=me.id;
    elsif p_action in ('mime_word','mime_start') then
      if r.phase<>'performing' or r.awarded or method<>'mime' or me.id is distinct from r.performer_id then raise exception 'Bare den som mimer kan gjøre dette nå.'; end if;
      if r.started_at is not null then raise exception 'Mimingen er allerede i gang.'; end if;
      if p_action='mime_word' then
        mime_word:=trim(coalesce(p_payload->>'value',''));
        if mime_word ~ '\s' then raise exception 'Bare ett ord, uten mellomrom.'; end if;
        if game_private.normalize_word(mime_word)='' or char_length(mime_word)>24 then raise exception 'Skriv ett ord på 1–24 tegn.'; end if;
        update game_private.rounds set word=mime_word where id=r.id;
      else
        if r.word is null then raise exception 'Velg et ord først.'; end if;
        update game_private.rounds set started_at=clock_timestamp() where id=r.id;
        update game_private.responses set finished=true where round_id=r.id and player_id=me.id;
      end if;
    elsif p_action='mime_guess' then
      if r.phase<>'performing' or r.awarded or method<>'mime' or me.id=r.performer_id or r.started_at is null then raise exception 'Du kan ikke gjette nå.'; end if;
      if response.finished then raise exception 'Du har allerede gjettet riktig.'; end if;
      elapsed:=extract(epoch from clock_timestamp()-r.started_at);
      -- One second of grace for network delay.
      if elapsed>(task->'answer'->>'timeout')::numeric+1 then raise exception 'Tiden er ute.'; end if;
      picked:=coalesce(p_payload->>'value','');
      if picked ~ '\s' then raise exception 'Svaret er ett ord, uten mellomrom.'; end if;
      if game_private.normalize_word(picked)='' then raise exception 'Skriv et ord.'; end if;
      if game_private.mime_match(game_private.normalize_word(picked),game_private.normalize_word(r.word)) then
        update game_private.responses set actual=round(least(elapsed,(task->'answer'->>'timeout')::numeric),2),finished=true
          where round_id=r.id and player_id=me.id;
      end if;
    elsif p_action='wl_answer' then
      if r.phase<>'performing' or r.awarded or method<>'wavelength' then raise exception 'Du kan ikke svare nå.'; end if;
      if r.wl_shown then raise exception 'Vent på neste spørsmål.'; end if;
      select answers into fasit from game_private.responses where round_id=r.id and player_id=r.performer_id;
      if me.id is distinct from r.performer_id and game_private.wl_streak(response.answers,fasit,r.wl_step)<r.wl_step then
        raise exception 'Du er ute av denne runden.'; end if;
      if response.answers[r.wl_step+1] is not null then raise exception 'Du har allerede svart.'; end if;
      picked:=p_payload->>'value';
      if picked is null or picked not in ('0','1') then raise exception 'Ugyldig valg.'; end if;
      update game_private.responses set answers[r.wl_step+1]=picked where round_id=r.id and player_id=me.id;
      -- The result is shown as soon as the performer and everyone still in have answered.
      perform game_private.wl_check(r.id);
    elsif p_action in ('wl_reveal','wl_next') then
      if not host then raise exception 'Bare verten kan styre spørsmålene.'; end if;
      if r.phase<>'performing' or r.awarded or method<>'wavelength' then raise exception 'Du kan ikke gjøre dette nå.'; end if;
      if p_payload->>'step' is distinct from r.wl_step::text then raise exception 'Spørsmålet er endret. Prøv igjen.'; end if;
      if p_action='wl_reveal' then
        if r.wl_shown then raise exception 'Svaret vises allerede.'; end if;
        if (select answers[r.wl_step+1] from game_private.responses where round_id=r.id and player_id=r.performer_id) is null then
          raise exception 'Venter på svaret til den som er trukket ut.'; end if;
        update game_private.rounds set wl_shown=true where id=r.id;
      else
        if not r.wl_shown then raise exception 'Vis svaret først.'; end if;
        if game_private.wl_done(r.id) then raise exception 'Runden er ferdig. Gå videre til fasiten.'; end if;
        update game_private.rounds set wl_step=wl_step+1,wl_shown=false where id=r.id;
      end if;
    elsif p_action='bite' then
      if r.phase<>'performing' or r.awarded or method<>'zombie' or r.zombie_step is null then raise exception 'Du kan ikke bite nå.'; end if;
      if response.zombie_round is null then raise exception 'Bare zombier kan bite.'; end if;
      -- After the time is up the round resolves with a random bite instead.
      if clock_timestamp()<r.started_at+interval '16 seconds' then
        if response.choice is not null then raise exception 'Du har allerede valgt.'; end if;
        target:=(p_payload->>'targetId')::uuid;
        if target is null or not exists(select 1 from game_private.responses where round_id=r.id and player_id=target and zombie_round is null) then
          raise exception 'Denne spilleren kan ikke bites.'; end if;
        if exists(select 1 from game_private.responses where round_id=r.id and choice=target::text) then
          raise exception 'En annen zombie har allerede valgt denne spilleren.'; end if;
        update game_private.responses set choice=target::text where round_id=r.id and player_id=me.id;
      end if;
      perform game_private.zombie_resolve(r.id);
    elsif p_action='zombie_tick' then
      -- Sent by the phones when the countdown runs out. Does nothing before the time is up.
      if method='zombie' then perform game_private.zombie_resolve(r.id); end if;
    elsif p_action='allocate' then
      if not s.player_sips or task->>'sips'='losers' or r.phase<>'sips' or not exists(select 1 from game_private.winners(r.id) where player_id=me.id) then raise exception 'Du kan ikke dele ut slurker nå.'; end if;
      target:=(p_payload->>'recipientId')::uuid;
      if target is null or not exists(select 1 from game_private.players where session_id=s.id and id=target)
        or exists(select 1 from game_private.players where id=target and spectator)
        or exists(select 1 from game_private.winners(r.id) where player_id=target) then raise exception 'Denne spilleren kan ikke få slurker.'; end if;
      begin
        insert into game_private.allocations(round_id,giver_id,recipient_id) values(r.id,me.id,target);
      exception when unique_violation then raise exception 'Slurkene er allerede delt ut, eller noen valgte spilleren først.'; end;
    elsif p_action in ('next','back') then
      -- Mim det and Samme bølgelengde have no separate guessing step: the others guess while the performer mimes.
      phases:=case when is_challenge and method not in ('mime','wavelength') then array['assignment','guessing','performing','reveal','sips']
        else array['assignment','performing','reveal','sips'] end;
      if (case when task->>'sips'='losers' then not s.game_sips else not s.player_sips end) then
        phases:=array_remove(phases,'sips');
      end if;
      -- A round still at the old leaderboard step counts as finished.
      phase_index:=coalesce(array_position(phases,r.phase),cardinality(phases)+1);
      if p_action='back' then
        if phase_index<=1 then raise exception 'Dette er første steg i runden.'; end if;
        update game_private.rounds set phase=phases[phase_index-1] where id=r.id;
      elsif r.phase='assignment' and not r.accepted then
        perform game_private.award_round(r.id);
        perform game_private.next_round(s.id);
      elsif phase_index>=cardinality(phases) then
        perform game_private.next_round(s.id);
      else
        -- Mim det starts its countdown when the performer presses start.
        if phases[phase_index+1]='performing' and method<>'mime' then
          update game_private.rounds set started_at=coalesce(started_at,clock_timestamp()) where id=r.id;
        end if;
        if phases[phase_index+1]='reveal' then
          update game_private.responses set actual=(task->'answer'->>'timeout')::numeric,finished=true where round_id=r.id and started_at is not null and not finished
            and not is_challenge and clock_timestamp()-started_at>=((task->'answer'->>'timeout')::numeric * interval '1 second');
          perform game_private.award_round(r.id);
        end if;
        update game_private.rounds set phase=phases[phase_index+1] where id=r.id;
        -- Zombie: the first zombie is drawn as the step starts (and the game may already be over with two players).
        if method='zombie' and phases[phase_index+1]='performing' then perform game_private.zombie_start(r.id); end if;
      end if;
    else raise exception 'Ukjent handling.';
    end if;
  end if;
  update public.session_updates set version=version+1 where session_id=s.id;
  return public.game_state(s.id);
end;
$$;

revoke execute on function game_private.completion_points(integer),game_private.zombie_start(uuid),
  game_private.zombie_finish(uuid),game_private.zombie_resolve(uuid),game_private.shuffled_tasks() from public, anon, authenticated;
