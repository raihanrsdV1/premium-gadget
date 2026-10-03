import React from 'react';
import { cn } from '@/lib/utils';
import { TONES } from './collectionConfig';

/** The little label shown on product cards. */
export const ToneChip = ({ label, tone = 'coral', className }) => {
  if (!label) return <span className="text-xs text-slate-400">No badge</span>;
  const t = TONES.find((x) => x.value === tone) || TONES[0];
  return <span className={cn('inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold', t.cls, className)}>{label}</span>;
};
