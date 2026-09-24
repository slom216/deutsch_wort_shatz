import type { ReactNode } from 'react';

import './StatCard.css';

interface StatCardProps {
  readonly label: string;
  readonly value: ReactNode;
  readonly hint?: string;
  /** Decorative shape above the label, drawn at its native size. */
  readonly icon?: string;
}

/**
 * Single figure with its label. Used by the dashboard and progress screens.
 *
 * Renders a `div` of `dt`/`dd` pairs, so it must sit directly inside a `<dl>`.
 */
export function StatCard({ label, value, hint, icon }: StatCardProps): ReactNode {
  return (
    <div className="stat-card">
      <dt className="stat-card__label">
        {icon ? <img className="stat-card__icon" src={icon} alt="" /> : null}
        {label}
      </dt>
      <dd className="stat-card__value">{value}</dd>
      {hint ? <dd className="stat-card__hint">{hint}</dd> : null}
    </div>
  );
}
