CREATE OR REPLACE FUNCTION public.enroll_account(requested text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
BEGIN
  PERFORM assert_active();
  IF requested NOT IN ('farmer','buyer','transporter','coordinator','agricultural_partner') THEN
    RAISE EXCEPTION 'Invalid account type';
  END IF;
  IF EXISTS (SELECT 1 FROM user_roles WHERE user_id=public.current_actor()) THEN
    RAISE EXCEPTION 'Account already enrolled';
  END IF;

  INSERT INTO role_requests(user_id,requested_role,status)
  VALUES (
    public.current_actor(),
    requested::app_role,
    CASE WHEN requested='coordinator' THEN 'pending' ELSE 'approved' END
  )
  ON CONFLICT(user_id) DO NOTHING;

  IF requested<>'coordinator' THEN
    INSERT INTO user_roles(user_id,role)
    VALUES (public.current_actor(),requested::app_role)
    ON CONFLICT(user_id) DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_role(user_ref uuid, role_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  selected_role app_role;
BEGIN
  PERFORM assert_active();
  IF NOT has_role('admin') THEN
    RAISE EXCEPTION 'Administrator access required' USING errcode='42501';
  END IF;
  IF user_ref=public.current_actor() THEN
    RAISE EXCEPTION 'Administrators cannot change their own role' USING errcode='42501';
  END IF;
  IF role_name NOT IN ('farmer','buyer','transporter','coordinator','agricultural_partner','admin') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id=user_ref) THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  selected_role := role_name::app_role;
  INSERT INTO user_roles(user_id,role,approved_by)
  VALUES (user_ref,selected_role,public.current_actor())
  ON CONFLICT(user_id) DO UPDATE
  SET role=EXCLUDED.role, approved_by=public.current_actor();

  UPDATE role_requests
  SET requested_role=selected_role,status='approved'
  WHERE user_id=user_ref;
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_role(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid,text) TO farmsave_authenticated;
