-- Topp 5 and Mim det share one typo rule: words must match exactly, except that words of 7+ letters
-- may be one typo apart. Short words like «sol» and «sel» are no longer the same word.
-- (Topp 5 used to allow one typo from 3 letters and two from 7 letters.)

create or replace function game_private.same_word(a text,b text) returns boolean
language sql immutable set search_path = '' as $$
  select a=b or (least(char_length(a),char_length(b))>=7 and game_private.edit_distance(a,b)<=1);
$$;

create or replace function game_private.mime_match(guess text,word text) returns boolean
language sql immutable set search_path = '' as $$
  select game_private.same_word(guess,word);
$$;

revoke execute on function game_private.same_word(text,text),game_private.mime_match(text,text) from public, anon, authenticated;
