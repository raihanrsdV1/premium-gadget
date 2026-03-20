import React from 'react';

const RepairServiceCard = ({ service }) => {
  return (
    <div className="border p-4 rounded-lg">
       <h3 className="font-bold">{service?.name || 'Repair Service'}</h3>
       <p>{service?.description || 'Description'}</p>
    </div>
  );
};

export default RepairServiceCard;
