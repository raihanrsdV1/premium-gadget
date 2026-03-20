import React from 'react';

const SearchResults = ({ results }) => {
  return (
    <div>
      {/* Search Results Stub */}
      Found {results?.length || 0} results.
    </div>
  );
};

export default SearchResults;
