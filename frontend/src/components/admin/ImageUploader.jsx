import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { useUploadImagesMutation } from '../../store/api/mediaApi';
import { errorText } from '../../lib/apiError';

const MAX_FILES = 10;
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Drop zone + file picker. Uploads to POST /uploads/images and reports the
 * stored media: onUploaded([{ id, url, width, height }]).
 * The server re-encodes every file, so only real images get through.
 */
export const ImageUploader = ({ onUploaded, onError, disabled, label = 'Add photos' }) => {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [upload, { isLoading }] = useUploadImagesMutation();

  const handle = async (fileList) => {
    const files = [...(fileList || [])];
    if (!files.length) return;
    const bad = files.find((f) => !f.type.startsWith('image/'));
    if (bad) return onError?.(`"${bad.name}" isn't an image.`);
    const big = files.find((f) => f.size > MAX_BYTES);
    if (big) return onError?.(`"${big.name}" is larger than 8 MB.`);
    if (files.length > MAX_FILES) return onError?.(`Upload at most ${MAX_FILES} photos at a time.`);
    try {
      const media = await upload(files).unwrap();
      onUploaded?.(media);
    } catch (err) {
      onError?.(errorText(err, 'Upload failed.'));
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); if (!disabled) handle(e.dataTransfer.files); }}
      className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${dragging ? 'border-primary bg-primary/5' : 'border-slate-300 bg-slate-50'} ${disabled ? 'opacity-60' : ''}`}
    >
      {isLoading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <ImagePlus className="h-6 w-6 text-slate-400" />}
      <p className="text-sm text-slate-600">
        {isLoading ? 'Uploading…' : <>Drag photos here or{' '}
          <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className="font-semibold text-primary hover:underline">{label.toLowerCase()}</button></>}
      </p>
      <p className="text-xs text-slate-500">JPG, PNG, WebP or AVIF · up to 8 MB each · stripped of location data</p>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple hidden onChange={(e) => handle(e.target.files)} />
    </div>
  );
};

export default ImageUploader;
