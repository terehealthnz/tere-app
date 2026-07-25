-- Pre-launch waitlist for the public site. Distinct from the in-clinic
-- waitlist (which is triggered when the clinic is at capacity mid-session).
--
-- Rows land here whenever a visitor submits the /waitlist form while the
-- `waitlist_mode` feature flag is on. When we flip to bookings-open, we
-- notify this list in batches so the queue doesn't get slammed on day one.

CREATE TABLE IF NOT EXISTS waitlist_signups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL,
  phone        text,
  first_name   text,
  region       text,
  source       text,         -- 'landing' | 'watch' | 'linkedin' | 'careers' | other
  interests    text[],       -- optional self-reported: e.g. ['patient','employer','insurer']
  ip_address   text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  notified_at  timestamptz   -- set when we email them "we're open"
);

CREATE INDEX IF NOT EXISTS idx_waitlist_signups_email ON waitlist_signups(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_signups_created ON waitlist_signups(created_at DESC);

ALTER TABLE waitlist_signups ENABLE ROW LEVEL SECURITY;
-- No policies — only the /api/waitlist-signup service-role endpoint writes,
-- and only admin UIs read (via server-mediated /api/patients or similar).

-- Flip the site into waitlist mode.
INSERT INTO feature_flags (key, enabled, description)
VALUES (
  'waitlist_mode',
  true,
  'Public site in pre-launch waitlist mode: "Start a consultation" CTAs route to /waitlist, beta banner shown, direct booking blocked unless ?dev=beta bypass. Set enabled=false to open bookings.'
)
ON CONFLICT (key) DO NOTHING;
