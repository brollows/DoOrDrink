create schema if not exists game_private;
revoke all on schema game_private from public, anon, authenticated;

create table game_private.tasks (
  id text primary key,
  definition jsonb not null
);
insert into game_private.tasks(id,definition) values
('beer','{"id":"beer","title":"Bånn i bøtta","description":"Drikk en øl så fort du kan. De andre gjetter hvor mange sekunder du bruker.","kind":"individual","answer":{"method":"stopwatch","enteredBy":"performer","unit":"sekunder","min":0,"max":60}}'),
('ten_seconds','{"id":"ten_seconds","title":"Perfekte 10","description":"Start din egen timer. Stopp så nær 10 sekunder som mulig. Tiden forsvinner når du stopper.","kind":"everyone","answer":{"method":"stopwatch","enteredBy":"performer","unit":"sekunder","min":0,"max":20,"target":10,"timeout":20}}');

create table game_private.sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9]{6}$'),
  host_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  status text not null default 'lobby' check (status in ('lobby','playing','finished')),
  round_id uuid,
  task_order text[] not null default array['beer','ten_seconds']
);
create table game_private.players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references game_private.sessions(id) on delete cascade,
  user_id uuid not null,
  name text not null check (char_length(name) between 1 and 24),
  score integer not null default 0,
  completed boolean not null default false,
  joined_at timestamptz not null default now(),
  unique(session_id,user_id)
);
create table game_private.rounds (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references game_private.sessions(id) on delete cascade,
  number integer not null,
  task_id text not null,
  phase text not null default 'assignment' check (phase in ('assignment','guessing','performing','reveal','leaderboard','sips')),
  performer_id uuid references game_private.players(id) on delete cascade,
  accepted boolean not null default false,
  transferred boolean not null default false,
  declined uuid[] not null default '{}',
  actual numeric,
  awarded boolean not null default false,
  unique(session_id,task_id)
);
create table game_private.responses (
  round_id uuid not null references game_private.rounds(id) on delete cascade,
  player_id uuid not null references game_private.players(id) on delete cascade,
  guess numeric,
  actual numeric,
  started_at timestamptz,
  finished boolean not null default false,
  points integer not null default 0,
  rank integer,
  primary key(round_id,player_id)
);
create table game_private.allocations (
  round_id uuid not null references game_private.rounds(id) on delete cascade,
  giver_id uuid not null references game_private.players(id) on delete cascade,
  recipient_id uuid not null references game_private.players(id) on delete cascade,
  primary key(round_id,giver_id),
  unique(round_id,recipient_id)
);
create table public.session_updates (
  session_id uuid primary key references game_private.sessions(id) on delete cascade,
  version integer not null default 1
);
alter table public.session_updates enable row level security;
revoke all on public.session_updates from anon, authenticated;
grant select on public.session_updates to authenticated;

create function game_private.is_member(p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from game_private.players p join game_private.sessions s on s.id=p.session_id
    where p.session_id=p_session and p.user_id=auth.uid() and s.expires_at>now());
$$;
grant usage on schema game_private to authenticated;
grant execute on function game_private.is_member(uuid) to authenticated;
create policy "Members receive update signals" on public.session_updates for select to authenticated
  using (game_private.is_member(session_id));

