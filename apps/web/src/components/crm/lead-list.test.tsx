import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LeadList } from './lead-list';

const lead = {
  id: 'lead-1',
  leadNumber: 'LD-1001',
  firstName: 'Jane',
  lastName: 'Doe',
  company: 'Acme',
  email: 'jane@example.com',
  phone: '5551234567',
  source: 'WEBSITE',
  status: 'new',
  assignedTo: 'Sales Team',
  createdAt: '2024-01-05T00:00:00.000Z',
  updatedAt: '2024-01-06T00:00:00.000Z',
};

describe('LeadList', () => {
  it('does not show the priority column', () => {
    render(<LeadList leads={[lead]} />);

    expect(screen.queryByText('Priority')).not.toBeInTheDocument();
  });

  it('calls onDelete when the delete action is selected and the user can delete', () => {
    const onDelete = vi.fn();

    render(<LeadList leads={[lead]} canDelete={true} onDelete={onDelete} />);

    const rowMenuButton = screen.getByRole('button', { name: /more actions/i });
    fireEvent.pointerDown(rowMenuButton);

    fireEvent.click(screen.getByText('Delete'));

    expect(onDelete).toHaveBeenCalledWith(lead);
  });

  it('does not show the delete action when the user cannot delete', () => {
    render(<LeadList leads={[lead]} canDelete={false} onDelete={vi.fn()} />);

    const rowMenuButton = screen.getByRole('button', { name: /more actions/i });
    fireEvent.pointerDown(rowMenuButton);

    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });
});
