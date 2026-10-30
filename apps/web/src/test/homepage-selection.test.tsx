import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const searchParamState = { value: 'homepage=exec-1' };
  const routeState = { profileName: 'create' };
  const rndState: {
    onDragStart: Record<string, (() => void) | undefined>;
    onDrag: Record<string, ((event: any, data: { x: number; y: number }) => void) | undefined>;
    onDragStop: Record<string, ((event: any, data: { x: number; y: number }) => void) | undefined>;
  } = {
    onDragStart: {},
    onDrag: {},
    onDragStop: {},
  };
  const auth = {
    hasPermission: vi.fn().mockReturnValue(true),
    hasEffectivePermission: vi.fn().mockReturnValue(true),
    profile: { id: '', name: 'Admin' },
    roles: ['Admin'] as string[],
    isAdmin: true,
    isSuperAdmin: false,
    isLoading: false,
    user: { id: '', firstName: 'Admin', lastName: 'User' },
    tenant: null as { name: string; slug?: string } | null,
  };
  const router = { push: vi.fn(), replace: vi.fn() };

  const analyticsApi = {
    getLeads: vi.fn().mockResolvedValue({ data: { data: { total: 12 } } }),
  };
  const taskApi = {
    list: vi.fn().mockResolvedValue({ data: { data: [] } }),
  };
  const followUpApi = taskApi;
  const activityApi = {
    list: vi.fn().mockResolvedValue({ data: { data: [] } }),
  };
  const profileApi = {
    list: vi.fn().mockResolvedValue({ data: { data: [{ id: 'profile-1', name: 'Admin' }] } }),
  };
  const reportApi = {
    list: vi.fn().mockResolvedValue({ data: { data: [] } }),
  };
  const dashboardApi = {
    list: vi.fn().mockResolvedValue({ data: { data: [] } }),
  };
  const homepageApi = {
    list: vi.fn().mockResolvedValue({ data: { data: [] } }),
    create: vi.fn().mockResolvedValue({
      data: { message: 'Home page created successfully', data: { id: 'standard-home' } },
    }),
    get: vi.fn().mockResolvedValue({
      data: { data: { name: 'Executive Dashboard', layout: [] } },
    }),
    update: vi.fn().mockResolvedValue({
      data: { message: 'Home page saved successfully', data: { id: 'standard-home' } },
    }),
    assigned: vi.fn().mockResolvedValue({
      data: { data: { name: 'Standard', layout: [] } },
    }),
  };

  return {
    searchParamState,
    routeState,
    rndState,
    auth,
    router,
    analyticsApi,
    taskApi,
    followUpApi,
    activityApi,
    profileApi,
    reportApi,
    dashboardApi,
    homepageApi,
  };
});

vi.mock('next/navigation', () => ({
  useParams: () => ({ profileName: mocks.routeState.profileName }),
  useRouter: () => mocks.router,
  useSearchParams: () => new URLSearchParams(mocks.searchParamState.value),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    user: mocks.auth.user,
    tenant: mocks.auth.tenant,
    profile: mocks.auth.profile,
    roles: mocks.auth.roles,
    isAdmin: mocks.auth.isAdmin,
    isSuperAdmin: mocks.auth.isSuperAdmin,
    isLoading: mocks.auth.isLoading,
    hasPermission: mocks.auth.hasPermission,
    hasEffectivePermission: mocks.auth.hasEffectivePermission,
  }),
}));

vi.mock('@/lib/api', () => ({
  analyticsApi: mocks.analyticsApi,
  taskApi: mocks.taskApi,
  followUpApi: mocks.followUpApi,
  activityApi: mocks.activityApi,
  profileApi: mocks.profileApi,
  reportApi: mocks.reportApi,
  dashboardApi: mocks.dashboardApi,
  homepageApi: mocks.homepageApi,
}));

vi.mock('react-rnd', () => ({
  Rnd: ({
    children,
    position,
    size,
    style,
    onDragStart,
    onDrag,
    onDragStop,
    'data-widget-id': widgetId,
  }: {
    children: React.ReactNode;
    position?: { x: number; y: number };
    size?: { width: number; height: number };
    style?: React.CSSProperties;
    onDragStart?: () => void;
    onDrag?: (event: any, data: { x: number; y: number }) => void;
    onDragStop?: (event: any, data: { x: number; y: number }) => void;
    'data-widget-id'?: string;
  }) => {
    if (widgetId) {
      mocks.rndState.onDragStart[widgetId] = onDragStart;
      mocks.rndState.onDrag[widgetId] = onDrag;
      mocks.rndState.onDragStop[widgetId] = onDragStop;
    }
    return (
      <div
        style={style}
        data-widget-id={widgetId}
        data-layout-x={position?.x}
        data-layout-y={position?.y}
        data-layout-width={size?.width}
        data-layout-height={size?.height}
      >
        {children}
      </div>
    );
  },
}));

import HomePage from '../app/(dashboard)/home/page';
import ProfileLandingPage from '../app/(dashboard)/profiles/[profileName]/page';
import CustomizeProfileHomePage from '../app/(dashboard)/admin/customize-home/[profileName]/page';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function getContainer(): HTMLDivElement {
  if (!container) {
    throw new Error('Test container is not initialized');
  }
  return container;
}

function dispatchPointerEvent(
  target: EventTarget,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  clientX: number,
  clientY: number,
  pointerId = 1,
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    pointerId: { value: pointerId },
    button: { value: 0 },
  });
  target.dispatchEvent(event);
}

