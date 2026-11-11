import { it, expect, vi } from 'vitest';
import { StrictMode, useCallback } from 'react';
import { render, screen, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataProvider } from '../components/data/provider';
import { Workspace } from '../components/workspace';
import { useResource } from '../lib/data/use-resource';
import { ResourceView } from '../components/data/shared';
import type { Result } from '../lib/data';
it('renders sample data on every destination and simulates live customer + AI messages in StrictMode', async () => {
  const user = userEvent.setup();
  render(
    <StrictMode>
      <DataProvider mode="mock">
        <Workspace />
      </DataProvider>
    </StrictMode>,
  );
  expect(screen.getByTestId('sample-label')).toHaveTextContent('Sample data');
  await screen.findByText('40 conversations');
  await user.click(screen.getAllByTestId('conversation-row')[0]);
  expect(await screen.findByText(/Transcript:/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Simulate incoming message' }));
  await within(screen.getByLabelText('Chat messages')).findByText('Hello! Good afternoon, please.');
  await waitFor(
    () =>
      expect(
        within(screen.getByLabelText('Chat messages')).getByText(
          'Hello! Welcome to Adire by Tola. How can we help you today?',
        ),
      ).toBeInTheDocument(),
    { timeout: 3500 },
  );
  const nav = screen.getByRole('navigation', { name: 'Mobile navigation' });
  for (const name of ['Catalogue', 'Orders', 'Insights', 'Settings', 'Inbox']) {
    await user.click(within(nav).getByRole('button', { name }));
    expect(screen.getByTestId('sample-label')).toBeVisible();
  }
  await user.click(within(nav).getByRole('button', { name: 'Catalogue' }));
  expect(await screen.findByText('25 items')).toBeInTheDocument();
  await user.click(within(nav).getByRole('button', { name: 'Settings' }));
  await user.click(screen.getByRole('button', { name: 'team' }));
  expect(await screen.findByText('Tola Adeyemi')).toBeInTheDocument();
});
it('removes the sample label automatically for the API adapter', async () => {
  const { rerender } = render(
    <DataProvider mode="mock">
      <p>Workspace child</p>
    </DataProvider>,
  );
  await screen.findByText('Workspace child');
  expect(screen.getByTestId('sample-label')).toBeInTheDocument();
  rerender(
    <DataProvider mode="api">
      <p>Workspace child</p>
    </DataProvider>,
  );
  await screen.findByText('Workspace child');
  expect(screen.queryByTestId('sample-label')).not.toBeInTheDocument();
});
it('resource hook exposes loading, safe errors, and successful retry', async () => {
  let resolve!: (value: Result<string>) => void;
  const load = vi
    .fn()
    .mockImplementationOnce(() => new Promise<Result<string>>((r) => (resolve = r)))
    .mockResolvedValue({ ok: true, data: 'Recovered catalogue' });
  function Probe() {
    const resource = useResource<string>(useCallback(() => load(), []));
    return <ResourceView resource={resource}>{(data) => <p>{data}</p>}</ResourceView>;
  }
  render(<Probe />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading');
  await act(async () =>
    resolve({
      ok: false,
      error: { code: 'UNAVAILABLE', message: 'Sample connection interrupted.', retryable: true },
    }),
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Sample connection interrupted.');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('Recovered catalogue')).toBeInTheDocument();
});
