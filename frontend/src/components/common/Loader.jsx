import React from 'react';
import { Loader2 } from 'lucide-react';

const Loader = ({ className = "" }) => {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
};

export default Loader;
