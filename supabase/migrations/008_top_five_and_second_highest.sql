-- Two new everyone-tasks.
--
-- Topp 5 (answer.method 'words'): everybody has answer.timeout seconds to write up to answer.words single words
-- for the theme in `question`. Words are compared without case, spaces and punctuation, and words one typo apart
-- (two for words of 7+ letters) count as the same. The five most written words (at least two writers) are shown
-- with who wrote them; every word a player has on the list gives 2 points. Sips: the round's top three hand out.
--
-- Nest mest (answer.method 'highest'): everybody picks a whole number. The highest number drinks `sipCount` sips
-- automatically; the others are ranked from the top with the usual position scoring, so the second highest wins.
--
-- New task field: sipCount (default 3) for tasks where losers drink automatically.

alter table game_private.rounds
  add column started_at timestamptz,
  add column top_words jsonb;
alter table game_private.responses add column words text[];

create function game_private.normalize_word(word text) returns text
language sql immutable set search_path = '' as $$
  select left(lower(regexp_replace(word,'[[:space:][:punct:]]','','g')),24);
$$;

create function game_private.edit_distance(a text,b text) returns integer
language plpgsql immutable set search_path = '' as $$
declare previous integer[]; current integer[]; i integer; j integer;
begin
  if a=b then return 0; end if;
  if char_length(a)=0 then return char_length(b); end if;
  if char_length(b)=0 then return char_length(a); end if;
  previous:=array(select generate_series(0,char_length(b)));
  for i in 1..char_length(a) loop
    current:=array[i];
    for j in 1..char_length(b) loop
      current:=current||least(previous[j+1]+1,current[j]+1,previous[j]+case when substr(a,i,1)=substr(b,j,1) then 0 else 1 end);
    end loop;
    previous:=current;
  end loop;
  return previous[char_length(b)+1];
end;
$$;

-- Same word, or a typo of it: one edit for words of 3+ letters, two for 7+ letters.
create function game_private.same_word(a text,b text) returns boolean
language sql immutable set search_path = '' as $$
  select a=b or (least(char_length(a),char_length(b))>=3
    and game_private.edit_distance(a,b)<=case when least(char_length(a),char_length(b))>=7 then 2 else 1 end);
$$;

insert into game_private.tasks(id,definition) values
('top5_sex','{"id":"top5_sex","title":"Topp 5: Sex","question":"Sex","description":"Skriv 3 ord du forbinder med temaet. Bare ett ord per felt. 2 poeng for hvert ord som havner på topp 5.","kind":"everyone","answer":{"method":"words","words":3,"timeout":60,"unit":"","min":0,"max":0}}'),
('top5_drunk','{"id":"top5_drunk","title":"Topp 5: Ord for å være full","question":"Ord for å være full","description":"Skriv 3 ord du forbinder med temaet. Bare ett ord per felt. 2 poeng for hvert ord som havner på topp 5.","kind":"everyone","answer":{"method":"words","words":3,"timeout":60,"unit":"","min":0,"max":0}}'),
('top5_vors','{"id":"top5_vors","title":"Topp 5: Vorspiel","question":"Ting man finner på et vorspiel","description":"Skriv 3 ord du forbinder med temaet. Bare ett ord per felt. 2 poeng for hvert ord som havner på topp 5.","kind":"everyone","answer":{"method":"words","words":3,"timeout":60,"unit":"","min":0,"max":0}}'),
('top5_food','{"id":"top5_food","title":"Topp 5: Fyllemat","question":"Fyllemat","description":"Skriv 3 ord du forbinder med temaet. Bare ett ord per felt. 2 poeng for hvert ord som havner på topp 5.","kind":"everyone","answer":{"method":"words","words":3,"timeout":60,"unit":"","min":0,"max":0}}'),
('top5_regret','{"id":"top5_regret","title":"Topp 5: Dagen derpå","question":"Ting man angrer på dagen derpå","description":"Skriv 3 ord du forbinder med temaet. Bare ett ord per felt. 2 poeng for hvert ord som havner på topp 5.","kind":"everyone","answer":{"method":"words","words":3,"timeout":60,"unit":"","min":0,"max":0}}'),
('second_highest','{"id":"second_highest","title":"Nest mest","description":"Velg et tall fra 0 til 100. Høyest taper og tar 5 slurker. Nest høyest vinner.","kind":"everyone","sips":"losers","sipCount":5,"answer":{"method":"highest","unit":"","min":0,"max":100,"step":1}}');

create or replace function game_private.award_round(p_round uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r game_private.rounds; participant_count integer; item record; points_value integer; task jsonb;
  is_challenge boolean; method text; first_count integer; second_count integer; minority text;
  reps text[]; map_words text[]; map_index integer[]; found integer; i integer; top jsonb; top_value numeric;
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
    select count(*) into participant_count from game_private.responses where round_id=r.id and not drinks;
    for item in select player_id,rank() over(order by choice::numeric desc) as place
      from game_private.responses where round_id=r.id and choice is not null and not drinks
    loop
      points_value := participant_count-item.place+1;
      if item.place<=2 and participant_count>=3 then points_value:=points_value+1; end if;
      if item.place=1 and participant_count>=2 then points_value:=points_value+2; end if;
      update game_private.responses set points=points_value,rank=item.place where round_id=r.id and player_id=item.player_id;
    end loop;
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
      -- Server-side countdown, so every phone shows the same time left.
      'secondsLeft',case when r.started_at is null or task->'answer'->>'method'<>'words' then null
        else greatest(0,(task->'answer'->>'timeout')::numeric-extract(epoch from clock_timestamp()-r.started_at)) end,
      'topWords',case when revealed then r.top_words else null end,
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
        'words',case when revealed or q.player_id=me.id then to_jsonb(q.words) else null end,
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
  method text; picked text; machine text; picked_words text[];
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
    if p_action in ('guess','timer_start','timer_stop','choose','words') and response.player_id is null then raise exception 'Du deltar ikke i denne runden.'; end if;
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
        if phases[phase_index+1]='performing' then
          update game_private.rounds set started_at=coalesce(started_at,clock_timestamp()) where id=r.id;
        end if;
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

revoke execute on function game_private.normalize_word(text),game_private.edit_distance(text,text),game_private.same_word(text,text)
  from public, anon, authenticated;
