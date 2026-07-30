import type { ReactNode } from 'react';

import './PhaseNotice.css';

interface PhaseNoticeProps {
  /** The development phase that delivers this screen's behaviour. */
  readonly phase: string;
  readonly children: ReactNode;
}

/**
 * Marks a screen whose real behaviour arrives in a later development phase.
 *
 * §34 forbids presenting placeholder data as final. Rather than filling these screens
 * with invented numbers, each states plainly what it will do and which phase builds it.
 */
export function PhaseNotice({ phase, children }: PhaseNoticeProps): ReactNode {
  return (
    <aside className="phase-notice">
      <p className="phase-notice__phase">Planned for {phase}</p>
      <div className="phase-notice__body">{children}</div>
    </aside>
  );
}
