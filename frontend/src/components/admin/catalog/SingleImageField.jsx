import React, { useId, useRef } from 'react';
import { ImagePlus, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useUploadImagesMutation } from '../../../store/api/mediaApi';
import { errorText } from '../../../lib/apiError';
import { Button } from '../../ui/Button';
import { cn } from '@/lib/utils';

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * One image (logo, category banner, homepage banner…). Uploads to
 * POST /uploads/images and reports the stored URL: onChange(url | null).
 */
export const SingleImageField = ({ label, hint, value, onChange, onError, aspect = 'aspect-[16/9]', fit = 'object-cover', disabled, className }) => {
  const inputRef = useRef(null);
  const labelId = useId();
  const [upload, { isLoading }] = useUploadImagesMutation();

  const handle = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { onError?.(`"${file.name}" isn't an image.`); return; }
    if (file.size > MAX_BYTES) { onError?.(`"${file.name}" is larger than 8 MB.`); return; }
    try {
      const [media] = await upload([file]).unwrap();
      onChange(media.url, media);
    } catch (err) {
      onError?.(errorText(err, 'Upload failed.'));
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className={cn('space-y-1.5', className)} role="group" aria-labelledby={labelId}>
      <span id={labelId} className="block text-sm font-medium text-slate-700">{label}</span>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (!disabled) handle(e.dataTransfer.files?.[0]); }}
        className={cn('relative overflow-hidden rounded-lg border-2 border-dashed bg-slate-50', aspect, value ? 'border-transparent' : 'border-slate-300')}>
        {value ? (
          <img src={value} alt="" className={cn('h-full w-full bg-white', fit)} />
        ) : (
          <button type="button" disabled={disabled || isLoading} onClick={() => inputRef.current?.click()}
            className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-primary">
            {isLoading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <ImagePlus className="h-6 w-6" />}
            {isLoading ? 'Uploading…' : 'Upload image'}
          </button>
        )}
        {value && isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        )}
      </div>
      {value && !disabled && (
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={isLoading} onClick={() => inputRef.current?.click()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Replace</Button>
          <Button type="button" variant="ghost" size="sm" className="text-red-600 hover:text-red-700" disabled={isLoading} onClick={() => onChange(null)}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Remove</Button>
        </div>
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden aria-label={label} onChange={(e) => handle(e.target.files?.[0])} />
    </div>
  );
};

export default SingleImageField;
