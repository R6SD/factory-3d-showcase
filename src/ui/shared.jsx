import React from 'react';

export function Card({title,action,children}){return <section className="card"><div className="card-head"><h2>{title}</h2>{action}</div>{children}</section>}
