import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';

export default function NotFoundPage(): ReactNode {
  const { pathname } = useLocation();

  return (
    <>
      <PageHeader title="Page not found" />
      <p>
        There is no page at <code>{pathname}</code>.
      </p>
      <p>
        Go to the <Link to="/">dashboard</Link>, or browse the{' '}
        <Link to="/vocabulary">vocabulary</Link>.
      </p>
    </>
  );
}
