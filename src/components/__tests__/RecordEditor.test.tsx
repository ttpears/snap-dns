// src/components/__tests__/RecordEditor.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RecordEditor from '../RecordEditor';
import { DNSRecord } from '../../types/dns';

describe('RecordEditor CAA quoting', () => {
  it('canonicalizes an edited CAA value to the quoted form on save', () => {
    const onSave = jest.fn();
    const record = { name: '@', type: 'CAA', value: '0 issue "old.example.com"', ttl: 300 } as unknown as DNSRecord;
    render(<RecordEditor record={record} onSave={onSave} onCancel={() => {}} />);

    // Edit the value, removing the quotes as a user easily might.
    const valueField = screen.getByLabelText('Value') as HTMLInputElement;
    fireEvent.change(valueField, { target: { value: '0 issue sectigo.com' } });
    fireEvent.click(screen.getByText('Save Changes'));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ value: '0 issue "sectigo.com"' })
    );
  });
});

describe('RecordEditor value-field format hints', () => {
  const renderType = (type: string, value: string) =>
    render(
      <RecordEditor
        record={{ name: 'x', type, value, ttl: 300 } as unknown as DNSRecord}
        onSave={jest.fn()}
        onCancel={() => {}}
      />
    );

  it('shows a format hint for a type that previously had none (DS)', () => {
    renderType('DS', '12345 8 2 ABCD');
    expect(screen.getByText(/key-tag algorithm digest-type digest/)).toBeInTheDocument();
  });

  it('shows a format hint for CAA', () => {
    renderType('CAA', '0 issue "letsencrypt.org"');
    expect(screen.getByText(/flags tag value/)).toBeInTheDocument();
  });
});
