import { useCallback, useEffect, useRef, useState } from 'react';
import Sidebar from './Sidebar';
import MessageList from './MessageList';
import MessageView from './MessageView';

const VIEW_STATE_MARK = 'gm-view';

function isMobile() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
}

export default function Layout() {
  const [folder, setFolder] = useState<string>('INBOX');
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  // mobile pane navigation: which pane is showing
  const [pane, setPane] = useState<'folders' | 'list' | 'view'>('list');
  const paneRef = useRef(pane);
  useEffect(() => {
    paneRef.current = pane;
  }, [pane]);

  // Browser back / iOS edge swipe / Android back: pop the pushed "view" state.
  useEffect(() => {
    const onPop = () => {
      setPane((p) => (p === 'view' ? 'list' : p));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function pickFolder(path: string) {
    setFolder(path);
    setSelectedUid(null);
    setPane('list');
  }

  function pickMessage(uid: number) {
    setSelectedUid(uid);
    setPane('view');
    if (isMobile() && window.history.state?.gm !== VIEW_STATE_MARK) {
      window.history.pushState({ gm: VIEW_STATE_MARK }, '');
    }
  }

  const backFromView = useCallback(() => {
    if (window.history.state?.gm === VIEW_STATE_MARK) {
      window.history.back();
    } else {
      setPane('list');
    }
  }, []);

  // Custom left-edge right-swipe → back to list. Useful on Android Chrome
  // where the system edge swipe goes to the previous browser page.
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let startT = 0;
    let tracking = false;
    const onStart = (e: TouchEvent) => {
      if (paneRef.current !== 'view') return;
      if (e.touches.length !== 1) return;
      tracking = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startT = Date.now();
    };
    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      const dt = Date.now() - startT;
      if (dx > 70 && dy < 60 && dt < 600) {
        backFromView();
      }
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
    };
  }, [backFromView]);

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-white text-ink-900">
      {/* Sidebar — always visible on md+, slide-in on mobile via `pane` */}
      <aside
        className={[
          'h-full w-64 shrink-0 border-r border-ink-200 bg-ink-50',
          'md:block',
          pane === 'folders' ? 'block' : 'hidden md:block',
        ].join(' ')}
      >
        <Sidebar
          currentFolder={folder}
          onSelect={pickFolder}
          onClose={() => setPane('list')}
        />
      </aside>

      {/* Message list — stays visible under the sliding view on mobile so it's
          revealed when the view slides off-screen. */}
      <section
        className={[
          'h-full w-full shrink-0 border-r border-ink-200 md:w-[22rem] lg:w-[24rem]',
          pane === 'folders' ? 'hidden md:block' : 'block',
        ].join(' ')}
      >
        <MessageList
          folder={folder}
          selectedUid={selectedUid}
          onPick={pickMessage}
          onOpenFolders={() => setPane('folders')}
        />
      </section>

      {/* Message view — on mobile, absolute over the list; slide in/out via
          translateX. On desktop, static and side-by-side. */}
      <main
        className={[
          'h-full min-w-0 bg-white shadow-2xl',
          'absolute inset-0 z-20 transform-gpu transition-transform duration-[260ms] ease-out',
          pane === 'view' ? 'translate-x-0' : 'translate-x-full',
          'md:relative md:inset-auto md:z-auto md:flex-1 md:translate-x-0 md:shadow-none md:transition-none',
        ].join(' ')}
      >
        <MessageView uid={selectedUid} folder={folder} onBack={backFromView} />
      </main>

      {/* Mobile-only left-edge gesture catcher. Touches inside iframes don't
          bubble to the parent window, so a tiny overlay on the edge guarantees
          we receive the swipe start. Above the sliding main pane so it's
          always reachable while the view is showing. */}
      {pane === 'view' && (
        <div
          aria-hidden
          className="pointer-events-auto absolute inset-y-0 left-0 z-30 w-7 md:hidden"
          style={{ touchAction: 'pan-y' }}
        />
      )}
    </div>
  );
}
