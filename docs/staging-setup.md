# Staging environment setup

`staging.tere.co.nz` runs the `staging` git branch against a **separate Supabase project** with its own database. Test changes there before merging to `main`.

## One-time setup

### 1. Create the staging Supabase project

1. Log in to https://supabase.com/dashboard
2. Click **New project**
3. Name: `tere-staging` (organisation same as prod)
4. Set a database password (keep it different from prod, save to 1Password)
5. Region: match production (Sydney)
6. Click **Create new project**
7. Wait ~2 min for provisioning

Once the project is up, grab three values from **Project Settings → API**:
- `Project URL`  → will be `VITE_SUPABASE_URL` on staging
- `anon public key` → will be `VITE_SUPABASE_ANON_KEY` on staging
- `service_role key` → will be `SUPABASE_SERVICE_ROLE_KEY` on staging

### 2. Clone the schema onto staging

The prod schema lives across several `.sql` files in `supabase/`. Run them all against staging in order:

1. Go to staging project → **SQL Editor** → **New query**
2. Copy the contents of each file in `supabase/` in order (they're timestamped in filename):
   - `supabase-master-migration.sql` (root)
   - `supabase-*.sql` (root-level extras)
   - `supabase/2026-07-*_*.sql` (validation, model weights, pharmacy contacts, feature flags)
3. Paste + run each one on staging
4. Verify tables exist: **Table Editor** should show the same tables as prod

Alternative shortcut: prod → **Database → Backups → Download** → get a `.sql` schema-only dump → paste + run on staging. Faster if you have that on your tier.

### 3. Seed a provider account on staging

Same steps as prod (see conversation from 2026-07-06):

1. Staging → **Authentication → Users → Add user** with your email + a password
2. Staging → **SQL Editor**:
   ```sql
   INSERT INTO providers (email, first_name, last_name, is_active, is_provider, is_admin, is_supervisor)
   VALUES ('terehealthnz@gmail.com', 'Patrick', 'Herling', true, true, true, true);
   ```
3. Also copy over test consultations if you want realistic-looking data (via SQL export from prod).

### 4. Configure Vercel branches

In the Vercel dashboard for the `tere-app` project:

1. **Settings → Git → Production Branch**: leave as `main`
2. **Settings → Environments** (or **Environment Variables**):
   - Add a new "Preview" scope filter targeting the `staging` branch
   - For each of these env vars, set an override with the staging Supabase values:
     - `VITE_SUPABASE_URL` (staging project URL)
     - `VITE_SUPABASE_ANON_KEY` (staging anon key)
     - `SUPABASE_SERVICE_ROLE_KEY` (staging service role key)
     - Leave other env vars (Stripe test keys, Deepgram, etc.) inherited from Production, or override if you have separate test keys
3. **Settings → Domains → Add domain**: `staging.tere.co.nz`
   - Configure to point to the `staging` branch specifically
   - Add the CNAME record in your DNS provider as Vercel instructs

### 5. Create the branch + first deploy

Locally:

```bash
git checkout -b staging
git push -u origin staging
```

Vercel will auto-deploy the `staging` branch to `staging.tere.co.nz` using the staging env vars. Smoke-test the login flow to confirm it hits the staging Supabase.

## Daily workflow

- **Small fixes**: work directly on a feature branch → push → get a preview URL from Vercel → test → merge to `main`
- **Anything risky** (schema migrations, RLS changes, auth changes, algorithm changes with clinical impact):
  1. Branch off `staging`
  2. Push and let Vercel preview URL deploy
  3. Merge into `staging` when ready → `staging.tere.co.nz` picks it up
  4. Run a full end-to-end test on staging (create consult, capture vitals, provider claim, save notes, prescription)
  5. Merge `staging` → `main` to promote

## Schema sync discipline

When you write a migration:

1. Run it on staging first from the SQL editor.
2. If it worked, run the same SQL on prod.
3. Commit the SQL file to `supabase/` so future clones of prod (or new staging refreshes) reproduce it.

When you receive real patient data on prod that shouldn't be on staging (which you never should, but just in case): manually `DELETE` it off staging via SQL editor. Or on a schedule, blow away and re-clone staging from scratch.

## Testing feature flags on staging first

Combining staging + feature flags gives you the strongest safety pattern:

1. Ship a change to `main` (prod) behind a flag defaulting to **off**
2. Ship the same change to `staging` and turn the flag **on for yourself** via `staging.tere.co.nz/clinician/admin/flags`
3. Prove the change out on staging with real end-to-end flows
4. On prod, turn the flag on for just yourself, do a live smoke test
5. Turn it on for other providers
6. Turn it on for everyone
7. After a week or two of it being on, delete the flag from code (and the row from `feature_flags`)

This lets you make big changes without ever having "the deploy that broke things".
