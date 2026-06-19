import { useRef, useState } from 'react';
import { FileUp, UploadCloud } from 'lucide-react';
import type { Doc } from '../types';
import { docLabel } from '../lib/docs';
import { Button } from './Button';
import { Modal } from './Overlay';

/** Real client-side file picker. Phase A holds the file in memory (object URL);
 *  Phase B swaps onUpload for a StorageService POST. */
export function UploadModal({
  doc,
  onUpload,
  onClose,
}: {
  doc: Doc;
  onUpload: (file: { name: string; url: string }) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);

  return (
    <Modal
      title={`Upload — ${docLabel(doc.type)}`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!picked}
            onClick={() => {
              if (!picked) return;
              onUpload({ name: picked.name, url: URL.createObjectURL(picked) });
              onClose();
            }}
          >
            Upload document
          </Button>
        </div>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => setPicked(e.target.files?.[0] ?? null)}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="grid w-full place-items-center gap-2 rounded-card border border-dashed border-divider bg-page py-10 text-center text-muted hover:border-navy"
      >
        {picked ? <FileUp size={28} className="text-navy" /> : <UploadCloud size={28} />}
        <p className="text-sm font-semibold text-medium">{picked ? picked.name : 'Choose a file'}</p>
        <p className="text-xs">PDF, JPG or PNG</p>
      </button>
    </Modal>
  );
}
