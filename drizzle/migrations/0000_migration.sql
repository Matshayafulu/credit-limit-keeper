CREATE TABLE public.bookings (
  id text PRIMARY KEY,
  service text NOT NULL, branch text NOT NULL, date text NOT NULL, time text NOT NULL,
  name text NOT NULL, phone text NOT NULL, paid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.book_slot(_id text,_service text,_branch text,_date text,_time text,_name text,_phone text,_cap int,_skip text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(_branch||_date||_time));
  IF (SELECT count(*) FROM public.bookings WHERE branch=_branch AND date=_date AND time=_time AND id IS DISTINCT FROM _skip) >= _cap THEN RETURN false; END IF;
  IF _skip IS NULL THEN
    INSERT INTO public.bookings(id,service,branch,date,time,name,phone) VALUES(_id,_service,_branch,_date,_time,_name,_phone);
  ELSE
    UPDATE public.bookings SET date=_date, time=_time WHERE id=_skip AND phone=_phone;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.book_slot FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.book_slot TO service_role;