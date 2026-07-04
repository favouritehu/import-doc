import { Outlet } from 'react-router-dom';
import { useIsMobile } from '../lib/useIsMobile';
import { useStore } from '../store/store';
import { MobileBottomNav } from './MobileBottomNav';
import { Sidebar } from './Sidebar';
import { Toast } from './Toast';
import { CommandPalette } from './CommandPalette';

export function AppShell() {
  const isMobile = useIsMobile();
  const { ready } = useStore();
  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-page text-muted">
        <div className="anim-pulse text-sm font-semibold">Loading…</div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen bg-page text-ink">
      {!isMobile && <Sidebar />}
      <div className="flex min-w-0 flex-1 flex-col pb-24 md:pb-0">
        <Outlet />
      </div>
      {isMobile && <MobileBottomNav />}
      <Toast />
      <CommandPalette />
    </div>
  );
}

/** Standard padded content container used under a screen's TopBar. */
export function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-content px-4 py-4 md:px-6 md:py-6">{children}</div>;
}
