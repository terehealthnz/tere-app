# Tere — Rural Urgent Care Platform

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
npm run dev
```

## Environment variables

| Variable | Where to get it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project settings |
| `VITE_SUPABASE_ANON_KEY` | Supabase project settings → API |
| `DAILY_API_KEY` | daily.co → Developers → API Keys |
| `OPENAI_API_KEY` | platform.openai.com |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `VITE_CLINICIAN_PIN` | Choose a strong PIN |

## Database

Run `supabase/schema.sql` in your Supabase SQL editor before first use.

## Deploy to Vercel

```bash
npm install -g vercel
vercel --prod
```

Add all environment variables in Vercel dashboard → Settings → Environment Variables.

## Routes

| Path | Description |
|---|---|
| `/` | Patient intake form |
| `/vitals` | rPPG vital signs capture |
| `/waiting` | Patient waiting room |
| `/done` | Post-consultation summary |
| `/clinician` | Clinician PIN login |
| `/clinician/dashboard` | Patient queue |
| `/clinician/consult/:id` | Consultation view |

## rPPG (Tere Vitals)

Built-in proprietary heart rate and respiratory rate measurement using:
- MediaPipe FaceMesh (Google, Apache 2.0) — face detection
- POS algorithm (Wang et al., 2017) — rPPG signal extraction
- Custom FFT — frequency analysis

All processing happens on-device. No facial video leaves the patient's phone.
Results labelled "indicative screening — not a substitute for medical-grade devices."

## Tere Scribe

AI clinical documentation:
- OpenAI Whisper — consultation audio → transcript
- Anthropic Claude — transcript + context → SOAP notes
- Cost: ~$0.18/consult (Whisper) + ~$0.02/consult (Claude) = ~$0.20/consult total

## Clinical note

This software is a clinical tool. All AI-generated content must be reviewed by the
treating clinician before acceptance. The clinician is solely responsible for all
clinical decisions and documentation.

MCNZ-registered clinicians only.