describe('HomePage homepage selection', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.searchParamState.value = 'homepage=exec-1';
    mocks.routeState.profileName = 'create';
    mocks.rndState.onDragStart = {};
    mocks.rndState.onDrag = {};
    mocks.rndState.onDragStop = {};
    vi.clearAllMocks();
    mocks.auth.hasPermission.mockReturnValue(true);
    mocks.auth.hasEffectivePermission.mockReturnValue(true);
    mocks.auth.profile = { id: '', name: 'Admin' };
    mocks.auth.roles = ['Admin'];
    mocks.auth.isAdmin = true;
    mocks.auth.isSuperAdmin = false;
    mocks.auth.isLoading = false;
    mocks.auth.user = { id: '', firstName: 'Admin', lastName: 'User' };
    mocks.auth.tenant = null;
    mocks.analyticsApi.getLeads.mockResolvedValue({ data: { data: { total: 12 } } });
    mocks.taskApi.list.mockResolvedValue({ data: { data: [] } });
    mocks.activityApi.list.mockResolvedValue({ data: { data: [] } });
    mocks.homepageApi.get.mockResolvedValue({
      data: { data: { name: 'Executive Dashboard', layout: [] } },
    });
    mocks.homepageApi.list.mockResolvedValue({ data: { data: [] } });
    mocks.profileApi.list.mockResolvedValue({
      data: { data: [{ id: 'profile-1', name: 'Admin' }] },
    });
    mocks.reportApi.list.mockResolvedValue({ data: { data: [] } });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    container = null;
    root = null;
  });

  it('refetches dashboard data when the selected homepage changes', async () => {
    await act(async () => {
      root!.render(<HomePage />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.analyticsApi.getLeads).toHaveBeenCalledTimes(1);
    expect(mocks.homepageApi.get).toHaveBeenCalledWith('exec-1');
    expect(getContainer().textContent).toContain('Executive Dashboard');

    mocks.searchParamState.value = 'homepage=untitled-23';
    mocks.homepageApi.get.mockResolvedValue({
      data: { data: { name: 'Untitled Homepage23', layout: [] } },
    });

    await act(async () => {
      root!.render(<HomePage />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.analyticsApi.getLeads).toHaveBeenCalledTimes(2);
    expect(mocks.homepageApi.get).toHaveBeenLastCalledWith('untitled-23');
    expect(getContainer().textContent).toContain('Untitled Homepage23');
  });

  it('redirects non-admin users from an unassigned homepage to their own dashboard', async () => {
    mocks.auth.profile = { id: '', name: 'System Administrator' };
    mocks.auth.roles = ['System Administrator'];
    mocks.searchParamState.value = 'homepage=other-profile-home';
    mocks.homepageApi.assigned.mockResolvedValue({
      data: { data: { id: 'system-home', name: 'System Administrator Home', layout: ['total-leads'] } },
    });

    await act(async () => {
      root!.render(<HomePage />);
      await Promise.resolve();
    });

    expect(mocks.homepageApi.get).not.toHaveBeenCalled();
    expect(mocks.router.replace).toHaveBeenCalledWith('/home');
    expect(getContainer().textContent).toContain('System Administrator Home');
  });

  it('opens the signed-in user profile home after visiting Home', async () => {
    mocks.searchParamState.value = '';
    mocks.auth.profile = { id: 'profile-sales', name: 'Sales Manager' };
    mocks.auth.user = { id: 'user-1', firstName: 'Admin', lastName: 'User' };
    mocks.auth.tenant = { name: 'DCT Real Estate', slug: 'dct-real-estate' };
    mocks.auth.isAdmin = false;
    mocks.auth.roles = ['Sales'];

    await act(async () => {
      root!.render(<HomePage />);
      await Promise.resolve();
    });

    expect(mocks.router.replace).toHaveBeenCalledWith(
      '/DCT%20Real%20Estate/user-1',
    );
    expect(getContainer().textContent).toBe('');
  });

  it('loads the same assigned homepage layout for a non-admin profile user', async () => {
    mocks.routeState.profileName = 'sales-manager';
    mocks.searchParamState.value =
      'profileId=profile-sales&profileLabel=Sales%20Manager';
    mocks.auth.profile = { id: 'profile-sales', name: 'Sales Manager' };
    mocks.auth.isAdmin = false;
    mocks.auth.roles = ['Sales'];
    mocks.homepageApi.assigned.mockResolvedValue({
      data: {
        data: {
          id: 'sales-home',
          name: 'Sales Team Home',
          description: 'Sales dashboard',
          layout: [
            { id: 'total-leads', x: 8, y: 8, width: 271, height: 116 },
            { id: 'active-tasks', x: 287, y: 8, width: 271, height: 116 },
          ],
        },
      },
    });

    await act(async () => {
      root!.render(<ProfileLandingPage />);
      await Promise.resolve();
    });

    expect(mocks.homepageApi.assigned).toHaveBeenCalled();
    expect(mocks.homepageApi.list).not.toHaveBeenCalled();
    expect(getContainer().textContent).toContain('Welcome Admin User');
    const leadsWidget = getContainer().querySelector<HTMLElement>(
      '[data-testid="profile-homepage-layout"] [data-widget-id="total-leads"]',
    );
    const activeTasksWidget = getContainer().querySelector<HTMLElement>(
      '[data-testid="profile-homepage-layout"] [data-widget-id="active-tasks"]',
    );
    expect(leadsWidget?.getAttribute('data-layout-x')).toBe('8');
    expect(activeTasksWidget?.getAttribute('data-layout-x')).toBe('287');
  });

  it('loads the test3 homepage and preserves its custom saved components for assigned users', async () => {
    mocks.routeState.profileName = 'test3';
    mocks.searchParamState.value = 'profileId=profile-test3&profileLabel=test3';
    mocks.auth.profile = { id: 'profile-test3', name: 'test3' };
    mocks.auth.isAdmin = false;
    mocks.auth.roles = ['test3'];
    mocks.homepageApi.assigned.mockResolvedValue({
      data: {
        data: {
          id: 'test3-home',
          name: 'test3 Home',
          description: 'test3 dashboard',
          layout: [
            { id: 'tasks-by-users', x: 8, y: 132, width: 364, height: 364 },
            { id: 'report-report-1', x: 380, y: 132, width: 736, height: 488 },
          ],
        },
      },
    });

    await act(async () => {
      root!.render(<ProfileLandingPage />);
      await Promise.resolve();
    });

    expect(mocks.homepageApi.assigned).toHaveBeenCalled();
    expect(getContainer().textContent).toContain('Welcome Admin User');
    expect(getContainer().textContent).toContain('Tasks by Users');
    expect(getContainer().textContent).toContain('Report report-1');
    expect(getContainer().querySelector<HTMLElement>(
      '[data-testid="profile-homepage-layout"] [data-widget-id="tasks-by-users"]',
    )?.getAttribute('data-layout-y')).toBe('132');
    expect(getContainer().querySelector<HTMLElement>(
      '[data-testid="profile-homepage-layout"] [data-widget-id="report-report-1"]',
    )?.getAttribute('data-layout-x')).toBe('380');
  });

  it('shows the default profile dashboard when the assigned homepage has no saved widgets', async () => {
    mocks.routeState.profileName = 'test3';
    mocks.searchParamState.value = 'profileId=profile-test3&profileLabel=test3';
    mocks.auth.profile = { id: 'profile-test3', name: 'test3' };
    mocks.auth.isAdmin = false;
    mocks.auth.roles = ['test3'];
    mocks.homepageApi.assigned.mockResolvedValue({
      data: {
        data: {
          id: 'test3-home',
          name: 'test3 Home',
          layout: [],
        },
      },
    });

    await act(async () => {
      root!.render(<ProfileLandingPage />);
      await Promise.resolve();
    });

    expect(getContainer().querySelector('[data-testid="profile-homepage-layout"]')).toBeNull();
    expect(getContainer().textContent).toContain('Welcome Admin User');
    expect(getContainer().textContent).toContain('Total Leads');
    expect(getContainer().textContent).toContain('Upcoming Follow-ups');
    expect(getContainer().textContent).toContain('Recent Activity');
  });

  it('scales saved homepage widget widths across the available content area', async () => {
    mocks.homepageApi.get.mockResolvedValue({
      data: {
        data: {
          name: 'Executive Dashboard',
          layout: [{ id: 'total-leads', x: 0, y: 8, width: 558, height: 85 }],
        },
      },
    });

    await act(async () => {
      root!.render(<HomePage />);
      await Promise.resolve();
    });

    const fullWidthWidget = Array.from(getContainer().querySelectorAll('div[style]')).find(
      (element) => (element as HTMLElement).style.width === '50%',
    ) as HTMLElement | undefined;
    expect(fullWidthWidget?.style.left).toBe('0%');
  });

  it('loads the default CRM widget set for new dashboards', async () => {
    mocks.profileApi.list.mockResolvedValue({
      data: { data: [{ id: 'profile-1', name: 'Admin' }] },
    });

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(getContainer().textContent).toContain('Total Leads');
    expect(getContainer().textContent).toContain('Active Tasks');
    expect(getContainer().textContent).toContain('Upcoming Tasks');
    expect(getContainer().textContent).toContain('Recent Activity');
  });

  it('does not request or display follow-up data when Follow-up read permission is missing', async () => {
    mocks.auth.hasPermission.mockImplementation((objectName: string) => objectName !== 'FollowUp' && objectName !== 'Task');
    mocks.auth.hasEffectivePermission.mockReturnValue(false);

    await act(async () => {
      root!.render(<HomePage />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.taskApi.list).not.toHaveBeenCalled();
    expect(getContainer().textContent).not.toContain('Scheduled Follow-ups');
    expect(getContainer().textContent).not.toContain('Upcoming Follow-ups');
  });

  it.each([
    ['standard-user', 'Standard User', 'profile-standard', 'homepage-standard'],
    ['system-administrator', 'System Administrator', 'profile-system-admin', 'homepage-system-admin'],
  ])('opens the existing homepage for %s', async (slug, profileName, profileId, homepageId) => {
    mocks.routeState.profileName = slug;
    mocks.profileApi.list.mockResolvedValue({
      data: { data: [{ id: profileId, name: profileName }] },
    });
    mocks.homepageApi.list.mockResolvedValue({
      data: {
        data: [{ id: homepageId, sharedProfiles: [{ profile: { id: profileId } }] }],
      },
    });

    await act(async () => {
      root!.render(<ProfileLandingPage />);
      await Promise.resolve();
    });

    const editLink = Array.from(getContainer().querySelectorAll('a'))
      .find((link) => link.textContent?.trim() === 'Edit');
    expect(editLink?.getAttribute('href')).toBe(
      `/admin/customize-home/create?profile=${encodeURIComponent(profileName).replace(/%20/g, '+')}&profileId=${profileId}&homepageId=${homepageId}`,
    );
    expect(mocks.homepageApi.list).toHaveBeenCalled();
  });

  it('shows the admin edit action on the Pre Sales dashboard page', async () => {
    mocks.routeState.profileName = 'pre-sales';
    mocks.profileApi.list.mockResolvedValue({
      data: { data: [{ id: 'profile-pre-sales', name: 'Pre Sales' }] },
    });
    mocks.homepageApi.list.mockResolvedValue({ data: { data: [] } });

    await act(async () => {
      root!.render(<ProfileLandingPage />);
      await Promise.resolve();
    });

    const editLink = Array.from(getContainer().querySelectorAll('a'))
      .find((link) => link.textContent?.trim() === 'Edit');
    expect(editLink?.getAttribute('href'))
      .toBe('/admin/customize-home/create?profile=Pre+Sales&profileId=profile-pre-sales');
  });

  it('shows the admin edit action on the Standard dashboard page', async () => {
    mocks.routeState.profileName = 'standard-user';
    mocks.profileApi.list.mockResolvedValue({
      data: { data: [{ id: 'profile-standard', name: 'Standard User' }] },
    });
    mocks.homepageApi.list.mockResolvedValue({ data: { data: [] } });

    await act(async () => {
      root!.render(<ProfileLandingPage />);
      await Promise.resolve();
    });

    const editLink = Array.from(getContainer().querySelectorAll('a'))
      .find((link) => link.textContent?.trim() === 'Edit');
    expect(editLink?.getAttribute('href'))
      .toBe('/admin/customize-home/create?profile=Standard+User&profileId=profile-standard');
  });

  it('shows one edit action for a newly created profile', async () => {
    mocks.routeState.profileName = 'new-profile';
    mocks.profileApi.list.mockResolvedValue({
      data: { data: [{ id: 'profile-new', name: 'New Profile' }] },
    });
    mocks.homepageApi.list.mockResolvedValue({ data: { data: [] } });

    await act(async () => {
      root!.render(<ProfileLandingPage />);
      await Promise.resolve();
    });

    const editLinks = Array.from(getContainer().querySelectorAll('a'))
      .filter((link) => link.textContent?.trim() === 'Edit');
    expect(editLinks).toHaveLength(1);
    expect(editLinks[0].getAttribute('href'))
      .toBe('/admin/customize-home/create?profile=New+Profile&profileId=profile-new');
  });

  it('renders Edit immediately when opened with a profile identity', async () => {
    mocks.routeState.profileName = 'new-profile';
    mocks.searchParamState.value = 'profileId=profile-new&profileLabel=New%20Profile';
    let resolveHomepages!: (response: { data: { data: unknown[] } }) => void;
    mocks.homepageApi.list.mockReturnValue(new Promise((resolve) => {
      resolveHomepages = resolve;
    }));

    await act(async () => {
      root!.render(<ProfileLandingPage />);
      await Promise.resolve();
    });

    expect(getContainer().textContent).toContain('Welcome Admin User');
    expect(Array.from(getContainer().querySelectorAll('a'))
      .find((link) => link.textContent?.trim() === 'Edit')
      ?.getAttribute('href'))
      .toBe('/admin/customize-home/create?profile=New+Profile&profileId=profile-new');
    expect(mocks.profileApi.list).not.toHaveBeenCalled();

    await act(async () => {
      resolveHomepages({ data: { data: [] } });
      await Promise.resolve();
    });
  });

  it('opens the existing Customize Home editor for a new profile', async () => {
    mocks.routeState.profileName = 'new-profile';
    mocks.profileApi.list.mockResolvedValue({
      data: { data: [{ id: 'profile-new', name: 'New Profile' }] },
    });
    mocks.homepageApi.list.mockResolvedValue({ data: { data: [] } });

    await act(async () => {
      root!.render(<ProfileLandingPage />);
      await Promise.resolve();
    });
    const editLink = Array.from(getContainer().querySelectorAll('a'))
      .find((link) => link.textContent?.trim() === 'Edit');
    expect(editLink?.getAttribute('href'))
      .toBe('/admin/customize-home/create?profile=New+Profile&profileId=profile-new');
    expect(getContainer().querySelector('input[aria-label="Profile home title"]')).toBeNull();
  });

  it('opens the existing Customize Home editor for the selected profile homepage', async () => {
    mocks.routeState.profileName = 'new-profile';
    mocks.profileApi.list.mockResolvedValue({
      data: { data: [{ id: 'profile-new', name: 'New Profile' }] },
    });
    mocks.homepageApi.list.mockResolvedValue({
      data: {
        data: [{
          id: 'homepage-new',
          sharedProfiles: [{ profile: { id: 'profile-new' } }],
        }],
      },
    });
    mocks.homepageApi.get.mockResolvedValue({
      data: {
        data: {
          id: 'homepage-new',
          name: 'New Profile',
          layout: [
            { id: 'total-leads', x: 8, y: 8, width: 271, height: 116 },
            { id: 'active-tasks', x: 845, y: 8, width: 271, height: 116 },
          ],
          sharedProfiles: [{ profile: { id: 'profile-new' } }],
        },
      },
    });

    await act(async () => {
      root!.render(<ProfileLandingPage />);
      await Promise.resolve();
    });

    const editLink = Array.from(getContainer().querySelectorAll('a'))
      .find((link) => link.textContent?.trim() === 'Edit');
    expect(editLink?.getAttribute('href'))
      .toBe('/admin/customize-home/create?profile=New+Profile&profileId=profile-new&homepageId=homepage-new');
    expect(getContainer().querySelector('input[aria-label="Profile home title"]')).toBeNull();
  });

  it('edits the selected profile homepage in place instead of retaining its test name', async () => {
    mocks.routeState.profileName = 'homepage-system-admin';
    mocks.searchParamState.value = 'profile=System%20Administrator';
    mocks.homepageApi.get.mockResolvedValue({
      data: { data: { name: 'test30', layout: [] } },
    });

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });

    expect(mocks.homepageApi.get).toHaveBeenCalledWith('homepage-system-admin');
    expect((getContainer().querySelector('input[aria-label="Homepage name"]') as HTMLInputElement).value)
      .toBe('System Administrator');
  });

  it('starts a new Standard homepage with the Standard name', async () => {
    mocks.routeState.profileName = 'create';
    mocks.searchParamState.value = 'profile=Standard';

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });

    expect((getContainer().querySelector('input[aria-label="Homepage name"]') as HTMLInputElement).value)
      .toBe('Standard');
  });

  it('opens the existing profile homepage from the quick Edit route', async () => {
    mocks.routeState.profileName = 'create';
    mocks.searchParamState.value = 'profile=New%20Profile&profileId=profile-new';
    mocks.profileApi.list.mockResolvedValue({
      data: { data: [{ id: 'profile-new', name: 'New Profile' }] },
    });
    mocks.homepageApi.list.mockResolvedValue({
      data: {
        data: [{
          id: 'homepage-existing',
          name: 'New Profile',
          description: 'Profile-specific homepage',
          layout: [{ id: 'total-leads', x: 8, y: 8, width: 271, height: 116 }],
          sharedProfiles: [{ profile: { id: 'profile-new' } }],
        }],
      },
    });

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });

    expect(mocks.homepageApi.get).not.toHaveBeenCalled();
    expect((getContainer().querySelector('input[aria-label="Homepage name"]') as HTMLInputElement).value)
      .toBe('New Profile');
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button'))
        .find((button) => button.textContent?.includes('Save and Share'))
        ?.click();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button'))
        .find((button) => button.textContent?.trim() === 'Save')
        ?.click();
      await Promise.resolve();
    });

    expect(mocks.homepageApi.update).toHaveBeenCalledWith(
      'homepage-existing',
      expect.objectContaining({ profileIds: ['profile-new'] }),
    );
  });

  it('loads the exact selected profile homepage when its ID is provided', async () => {
    mocks.routeState.profileName = 'create';
    mocks.searchParamState.value = 'profile=Sales%20Manager&profileId=profile-sales&homepageId=homepage-sales';
    mocks.homepageApi.get.mockResolvedValue({
      data: {
        data: {
          id: 'homepage-sales',
          name: 'Sales Manager Home',
          layout: [
            { id: 'active-tasks', x: 8, y: 8, width: 271, height: 116 },
            { id: 'recent-activity', x: 8, y: 132, width: 356, height: 488 },
          ],
          sharedProfiles: [{ profileId: 'profile-sales' }],
        },
      },
    });

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });

    expect(mocks.homepageApi.get).toHaveBeenCalledWith('homepage-sales');
    expect(Array.from(getContainer().querySelectorAll('section h3'))
      .map((heading) => heading.textContent))
      .toEqual(['Active Tasks', 'Recent Activity']);
  });

  it.each([
    ['Sales Manager', 'profile-sales', 'homepage-sales', 'leads-by-source', 'LEADS BY SOURCE'],
    ['Marketing Manager', 'profile-marketing', 'homepage-marketing', 'open-tasks', 'OPEN TASKS'],
  ])('loads the saved components for %s instead of applying shared defaults', async (
    profileName,
    profileId,
    homepageId,
    widgetId,
    widgetTitle,
  ) => {
    mocks.routeState.profileName = 'create';
    mocks.searchParamState.value = `profile=${encodeURIComponent(profileName)}&profileId=${profileId}&homepageId=${homepageId}`;
    mocks.homepageApi.get.mockResolvedValue({
      data: {
        data: {
          id: homepageId,
          name: `${profileName} Home`,
          layout: [{ id: widgetId, x: 8, y: 8, width: 526, height: 488 }],
          sharedProfiles: [{ profileId }],
        },
      },
    });

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });

    expect(mocks.homepageApi.get).toHaveBeenCalledWith(homepageId);
    expect(Array.from(getContainer().querySelectorAll('section h3'))
      .map((heading) => heading.textContent))
      .toEqual([widgetTitle]);
  });

  it('shows live dashboard values and records in the selected profile editor', async () => {
    mocks.routeState.profileName = 'create';
    mocks.searchParamState.value =
      'profile=Sales%20Manager&profileId=profile-sales&homepageId=homepage-sales';
    mocks.homepageApi.get.mockResolvedValue({
      data: {
        data: {
          id: 'homepage-sales',
          name: 'Sales Manager Home',
          layout: [
            { id: 'total-leads', x: 8, y: 8, width: 271, height: 116 },
            { id: 'active-tasks', x: 287, y: 8, width: 271, height: 116 },
            { id: 'upcoming-tasks', x: 8, y: 132, width: 713, height: 488 },
            { id: 'recent-activity', x: 729, y: 132, width: 356, height: 488 },
            { id: 'upcoming-tasks', x: 8, y: 628, width: 713, height: 488 },
            { id: 'recent-activity', x: 729, y: 628, width: 356, height: 488 },
          ],
          sharedProfiles: [{ profileId: 'profile-sales' }],
        },
      },
    });
    mocks.analyticsApi.getLeads.mockResolvedValue({ data: { data: { total: 150 } } });
    mocks.taskApi.list.mockResolvedValue({
      data: { data: [{ id: 'task-1', title: 'Follow up with Alice', status: 'OPEN', dueDate: '2026-10-10' }] },
    });
    mocks.activityApi.list.mockResolvedValue({
      data: { data: [{ id: 'activity-1', message: 'Logged call with Bob', type: 'Call', createdAt: '2026-10-09T00:00:00.000Z' }] },
    });

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });

    const editorText = getContainer().textContent || '';
    expect(editorText).toContain('150');
    expect(editorText).toContain('Follow up with Alice');
    expect(editorText).toContain('Logged call with Bob');
    expect(editorText).not.toContain('10  ▲ 100%');
    expect(editorText).not.toContain('Rs. 35,000.00');
  });

  it('shows only components rendered on the selected profile page', async () => {
    mocks.routeState.profileName = 'create';
    mocks.searchParamState.value = 'profile=New%20Profile&profileId=profile-new';
    mocks.homepageApi.list.mockResolvedValue({
      data: {
        data: [{
          id: 'homepage-existing',
          name: 'New Profile',
          layout: [
            { id: 'total-leads', x: 8, y: 8, width: 271, height: 116 },
            { id: 'tasks-by-users', x: 8, y: 132, width: 356, height: 364 },
            { id: 'report-report-1', x: 8, y: 504, width: 1068, height: 488 },
          ],
          sharedProfiles: [{ profile: { id: 'profile-new' } }],
        }],
      },
    });
    mocks.reportApi.list.mockResolvedValue({
      data: { data: [{ id: 'report-1', name: 'Profile Report' }] },
    });

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });

    expect(Array.from(getContainer().querySelectorAll('section h3'))
      .map((heading) => heading.textContent))
      .toEqual(['Total Leads', 'TASKS BY USERS', 'Profile Report']);
  });

  it('uses the selected profile homepage components instead of the default widget set', async () => {
    mocks.routeState.profileName = 'create';
    mocks.searchParamState.value = 'profile=test1234&profileId=profile-test1234';
    mocks.homepageApi.list.mockResolvedValue({
      data: {
        data: [{
          id: 'homepage-test1234',
          name: 'test1234',
          layout: [
            { id: 'recent-activity', x: 8, y: 8, width: 356, height: 488 },
          ],
          sharedProfiles: [{ profile: { id: 'profile-test1234' } }],
        }],
      },
    });

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });

    expect(Array.from(getContainer().querySelectorAll('section h3'))
      .map((heading) => heading.textContent))
      .toEqual(['Recent Activity']);
  });

  it('saves a new Standard homepage after selecting a profile to share it with', async () => {
    mocks.routeState.profileName = 'create';
    mocks.searchParamState.value = 'profile=Standard&profileId=profile-standard';
    mocks.profileApi.list.mockResolvedValue({
      data: { data: [{ id: 'profile-standard', name: 'Standard' }] },
    });

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button')).find(
        (button) => button.textContent?.includes('Save and Share'),
      )?.click();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Save',
      )?.click();
      await Promise.resolve();
    });

    expect(mocks.homepageApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Standard', profileIds: ['profile-standard'] }),
    );
  });

  it('keeps the editor visible while saving and navigates to the selected profile home', async () => {
    mocks.routeState.profileName = 'create';
    mocks.searchParamState.value = 'profile=Sales%20Manager&profileId=profile-sales';
    mocks.auth.user = { id: 'user-1', firstName: 'Admin', lastName: 'User' };
    mocks.auth.tenant = { name: 'DCT Real Estate', slug: 'dct-real-estate' };
    mocks.profileApi.list.mockResolvedValue({
      data: { data: [{ id: 'profile-sales', name: 'Sales Manager' }] },
    });
    let resolveSave!: (response: any) => void;
    mocks.homepageApi.create.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button'))
        .find((button) => button.textContent?.includes('Save and Share'))
        ?.click();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button'))
        .find((button) => button.textContent?.trim() === 'Save')
        ?.click();
      await Promise.resolve();
    });

    expect(getContainer().textContent).toContain('Saving...');
    expect(getContainer().textContent).toContain('Dashboard Components');
    expect(getContainer().querySelector('[data-widget-id="total-leads"]')).toBeTruthy();
    expect(mocks.router.push).not.toHaveBeenCalled();

    await act(async () => {
      resolveSave({
        data: {
          message: 'Home page saved successfully',
          data: { id: 'homepage-sales' },
        },
      });
      await Promise.resolve();
    });

    expect(mocks.router.push).toHaveBeenCalledWith(
      '/DCT%20Real%20Estate/user-1',
    );
  });

  it('shows the selected dashboard components when Dashboard is clicked', async () => {
    mocks.routeState.profileName = 'selected-homepage';
    mocks.searchParamState.value = '';
    mocks.homepageApi.get.mockResolvedValue({
      data: { data: { name: 'Selected Dashboard', layout: ['total-leads'] } },
    });

    mocks.dashboardApi.list.mockResolvedValueOnce({
      data: { data: [{ id: 'd1', name: 'Sales Pipeline Dashboard', description: 'Saved' }] },
    });
    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });

    expect(getContainer().querySelector('aside h2')?.textContent).toBe('Dashboard Components');
    expect(getContainer().textContent).toContain('Total Leads');

    await act(async () => {
      getContainer().querySelector<HTMLButtonElement>('button[aria-label="Reports"]')?.click();
    });
    expect(getContainer().textContent).not.toContain('Dashboard Components');
    expect(getContainer().textContent).toContain('No dashboard components found');

    await act(async () => {
      getContainer().querySelector<HTMLButtonElement>('button[aria-label="Dashboard"]')?.click();
    });
    expect(getContainer().textContent).toContain('Dashboard Components');
    expect(getContainer().textContent).toContain('Sales Pipeline Dashboard');
    expect(getContainer().textContent).not.toContain('No dashboard components found');
  });

  it('drops a left-panel widget into the selected empty grid cell', async () => {
    mocks.routeState.profileName = 'create';
    mocks.searchParamState.value = 'profile=Standard';

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.change(getContainer().querySelector('select[aria-label="Component category"]')!, {
        target: { value: 'Activity Stats' },
      });
    });

    const availableWidget = getContainer().querySelector<HTMLElement>(
      '[aria-label="Add TASKS BY USERS to dashboard"]',
    );
    expect(availableWidget).toBeTruthy();
    const canvas = getContainer().querySelector<HTMLElement>('main .relative.w-full.overflow-hidden');
    expect(canvas).toBeTruthy();
    vi.spyOn(canvas!, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      right: 1200,
      bottom: 2200,
      width: 1100,
      height: 2100,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect);

    await act(async () => {
      dispatchPointerEvent(availableWidget!, 'pointerdown', 20, 20);
      dispatchPointerEvent(window, 'pointermove', 510, 1244);
      dispatchPointerEvent(window, 'pointerup', 510, 1244);
    });

    const addedWidget = Array.from(getContainer().querySelectorAll('section h3'))
      .find((heading) => heading.textContent === 'TASKS BY USERS');
    const addedPosition = getContainer().querySelector<HTMLElement>(
      '[data-widget-id="tasks-by-users"]',
    );
    expect(addedPosition?.getAttribute('data-layout-x')).toBe('380');
    expect(addedPosition?.getAttribute('data-layout-y')).toBe('1124');
  });

  it('places a panel widget at the actual pointer release point in an empty center cell', async () => {
    mocks.routeState.profileName = 'create';
    mocks.searchParamState.value = 'profile=Standard';

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });
    await act(async () => {
      getContainer().querySelector<HTMLButtonElement>(
        'button[aria-label="More homepage options"]',
      )?.click();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button')).find(
        (button) => button.textContent?.includes('Remove all components'),
      )?.click();
    });
    await act(async () => {
      fireEvent.change(
        getContainer().querySelector('select[aria-label="Component category"]')!,
        { target: { value: 'Activity Stats' } },
      );
    });
    const source = getContainer().querySelector<HTMLElement>(
      '[aria-label="Add TASKS BY USERS to dashboard"]',
    );
    const canvas = getContainer().querySelector<HTMLElement>(
      'main .relative.w-full.overflow-hidden',
    );
    expect(source).toBeTruthy();
    expect(canvas).toBeTruthy();
    vi.spyOn(canvas!, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      right: 1224,
      bottom: 2000,
      width: 1124,
      height: 1900,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect);

    await act(async () => {
      dispatchPointerEvent(source!, 'pointerdown', 20, 20);
      dispatchPointerEvent(window, 'pointermove', 510, 510);
      dispatchPointerEvent(window, 'pointerup', 510, 510);
    });

    const widget = getContainer().querySelector<HTMLElement>(
      '[data-widget-id="tasks-by-users"]',
    );
    expect(widget?.getAttribute('data-layout-x')).toBe('380');
    expect(widget?.getAttribute('data-layout-y')).toBe('380');
  });

  it('drops components at the selected grid positions across the center and corners', async () => {
    mocks.routeState.profileName = 'create';
    mocks.searchParamState.value = 'profile=Standard';

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });
    await act(async () => {
      getContainer().querySelector<HTMLButtonElement>(
        'button[aria-label="More homepage options"]',
      )?.click();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button')).find(
        (button) => button.textContent?.includes('Remove all components'),
      )?.click();
    });
    await act(async () => {
      fireEvent.change(
        getContainer().querySelector('select[aria-label="Component category"]')!,
        { target: { value: 'Activity Stats' } },
      );
    });

    const canvas = getContainer().querySelector<HTMLElement>(
      'main .relative.w-full.overflow-hidden',
    );
    expect(canvas).toBeTruthy();
    Object.defineProperty(canvas, 'clientLeft', { configurable: true, value: 1 });
    Object.defineProperty(canvas, 'clientTop', { configurable: true, value: 1 });
    vi.spyOn(canvas!, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      right: 1224,
      bottom: 2000,
      width: 1124,
      height: 1900,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect);

    const positions = [
      { id: 'open-tasks', column: 0, row: 0 },
      { id: 'overdue-tasks', column: 9, row: 0 },
      { id: 'tasks-completed', column: 0, row: 6 },
      { id: 'my-calls-today', column: 9, row: 6 },
      { id: 'tasks-by-users', column: 4, row: 3 },
    ];
    for (const position of positions) {
      const source = getContainer().querySelector<HTMLElement>(
        `[aria-label="Add ${position.id.replace(/-/g, ' ').toUpperCase()} to dashboard"]`,
      );
      expect(source).toBeTruthy();
      const clientX = 100 + 1 + 8 + position.column * 93 + 20;
      const clientY = 100 + 1 + 8 + position.row * 124 + 20;
      await act(async () => {
        dispatchPointerEvent(source!, 'pointerdown', 20, 20);
        dispatchPointerEvent(window, 'pointermove', clientX, clientY);
        dispatchPointerEvent(window, 'pointerup', clientX, clientY);
      });
      const widget = getContainer().querySelector<HTMLElement>(
        `[data-widget-id="${position.id}"]`,
      );
      expect(widget?.getAttribute('data-layout-x')).toBe(
        String(8 + position.column * 93),
      );
      expect(widget?.getAttribute('data-layout-y')).toBe(
        String(8 + position.row * 124),
      );
    }
  });

  it('moves occupied widgets aside when a new widget is dropped over them', async () => {
    mocks.routeState.profileName = 'create';
    mocks.searchParamState.value = 'profile=Standard';
    mocks.reportApi.list.mockResolvedValue({
      data: { data: [{ id: 'collision-report', name: 'Collision Report' }] },
    });

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });
    await act(async () => {
      getContainer().querySelector<HTMLButtonElement>('button[aria-label="Reports"]')?.click();
    });

    const canvas = getContainer().querySelector<HTMLElement>('main .relative.w-full.overflow-hidden');
    expect(canvas).toBeTruthy();
    vi.spyOn(canvas!, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      right: 1200,
      bottom: 2000,
      width: 1100,
      height: 1900,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect);

    const availableWidget = getContainer().querySelector<HTMLElement>(
      '[aria-label="Add Collision Report to dashboard"]',
    );
    expect(availableWidget).toBeTruthy();
    await act(async () => {
      dispatchPointerEvent(availableWidget!, 'pointerdown', 20, 20);
      dispatchPointerEvent(window, 'pointermove', 400, 120);
    });
    expect(getContainer().textContent).toContain('Drop component here');

    await act(async () => {
      dispatchPointerEvent(window, 'pointerup', 400, 120);
    });

    const reportWidget = getContainer().querySelector<HTMLElement>(
      '[data-widget-id="report-collision-report"]',
    );
    expect(reportWidget?.getAttribute('data-layout-x')).toBe('8');
    expect(reportWidget?.getAttribute('data-layout-y')).toBe('8');
    const widgetPositions = Array.from(
      getContainer().querySelectorAll<HTMLElement>('[data-widget-id]'),
    ).map((element) => ({
      id: element.dataset.widgetId,
      x: Number(element.dataset.layoutX),
      y: Number(element.dataset.layoutY),
      width: Number(element.dataset.layoutWidth),
      height: Number(element.dataset.layoutHeight),
    }));
    expect(widgetPositions.some((layout) => layout.id === 'report-collision-report')).toBe(true);
    for (let index = 0; index < widgetPositions.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < widgetPositions.length; otherIndex += 1) {
        const first = widgetPositions[index];
        const second = widgetPositions[otherIndex];
        const overlaps = first.x < second.x + second.width &&
          first.x + first.width > second.x &&
          first.y < second.y + second.height &&
          first.y + first.height > second.y;
        expect(overlaps).toBe(false);
      }
    }
  });

  it('swaps widgets at the drop position and preserves both positions after saving', async () => {
    mocks.routeState.profileName = 'create';
    mocks.searchParamState.value =
      'profile=Occupied+Layout&profileId=profile-occupied&homepageId=occupied-layout';
    mocks.homepageApi.get.mockResolvedValue({
      data: {
        data: {
          name: 'Occupied Layout',
          layout: [
            { id: 'total-leads', x: 8, y: 8, width: 271, height: 116 },
            { id: 'active-tasks', x: 287, y: 8, width: 271, height: 116 },
          ],
          sharedProfiles: [{ profileId: 'profile-occupied' }],
        },
      },
    });

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });

    await act(async () => {
      mocks.rndState.onDragStart['total-leads']?.();
    });
    await act(async () => {
      mocks.rndState.onDrag['total-leads']?.({}, { x: 287, y: 8 });
    });
    expect(getContainer().textContent).toContain('Swap positions');
    expect(getContainer().querySelector('.border-red-500')).toBeNull();
    expect(getContainer().textContent).not.toContain('Space occupied');
    expect(getContainer().textContent).not.toContain('Components cannot overlap');
    expect(getContainer().textContent).not.toContain('Move it to an empty area');
    await act(async () => {
      mocks.rndState.onDragStop['total-leads']?.({}, { x: 287, y: 8 });
    });

    for (let index = 0; index < 20; index += 1) {
      const widgetId = index % 2 === 0 ? 'active-tasks' : 'total-leads';
      await act(async () => {
        mocks.rndState.onDragStart[widgetId]?.();
      });
      await act(async () => {
        mocks.rndState.onDrag[widgetId]?.({}, { x: 287, y: 8 });
      });
      await act(async () => {
        mocks.rndState.onDragStop[widgetId]?.({}, { x: 287, y: 8 });
      });
      expect(getContainer().querySelector<HTMLElement>(
        `[data-widget-id="${widgetId}"]`,
      )?.getAttribute('data-layout-x')).toBe('287');
    }

    const totalLeadsPosition = getContainer().querySelector<HTMLElement>(
      '[data-widget-id="total-leads"]',
    );
    const activeTasksPosition = getContainer().querySelector<HTMLElement>(
      '[data-widget-id="active-tasks"]',
    );
    expect(totalLeadsPosition?.getAttribute('data-layout-x')).toBe('287');
    expect(activeTasksPosition?.getAttribute('data-layout-x')).toBe('8');
    expect(getContainer().textContent).not.toContain('Components cannot overlap');
    expect(getContainer().textContent).not.toContain('Move it to an empty area');

    await act(async () => {
      Array.from(getContainer().querySelectorAll('button'))
        .find((button) => button.textContent?.includes('Save and Share'))
        ?.click();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button'))
        .find((button) => button.textContent?.trim() === 'Save')
        ?.click();
      await Promise.resolve();
    });

    const savedPayload =
      mocks.homepageApi.update.mock.calls.at(-1)?.[1] ??
      mocks.homepageApi.create.mock.calls.at(-1)?.[0];
    expect(savedPayload).toBeDefined();
    expect(savedPayload.layout).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'total-leads', x: 287, y: 8 }),
      expect.objectContaining({ id: 'active-tasks', x: 8, y: 8 }),
    ]));
    mocks.homepageApi.get.mockResolvedValue({
      data: {
        data: {
          id: 'occupied-layout',
          name: 'Occupied Layout',
          layout: savedPayload.layout,
          sharedProfiles: [{ profileId: 'profile-occupied' }],
        },
      },
    });
    await act(async () => {
      root!.render(<></>);
    });
    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });
    expect(getContainer().querySelector<HTMLElement>(
      '[data-widget-id="total-leads"]',
    )?.getAttribute('data-layout-x')).toBe('287');
    expect(getContainer().querySelector<HTMLElement>(
      '[data-widget-id="active-tasks"]',
    )?.getAttribute('data-layout-x')).toBe('8');
  });

  it('keeps the widget title at full contrast while the widget is selected for dragging', async () => {
    mocks.routeState.profileName = 'create';
    mocks.searchParamState.value = 'profile=Standard';

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });

    await act(async () => {
      mocks.rndState.onDragStart['total-leads']?.();
    });

    const widget = getContainer().querySelector<HTMLElement>(
      '[data-widget-id="total-leads"]',
    );
    const title = Array.from(getContainer().querySelectorAll('section h3'))
      .find((heading) => heading.textContent === 'Total Leads');
    expect(widget?.style.opacity).toBe('1');
    expect(title?.className).toContain('text-foreground');
    expect(title?.className).toContain('opacity-100');
  });

  it('keeps differently sized widgets inside the grid when their swap target is too narrow', async () => {
    mocks.routeState.profileName = 'create';
    mocks.searchParamState.value =
      'profile=Wide+Widget&profileId=profile-wide&homepageId=wide-widget-home';
    mocks.homepageApi.get.mockResolvedValue({
      data: {
        data: {
          name: 'Wide Widget',
          layout: [
            { id: 'upcoming-tasks', x: 8, y: 8, width: 736, height: 488 },
            { id: 'total-leads', x: 845, y: 8, width: 271, height: 116 },
          ],
          sharedProfiles: [{ profileId: 'profile-wide' }],
        },
      },
    });

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });

    await act(async () => {
      mocks.rndState.onDragStart['total-leads']?.();
      mocks.rndState.onDrag['total-leads']?.({}, { x: 8, y: 8 });
    });
    expect(getContainer().textContent).toContain('Swap positions');
    await act(async () => {
      mocks.rndState.onDragStop['total-leads']?.({}, { x: 8, y: 8 });
    });

    const wideWidget = getContainer().querySelector<HTMLElement>(
      '[data-widget-id="upcoming-tasks"]',
    );
    const smallWidget = getContainer().querySelector<HTMLElement>(
      '[data-widget-id="total-leads"]',
    );
    expect(smallWidget?.getAttribute('data-layout-x')).toBe('8');
    expect(wideWidget?.getAttribute('data-layout-x')).toBe('380');
    expect(wideWidget?.getAttribute('data-layout-width')).toBe('736');
    expect(Number(wideWidget?.getAttribute('data-layout-x')) +
      Number(wideWidget?.getAttribute('data-layout-width'))).toBeLessThanOrEqual(1116);
    expect(Number(smallWidget?.getAttribute('data-layout-x')) +
      Number(smallWidget?.getAttribute('data-layout-width'))).toBeLessThanOrEqual(1116);
  });

  it('closes a widget and saves the updated dashboard layout', async () => {
    mocks.routeState.profileName = 'close-widget-home';
    mocks.searchParamState.value = '';
    mocks.homepageApi.get.mockResolvedValue({
      data: {
        data: {
          id: 'close-widget-home',
          name: 'Close Widget Home',
          layout: [
            { id: 'total-leads', x: 8, y: 8, width: 271, height: 116 },
            { id: 'active-tasks', x: 287, y: 8, width: 271, height: 116 },
          ],
          sharedProfiles: [{ profileId: 'profile-close-widget' }],
        },
      },
    });

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });

    await act(async () => {
      getContainer()
        .querySelector<HTMLButtonElement>('button[aria-label="Close Total Leads"]')
        ?.click();
    });
    expect(getContainer().querySelector('[data-widget-id="total-leads"]')).toBeNull();
    expect(getContainer().querySelector('[data-widget-id="active-tasks"]')).toBeTruthy();

    await act(async () => {
      Array.from(getContainer().querySelectorAll('button'))
        .find((button) => button.textContent?.includes('Save and Share'))
        ?.click();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button'))
        .find((button) => button.textContent?.trim() === 'Save')
        ?.click();
      await Promise.resolve();
    });

    const savedPayload = mocks.homepageApi.update.mock.calls.at(-1)?.[1];
    expect(savedPayload.layout.map((item: { id: string }) => item.id))
      .toEqual(['active-tasks']);
    mocks.homepageApi.get.mockResolvedValue({
      data: {
        data: {
          id: 'close-widget-home',
          name: 'Close Widget Home',
          layout: savedPayload.layout,
          sharedProfiles: [{ profileId: 'profile-close-widget' }],
        },
      },
    });
    await act(async () => {
      root!.render(<></>);
    });
    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });
    expect(getContainer().querySelector('[data-widget-id="total-leads"]')).toBeNull();
    expect(getContainer().querySelector('[data-widget-id="active-tasks"]')).toBeTruthy();
  });

  it('saves and reloads a widget at its selected grid position', async () => {
    mocks.routeState.profileName = 'saved-layout';
    mocks.searchParamState.value = '';
    const originalHomepage = {
      id: 'saved-layout',
      name: 'Saved Layout',
      layout: [
        { id: 'total-leads', x: 8, y: 8, width: 271, height: 116 },
        { id: 'active-tasks', x: 287, y: 8, width: 271, height: 116 },
      ],
      sharedProfiles: [{ profile: { id: 'profile-saved', name: 'Saved Profile' } }],
    };
    mocks.homepageApi.get.mockResolvedValue({ data: { data: originalHomepage } });

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });

    await act(async () => {
      mocks.rndState.onDragStart['total-leads']?.();
    });
    await act(async () => {
      mocks.rndState.onDrag['total-leads']?.('total-leads', { x: 566, y: 132 });
    });
    await act(async () => {
      mocks.rndState.onDragStop['total-leads']?.({}, { x: 566, y: 132 });
    });
    const movedTotalLeads = Array.from(getContainer().querySelectorAll('section h3'))
      .find((heading) => heading.textContent === 'Total Leads');
    expect(movedTotalLeads?.closest('section')?.parentElement?.getAttribute('data-layout-x'))
      .toBe('566');

    await act(async () => {
      Array.from(getContainer().querySelectorAll('button'))
        .find((button) => button.textContent?.includes('Save and Share'))
        ?.click();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button'))
        .find((button) => button.textContent?.trim() === 'Save')
        ?.click();
      await Promise.resolve();
    });
    expect(mocks.homepageApi.update).toHaveBeenCalledWith(
      'saved-layout',
      expect.objectContaining({
        layout: expect.arrayContaining([
          expect.objectContaining({ id: 'total-leads', x: 566, y: 132 }),
        ]),
      }),
    );

    const savedPayload = mocks.homepageApi.update.mock.calls[0][1];
    mocks.homepageApi.get.mockResolvedValue({
      data: {
        data: {
          ...originalHomepage,
          layout: savedPayload.layout,
        },
      },
    });
    await act(async () => {
      root!.render(<></>);
    });
    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });
    const reloadedTotalLeads = Array.from(getContainer().querySelectorAll('section h3'))
      .find((heading) => heading.textContent === 'Total Leads');
    expect(reloadedTotalLeads?.closest('section')?.parentElement?.getAttribute('data-layout-x'))
      .toBe('566');
    expect(reloadedTotalLeads?.closest('section')?.parentElement?.getAttribute('data-layout-y'))
      .toBe('132');

    mocks.routeState.profileName = 'saved-profile';
    mocks.profileApi.list.mockResolvedValue({
      data: { data: [{ id: 'profile-saved', name: 'Saved Profile' }] },
    });
    mocks.homepageApi.list.mockResolvedValue({
      data: {
        data: [{
          ...originalHomepage,
          layout: savedPayload.layout,
          sharedProfiles: [{ profile: { id: 'profile-saved' } }],
        }],
      },
    });
    await act(async () => {
      root!.render(<></>);
    });
    await act(async () => {
      root!.render(<ProfileLandingPage />);
      await Promise.resolve();
    });
    const savedProfileWidget = getContainer().querySelector<HTMLElement>(
      '[data-testid="profile-homepage-layout"] [data-widget-id="total-leads"]',
    );
    expect(getContainer().querySelector<HTMLElement>(
      '[data-testid="profile-homepage-layout"]',
    )?.style.width).toBe('100%');
    expect(savedProfileWidget?.getAttribute('data-layout-x')).toBe('566');
    expect(savedProfileWidget?.getAttribute('data-layout-y')).toBe('132');
    expect(savedProfileWidget?.style.gridColumn).toBe('7 / span 3');
    expect(savedProfileWidget?.style.gridRow).toBe('2 / span 1');
  });

  it('does not add a component when clicked and supports homepage options actions', async () => {
    mocks.routeState.profileName = 'create';
    mocks.searchParamState.value = 'profile=Standard';

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });

    await act(async () => {
      getContainer().querySelector<HTMLElement>('[aria-label="Add LEADS BY SOURCE to dashboard"]')?.click();
    });
    expect(getContainer().querySelector('[aria-label="Add LEADS BY SOURCE to dashboard"]')).toBeTruthy();
    expect(Array.from(getContainer().querySelectorAll('section h3')).some(
      (heading) => heading.textContent === 'LEADS BY SOURCE',
    )).toBe(false);

    await act(async () => {
      getContainer().querySelector<HTMLButtonElement>('button[aria-label="More homepage options"]')?.click();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button')).find(
        (button) => button.textContent?.includes('Remove all components'),
      )?.click();
    });
    expect(getContainer().textContent).toContain('Drag and drop a component');

    await act(async () => {
      getContainer().querySelector<HTMLButtonElement>('button[aria-label="More homepage options"]')?.click();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button')).find(
        (button) => button.textContent?.includes('Restore default components'),
      )?.click();
    });
    expect(getContainer().textContent).toContain('Total Leads');
    expect(getContainer().textContent).toContain('Upcoming Tasks');
  });

  it('loads the requested reports as draggable Standard dashboard components', async () => {
    mocks.routeState.profileName = 'create';
    mocks.searchParamState.value = 'profile=Standard';
    mocks.profileApi.list.mockResolvedValue({
      data: { data: [{ id: 'profile-standard', name: 'Standard User' }] },
    });
    mocks.reportApi.list.mockResolvedValue({
      data: {
        data: {
          items: [
            { id: 'lead-report-id', name: 'Lead Reports', type: 'SUMMARY' },
            { id: 'lead-source-report-id', name: 'Lead by Source', type: 'SUMMARY' },
            { id: 'cmumldp6r00uc5z6amm8lvc2i', name: 'Lead by Status', type: 'SUMMARY' },
          ],
          pagination: { total: 3, totalPages: 1 },
        },
      },
    });

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });
    await act(async () => {
      getContainer().querySelector<HTMLButtonElement>('button[aria-label="Reports"]')?.click();
    });

    for (const reportName of ['Lead Reports', 'Lead by Source', 'Lead by Status']) {
      expect(
        getContainer().querySelector(`[aria-label="Add ${reportName} to dashboard"]`),
      ).toBeTruthy();
    }

    const reportRows = [
      { name: 'Lead Reports', id: 'lead-report-id', row: 9 },
      { name: 'Lead by Source', id: 'lead-source-report-id', row: 13 },
      { name: 'Lead by Status', id: 'cmumldp6r00uc5z6amm8lvc2i', row: 17 },
    ];
    const canvas = getContainer().querySelector<HTMLElement>('main .relative.w-full.overflow-hidden');
    expect(canvas).toBeTruthy();
    vi.spyOn(canvas!, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      right: 1200,
      bottom: 4000,
      width: 1100,
      height: 3900,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect);
    for (const report of reportRows) {
      const availableWidget = getContainer().querySelector<HTMLElement>(
        `[aria-label="Add ${report.name} to dashboard"]`,
      );
      expect(availableWidget).toBeTruthy();
      const clientX = 400;
      const clientY = 100 + 8 + report.row * 124 + 20;
      await act(async () => {
        dispatchPointerEvent(availableWidget!, 'pointerdown', 20, 20);
        dispatchPointerEvent(window, 'pointermove', clientX, clientY);
        dispatchPointerEvent(window, 'pointerup', clientX, clientY);
      });
      const reportHeading = Array.from(getContainer().querySelectorAll('section h3')).find(
        (heading) => heading.textContent === report.name,
      );
      expect(getContainer().querySelector<HTMLElement>(
        `[data-widget-id="report-${report.id}"]`,
      )?.getAttribute('data-layout-y'))
        .toBe(String(8 + report.row * 124));
    }
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button')).find(
        (button) => button.textContent?.includes('Save and Share'),
      )?.click();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button')).find(
        (button) => button.textContent?.includes('Add Profile'),
      )?.click();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Add',
      )?.click();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Save',
      )?.click();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Save',
      )?.click();
      await Promise.resolve();
    });

    const savedWidgetIds = (mocks.homepageApi.create.mock.calls[0][0].layout as Array<{ id: string }>).map(
      (widget) => widget.id,
    );
    expect(savedWidgetIds).toEqual(expect.arrayContaining([
      'report-lead-report-id',
      'report-lead-source-report-id',
      'report-cmumldp6r00uc5z6amm8lvc2i',
    ]));
  });
});