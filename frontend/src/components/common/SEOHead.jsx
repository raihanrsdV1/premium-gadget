import React from 'react';
import { Helmet } from 'react-helmet-async';

const SEOHead = ({ title, description }) => {
  return (
    <Helmet>
      <title>{title ? `${title} | Premium Gadget` : 'Premium Gadget'}</title>
      <meta name="description" content={description || 'Premium laptops, accessories, and repairs in Bangladesh'} />
    </Helmet>
  );
};

export default SEOHead;
