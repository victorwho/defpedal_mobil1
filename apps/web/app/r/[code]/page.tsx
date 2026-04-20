import type { Metadata } from 'next';
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

// Slice 7a: populate OG + Twitter meta from the real share so the card
// title/description match the route. The OG image URL is auto-wired by
// Next.js 15's `opengraph-image.tsx` convention (sibling file in this
// folder) — no manual openGraph.images override here.
//
// noindex stays set here too even though the root layout already declares
// it (belt-and-suspenders: if the root default ever changes, share pages
// must still be private).
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const result = await fetchRouteShare(code);

  const baseMeta: Metadata = {
    robots: { index: false, follow: false },
    // twitter:card=summary_large_image pairs with the 1200×630
    // opengraph-image.tsx so Twitter shows a big card not a small square.
    twitter: { card: 'summary_large_image' },
  };

  if (result.status !== 'ok') {
    return {
      ...baseMeta,
      title: 'Defensive Pedal',
      description: 'Safer cycling routes, shared.',
    };
  }

  const { route, sharerDisplayName } = result.data;
  const km = (route.distanceMeters / 1000).toFixed(1);
  const displayName = sharerDisplayName ?? 'A Defensive Pedal rider';
  const title = `${displayName} shared a ${km} km cycling route`;
  const description = 'Safer cycling routes, shared. Open in Defensive Pedal.';

  return {
    ...baseMeta,
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'Defensive Pedal',
    },
  };
}

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
