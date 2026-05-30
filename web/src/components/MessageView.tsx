import { ArrowLeft } from 'lucide-react';

export default function MessageView({
  uid,
  folder,
  onBack,
}: {
  uid: number | null;
  folder: string;
  onBack: () => void;
}) {
  if (uid == null) {
    return (
      <div className="hidden h-full place-items-center text-sm text-ink-400 md:grid">
        Select a message
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="flex items-center gap-2 border-b border-ink-200 px-3 py-3 md:px-5">
        <button
          onClick={onBack}
          className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100 md:hidden"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="text-xs text-ink-400">
          {folder} · #{uid}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-6 text-sm text-ink-500">
        Message body rendering arrives next iteration (parse + sanitize + attachments).
      </div>
    </div>
  );
}
