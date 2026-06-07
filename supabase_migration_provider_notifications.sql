-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)
-- Creates the provider_notifications table for admin → provider messaging

CREATE TABLE IF NOT EXISTS provider_notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  from_name text NOT NULL DEFAULT 'Admin',
  subject text NOT NULL,
  body text NOT NULL,
  is_pinned boolean DEFAULT false,
  read_by text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE provider_notifications ENABLE ROW LEVEL SECURITY;

-- Allow all reads (providers use service-role API endpoint)
CREATE POLICY anon_select ON provider_notifications
  FOR SELECT USING (true);

-- Test insert
-- INSERT INTO provider_notifications (from_name, subject, body)
-- VALUES ('Admin', 'Welcome to Tere Messages', 'This tab is for admin announcements and notifications to providers.');
