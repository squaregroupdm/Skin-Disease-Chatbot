# Skin Care Assistant — Publishing Guide (No Coding Required)

This guide takes you from this folder to a live, installable app on any phone.
Total time: about 1–1.5 hours, mostly creating accounts. Do the steps in order.

**What you'll end up with:** a web address (e.g. `skincare-assistant.vercel.app`) that
works like an app — users open it once, tap "Install", and it lives on their phone
with an icon, fullscreen, no browser bars. No Google Play or App Store involved.

---

## What's in this folder (you don't need to touch any of it)

- `src/` – the app itself (the same one you tested inside Claude)
- `api/` – a tiny secure server that holds your AI key and talks to the database
- `public/icons/` – the app icons phones will show
- `supabase.sql` – a script that creates your database table (you'll paste it once)
- `.env.example` – the names of the 4 secret values you'll enter into Vercel

---

## STEP 1 — Create your accounts (≈30 min)

Sign up for these four services. Use the same email for all of them.

| Service | Website | What it does | Cost |
|---|---|---|---|
| **GitHub** | github.com | Stores your app's code | Free |
| **Vercel** | vercel.com | Hosts your app on the internet | Free |
| **Supabase** | supabase.com | Your database (stores your books & settings) | Free |
| **Anthropic Console** | console.anthropic.com | The AI that answers questions | Pay-per-use* |

*Anthropic is the only paid piece. Add a card under **Billing**, then set a
**monthly spending limit** (Billing → Limits) — e.g. $20 — so you're never surprised.
Typical cost is $0.01–0.03 per answer.

> **Tip:** When signing up for Vercel, choose "Continue with GitHub". It links the two
> automatically and saves you a step later.

---

## STEP 2 — Get your Anthropic AI key (5 min)

1. In console.anthropic.com go to **API Keys** → **Create Key**.
2. Name it `skin-care-app` and click Create.
3. **Copy the key now** (it starts with `sk-ant-`). It is shown only once — paste it
   somewhere safe like a Notes file. You'll need it in Step 5.

---

## STEP 3 — Set up the database (10 min)

1. In supabase.com click **New project**.
   - Name: `skin-care-assistant`
   - Database password: choose anything strong and save it (you won't need it again,
     but keep it).
   - Region: **Singapore** (closest to Bangladesh) — makes the app faster.
   - Click **Create new project** and wait ~2 minutes.
2. In the left menu click **SQL Editor** → **New query**.
3. Open the file `supabase.sql` from this folder in Notepad, copy everything,
   paste it into the query box, and click **Run**. You should see "Success".
4. Now collect two values. In the left menu go to **Project Settings → API**:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`. Copy it.
   - **service_role** key (under "Project API keys" — click *Reveal*). Copy it.
     This key is secret — it never goes anywhere except Vercel in Step 5.

---

## STEP 4 — Put the code on GitHub (10 min)

1. In github.com click the **+** (top right) → **New repository**.
   - Name: `skin-care-assistant`
   - Keep it **Private**.
   - Click **Create repository**.
2. On the empty repository page, click the link **"uploading an existing file"**.
3. Open this folder on your computer. Select **everything inside it** (all files and
   folders — `api`, `public`, `src`, `index.html`, `package.json`, etc.) and drag them
   into the GitHub upload box.
   - ❗ Do NOT upload a `node_modules` or `dist` folder if you see one — they're not needed.
   - ✅ Make sure the `api`, `public` and `src` folders are included as folders.
4. Scroll down and click **Commit changes**. Wait for the upload to finish.

---

## STEP 5 — Deploy on Vercel (10 min)

1. In vercel.com click **Add New… → Project**.
2. You'll see your GitHub repositories. Click **Import** next to `skin-care-assistant`.
   (If you don't see it, click "Adjust GitHub App Permissions" and allow access.)
3. Vercel auto-detects **Vite**. Leave all build settings as they are.
4. Open the **Environment Variables** section and add these four, one at a time
   (Name on the left, Value on the right):

   | Name | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | your `sk-ant-…` key from Step 2 |
   | `SUPABASE_URL` | your Project URL from Step 3 |
   | `SUPABASE_SERVICE_ROLE_KEY` | your service_role key from Step 3 |
   | `ADMIN_PASSCODE` | a passcode you choose — this opens your Admin Panel |

5. Click **Deploy**. Wait about 2 minutes.
6. 🎉 Vercel shows "Congratulations" and your live address, something like
   `https://skin-care-assistant.vercel.app`. Click it — your app is live on the internet.

---

## STEP 6 — First-time setup as admin (10 min)

1. Open your live app. At the bottom-right, click the small grey **Admin** link.
2. Enter the `ADMIN_PASSCODE` you chose in Step 5.
3. **Sources tab** → **Upload source file** → upload your book files.
   - The two `.txt` files prepared earlier (`Skin_Diseases_Bangla.txt` and
     `Skin_Diseases_English.txt`) are the fastest and most reliable option.
   - You can also upload `.docx`, `.csv`, `.xlsx`, or `.pdf` (PDFs are read by AI and
     take a few minutes; a counter shows progress).
4. **Branding tab** → set your app name, tagline, welcome text, suggested questions,
   disclaimer and theme color → **Save changes**.
5. Close the panel and ask a test question in both English and Bangla.

---

## STEP 7 — Install it on phones

Share your address with users. Installing takes them 10 seconds:

- **Android (Chrome):** an **"Install app"** button appears in the app's header
  (or Chrome menu ⋮ → *Install app / Add to Home screen*).
- **iPhone (Safari):** tap the **Share** button (square with arrow) → **Add to Home Screen**.

After that it opens fullscreen from their home screen like any app.

> **Tip:** Make a free QR code of your address (e.g. at qr-code-generator.com) for
> posters, leaflets or pharmacy counters.

---

## OPTIONAL — Your own web address (~$10–15/year)

Buy a domain (e.g. from Namecheap, or a `.com.bd` registrar) and in Vercel go to
your project → **Settings → Domains → Add**. Vercel shows exactly which two records to
enter at your registrar. Your app then lives at e.g. `www.yourbrand.com`.

---

## Everyday things

**Change the admin passcode:** Vercel → project → Settings → Environment Variables →
edit `ADMIN_PASSCODE` → Deployments → Redeploy the latest one.

**Update your books:** just use the Admin Panel. No redeploy needed — changes are
live for everyone instantly.

**Update the app itself (new features):** you'll receive replacement files. Upload
them to GitHub the same way as Step 4 (GitHub will ask to replace existing files).
Vercel redeploys automatically within ~2 minutes, and installed phones pick up the
new version next time they open the app.

**Check costs:** console.anthropic.com → Usage. Hosting and database stay free
at normal usage levels.

---

## If something goes wrong

- **"Couldn't reach the server" in the app** → one of the four environment
  variables in Vercel is missing or mistyped. Check Settings → Environment
  Variables, fix it, then Deployments → Redeploy.
- **"Wrong passcode"** → it must exactly match `ADMIN_PASSCODE` in Vercel
  (it is case-sensitive).
- **Answers fail / "couldn't connect just now"** → check your Anthropic key is
  valid and billing is set up at console.anthropic.com.
- **Deploy fails on Vercel** → most often the `api`, `src` or `public` folder wasn't
  uploaded to GitHub as a folder. Re-upload and make sure the folder structure matches
  this package.
- **The Install button doesn't show on Android** → it only appears after the site
  has been visited once and on HTTPS (Vercel gives you HTTPS automatically). Users can
  always use Chrome menu ⋮ → Install app.