create function game_private.next_round(p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s game_private.sessions; t text; performer uuid; n integer; task jsonb;
begin
  select * into s from game_private.sessions where id=p_session;
  select tasks.task into t from unnest(s.task_order) with ordinality as tasks(task,position)
    where not exists(select 1 from game_private.rounds r where r.session_id=s.id and r.task_id=tasks.task)
    order by position limit 1;
  select id into performer from game_private.players where session_id=s.id and not completed order by random() limit 1;
  if t is null or performer is null then
    update game_private.sessions set status='finished' where id=s.id;
    return;
  end if;
  select count(*)+1 into n from game_private.rounds where session_id=s.id;
  select definition into task from game_private.tasks where id=t;
  if task is null then raise exception 'Oppgaven finnes ikke.'; end if;
  insert into game_private.rounds(session_id,number,task_id,performer_id,accepted)
    values(s.id,n,t,case when task->>'kind'='everyone' then null else performer end,task->>'kind'='everyone') returning id into s.round_id;
  update game_private.sessions set status='playing',round_id=s.round_id where id=s.id;
  insert into game_private.responses(round_id,player_id) select s.round_id,id from game_private.players where session_id=s.id;
end;
$$;

create function game_private.award_round(p_round uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r game_private.rounds; participant_count integer; item record; points_value integer; task jsonb; is_individual boolean;
begin
  select * into r from game_private.rounds where id=p_round;
  if r.awarded then return; end if;
  select definition into task from game_private.tasks where id=r.task_id;
  is_individual:=task->>'kind'='individual';
  select count(*) into participant_count from game_private.responses where round_id=r.id and player_id is distinct from r.performer_id;
  for item in
    select player_id, rank() over(order by
      case when is_individual then abs(guess-greatest((task->'answer'->>'min')::numeric,least(r.actual,(task->'answer'->>'max')::numeric))) else abs(actual-(task->'answer'->>'target')::numeric) end) as place
    from game_private.responses where round_id=r.id and player_id is distinct from r.performer_id
      and (case when is_individual then guess is not null and r.actual is not null else finished and actual<(task->'answer'->>'timeout')::numeric end)
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
  update game_private.players p set score=p.score+q.points from game_private.responses q where q.round_id=r.id and q.player_id=p.id;
  update game_private.rounds set awarded=true where id=r.id;
end;
$$;

create function game_private.winners(p_round uuid) returns table(player_id uuid)
language sql stable security definer set search_path = '' as $$
  select q.player_id from game_private.responses q join game_private.players p on p.id=q.player_id
    where q.round_id=p_round and q.points>0
    order by q.points desc,p.joined_at,p.id limit 3;
$$;

create function public.game_state(p_session uuid) returns jsonb
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
    'id',s.id,'code',s.code,'hostId',s.host_id,'meId',me.id,'status',s.status,'expiresAt',s.expires_at,
    'taskCount',cardinality(s.task_order),
    'players',(select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'score',p.score,'completed',p.completed) order by p.joined_at,p.id)
      from game_private.players p where p.session_id=s.id),
    'round',case when r.id is null then null else jsonb_build_object(
      'id',r.id,'number',r.number,'taskId',r.task_id,'task',task,'phase',r.phase,'performerId',r.performer_id,
      'accepted',r.accepted,'transferred',r.transferred,'awarded',r.awarded,
      'actual',case when revealed or me.id=r.performer_id then r.actual else null end,
      'responses',(select jsonb_agg(jsonb_build_object('playerId',q.player_id,
        'submitted',case when s.host_id=me.id and r.phase='guessing' and me.id is distinct from r.performer_id
          and not exists(select 1 from game_private.responses own where own.round_id=r.id and own.player_id=me.id and own.guess is not null)
          and q.player_id<>me.id then false when task->>'kind'='individual' then q.guess is not null else q.finished end,
        'guess',case when revealed or q.player_id=me.id then q.guess else null end,
        'actual',case when revealed or (q.player_id=me.id and task->>'kind'='individual') then q.actual else null end,
        'startedAt',case when q.player_id=me.id then q.started_at else null end,
        'finished',q.finished,'points',case when revealed then q.points else 0 end,
        'rank',case when revealed then q.rank else null end)) from game_private.responses q where q.round_id=r.id),
      'winners',case when revealed then (select coalesce(jsonb_agg(w.player_id),'[]'::jsonb) from game_private.winners(r.id) w) else '[]'::jsonb end,
      'allocations',(select coalesce(jsonb_agg(jsonb_build_object('giverId',a.giver_id,'recipientId',a.recipient_id)),'[]'::jsonb)
        from game_private.allocations a where a.round_id=r.id)
    ) end
  );
end;
$$;

