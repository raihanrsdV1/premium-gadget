import React from 'react';

/**
 * Premium Gadget logo: the round PG mark plus the wordmark.
 *   <BrandLogo size="md" />  ·  <BrandLogo markOnly />
 */
const SIZES = {
  sm: { mark: 'h-8 w-8', text: 'text-base' },
  md: { mark: 'h-10 w-10', text: 'text-lg' },
  lg: { mark: 'h-14 w-14', text: 'text-2xl' },
};

export const BrandLogo = ({ size = 'md', markOnly = false, className = '' }) => {
  const s = SIZES[size] || SIZES.md;
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img src="/brand/logo-mark.png" alt={markOnly ? 'Premium Gadget' : ''} className={`${s.mark} shrink-0`} />
      {!markOnly && (
        <span className={`${s.text} font-extrabold leading-none tracking-tight`}>
          <span className="text-primary">Premium</span> <span className="text-[#E8635A]">Gadget</span>
        </span>
      )}
    </span>
  );
};
