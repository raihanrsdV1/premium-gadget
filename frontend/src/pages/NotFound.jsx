import React from 'react';
import { Link } from 'react-router-dom';

const NotFound = () => (
  <div className="min-h-[60vh] grid place-items-center text-center px-4">
    <div className="space-y-4">
      <img src="/brand/cat.png" alt="" className="mx-auto h-24 w-auto" />
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-slate-600">That admin page doesn&apos;t exist.</p>
      <Link to="/admin" className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white">Back to dashboard</Link>
    </div>
  </div>
);

export default NotFound;
