-- Job listings table for /careers page
-- Run this in your Supabase SQL editor

create table if not exists job_listings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  location text,
  employment_type text default 'contractor',
  short_description text,
  full_description text,
  requirements text[],
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Disable RLS so public /careers page can read listings without auth
alter table job_listings disable row level security;

-- Pre-seed with three default listings
insert into job_listings (title, location, employment_type, short_description, full_description, requirements, is_active) values
(
  'Paramedic',
  'Remote/Nationwide',
  'contractor',
  'Provide urgent care assessments via video and phone for rural New Zealand patients.',
  'Tere Health is looking for experienced paramedics to join our remote urgent care team. You will conduct video and phone consultations with patients across rural New Zealand, providing clinical assessment, triage, and care coordination. This is a flexible contractor role — work from anywhere with a reliable internet connection.',
  ARRAY[
    'Current New Zealand Paramedic registration',
    'Minimum 2 years clinical experience',
    'Strong communication skills for video consultations',
    'Reliable broadband internet connection',
    'ACC registration (or willing to obtain)'
  ],
  true
),
(
  'Nurse Practitioner',
  'Remote/Nationwide',
  'contractor',
  'Deliver high-quality urgent care consultations and prescriptions remotely across rural Aotearoa.',
  'We are seeking qualified Nurse Practitioners to join the Tere Health clinical team. You will see patients via video, phone, and written consultations, prescribe medications electronically, and file ACC claims — all from home. Flexible hours, no paperwork, and a modern platform that handles the admin for you.',
  ARRAY[
    'Current New Zealand Nurse Practitioner registration (MCNZ)',
    'Prescribing authority',
    'Experience in urgent or primary care',
    'Comfortable with telehealth and digital tools',
    'ACC registration preferred'
  ],
  true
),
(
  'General Practitioner',
  'Remote/Nationwide',
  'contractor',
  'See urgent care patients by video or phone from anywhere in New Zealand — on your schedule.',
  'Tere Health is expanding its GP network to meet growing demand for rural urgent care. As a Tere Health GP, you will conduct video and phone consultations, issue prescriptions electronically, and help rural communities access the care they need. Set your own hours and availability. Our AI-assisted platform handles notes, ACC, and billing automatically.',
  ARRAY[
    'Current New Zealand General Practitioner registration (MCNZ)',
    'Vocationally registered GP preferred',
    'ACC provider registration',
    'Experience with telehealth or willingness to learn',
    'Reliable broadband connection'
  ],
  true
);
