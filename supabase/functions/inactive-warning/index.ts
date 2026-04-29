import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Inactive-account warning mailer.
//
// Compliance plan item 13 — GDPR Art. 5(1)(e) storage limitation. Sends the
// 23-month inactivity warning email so users have 30 days to come back before
// their account is purged at 24 months.
//
// Trigger: Cloud Scheduler weekly Mon 5:30 AM Europe/Bucharest, 30 min after
// the flag-inactive cron has marked the queue. See README.md for the gcloud
// command. Auth: Bearer ${CRON_SECRET} (same secret used by all retention
// crons).
//
// Pipeline:
//   1. SELECT id, email, locale FROM profiles WHERE the row is in the queue
//      (inactive_warning_sent_at IS NOT NULL AND email_sent_at IS NULL).
//   2. For each row, POST to Resend's REST API to actually deliver the email.
//   3. On success, UPDATE inactive_warning_email_sent_at = NOW().
//   4. On transient failure, log + skip (row stays in the queue).
//
// Idempotency: a row leaves the queue only after a successful delivery is
// recorded. Repeated invocations re-send only to rows that haven't been
// delivered yet.

const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM_ADDRESS = 'Defensive Pedal <team@defensivepedal.com>';
const REPLY_TO = 'privacy@defensivepedal.com';
const BATCH_SIZE = 50;

// Days the user has to act after the warning is sent before the account is
// purged. Mirrors `select_purgeable_inactive_users()` SQL definition.
const GRACE_DAYS = 30;

interface QueueRow {
  id: string;
  email: string;
  locale: string | null;
  inactive_warning_sent_at: string;
}

interface Translation {
  subject: string;
  text: string;
  html: string;
}

const buildContent = (locale: 'en' | 'ro', deletionDate: string): Translation => {
  if (locale === 'ro') {
    return {
      subject: `Contul tău Defensive Pedal nu a fost folosit de 23 de luni`,
      text: [
        `Bună,`,
        ``,
        `Nu am văzut activitate pe contul tău Defensive Pedal de 23 de luni. Pentru `,
        `a respecta regulile GDPR de minimizare a datelor, conturile inactive timp `,
        `de 24 de luni sunt șterse automat împreună cu toate datele asociate — `,
        `istoricul curselor, insignele, XP, profilul, totul.`,
        ``,
        `Dacă vrei să păstrezi contul, deschide aplicația o singură dată înainte `,
        `de ${deletionDate}. Asta contează ca activitate și resetează contorul.`,
        ``,
        `Dacă preferi să ștergem contul acum, poți face asta singur din `,
        `Profil → Cont → Șterge contul, sau pe web la `,
        `https://routes.defensivepedal.com/account-deletion.`,
        ``,
        `Întrebări: privacy@defensivepedal.com`,
        ``,
        `Defensive Pedal`,
      ].join('\n'),
      html: [
        `<!DOCTYPE html>`,
        `<html lang="ro"><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111827; line-height: 1.6;">`,
        `<p>Bună,</p>`,
        `<p>Nu am văzut activitate pe contul tău <strong>Defensive Pedal</strong> de 23 de luni. Pentru a respecta regulile GDPR de minimizare a datelor, conturile inactive timp de 24 de luni sunt șterse automat împreună cu toate datele asociate &mdash; istoricul curselor, insignele, XP, profilul, totul.</p>`,
        `<p style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 12px 16px; border-radius: 4px;"><strong>Dacă vrei să păstrezi contul</strong>, deschide aplicația o singură dată înainte de <strong>${deletionDate}</strong>. Asta contează ca activitate și resetează contorul.</p>`,
        `<p>Dacă preferi să ștergem contul acum, poți face asta singur din <strong>Profil → Cont → Șterge contul</strong> în aplicație, sau pe web la <a href="https://routes.defensivepedal.com/account-deletion" style="color: #FACC15;">routes.defensivepedal.com/account-deletion</a>.</p>`,
        `<p style="color: #71717A; font-size: 14px;">Întrebări: <a href="mailto:privacy@defensivepedal.com" style="color: #FACC15;">privacy@defensivepedal.com</a></p>`,
        `<p style="color: #71717A; font-size: 13px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #E5E7EB;">Defensive Pedal</p>`,
        `</body></html>`,
      ].join(''),
    };
  }

  // Default: English
  return {
    subject: `Your Defensive Pedal account hasn't been used in 23 months`,
    text: [
      `Hi,`,
      ``,
      `We haven't seen activity on your Defensive Pedal account in 23 months. `,
      `To respect GDPR data-minimization rules, accounts that stay inactive `,
      `for 24 months are automatically deleted along with all their data — `,
      `trip history, badges, XP, profile, everything.`,
      ``,
      `If you'd like to keep your account, just open the app once before `,
      `${deletionDate}. That counts as activity and resets the timer.`,
      ``,
      `If you'd rather we delete your account now, you can do that yourself `,
      `from Profile → Account → Delete account in the app, or on the web at `,
      `https://routes.defensivepedal.com/account-deletion.`,
      ``,
      `Questions: privacy@defensivepedal.com`,
      ``,
      `Defensive Pedal`,
    ].join('\n'),
    html: [
      `<!DOCTYPE html>`,
      `<html lang="en"><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111827; line-height: 1.6;">`,
      `<p>Hi,</p>`,
      `<p>We haven't seen activity on your <strong>Defensive Pedal</strong> account in 23 months. To respect GDPR data-minimization rules, accounts that stay inactive for 24 months are automatically deleted along with all their data &mdash; trip history, badges, XP, profile, everything.</p>`,
      `<p style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 12px 16px; border-radius: 4px;"><strong>If you'd like to keep your account</strong>, just open the app once before <strong>${deletionDate}</strong>. That counts as activity and resets the timer.</p>`,
      `<p>If you'd rather we delete your account now, you can do that yourself from <strong>Profile → Account → Delete account</strong> in the app, or on the web at <a href="https://routes.defensivepedal.com/account-deletion" style="color: #FACC15;">routes.defensivepedal.com/account-deletion</a>.</p>`,
      `<p style="color: #71717A; font-size: 14px;">Questions: <a href="mailto:privacy@defensivepedal.com" style="color: #FACC15;">privacy@defensivepedal.com</a></p>`,
      `<p style="color: #71717A; font-size: 13px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #E5E7EB;">Defensive Pedal</p>`,
      `</body></html>`,
    ].join(''),
  };
};

