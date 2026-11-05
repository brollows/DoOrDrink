-- Profile photos. Run after 016.
--
-- A player can add a photo when joining, and change or remove it until the game starts. The phone crops it to a
-- small square JPEG before sending it. Photos are kept apart from the players so game_state, which every phone
-- fetches every few seconds, stays light: it only says which version each player has, and the phones fetch the
-- photos themselves with player_photos when a version changes. Photos are deleted with the player and the game.

create table game_private.player_photos (
  player_id uuid primary key references game_private.players(id) on delete cascade,
  photo text not null check (char_length(photo) <= 120000 and photo ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'),
  updated_at timestamptz not null default clock_timestamp()
);
revoke all on game_private.player_photos from public, anon, authenticated;
-- Only reached through set_photo and player_photos, which run as the owner. RLS with no policies is an extra lock.
alter table game_private.player_photos enable row level security;

-- Sets (or with null removes) the caller's own photo. Only before the game starts.
create or replace function public.set_photo(p_session uuid, p_photo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s game_private.sessions; me game_private.players;
begin
  select * into s from game_private.sessions where id=p_session and expires_at>now() for update;
  select * into me from game_private.players where session_id=p_session and user_id=auth.uid();
  if s.id is null or me.id is null then raise exception 'Spillet finnes ikke eller har utløpt.'; end if;
  if s.status<>'lobby' then raise exception 'Bildet kan bare endres før spillet starter.'; end if;
  if p_photo is null then
    delete from game_private.player_photos where player_id=me.id;
  else
    if char_length(p_photo)>120000 or p_photo !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$' then raise exception 'Bildet kunne ikke lagres.'; end if;
    insert into game_private.player_photos(player_id,photo) values(me.id,p_photo)
      on conflict (player_id) do update set photo=excluded.photo, updated_at=clock_timestamp();
  end if;
  update public.session_updates set version=version+1 where session_id=s.id;
  return public.game_state(s.id);
end;
$$;

-- The photos of the given players in the caller's game, as {playerId: dataUrl}. Players without a photo are left out.
create or replace function public.player_photos(p_session uuid, p_players uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists(select 1 from game_private.players p join game_private.sessions s on s.id=p.session_id
    where p.session_id=p_session and p.user_id=auth.uid() and s.expires_at>now()) then
    raise exception 'Spillet finnes ikke eller har utløpt.';
  end if;
  return (select coalesce(jsonb_object_agg(ph.player_id,ph.photo),'{}'::jsonb)
    from game_private.player_photos ph join game_private.players p on p.id=ph.player_id
    where p.session_id=p_session and ph.player_id=any(p_players));
end;
$$;

revoke execute on function public.set_photo(uuid,text),public.player_photos(uuid,uuid[]) from public, anon;
grant execute on function public.set_photo(uuid,text),public.player_photos(uuid,uuid[]) to authenticated;

-- Same as in 016, with each player's photo version.
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
    -- 'photo' is only a version (milliseconds since it was set): the phones fetch the photos with player_photos.
    'players',(select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'score',p.score,'completed',p.completed,'spectator',p.spectator,
      'photo',(select floor(extract(epoch from ph.updated_at)*1000)::bigint from game_private.player_photos ph where ph.player_id=p.id))
      order by p.joined_at,p.id)
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
