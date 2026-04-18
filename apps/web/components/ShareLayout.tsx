import type { ReactNode } from 'react';

interface ShareLayoutProps {
  map: ReactNode;
  stats: ReactNode;
  ctas: ReactNode;
}

// Mobile-first responsive: below 720px map stacks above the panel; 720px+ map takes remaining
// width with the panel as a 400px sidebar. Scoped class names avoid global leakage.
const RESPONSIVE_CSS = `
.dp-share-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  background: #111827;
  color: #F5F5F7;
}
.dp-share-map {
  position: relative;
  flex: 1 1 auto;
  min-height: 280px;
}
.dp-share-panel {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  background: rgba(17, 24, 39, 0.92);
  backdrop-filter: blur(12px);
}
@media (min-width: 720px) {
  .dp-share-layout { flex-direction: row; }
  .dp-share-map { flex: 1 1 auto; min-height: 100vh; min-height: 100dvh; }
  .dp-share-panel { flex: 0 0 400px; max-width: 400px; overflow-y: auto; }
}
`;

export function ShareLayout({ map, stats, ctas }: ShareLayoutProps) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: RESPONSIVE_CSS }} />
      <main className="dp-share-layout">
        <div className="dp-share-map">{map}</div>
        <aside className="dp-share-panel" aria-label="Route summary and actions">
          {stats}
          {ctas}
        </aside>
      </main>
    </>
  );
}