const formatDeletionDate = (warningSentAt: string, locale: 'en' | 'ro'): string => {
  const date = new Date(new Date(warningSentAt).getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
  // Always render in the user's locale + Bucharest timezone.
  return date.toLocaleDateString(locale === 'ro' ? 'ro-RO' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Bucharest',
  });
};

const sendEmail = async (
  resendApiKey: string,
  to: string,
  content: Translation,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> => {
  const resp = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to,
      reply_to: REPLY_TO,
      subject: content.subject,
      text: content.text,
      html: content.html,
      // Tag for Resend dashboard filtering / metrics.
      tags: [
        { name: 'category', value: 'retention' },
        { name: 'template', value: 'inactive-warning' },
      ],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '<no body>');
    return {
      ok: false,
      error: `Resend HTTP ${resp.status}: ${body.slice(0, 200)}`,
    };
  }

  const data = (await resp.json().catch(() => null)) as { id?: string } | null;
  return { ok: true, id: data?.id ?? '<unknown>' };
};

Deno.serve(async (req: Request): Promise<Response> => {
  // Method gate
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Auth gate (matches the rest of the retention crons)
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret) {
    return new Response(
      JSON.stringify({ error: 'CRON_SECRET not configured on the function' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Resend gate
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    return new Response(
      JSON.stringify({ error: 'RESEND_API_KEY not configured on the function' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }

  // Supabase service-role client (Edge Functions inherit these env vars
  // automatically when deployed; they are also available locally via
  // `supabase functions serve`).
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseServiceRole) {
    return new Response(
      JSON.stringify({ error: 'Supabase env vars missing' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRole, {
    auth: { persistSession: false },
  });

  // Pull this tick's batch from the queue. We use an RPC because email lives
  // on auth.users (not public.profiles), and PostgREST does not expose the
  // auth schema for cross-schema joins. The RPC is service-role only.
  const { data: queue, error: queueError } = await supabase
    .rpc('get_inactive_warning_queue', { batch_size: BATCH_SIZE });

  if (queueError) {
    console.error('[inactive-warning] queue read failed', queueError);
    return new Response(
      JSON.stringify({ error: 'Queue read failed', detail: queueError.message }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }

  const rows = (queue ?? []) as QueueRow[];
  const sentIds: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const row of rows) {
    if (!row.email) {
      console.warn('[inactive-warning] skipping row without email', row.id);
      continue;
    }

    const locale: 'en' | 'ro' = row.locale === 'ro' ? 'ro' : 'en';
    const deletionDate = formatDeletionDate(row.inactive_warning_sent_at, locale);
    const content = buildContent(locale, deletionDate);

    const result = await sendEmail(resendApiKey, row.email, content);

    if (!result.ok) {
      console.error('[inactive-warning] send failed', { userId: row.id, error: result.error });
      failed.push({ id: row.id, error: result.error });
      continue;
    }

    const { error: markError } = await supabase
      .from('profiles')
      .update({ inactive_warning_email_sent_at: new Date().toISOString() })
      .eq('id', row.id);

    if (markError) {
      // The email did go out, but we couldn't mark it. Log loudly so a human
      // can reconcile (otherwise the user would receive duplicate warnings on
      // the next tick). Counted as failed for this run.
      console.error(
        '[inactive-warning] mark failed AFTER send (possible duplicate next tick)',
        { userId: row.id, error: markError.message, resendId: result.id },
      );
      failed.push({
        id: row.id,
        error: `mark-after-send failure: ${markError.message}`,
      });
      continue;
    }

    console.log('[inactive-warning] sent', {
      userId: row.id,
      locale,
      resendId: result.id,
      deletionDate,
    });
    sentIds.push(row.id);
  }

  return new Response(
    JSON.stringify({
      runAt: new Date().toISOString(),
      queueSize: rows.length,
      sentCount: sentIds.length,
      failedCount: failed.length,
      sentIds,
      failed,
      batchComplete: rows.length < BATCH_SIZE,
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  );
});
