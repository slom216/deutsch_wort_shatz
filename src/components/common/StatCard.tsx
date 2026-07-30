import type { ReactNode } from 'react';

import './StatCard.css';

interface StatCardProps {
  readonly label: string;
  readonly value: ReactNode;
  readonly hint?: string;
}

/** Single figure with its label. Used by the dashboard and progress screens. */
export function StatCard({ label, value, hint }: StatCardProps): ReactNode {
  return (
    <div className="stat-card">
      <dt className="stat-card__label">{label}</dt>
      <dd className="stat-card__value">{value}</dd>
      {hint ? <p className="stat-card__hint">{hint}</p> : null}
    </div>
  );
}
