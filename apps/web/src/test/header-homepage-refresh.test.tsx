import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const routeState = vi.hoisted(() => ({ value: '/home' }));
const searchState = vi.hoisted(() => ({ value: '' }));
const authState = vi.hoisted(() => ({
  profileName: 'Superadmin',
  isSuperAdmin: false,
}));
const logoutMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

const profileApiMock = vi.hoisted(() => ({
  list: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => routeState.value,
  useSearchParams: () => new URLSearchParams(searchState.value),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'user-1', firstName: 'Admin', lastName: 'User', email: 'admin@example.test', phone: '1234567890' },
    profile: authState.isSuperAdmin ? null : { id: 'profile-admin', name: authState.profileName, description: 'Platform administrator' },
    roles: ['Administrator'],
    tenant: { id: 'tenant-1', name: 'Test Company', slug: 'test-company' },
    logout: logoutMock,
    isAdmin: true,
    isSuperAdmin: authState.isSuperAdmin,
  }),
}));

vi.mock('@/lib/api', () => ({
  profileApi: profileApiMock,
}));

vi.mock('@/components/crm/search-dialog', () => ({
  SearchDialog: () => null,
}));

import { Header } from '../components/layout/header';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!('ResizeObserver' in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}
if (!window.HTMLElement.prototype.hasPointerCapture) {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.setPointerCapture = () => undefined;
  window.HTMLElement.prototype.releasePointerCapture = () => undefined;
}

describe('Header admin home refresh', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    routeState.value = '/home';
    searchState.value = '';
    authState.profileName = 'Superadmin';
    authState.isSuperAdmin = false;
    logoutMock.mockClear();
    profileApiMock.list.mockResolvedValue({ data: [] });
  });

  it('loads profiles on mount and refreshes them when the dropdown opens', async () => {
    const { rerender, getByRole } = render(<Header onMenuClick={() => undefined} />);

    await waitFor(() => {
      expect(profileApiMock.list).toHaveBeenCalledWith({ limit: 100 });
    });

    routeState.value = '/admin/customize-home';
    rerender(<Header onMenuClick={() => undefined} />);
    expect(profileApiMock.list).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(getByRole('button', { name: /Admin Home/i }), { key: 'Enter' });

    await waitFor(() => {
      expect(profileApiMock.list).toHaveBeenCalledTimes(2);
    });
  });

  it('does not show a custom homepages label for a selected homepage', async () => {
    searchState.value = 'homepage=homepage-1';
    const { getByRole } = render(<Header onMenuClick={() => undefined} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(getByRole('button', { name: /Admin Home/i })).toBeTruthy();
  });

  it.each([
    ['Superadmin', true],
    ['Admin', false],
    ['System Admin', false],
  ])('shows the %s profile name beside the avatar and only user details and logout in its menu', async (name, isSuperAdmin) => {
    authState.profileName = name;
    authState.isSuperAdmin = isSuperAdmin;
    const { getByRole, getByText, getAllByText, findByRole, getAllByRole, queryByRole } = render(
      <Header onMenuClick={() => undefined} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(getAllByText(name).length).toBeGreaterThan(0);
    const userMenuTrigger = getByRole('button', { name: 'Open user menu' });
    userMenuTrigger.focus();
    fireEvent.keyDown(userMenuTrigger, { key: 'Enter' });
    const profileMenuItem = await findByRole('menuitem', { name: /Admin User.*admin@example\.test/ });
    expect(getAllByRole('menuitem')).toHaveLength(2);
    expect(queryByRole('menuitem', { name: 'Account details' })).toBeNull();
    expect(queryByRole('menuitem', { name })).toBeNull();
    fireEvent.click(profileMenuItem);

    expect(getByRole('dialog')).toBeTruthy();
    expect(getByRole('heading', { name: 'Admin User' })).toBeTruthy();
    expect(getByText('user-1')).toBeTruthy();
    expect(getByText('admin@example.test')).toBeTruthy();
    expect(getByText('1234567890')).toBeTruthy();
    if (!isSuperAdmin) {
      expect(getByText('Platform administrator')).toBeTruthy();
    }
    expect(getByText(isSuperAdmin ? 'Super Admin' : 'Company user')).toBeTruthy();
    expect(getAllByText(name).length).toBeGreaterThanOrEqual(2);
    expect(getByText('Test Company')).toBeTruthy();
    expect(getByText('Administrator')).toBeTruthy();
  });

  it('keeps logout available in the profile menu', async () => {
    const { getByRole, findByRole } = render(
      <Header onMenuClick={() => undefined} />,
    );
    const userMenuTrigger = getByRole('button', { name: 'Open user menu' });
    userMenuTrigger.focus();
    fireEvent.keyDown(userMenuTrigger, { key: 'Enter' });
    fireEvent.click(await findByRole('menuitem', { name: 'Log out' }));

    await waitFor(() => expect(logoutMock).toHaveBeenCalledTimes(1));
  });
});