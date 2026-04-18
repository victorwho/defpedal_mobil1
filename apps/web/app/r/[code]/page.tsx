import { notFound } from 'next/navigation';

interface PageProps {
  params: { code: string };
}

export default function RouteSharePage({ params: _params }: PageProps) {
  notFound();
}
