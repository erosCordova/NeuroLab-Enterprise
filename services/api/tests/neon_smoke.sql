-- Run only against a development branch. All sample rows roll back.
DO $smoke$
DECLARE
    owner_uuid uuid := gen_random_uuid();
    project_uuid uuid := gen_random_uuid();
    email_value text := owner_uuid::text || '@example.invalid';
    before_users bigint := (SELECT count(*) FROM users);
    before_projects bigint := (SELECT count(*) FROM projects);
BEGIN
    BEGIN
        INSERT INTO users(id,email,display_name,password_hash)
        VALUES (owner_uuid,email_value,'SQL smoke test','not-a-login-credential');
        INSERT INTO projects(id,owner_id,name,normalized_name,tags)
        VALUES (project_uuid,owner_uuid,'Prueba CNN','prueba cnn','["cnn"]');
        IF NOT EXISTS (SELECT 1 FROM projects WHERE id=project_uuid AND revision=1) THEN
            RAISE EXCEPTION 'Project defaults failed';
        END IF;
        BEGIN
            INSERT INTO projects(id,owner_id,name,normalized_name)
            VALUES (gen_random_uuid(),owner_uuid,'Prueba CNN','prueba cnn');
            RAISE EXCEPTION 'Duplicate project accepted';
        EXCEPTION WHEN unique_violation THEN NULL;
        END;
        BEGIN
            INSERT INTO projects(id,owner_id,name,normalized_name)
            VALUES (gen_random_uuid(),gen_random_uuid(),'Otro proyecto','otro');
            RAISE EXCEPTION 'Missing owner accepted';
        EXCEPTION WHEN foreign_key_violation THEN NULL;
        END;
        BEGIN
            UPDATE projects SET status='invalid' WHERE id=project_uuid;
            RAISE EXCEPTION 'Invalid status accepted';
        EXCEPTION WHEN check_violation THEN NULL;
        END;
        BEGIN
            UPDATE projects SET tags='{}'::jsonb WHERE id=project_uuid;
            RAISE EXCEPTION 'Invalid tags accepted';
        EXCEPTION WHEN check_violation THEN NULL;
        END;
        BEGIN
            UPDATE projects SET revision=0 WHERE id=project_uuid;
            RAISE EXCEPTION 'Invalid revision accepted';
        EXCEPTION WHEN check_violation THEN NULL;
        END;
        RAISE EXCEPTION USING ERRCODE='ZX001', MESSAGE='Rollback smoke fixtures';
    EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
    END;
    IF (SELECT count(*) FROM users) <> before_users
       OR (SELECT count(*) FROM projects) <> before_projects
       OR EXISTS (SELECT 1 FROM users WHERE id=owner_uuid)
       OR EXISTS (SELECT 1 FROM projects WHERE id=project_uuid) THEN
        RAISE EXCEPTION 'Smoke test left persistent sample rows';
    END IF;
END $smoke$;
