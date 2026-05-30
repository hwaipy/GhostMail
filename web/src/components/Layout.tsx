import { useState } from 'react';
import Sidebar from './Sidebar';
import MessageList from './MessageList';
import MessageView from './MessageView';

export default function Layout() {
  const [folder, setFolder] = useState<string>('INBOX');
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  // mobile pane navigation: which pane is showing
  const [pane, setPane] = useState<'folders' | 'list' | 'view'>('list');

  function pickFolder(path: string) {
    setFolder(path);
    setSelectedUid(null);
    setPane('list');
  }

  function pickMessage(uid: number) {
    setSelectedUid(uid);
    setPane('view');
  }

  return (
    <div className="flex h-full w-full bg-white text-ink-900">
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

      {/* Message list — middle pane */}
      <section
        className={[
          'h-full w-full shrink-0 border-r border-ink-200 md:w-[22rem] lg:w-[24rem]',
          pane === 'list' ? 'block' : 'hidden md:block',
        ].join(' ')}
      >
        <MessageList
          folder={folder}
          selectedUid={selectedUid}
          onPick={pickMessage}
          onOpenFolders={() => setPane('folders')}
        />
      </section>

      {/* Message view — right pane */}
      <main
        className={[
          'h-full min-w-0 flex-1',
          pane === 'view' ? 'block' : 'hidden md:block',
        ].join(' ')}
      >
        <MessageView
          uid={selectedUid}
          folder={folder}
          onBack={() => setPane('list')}
        />
      </main>
    </div>
  );
}
