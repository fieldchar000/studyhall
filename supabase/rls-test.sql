-- Security test for the cloud rules. Runs inside ONE transaction that is always rolled
-- back at the end (the final RAISE), so it leaves nothing behind. Prints PASS/FAIL lines.
-- Run with: node scripts/rls-test.cjs
do $$
declare
  r text := '';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  code_a text; code_c text; code_ab text; code_srv text;
  srv uuid; chan uuid; msg_a uuid; msg_b uuid; n int; ok boolean; v text;

  -- helpers (closures aren't possible in plpgsql, so these are inline blocks below)
begin
  -- Two bootstrap codes (like the one the setup script makes) for A and C.
  insert into invites (code, kind, created_by, max_uses, expires_at) values ('TESTBOOTA1', 'friend', null, 1, now() + interval '1 day');
  insert into invites (code, kind, created_by, max_uses, expires_at) values ('TESTBOOTC1', 'friend', null, 1, now() + interval '1 day');

  -- ---- sign-up rules (inserting into auth.users fires the same triggers as real sign-ups)
  begin
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'x@users.studyhall.invalid', '',
            '{"username":"xtest","invite_code":"NOPE000000"}', now(), now());
    r := r || E'\nFAIL signup with bad code was allowed';
  exception when others then r := r || E'\nPASS signup with bad code refused (' || sqlerrm || ')'; end;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
  values (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alicetest@users.studyhall.invalid', '',
          '{"username":"alicetest","display_name":"Alice","invite_code":"TESTBOOTA1"}', now(), now());
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
  values (c, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'caroltest@users.studyhall.invalid', '',
          '{"username":"caroltest","display_name":"Carol","invite_code":"TESTBOOTC1"}', now(), now());

  begin
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'y@users.studyhall.invalid', '',
            '{"username":"ytest","invite_code":"TESTBOOTA1"}', now(), now());
    r := r || E'\nFAIL a used-up invite code worked twice';
  exception when others then r := r || E'\nPASS used-up invite refused'; end;

  -- A invites B (as A)
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  code_ab := create_invite('friend', null, 1, 7);
  execute 'reset role';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
  values (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bobtest@users.studyhall.invalid', '',
          json_build_object('username', 'bobtest', 'display_name', 'Bob', 'invite_code', code_ab)::jsonb, now(), now());

  select count(*) into n from friendships where user_a = least(a, b) and user_b = greatest(a, b);
  r := r || case when n = 1 then E'\nPASS signing up with Alice''s invite made Bob her friend' else E'\nFAIL friendship not created' end;
  select count(*) into n from friendships where c in (user_a, user_b);
  r := r || case when n = 0 then E'\nPASS Carol has no friends (no search, invite-only)' else E'\nFAIL Carol has friends' end;

  -- Profiles (synced personal table) with leaderboard opt-in for A and B
  insert into profiles (id, owner_id, created_at, updated_at, display_name, mode, leaderboard_opt_in) values
    (a::text, a::text, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'Alice', 'study', 1),
    (b::text, b::text, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'Bob', 'study', 1),
    (c::text, c::text, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'Carol', 'study', 1);

  -- ---- personal data as A
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into modules (id, owner_id, created_at, updated_at, name, code) values ('mod-a1', a::text, '2026-01-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', 'Alice module', 'A1');
  insert into notes (id, owner_id, created_at, updated_at, title, content, plain_text, kind, mode) values ('note-a1', a::text, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'Alice note', '', '', 'note', 'study');
  insert into focus_sessions (id, owner_id, created_at, updated_at, started_at, planned_minutes, focused_seconds, completed, kind) values ('fs-a1', a::text, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z', 25, 1500, 1, 'focus');
  insert into languages (id, owner_id, created_at, updated_at, name) values ('lang-a1', a::text, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'Japanese');
  insert into habits (id, owner_id, created_at, updated_at, name) values ('habit-a1', a::text, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'Read');
  insert into game_state (id, owner_id, created_at, updated_at, currency, state) values ('game-a1', a::text, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 300, '{}');
  begin
    insert into modules (id, owner_id, created_at, updated_at, name) values ('mod-hack', b::text, 'x', 'x', 'pretend to be Bob');
    r := r || E'\nFAIL Alice created a row owned by Bob';
  exception when others then r := r || E'\nPASS Alice cannot create rows owned by Bob'; end;
  -- last-write-wins: an older edit must not overwrite a newer one
  update modules set name = 'old edit', updated_at = '2026-04-01T00:00:00.000Z' where id = 'mod-a1';
  select name into v from modules where id = 'mod-a1';
  r := r || case when v = 'Alice module' then E'\nPASS older edit lost to newer one (last write wins)' else E'\nFAIL older edit overwrote newer: ' || v end;
  update modules set owner_id = b::text, updated_at = '2026-06-01T00:00:00.000Z' where id = 'mod-a1';
  select owner_id into v from modules where id = 'mod-a1';
  r := r || case when v = a::text then E'\nPASS rows cannot be handed to another owner' else E'\nFAIL owner changed' end;
  begin
    insert into shares (resource_type, resource_id, shared_with, permission) values ('module', 'mod-a1', c, 'view');
    r := r || E'\nFAIL Alice shared with Carol (not a friend)';
  exception when others then r := r || E'\nPASS sharing only allowed with friends'; end;
  execute 'reset role';

  -- ---- B before sharing
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from modules; r := r || case when n = 0 then E'\nPASS Bob sees none of Alice''s modules before sharing' else E'\nFAIL Bob sees ' || n || ' modules' end;
  select count(*) into n from focus_sessions; r := r || case when n = 0 then E'\nPASS Bob cannot read Alice''s focus sessions' else E'\nFAIL focus sessions leaked' end;
  select count(*) into n from profiles where id = a::text; r := r || case when n = 0 then E'\nPASS Bob cannot read Alice''s profile settings' else E'\nFAIL profile leaked' end;
  select count(*) into n from languages; r := r || case when n = 0 then E'\nPASS Bob cannot read Alice''s languages' else E'\nFAIL languages leaked' end;
  select count(*) into n from habits; r := r || case when n = 0 then E'\nPASS Bob cannot read Alice''s habits' else E'\nFAIL habits leaked' end;
  select count(*) into n from game_state; r := r || case when n = 0 then E'\nPASS Bob cannot read Alice''s game save' else E'\nFAIL game save leaked' end;
  update game_state set currency = 0, updated_at = '2026-08-01T00:00:00.000Z' where id = 'game-a1'; get diagnostics n = row_count;
  r := r || case when n = 0 then E'\nPASS Bob cannot change Alice''s game save' else E'\nFAIL Bob changed the game save' end;
  execute 'reset role';

  -- A shares module (view) and note (edit) with B
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into shares (resource_type, resource_id, shared_with, permission) values ('module', 'mod-a1', b, 'view'), ('note', 'note-a1', b, 'edit');
  update profiles set leaderboard_opt_in = 1 where id = a::text;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from modules where id = 'mod-a1'; r := r || case when n = 1 then E'\nPASS Bob reads the module Alice shared' else E'\nFAIL shared module not visible' end;
  update modules set name = 'Bob was here', updated_at = '2026-07-01T00:00:00.000Z' where id = 'mod-a1';
  get diagnostics n = row_count; r := r || case when n = 0 then E'\nPASS Bob cannot edit a view-only shared module' else E'\nFAIL Bob edited the module' end;
  update notes set title = 'Edited by Bob', updated_at = '2026-07-01T00:00:00.000Z' where id = 'note-a1';
  get diagnostics n = row_count; r := r || case when n = 1 then E'\nPASS Bob can edit a note shared with edit rights' else E'\nFAIL Bob could not edit shared note' end;
  select count(*) into n from leaderboard('2020-01-01'); r := r || case when n = 2 then E'\nPASS leaderboard shows Bob + opted-in friend Alice only' else E'\nFAIL leaderboard rows: ' || n end;
  execute 'reset role';

  -- ---- C sees nothing of A/B
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from modules; r := r || case when n = 0 then E'\nPASS Carol sees no one else''s modules' else E'\nFAIL Carol sees modules' end;
  select count(*) into n from notes; r := r || case when n = 0 then E'\nPASS Carol sees no one else''s notes' else E'\nFAIL Carol sees notes' end;
  update notes set title = 'Carol' where id = 'note-a1'; get diagnostics n = row_count;
  r := r || case when n = 0 then E'\nPASS Carol cannot edit Alice''s note' else E'\nFAIL Carol edited a note' end;
  select count(*) into n from user_directory where id in (a, b); r := r || case when n = 0 then E'\nPASS Carol cannot look up Alice or Bob (no public profiles)' else E'\nFAIL directory leaked' end;
  select count(*) into n from leaderboard('2020-01-01') where not is_me; r := r || case when n = 0 then E'\nPASS Carol''s leaderboard has no strangers' else E'\nFAIL leaderboard leaked' end;
  execute 'reset role';

  -- ---- servers
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  srv := create_server('Test server');
  select id into chan from channels where server_id = srv and kind = 'text' limit 1;
  insert into messages (channel_id, author_id, body) values (chan, a, 'hello from Alice') returning id into msg_a;
  code_srv := create_invite('server', srv, 5, 3);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from servers; r := r || case when n = 0 then E'\nPASS Carol cannot see a server she is not in' else E'\nFAIL server visible' end;
  select count(*) into n from messages; r := r || case when n = 0 then E'\nPASS Carol cannot read its messages' else E'\nFAIL messages leaked' end;
  begin
    insert into messages (channel_id, author_id, body) values (chan, c, 'spam');
    r := r || E'\nFAIL Carol posted in a server she is not in';
  exception when others then r := r || E'\nPASS Carol cannot post in it'; end;
  begin
    perform create_invite('server', srv, 1, 1);
    r := r || E'\nFAIL Carol made an invite for someone else''s server';
  exception when others then r := r || E'\nPASS only owners/mods create server invites'; end;
  perform redeem_invite(code_srv); -- joins as member
  select count(*) into n from messages; r := r || case when n = 1 then E'\nPASS after redeeming the invite Carol reads the history' else E'\nFAIL history not visible' end;
  insert into messages (channel_id, author_id, body) values (chan, c, 'hi, Carol here') returning id into msg_b;
  begin
    perform delete_message(msg_a);
    r := r || E'\nFAIL a member deleted someone else''s message';
  exception when others then r := r || E'\nPASS members cannot delete others'' messages'; end;
  delete from server_members where server_id = srv and user_id = a; get diagnostics n = row_count;
  r := r || case when n = 0 then E'\nPASS members cannot kick the owner' else E'\nFAIL member kicked owner' end;
  begin
    insert into channels (server_id, name) values (srv, 'carols-channel');
    r := r || E'\nFAIL member created a channel';
  exception when others then r := r || E'\nPASS only owners/mods manage channels'; end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform delete_message(msg_b);
  select deleted_at is not null into ok from messages where id = msg_b;
  r := r || case when ok then E'\nPASS owner can delete any message in their server' else E'\nFAIL owner delete failed' end;
  delete from server_members where server_id = srv and user_id = c; get diagnostics n = row_count;
  r := r || case when n = 1 then E'\nPASS owner can kick a member' else E'\nFAIL kick failed' end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from messages; r := r || case when n = 0 then E'\nPASS a kicked member loses access to the history' else E'\nFAIL kicked member still reads' end;
  execute 'reset role';

  raise exception 'RESULTS%', r; -- rolls everything back
end $$;
