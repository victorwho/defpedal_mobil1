# Branded signup email setup

Checklist for turning Supabase default signup emails into branded
`team@defensivepedal.com` emails that reopen the app after confirmation.

Code is already wired up (edge function + `emailRedirectTo` + deep-link
handler). The steps below are the manual infra/dashboard work.

---

## 1. Deploy the edge function

From repo root:

```bash
supabase functions deploy email-confirm --project-ref uobubaulcdcuggnetzei
```

Verify it responds:

```bash
curl -i "https://uobubaulcdcuggnetzei.supabase.co/functions/v1/email-confirm?scheme=defensivepedal-dev&code=TEST"
```

Should return HTTP 200 with HTML containing `defensivepedal-dev://auth/callback?code=TEST`.

## 2. Resend account + domain verification

1. Sign up at [resend.com](https://resend.com) with `victorrotariu@gmail.com`.
2. Domains → Add Domain → `defensivepedal.com`.
3. Add the three DNS records Resend shows (SPF `TXT`, DKIM `CNAME` x2 or `TXT`, optional DMARC `TXT`) to whoever hosts `defensivepedal.com` DNS.
4. Wait for "Verified" status (usually < 15 min).
5. Create an API key → store safely.

## 3. Supabase SMTP config

Dashboard → Project Settings → Auth → **SMTP Settings** → Enable custom SMTP:

| Field | Value |
|---|---|
| Sender email | `team@defensivepedal.com` |
| Sender name | `Defensive Pedal` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | `<the Resend API key from step 2>` |
| Minimum interval | leave default |

Save. Send a test email from Supabase to confirm it arrives from `team@defensivepedal.com`.

## 4. Redirect URL allowlist

Dashboard → Auth → **URL Configuration** → Redirect URLs → add:

```
https://uobubaulcdcuggnetzei.supabase.co/functions/v1/email-confirm?*
defensivepedal://auth/callback
defensivepedal-dev://auth/callback
defensivepedal-preview://auth/callback
```

(Keep the existing `beta.defensivepedal.com` entries — they're used by the web build.)

Site URL can stay as-is — the per-request `emailRedirectTo` overrides it.

## 5. Email template (placeholder for now)

Dashboard → Auth → **Email Templates** → **Confirm signup**. Replace the body with a placeholder until we write the real copy:

```html
<h2>Confirm your Defensive Pedal account</h2>
<p>Tap the button below on your phone to finish signing in.</p>
<p><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 20px;background:#facc15;color:#0b0d10;text-decoration:none;border-radius:10px;font-weight:600">Confirm my account</a></p>
<p style="color:#666;font-size:12px">If you didn't create a Defensive Pedal account, ignore this email.</p>
```

Subject: `Confirm your Defensive Pedal account`.

Leave "Magic Link", "Change Email", "Reset Password" on defaults for now.

## 6. End-to-end test

1. Rebuild dev APK (`./gradlew installDevelopmentDebug` from `apps/mobile/android`) — not strictly required for this change, but useful if you haven't recently.
2. In the app, open Account → Sign up → enter a test email + password.
3. Tap Sign up → see "Check your inbox" message.
4. Open the email on the phone (must be the device the app is installed on, so the PKCE verifier matches).
5. Tap the confirm button → browser opens `functions/v1/email-confirm` → bounces to `defensivepedal-dev://auth/callback?code=...` → the app handles the deep link and exchanges the code for a session.
6. The Account screen should now show the signed-in state with the confirmed email.

## Rollback

If anything breaks:

- Disable custom SMTP in Supabase dashboard → reverts to default sender.
- Remove `emailRedirectTo` from `signUpWithEmail` in `apps/mobile/src/lib/supabase.ts` → reverts to using Site URL.
- The edge function can stay deployed; nothing calls it unless `emailRedirectTo` is wired.
