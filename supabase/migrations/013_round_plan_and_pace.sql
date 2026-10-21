-- Fixed round plan, participant-scaled sip givers, and final standings only at game end.
-- Run after 012. Builds on the host settings in 012: players are counted without spectators,
-- and the last step of a round (sips, or the reveal when sips are turned off) starts the next round.
-- Existing games retain their plan; new starts cap challenge slots.

create function game_private.plan_tasks(p_order text[],p_players integer) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(task order by position),'{}'::text[]) from (
    select o.task,o.position,t.definition->>'kind' as kind,
      count(*) filter (where t.definition->>'kind'='challenge') over(order by o.position) as challenge_number
    from unnest(p_order) with ordinality o(task,position) join game_private.tasks t on t.id=o.task
  ) planned where kind='everyone' or challenge_number<=p_players;
$$;

create or replace function game_private.winners(p_round uuid) returns table(player_id uuid)
language sql stable security definer set search_path = '' as $$
  select q.player_id from game_private.responses q
    join game_private.players p on p.id=q.player_id
    join game_private.rounds r on r.id=q.round_id
    join game_private.tasks t on t.id=r.task_id
    where q.round_id=p_round and q.points>0 and coalesce(t.definition->>'sips','allocate')='allocate'
    order by q.points desc,p.joined_at,p.id
    limit (select case when count(*)<3 then 0 when count(*)<5 then 1 when count(*)<7 then 2 else 3 end
      from game_private.responses where round_id=p_round);
$$;

create or replace function public.game_state(p_session uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s game_private.sessions; me game_private.players; r game_private.rounds; revealed boolean; task jsonb; seconds_left numeric;
begin
  select * into s from game_private.sessions where id=p_session and expires_at>now();
  select * into me from game_private.players where session_id=p_session and user_id=auth.uid();
  if s.id is null or me.id is null then raise exception 'Spillet finnes ikke eller har utløpt.'; end if;
  select * into r from game_private.rounds where id=s.round_id;
  select definition into task from game_private.tasks where id=r.task_id;
  revealed:=r.phase in ('reveal','leaderboard','sips');
  seconds_left:=case when r.started_at is null or task->'answer'->>'method' not in ('words','mime') then null
    else greatest(0,(task->'answer'->>'timeout')::numeric-extract(epoch from clock_timestamp()-r.started_at)) end;
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
      'accepted',r.accepted,'transferred',r.transferred,'awarded',r.awarded,
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
        'choice',case when revealed or q.player_id=me.id then q.choice else null end,
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
    if p_action in ('guess','timer_start','timer_stop','choose','words','mime_guess','wl_answer') and response.player_id is null then raise exception 'Du deltar ikke i denne runden.'; end if;
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
      end if;
    else raise exception 'Ukjent handling.';
    end if;
  end if;
  update public.session_updates set version=version+1 where session_id=s.id;
  return public.game_state(s.id);
end;
$$;
