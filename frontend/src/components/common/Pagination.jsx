import React from 'react';

const Pagination = ({ current, total, onPageChange }) => {
  return (
    <div className="flex space-x-2">
      {/* Pagination Stub */}
      <button disabled={current === 1}>Prev</button>
      <span>{current} / {total}</span>
      <button disabled={current === total}>Next</button>
    </div>
  );
};

export default Pagination;
