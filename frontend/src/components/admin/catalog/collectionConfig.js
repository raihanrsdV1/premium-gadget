export const TONES = [
  { value: 'coral', label: 'Coral', cls: 'bg-rose-500 text-white' },
  { value: 'blue', label: 'Blue', cls: 'bg-blue-600 text-white' },
  { value: 'navy', label: 'Navy', cls: 'bg-slate-800 text-white' },
  { value: 'green', label: 'Green', cls: 'bg-emerald-600 text-white' },
  { value: 'amber', label: 'Amber', cls: 'bg-amber-400 text-slate-900' },
];


export const SOURCES = [
  { value: 'manual', label: 'Picked by hand', help: 'You choose the products and their order.' },
  { value: 'newest', label: 'Newest products', help: 'Products added in the last few days, newest first.' },
  { value: 'on_sale', label: 'Products on sale', help: 'Products with a running sale, biggest discount first.' },
  { value: 'best_selling', label: 'Best selling', help: 'Most units sold (website and in-store) in the last few days.' },
  { value: 'featured', label: 'Featured products', help: 'Products marked "featured" in the product editor.' },
];

export const WINDOWED = ['newest', 'best_selling'];

export const sourceText = (c) => {
  const s = SOURCES.find((x) => x.value === c.source);
  if (!s) return c.source;
  if (WINDOWED.includes(c.source)) return `${s.label} (last ${c.source_days || 30} days)`;
  return s.label;
};

export const COLLECTION_STATUS = {
  live: { label: 'Live', tone: 'green' },
  scheduled: { label: 'Scheduled', tone: 'blue' },
  ended: { label: 'Ended', tone: 'slate' },
  off: { label: 'Off', tone: 'amber' },
};

export const LAYOUTS = [
  { value: 'carousel', label: 'Carousel (sliding row)' },
  { value: 'grid', label: 'Grid' },
  { value: 'countdown', label: 'Countdown (needs an end time)' },
];
