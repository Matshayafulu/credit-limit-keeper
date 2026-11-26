ALTER TABLE public.bookings ADD COLUMN session_token text, ADD COLUMN session_expires timestamptz, ADD COLUMN otp_sent_at timestamptz;
CREATE TABLE public.notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id text NOT NULL, kind text NOT NULL, message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.support_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reason text NOT NULL, contact text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.support_requests TO service_role;
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;