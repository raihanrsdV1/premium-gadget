import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, GripVertical, Loader2, Star, Trash2 } from 'lucide-react';
import { ImageUploader } from '../ImageUploader';
import { IconButton } from './CatalogUi';
import { cn } from '@/lib/utils';

/**
 * Product photo grid: upload, reorder (arrows or drag), pick the main photo,
 * edit alt text, delete. Purely presentational — the parent decides whether a
 * change is saved right away (existing product) or kept for the create call.
 *
 *   images: [{ id, url, alt_text, is_primary }] in display order
 */
export const ImageManager = ({
  images, onUploaded, onMove, onMakePrimary, onAltChange, onDelete, onError,
  busyId, disabled, max = 30,
}) => {
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const full = images.length >= max;

  const drop = (to) => {
    if (dragFrom !== null && dragFrom !== to) onMove(dragFrom, to);
    setDragFrom(null);
    setDragOver(null);
  };

  return (
    <div className="space-y-4">
      {images.length > 0 && (
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Product photos">
          {images.map((img, i) => (
            <li key={img.id}
              draggable={!disabled}
              onDragStart={(e) => { setDragFrom(i); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(e) => { if (dragFrom !== null) { e.preventDefault(); setDragOver(i); } }}
              onDragLeave={() => setDragOver((o) => (o === i ? null : o))}
              onDrop={(e) => { e.preventDefault(); drop(i); }}
              onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
              className={cn('group overflow-hidden rounded-lg border bg-white transition-shadow',
                img.is_primary ? 'border-primary ring-2 ring-primary/30' : '',
                dragOver === i && dragFrom !== i ? 'ring-2 ring-primary' : '',
                dragFrom === i ? 'opacity-50' : '')}>
              <div className="relative aspect-square bg-slate-50">
                <img src={img.url} alt={img.alt_text || ''} className="h-full w-full object-cover" draggable={false} />
                <span className="absolute left-2 top-2 rounded bg-slate-900/70 px-1.5 py-0.5 text-xs font-semibold text-white">{i + 1}</span>
                {img.is_primary && (
                  <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                    <Star className="h-3 w-3 fill-current" />Main photo
                  </span>
                )}
                {!disabled && <GripVertical className="absolute bottom-2 right-2 h-4 w-4 text-white drop-shadow opacity-0 group-hover:opacity-100" aria-hidden="true" />}
                {busyId === img.id && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/60"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                )}
              </div>
              <div className="space-y-2 p-2">
                <input value={img.alt_text || ''} disabled={disabled} maxLength={255}
                  onChange={(e) => onAltChange(img.id, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                  aria-label={`Description of photo ${i + 1}`} placeholder="Describe the photo"
                  className="h-8 w-full rounded-md border border-input bg-white px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-slate-50" />
                <div className="flex items-center justify-between gap-1">
                  <div className="flex">
                    <IconButton icon={ChevronLeft} label={`Move photo ${i + 1} left`} disabled={disabled || i === 0} onClick={() => onMove(i, i - 1)} />
                    <IconButton icon={ChevronRight} label={`Move photo ${i + 1} right`} disabled={disabled || i === images.length - 1} onClick={() => onMove(i, i + 1)} />
                  </div>
                  <div className="flex">
                    {!img.is_primary && (
                      <IconButton icon={Star} label={`Make photo ${i + 1} the main photo`} disabled={disabled} onClick={() => onMakePrimary(img.id)} />
                    )}
                    <IconButton icon={Trash2} tone="danger" label={`Delete photo ${i + 1}`} disabled={disabled} onClick={() => onDelete(img.id)} />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {full ? (
        <p className="text-sm text-slate-500">A product can have up to {max} photos. Delete one to add another.</p>
      ) : (
        <ImageUploader disabled={disabled} onUploaded={onUploaded} onError={onError} label="Choose photos" />
      )}
      <p className="text-xs text-muted-foreground">
        The <b>main photo</b> is shown in search results, product cards and when the link is shared. Drag photos or use the arrows to change the order on the product page.
      </p>
    </div>
  );
};

export default ImageManager;
