// src/components/editors/__tests__/PlainTxtEditor.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PlainTxtEditor from '../PlainTxtEditor';

describe('PlainTxtEditor', () => {
  it('strips quotes from user input', () => {
    const onChange = jest.fn();
    render(<PlainTxtEditor value="" onChange={onChange} />);

    const input = screen.getByTestId('plain-txt-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'hello "world"' } });

    expect(input.value).toBe('hello world');
    expect(onChange).toHaveBeenLastCalledWith('hello world');
  });

  it('shows the wire-format preview with quotes', () => {
    const onChange = jest.fn();
    render(<PlainTxtEditor value="hello" onChange={onChange} />);

    expect(screen.getByTestId('plain-txt-preview').textContent).toBe('"hello"');
  });

  it('shows healed notice when loading a malformed record', () => {
    const onChange = jest.fn();
    render(
      <PlainTxtEditor
        value={'\\"this is a long string that should be one1'}
        onChange={onChange}
      />
    );

    expect(
      screen.getByText(/extra quoting that was cleaned up/i)
    ).toBeInTheDocument();
    const input = screen.getByTestId('plain-txt-input') as HTMLTextAreaElement;
    expect(input.value).toBe('this is a long string that should be one1');
  });

  it('does not show healed notice for clean records', () => {
    const onChange = jest.fn();
    render(<PlainTxtEditor value="clean text" onChange={onChange} />);

    expect(
      screen.queryByText(/extra quoting that was cleaned up/i)
    ).not.toBeInTheDocument();
  });

  it('shows multi-chunk count for values exceeding 255 bytes', () => {
    const onChange = jest.fn();
    const long = 'a'.repeat(300);
    render(<PlainTxtEditor value={long} onChange={onChange} />);

    expect(screen.getByTestId('plain-txt-counter').textContent).toMatch(
      /300 characters · 2 chunks/
    );
  });

  it('calls onChange with chunked array for long values', () => {
    const onChange = jest.fn();
    render(<PlainTxtEditor value="" onChange={onChange} />);

    const input = screen.getByTestId('plain-txt-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'a'.repeat(256) } });

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(Array.isArray(lastCall)).toBe(true);
    expect(lastCall).toEqual(['a'.repeat(255), 'a']);
  });
});
