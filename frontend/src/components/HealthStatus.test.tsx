import { render, screen } from '@testing-library/react';
import { HealthStatus } from './HealthStatus';

describe('HealthStatus', () => {
  it('renders the API and database state', () => {
    render(
      <HealthStatus
        state={{
          kind: 'success',
          data: { status: 'degraded', database: 'down', uptime: 12.4, timestamp: '' },
        }}
      />,
    );
    expect(screen.getByText('degraded')).toBeInTheDocument();
    expect(screen.getByText('down')).toBeInTheDocument();
    expect(screen.getByText('12s')).toBeInTheDocument();
  });

  it('shows an alert when the API is unreachable', () => {
    render(<HealthStatus state={{ kind: 'error', message: 'Failed to fetch' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to fetch');
  });
});