create function public.create_game(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s game_private.sessions; pid uuid; attempts integer:=0;
begin
  if auth.uid() is null then raise exception 'Du må koble til først.'; end if;
  if char_length(trim(p_name)) not between 1 and 24 then raise exception 'Navnet må ha 1–24 tegn.'; end if;
  if (select count(*) from game_private.sessions active join game_private.players p on p.id=active.host_id
      where p.user_id=auth.uid() and active.expires_at>now())>=5 then raise exception 'Du har allerede fem aktive spill.'; end if;
  loop
    begin
      insert into game_private.sessions(code,host_id) values(lpad(floor(random()*1000000)::text,6,'0'),gen_random_uuid()) returning * into s;
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

create function public.join_game(p_code text,p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s game_private.sessions;
begin
  if auth.uid() is null then raise exception 'Du må koble til først.'; end if;
  select * into s from game_private.sessions where code=p_code and expires_at>now() for update;
  if s.id is null then raise exception 'Fant ikke spillet. Sjekk koden.'; end if;
  if exists(select 1 from game_private.players where session_id=s.id and user_id=auth.uid()) then return public.game_state(s.id); end if;
  if s.status<>'lobby' then raise exception 'Spillet har startet. Nye spillere kan ikke bli med.'; end if;
  if char_length(trim(p_name)) not between 1 and 24 then raise exception 'Navnet må ha 1–24 tegn.'; end if;
  if (select count(*) from game_private.players where session_id=s.id)>=40 then raise exception 'Spillet har nådd 40 spillere.'; end if;
  insert into game_private.players(session_id,user_id,name) values(s.id,auth.uid(),trim(p_name));
  update public.session_updates set version=version+1 where session_id=s.id;
  return public.game_state(s.id);
end;
$$;

create function public.game_action(p_session uuid,p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s game_private.sessions; me game_private.players; r game_private.rounds; response game_private.responses;
  target uuid; value numeric; elapsed numeric; host boolean; phases text[]; phase_index integer; task jsonb; is_individual boolean;
begin
  select * into s from game_private.sessions where id=p_session and expires_at>now() for update;
  select * into me from game_private.players where session_id=p_session and user_id=auth.uid();
  if s.id is null or me.id is null then raise exception 'Spillet finnes ikke eller har utløpt.'; end if;
  host:=s.host_id=me.id;
  select * into r from game_private.rounds where id=s.round_id;
  select definition into task from game_private.tasks where id=r.task_id;
  is_individual:=task->>'kind'='individual';
  if p_action in ('start','next','back','end') and not host then raise exception 'Bare verten kan styre spillet.'; end if;
  if p_action='start' then
    if s.status<>'lobby' then raise exception 'Spillet har allerede startet.'; end if;
    if (select count(*) from game_private.players where session_id=s.id)<2 then raise exception 'Dere må være minst to spillere.'; end if;
    perform game_private.next_round(s.id);
  elsif p_action='end' then
    update game_private.sessions set status='finished' where id=s.id;
  else
    if s.status<>'playing' or r.id is null then raise exception 'Spillet er ikke i gang.'; end if;
    if p_payload->>'roundId' is distinct from r.id::text then raise exception 'Runden er endret. Prøv igjen.'; end if;
    if p_action in ('next','back') and p_payload->>'phase' is distinct from r.phase then raise exception 'Steget er endret. Prøv igjen.'; end if;
    select * into response from game_private.responses where round_id=r.id and player_id=me.id;
    if p_action='accept' then
      if r.phase<>'assignment' or r.awarded or r.accepted or me.id is distinct from r.performer_id then raise exception 'Du kan ikke ta denne oppgaven nå.'; end if;
      update game_private.rounds set accepted=true where id=r.id;
    elsif p_action='decline' then
      if r.phase<>'assignment' or r.awarded or r.accepted or me.id is distinct from r.performer_id then raise exception 'Du kan ikke sende denne oppgaven videre nå.'; end if;
      select id into target from game_private.players where session_id=s.id and not completed
        and id<>me.id and not(id=any(r.declined)) order by random() limit 1;
      if target is null then raise exception 'Ingen andre kan ta oppgaven. Verten kan hoppe over den.'; end if;
      update game_private.rounds set performer_id=target,transferred=true,declined=array_append(declined,me.id) where id=r.id;
    elsif p_action='guess' then
      if r.phase<>'guessing' or r.awarded or me.id=r.performer_id or response.guess is not null then raise exception 'Du kan ikke svare nå.'; end if;
      value:=(p_payload->>'value')::numeric;
      if value is null or value<(task->'answer'->>'min')::numeric or value>(task->'answer'->>'max')::numeric or value='NaN'::numeric then raise exception 'Svaret er utenfor oppgavens grenser.'; end if;
      update game_private.responses set guess=round(value,1) where round_id=r.id and player_id=me.id;
    elsif p_action='timer_start' then
      if r.phase<>'performing' or r.awarded or response.started_at is not null or response.finished then raise exception 'Timeren kan ikke startes nå.'; end if;
      if task->'answer'->>'method'<>'stopwatch' then raise exception 'Denne oppgaven bruker ikke stoppeklokke.'; end if;
      if is_individual and me.id is distinct from r.performer_id then raise exception 'Bare den som har oppgaven kan ta tiden.'; end if;
      update game_private.responses set started_at=clock_timestamp() where round_id=r.id and player_id=me.id;
    elsif p_action='timer_stop' then
      if r.phase<>'performing' or r.awarded or response.started_at is null or response.finished then raise exception 'Timeren kan ikke stoppes nå.'; end if;
      if task->'answer'->>'method'<>'stopwatch' then raise exception 'Denne oppgaven bruker ikke stoppeklokke.'; end if;
      if is_individual and me.id is distinct from r.performer_id then raise exception 'Bare den som har oppgaven kan ta tiden.'; end if;
      elapsed:=greatest(0,extract(epoch from clock_timestamp()-response.started_at));
      value:=(p_payload->>'value')::numeric;
      if value is null or value<0 or value='NaN'::numeric or value>elapsed+3 then raise exception 'Tiden kunne ikke bekreftes. Prøv igjen.'; end if;
      if not is_individual then value:=case when elapsed>=(task->'answer'->>'timeout')::numeric+3 or value>=(task->'answer'->>'timeout')::numeric then (task->'answer'->>'timeout')::numeric else value end; end if;
      value:=round(value,2);
      update game_private.responses set actual=value,finished=true where round_id=r.id and player_id=me.id;
      if is_individual then update game_private.rounds set actual=value where id=r.id; end if;
    elsif p_action='manual_result' then
      if r.phase<>'performing' or r.awarded or r.actual is not null or task->'answer'->>'method'<>'manual' or not is_individual then raise exception 'Du kan ikke oppgi fasit nå.'; end if;
      if task->'answer'->>'enteredBy'='host' then
        if not host then raise exception 'Bare verten kan oppgi fasit.'; end if;
      elsif me.id is distinct from r.performer_id then raise exception 'Bare den som har oppgaven kan oppgi fasit.';
      end if;
      value:=(p_payload->>'value')::numeric;
      if value is null or value<0 or value='NaN'::numeric or value='Infinity'::numeric then raise exception 'Oppgi en gyldig verdi.'; end if;
      update game_private.rounds set actual=value where id=r.id;
      update game_private.responses set actual=value,finished=true where round_id=r.id and player_id=r.performer_id;
    elsif p_action='allocate' then
      if r.phase<>'sips' or not exists(select 1 from game_private.winners(r.id) where player_id=me.id) then raise exception 'Du kan ikke dele ut slurker nå.'; end if;
      target:=(p_payload->>'recipientId')::uuid;
      if target is null or not exists(select 1 from game_private.players where session_id=s.id and id=target)
        or exists(select 1 from game_private.winners(r.id) where player_id=target) then raise exception 'Denne spilleren kan ikke få slurker.'; end if;
      begin
        insert into game_private.allocations(round_id,giver_id,recipient_id) values(r.id,me.id,target);
      exception when unique_violation then raise exception 'Slurkene er allerede delt ut, eller noen valgte spilleren først.'; end;
    elsif p_action in ('next','back') then
      phases:=case when is_individual then array['assignment','guessing','performing','reveal','leaderboard','sips']
        else array['assignment','performing','reveal','leaderboard','sips'] end;
      phase_index:=array_position(phases,r.phase);
      if p_action='back' then
        if phase_index<=1 then raise exception 'Dette er første steg i runden.'; end if;
        update game_private.rounds set phase=phases[phase_index-1] where id=r.id;
      elsif r.phase='assignment' and not r.accepted then
        perform game_private.award_round(r.id);
        perform game_private.next_round(s.id);
      elsif r.phase='sips' then
        perform game_private.next_round(s.id);
      else
        if phases[phase_index+1]='reveal' then
          update game_private.responses set actual=(task->'answer'->>'timeout')::numeric,finished=true where round_id=r.id and started_at is not null and not finished
            and not is_individual and clock_timestamp()-started_at>=((task->'answer'->>'timeout')::numeric * interval '1 second');
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

revoke all on all tables in schema game_private from public, anon, authenticated;
revoke execute on all functions in schema game_private from public, anon, authenticated;
grant execute on function game_private.is_member(uuid) to authenticated;
revoke execute on function public.create_game(text),public.join_game(text,text),public.game_state(uuid),public.game_action(uuid,text,jsonb) from public,anon;
grant execute on function public.create_game(text),public.join_game(text,text),public.game_state(uuid),public.game_action(uuid,text,jsonb) to authenticated;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.session_updates;
  end if;
end $$;
