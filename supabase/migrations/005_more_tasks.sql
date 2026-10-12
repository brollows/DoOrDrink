-- More tasks, random task order and two new task types.
--
-- Task kinds:
--   challenge: one player is picked and the others guess. Each player does at most one challenge,
--              so challenges stop once every player has completed one.
--   everyone:  everybody plays. These never run out because of completed players.
--
-- Task definition fields (in addition to id/title/description/kind/answer):
--   sips:          'allocate' (default, the round's top three hand out sips)
--                  or 'losers' (losers drink automatically, nobody hands out sips)
--   question:      shown to the performer of a manual challenge
--   guessQuestion: shown to guessers, {name} is replaced with the performer's name
--   options:       the two alternatives of a 'choice' task
--   answer.method: 'stopwatch' | 'manual' | 'rps' (rock, paper, scissors) | 'choice' (would you rather)
--   answer.step:   slider step for guesses (default 0.1)

alter table game_private.responses
  add column choice text,
  add column opponent_id uuid,
  add column bot_choice text,
  add column tie_choice text,
  add column drinks boolean not null default false;

update game_private.tasks set definition=jsonb_set(definition,'{kind}','"challenge"') where definition->>'kind'='individual';
update game_private.tasks set definition=definition||'{"guessQuestion":"Hvor mange sekunder bruker {name} på å drikke ølen?"}' where id='beer';

insert into game_private.tasks(id,definition) values
('height','{"id":"height","title":"Kjenn kompisen","description":"Svar ærlig i appen, og ikke si svaret høyt. De andre gjetter.","question":"Hvor høy er du?","guessQuestion":"Hvor høy er {name}?","kind":"challenge","answer":{"method":"manual","enteredBy":"performer","unit":"cm","min":150,"max":250,"step":1}}'),
('rps','{"id":"rps","title":"Stein, saks, papir","description":"Alle får en tilfeldig motstander. Vinneren får 3 poeng, taperen tar 3 slurker.","kind":"everyone","sips":"losers","answer":{"method":"rps","unit":"","min":0,"max":0}}'),
('wyr_naked','{"id":"wyr_naked","title":"Ville du helst …","description":"Alle velger. De som havner i mindretall tar 3 slurker.","kind":"everyone","sips":"losers","options":["Hatt en kjæreste som gråter hver gang du kler av deg","Hatt en kjæreste som ler hver gang du kler av deg"],"answer":{"method":"choice","unit":"","min":0,"max":0}}'),
('wyr_honest','{"id":"wyr_honest","title":"Ville du helst …","description":"Alle velger. De som havner i mindretall tar 3 slurker.","kind":"everyone","sips":"losers","options":["Måttet si høyt alt du tenker resten av kvelden","Ikke fått si et eneste ord resten av kvelden"],"answer":{"method":"choice","unit":"","min":0,"max":0}}'),
('wyr_history','{"id":"wyr_history","title":"Ville du helst …","description":"Alle velger. De som havner i mindretall tar 3 slurker.","kind":"everyone","sips":"losers","options":["Fått nettleserhistorikken din vist på storskjerm","Fått alle meldingene dine lest høyt for familien"],"answer":{"method":"choice","unit":"","min":0,"max":0}}'),
('wyr_wake_up','{"id":"wyr_wake_up","title":"Ville du helst …","description":"Alle velger. De som havner i mindretall tar 3 slurker.","kind":"everyone","sips":"losers","options":["Våknet ved siden av eksen din","Våknet ved siden av sjefen din"],"answer":{"method":"choice","unit":"","min":0,"max":0}}'),
('wyr_beer','{"id":"wyr_beer","title":"Ville du helst …","description":"Alle velger. De som havner i mindretall tar 3 slurker.","kind":"everyone","sips":"losers","options":["Bare drukket lunken øl resten av livet","Aldri drukket alkohol igjen"],"answer":{"method":"choice","unit":"","min":0,"max":0}}');

create function game_private.beats(a text,b text) returns boolean
language sql immutable set search_path = '' as $$
  select (a,b) in (('rock','scissors'),('scissors','paper'),('paper','rock'));
$$;

-- Only 'allocate' tasks have sip givers.
create or replace function game_private.winners(p_round uuid) returns table(player_id uuid)
language sql stable security definer set search_path = '' as $$
  select q.player_id from game_private.responses q
    join game_private.players p on p.id=q.player_id
    join game_private.rounds r on r.id=q.round_id
    join game_private.tasks t on t.id=r.task_id
    where q.round_id=p_round and q.points>0 and coalesce(t.definition->>'sips','allocate')='allocate'
    order by q.points desc,p.joined_at,p.id limit 3;
$$;

create or replace function public.create_game(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s game_private.sessions; pid uuid; attempts integer:=0;
begin
  if auth.uid() is null then raise exception 'Du må koble til først.'; end if;
  if char_length(trim(p_name)) not between 1 and 24 then raise exception 'Navnet må ha 1–24 tegn.'; end if;
  if (select count(*) from game_private.sessions active join game_private.players p on p.id=active.host_id
      where p.user_id=auth.uid() and active.expires_at>now())>=5 then raise exception 'Du har allerede fem aktive spill.'; end if;
  loop
    begin
      -- Every game gets all tasks in a random order.
      insert into game_private.sessions(code,host_id,task_order)
        values(lpad(floor(random()*1000000)::text,6,'0'),gen_random_uuid(),
          (select array_agg(id order by random()) from game_private.tasks)) returning * into s;
      exit;
    exception when unique_violation then
      attempts:=attempts+1; if attempts>20 then raise exception 'Kunne ikke lage spillkode. Prøv igjen.'; end if;
    end;
  end loop;
  insert into game_private.players(session_id,user_id,name) values(s.id,auth.uid(),trim(p_name)) returning id into pid;
  update game_private.sessions set host_id=pid where id=s.id;
  insert into public.session_updates(session_id) values(s.id);
  return public.game_state(s.id);
end;
$$;

create or replace function game_private.next_round(p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s game_private.sessions; t text; performer uuid; n integer; task jsonb; ids uuid[]; i integer;
begin
  select * into s from game_private.sessions where id=p_session;
  -- The next unused task; challenges only while someone still has their challenge left.
  select o.task into t from unnest(s.task_order) with ordinality as o(task,position)
    join game_private.tasks d on d.id=o.task
    where not exists(select 1 from game_private.rounds r where r.session_id=s.id and r.task_id=o.task)
      and (d.definition->>'kind'='everyone' or exists(select 1 from game_private.players p
        where p.session_id=s.id and not p.completed and (s.host_plays or p.id<>s.host_id)))
    order by o.position limit 1;
  if t is null then
    update game_private.sessions set status='finished' where id=s.id;
    return;
  end if;
  select definition into task from game_private.tasks where id=t;
  if task->>'kind'='challenge' then
    select id into performer from game_private.players where session_id=s.id and not completed
      and (s.host_plays or id<>s.host_id) order by random() limit 1;
  end if;
  select count(*)+1 into n from game_private.rounds where session_id=s.id;
  insert into game_private.rounds(session_id,number,task_id,performer_id,accepted)
    values(s.id,n,t,performer,task->>'kind'='everyone') returning id into s.round_id;
  update game_private.sessions set status='playing',round_id=s.round_id where id=s.id;
  insert into game_private.responses(round_id,player_id) select s.round_id,id from game_private.players
    where session_id=s.id and (s.host_plays or id<>s.host_id);
  if task->'answer'->>'method'='rps' then
    -- Random pairs. With an odd number of players the last one plays against the machine (opponent_id null).
    ids:=array(select id from game_private.players where session_id=s.id and (s.host_plays or id<>s.host_id) order by random());
    for i in 1..cardinality(ids)-1 by 2 loop
      update game_private.responses set opponent_id=ids[i+1] where round_id=s.round_id and player_id=ids[i];
      update game_private.responses set opponent_id=ids[i] where round_id=s.round_id and player_id=ids[i+1];
    end loop;
  end if;
end;
$$;

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
    -- The minority drinks; a tie means nobody does. Not answering always means drinking.
    select count(*) filter (where choice='0'),count(*) filter (where choice='1') into first_count,second_count
      from game_private.responses where round_id=r.id;
    minority:=case when first_count<second_count then '0' when second_count<first_count then '1' end;
    update game_private.responses set drinks=(choice is null or coalesce(choice=minority,false)) where round_id=r.id;
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

create or replace function public.game_state(p_session uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s game_private.sessions; me game_private.players; r game_private.rounds; revealed boolean; task jsonb;
begin
  select * into s from game_private.sessions where id=p_session and expires_at>now();
  select * into me from game_private.players where session_id=p_session and user_id=auth.uid();
  if s.id is null or me.id is null then raise exception 'Spillet finnes ikke eller har utløpt.'; end if;
  select * into r from game_private.rounds where id=s.round_id;
  select definition into task from game_private.tasks where id=r.task_id;
  revealed:=r.phase in ('reveal','leaderboard','sips');
  return jsonb_build_object(
    'id',s.id,'code',s.code,'hostId',s.host_id,'hostPlays',s.host_plays,'meId',me.id,'status',s.status,'expiresAt',s.expires_at,
    'taskCount',cardinality(s.task_order),
    'players',(select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'score',p.score,'completed',p.completed) order by p.joined_at,p.id)
      from game_private.players p where p.session_id=s.id),
    'round',case when r.id is null then null else jsonb_build_object(
      'id',r.id,'number',r.number,'taskId',r.task_id,'task',task,'phase',r.phase,'performerId',r.performer_id,
      'accepted',r.accepted,'transferred',r.transferred,'awarded',r.awarded,
      'actual',case when revealed or me.id=r.performer_id then r.actual else null end,
      'responses',(select jsonb_agg(jsonb_build_object('playerId',q.player_id,
        -- A playing host only sees who has answered after answering themselves.
        'submitted',case when s.host_plays and s.host_id=me.id and r.phase='guessing' and me.id is distinct from r.performer_id
          and not exists(select 1 from game_private.responses own where own.round_id=r.id and own.player_id=me.id and own.guess is not null)
          and q.player_id<>me.id then false when task->>'kind'='challenge' then q.guess is not null else q.finished end,
        'guess',case when revealed or q.player_id=me.id then q.guess else null end,
        'actual',case when revealed or (q.player_id=me.id and task->>'kind'='challenge') then q.actual else null end,
        'startedAt',case when q.player_id=me.id then q.started_at else null end,
        'choice',case when revealed or q.player_id=me.id then q.choice else null end,
        'opponentId',q.opponent_id,
        'botChoice',case when revealed then q.bot_choice else null end,
        'tieChoice',q.tie_choice,
        'drinks',case when revealed then q.drinks else false end,
        'finished',q.finished,'points',case when revealed then q.points else 0 end,
        'rank',case when revealed then q.rank else null end)) from game_private.responses q where q.round_id=r.id),
      'winners',case when revealed then (select coalesce(jsonb_agg(w.player_id),'[]'::jsonb) from game_private.winners(r.id) w) else '[]'::jsonb end,
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
  method text; picked text; machine text;
begin
  select * into s from game_private.sessions where id=p_session and expires_at>now() for update;
  select * into me from game_private.players where session_id=p_session and user_id=auth.uid();
  if s.id is null or me.id is null then raise exception 'Spillet finnes ikke eller har utløpt.'; end if;
  host:=s.host_id=me.id;
  select * into r from game_private.rounds where id=s.round_id;
  select definition into task from game_private.tasks where id=r.task_id;
  is_challenge:=task->>'kind'='challenge';
  method:=task->'answer'->>'method';
  if p_action in ('start','next','back','end','host_plays') and not host then raise exception 'Bare verten kan styre spillet.'; end if;
  if p_action='start' then
    if s.status<>'lobby' then raise exception 'Spillet har allerede startet.'; end if;
    if (select count(*) from game_private.players where session_id=s.id and (s.host_plays or id<>s.host_id))<2 then
      raise exception 'Dere må være minst to spillere.'; end if;
    perform game_private.next_round(s.id);
  elsif p_action='host_plays' then
    if s.status<>'lobby' then raise exception 'Dette kan bare endres før spillet starter.'; end if;
    if jsonb_typeof(p_payload->'value')<>'boolean' then raise exception 'Ugyldig valg.'; end if;
    update game_private.sessions set host_plays=(p_payload->>'value')::boolean where id=s.id;
  elsif p_action='end' then
    update game_private.sessions set status='finished' where id=s.id;
  else
    if s.status<>'playing' or r.id is null then raise exception 'Spillet er ikke i gang.'; end if;
    if p_payload->>'roundId' is distinct from r.id::text then raise exception 'Runden er endret. Prøv igjen.'; end if;
    if p_action in ('next','back') and p_payload->>'phase' is distinct from r.phase then raise exception 'Steget er endret. Prøv igjen.'; end if;
    select * into response from game_private.responses where round_id=r.id and player_id=me.id;
    if p_action in ('guess','timer_start','timer_stop','choose') and response.player_id is null then raise exception 'Du deltar ikke i denne runden.'; end if;
    if p_action='accept' then
      if r.phase<>'assignment' or r.awarded or r.accepted or me.id is distinct from r.performer_id then raise exception 'Du kan ikke ta denne oppgaven nå.'; end if;
      update game_private.rounds set accepted=true where id=r.id;
    elsif p_action='decline' then
      if r.phase<>'assignment' or r.awarded or r.accepted or me.id is distinct from r.performer_id then raise exception 'Du kan ikke sende denne oppgaven videre nå.'; end if;
      select id into target from game_private.players where session_id=s.id and not completed
        and id<>me.id and not(id=any(r.declined)) and (s.host_plays or id<>s.host_id) order by random() limit 1;
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
      if r.phase<>'performing' or r.awarded or method not in ('rps','choice') then raise exception 'Du kan ikke velge nå.'; end if;
      if response.choice is not null then raise exception 'Du har allerede valgt.'; end if;
      picked:=p_payload->>'value';
      if method='choice' then
        if picked is null or picked not in ('0','1') then raise exception 'Ugyldig valg.'; end if;
        update game_private.responses set choice=picked,finished=true where round_id=r.id and player_id=me.id;
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
    elsif p_action='allocate' then
      if r.phase<>'sips' or not exists(select 1 from game_private.winners(r.id) where player_id=me.id) then raise exception 'Du kan ikke dele ut slurker nå.'; end if;
      target:=(p_payload->>'recipientId')::uuid;
      if target is null or not exists(select 1 from game_private.players where session_id=s.id and id=target)
        or (not s.host_plays and target=s.host_id)
        or exists(select 1 from game_private.winners(r.id) where player_id=target) then raise exception 'Denne spilleren kan ikke få slurker.'; end if;
      begin
        insert into game_private.allocations(round_id,giver_id,recipient_id) values(r.id,me.id,target);
      exception when unique_violation then raise exception 'Slurkene er allerede delt ut, eller noen valgte spilleren først.'; end;
    elsif p_action in ('next','back') then
      phases:=case when is_challenge then array['assignment','guessing','performing','reveal','sips','leaderboard']
        else array['assignment','performing','reveal','sips','leaderboard'] end;
      phase_index:=array_position(phases,r.phase);
      if p_action='back' then
        if phase_index<=1 then raise exception 'Dette er første steg i runden.'; end if;
        update game_private.rounds set phase=phases[phase_index-1] where id=r.id;
      elsif r.phase='assignment' and not r.accepted then
        perform game_private.award_round(r.id);
        perform game_private.next_round(s.id);
      elsif r.phase='leaderboard' then
        perform game_private.next_round(s.id);
      else
        if phases[phase_index+1]='reveal' then
          update game_private.responses set actual=(task->'answer'->>'timeout')::numeric,finished=true where round_id=r.id and started_at is not null and not finished
            and not is_challenge and clock_timestamp()-started_at>=((task->'answer'->>'timeout')::numeric * interval '1 second');
          perform game_private.award_round(r.id);
        end if;
        update game_private.rounds set phase=phases[phase_index+1] where id=r.id;
      end if;
    else raise exception 'Ukjent handling.';
    end if;
  end if;
  update public.session_updates set version=version+1 where session_id=s.id;
  return public.game_state(s.id);
end;
$$;

revoke execute on function game_private.beats(text,text) from public, anon, authenticated;
