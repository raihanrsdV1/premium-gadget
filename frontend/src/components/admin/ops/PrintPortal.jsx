import React from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders `children` straight into <body>, outside the app, and only for
 * printing: on paper the whole app (#root) is hidden and only this shows.
 * On screen it is invisible, so pages render their own preview.
 *
 *   <PrintPortal page="receipt"><Receipt sale={sale} /></PrintPortal>
 *   <Button onClick={() => window.print()}>Print</Button>
 *
 * page: 'receipt' (80 mm thermal roll) or 'a4' (invoice).
 */
// Receipts set no paper size: the thermal printer's driver supplies the
// 80 mm roll, so nothing is wasted on a fixed page length.
const PAGE_CSS = {
  receipt: '@page { margin: 2mm; }',
  a4: '@page { size: A4; margin: 12mm; }',
};

export const PrintPortal = ({ page = 'a4', children }) => createPortal(
  <div className="ops-print-root">
    <style>{`
      .ops-print-root { display: none; }
      @media print {
        ${PAGE_CSS[page] || PAGE_CSS.a4}
        html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
        body > #root { display: none !important; }
        .ops-print-root { display: block; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `}</style>
    {children}
  </div>,
  document.body,
);

export default PrintPortal;
