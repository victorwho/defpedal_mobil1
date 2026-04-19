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

// `dp_share_code` attribution cookie is set in apps/web/middleware.ts (Next.js 15
// disallows cookie mutation during Server Component render).

export default async function RouteSharePage({ params }: PageProps) {
  const { code } = await params;
  const result = await fetchRouteShare(code);

  if (result.status === 'not_found') notFound();
  if (result.status === 'gone') return <ShareGoneCard />;
  if (result.status === 'error') throw new Error(result.message);

  return (
    <ShareLayout
      map={<ShareMap share={result.data} />}
      stats={<ShareStatsBar share={result.data} />}
      ctas={<ShareCtas code={code} />}
    />
  );
}
