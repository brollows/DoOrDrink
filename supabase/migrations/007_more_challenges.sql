-- Three more challenges. All use closest-wins position scoring (see CLAUDE.md).
-- answer.input 'counter': the performer counts attempts on a tap counter in the app
-- and the total is saved as the result (manual_result) when they succeed.

insert into game_private.tasks(id,definition) values
('steps','{"id":"steps","title":"Skritteller","description":"Sjekk helse-appen og svar i appen, uten å si det høyt. De andre gjetter.","question":"Hvor mange skritt har du gått i dag?","guessQuestion":"Hvor mange skritt har {name} gått i dag?","kind":"challenge","answer":{"method":"manual","enteredBy":"performer","unit":"skritt","min":0,"max":30000,"step":100}}'),
('snap_streak','{"id":"snap_streak","title":"Snap-streak","description":"Sjekk Snapchat og svar i appen, uten å si det høyt. De andre gjetter.","question":"Hvor lang er den største snap-streaken din?","guessQuestion":"Hvor lang er den største snap-streaken til {name}?","kind":"challenge","answer":{"method":"manual","enteredBy":"performer","unit":"dager","min":0,"max":5000,"step":1}}'),
('cup_flip','{"id":"cup_flip","title":"Hvor mange?","description":"Sett en kopp på bordkanten og flipp den så den lander andre veien opp. De andre gjetter hvor mange forsøk du trenger.","guessQuestion":"Hvor mange forsøk bruker {name} på å flippe koppen?","kind":"challenge","answer":{"method":"manual","enteredBy":"performer","input":"counter","unit":"forsøk","min":1,"max":200,"step":1}}');
