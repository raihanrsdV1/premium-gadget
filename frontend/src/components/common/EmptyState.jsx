import React from 'react';

const EmptyState = ({ title, description, icon }) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && <div className="text-4xl mb-4 text-muted-foreground">{icon}</div>}
      <h3 className="text-lg font-bold mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-sm">{description}</p>
    </div>
  );
};

export default EmptyState;
