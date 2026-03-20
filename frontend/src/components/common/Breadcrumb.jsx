import React from 'react';
import { Link } from 'react-router-dom';

const Breadcrumb = ({ items = [] }) => {
  return (
    <nav className="flex items-center text-sm text-muted-foreground">
      {items.map((item, idx) => (
        <React.Fragment key={idx}>
          {item.href ? <Link to={item.href} className="hover:text-foreground">{item.label}</Link> : <span className="text-foreground">{item.label}</span>}
          {idx < items.length - 1 && <span className="mx-2">/</span>}
        </React.Fragment>
      ))}
    </nav>
  );
};

export default Breadcrumb;
