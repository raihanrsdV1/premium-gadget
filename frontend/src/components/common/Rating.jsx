import React from 'react';

const Rating = ({ value, count }) => {
  return (
    <div className="flex items-center">
      {/* Rating Stub */}
      <span className="text-amber-400">★</span>
      <span className="ml-1 font-medium">{value}</span>
      {count && <span className="ml-1 text-muted-foreground">({count})</span>}
    </div>
  );
};

export default Rating;
