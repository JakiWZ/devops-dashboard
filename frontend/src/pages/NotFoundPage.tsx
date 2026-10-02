import { Link } from 'react-router';
import { EmptyState } from '../components/EmptyState';

export function NotFoundPage() {
  return (
    <EmptyState title="Page not found">
      <Link to="/" className="underline">
        Back to the overview
      </Link>
    </EmptyState>
  );
}
