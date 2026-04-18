import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { fetchRouteShare } from '../../../lib/fetchRouteShare';
import { ShareCtas } from '../../../components/ShareCtas';
import { ShareGoneCard } from '../../../components/ShareGoneCard';
import { ShareLayout } from '../../../components/ShareLayout';
import { ShareMap } from '../../../components/ShareMap';
import { ShareStatsBar } from '../../../components/ShareStatsBar';

interface PageProps {
  // Next.js 15 — dynamic route params are a Promise, must be awaited.
  params: Promise<{ code: string }>;
}

// Force dynamic — each code resolves server-side with no-store fetch so revokes + view-count
// updates take effect on the next request.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Cookie lifetime matches the PRD default share expiry.
const SHARE_CODE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export default async function RouteSharePage({ params }: PageProps) {
  const { code } = await params;
  const result = await fetchRouteShare(code);

  if (result.status === 'not_found') notFound();
  if (result.status === 'gone') return <ShareGoneCard />;
  if (result.status === 'error') throw new Error(result.message);

  // Attribution cookie for the slice-2 claim pipeline.
  // SameSite=Lax + NOT HttpOnly — the slice-7 PostHog snippet reads this from JS to bridge
  // the web session into the mobile app's PostHog user at claim time.
  const jar = await cookies();
  jar.set('dp_share_code', code, {
    maxAge: SHARE_CODE_COOKIE_MAX_AGE_SECONDS,
    sameSite: 'lax',
    httpOnly: false,
    secure: true,
    path: '/',
  });

  return (
    <ShareLayout
      map={<ShareMap share={result.data} />}
      stats={<ShareStatsBar share={result.data} />}
      ctas={<ShareCtas code={code} />}
    />
  );
}
