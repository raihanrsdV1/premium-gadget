import React from 'react';

const SpecTable = ({ specifications = [] }) => {
  return (
    <div className="divide-y text-sm border rounded-lg">
      {specifications.map((spec, idx) => (
        <div key={idx} className="grid grid-cols-3 py-3 px-4 gap-4">
          <span className="text-muted-foreground font-medium">{spec.key}</span>
          <span className="col-span-2 text-foreground">{spec.value}</span>
        </div>
      ))}
    </div>
  );
};

export default SpecTable;
