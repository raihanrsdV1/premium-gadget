import React from 'react';

const RepairTracker = ({ trackingNumber }) => {
  return (
    <div className="border p-4 rounded-lg">
      <h3 className="font-bold">Tracking Status for {trackingNumber}</h3>
      <p>Status: Pending</p>
    </div>
  );
};

export default RepairTracker;
