import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '../../../../components/admin/DataTable';
import { EditorNav } from './EditorNav';

/** Page frame shared by the new / existing product editors: back link, header, section nav. */
export const EditorShell = ({ title, description, actions, sections, children }) => (
  <div>
    <Link to="/admin/products" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900">
      <ArrowLeft className="h-4 w-4" />All products
    </Link>
    <PageHeader title={title} description={description} actions={actions} />
    <div className="xl:hidden"><EditorNav sections={sections} layout="strip" /></div>
    <div className="xl:grid xl:grid-cols-[190px_minmax(0,1fr)] xl:gap-8">
      <aside className="hidden xl:block"><EditorNav sections={sections} layout="column" /></aside>
      <div className="min-w-0 space-y-6">{children}</div>
    </div>
  </div>
);


export default EditorShell;
