import { expect, test, type Page, type Route } from '@playwright/test';

const bootMessages = [
  'Turning plant signals into insight',
  'Connecting plants, climate, and data',
  'Listening to what the plants are telling us',
  'From field signals to scientific insight',
  'Where plants, sensors, and data come together',
  'Making the invisible plant environment visible',
];

const permissionFixture = {
  success: true,
  permissions: [
    {
      email: 'initial-load-test@example.invalid',
      owner: 'North Research Plot',
      mac_address: 'test-system-a',
      experiment: 'trial-a',
      role: 'read',
      valid_from: null,
      valid_until: null,
      created_at: null,
      device_name: 'Canopy Station',
      description: 'North canopy sensors',
    },
    {
      email: 'initial-load-test@example.invalid',
      owner: 'South Research Plot',
      mac_address: 'test-system-b',
      experiment: 'trial-b',
      role: 'admin',
      valid_from: null,
      valid_until: null,
      created_at: null,
      device_name: 'Lysimeter Station',
      description: 'South lysimeter sensors',
    },
  ],
};

const installAuthenticatedSession = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.setItem('userData', JSON.stringify({
      email: 'initial-load-test@example.invalid',
      timestamp: Date.now(),
    }));
  });
};

const installAuthResolutionDelay = async (page: Page, delayMs: number) => {
  await page.addInitScript((delay) => {
    (window as Window & { __FIELD4D_AUTH_TEST_DELAY_MS__?: number })
      .__FIELD4D_AUTH_TEST_DELAY_MS__ = delay;
  }, delayMs);
};

const fulfillPermissions = async (route: Route, status = 200) => {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: status === 200
      ? JSON.stringify(permissionFixture)
      : JSON.stringify({ detail: 'Synthetic permissions failure' }),
  });
};

test('fast auth boot honors the short minimum then transitions to login', async ({ page }) => {
  // Keep the loader observable even when Vite performs a cold module transform before
  // Playwright can attach its first locator assertion. This affects only the test hook.
  await installAuthResolutionDelay(page, 2_500);
  const navigation = page.goto('/', { waitUntil: 'commit' });
  await expect(page.getByTestId('app-boot-loader')).toBeVisible();
  await navigation;
  const loaderVisibleAt = Date.now();
  const initialMessage = await page.locator('.field4d-loading-logo__label').innerText();
  expect(bootMessages).toContain(initialMessage);
  await expect(page.getByRole('heading', { name: 'Sign in to Field4D' })).toHaveCount(0);

  const motion = await page.getByTestId('app-boot-loader').evaluate((loader) => {
    const mark = loader.querySelector('[data-testid="field4d-loading-logo-mark"]');
    const message = loader.querySelector('.field4d-loading-logo__label');
    if (!mark || !message) throw new Error('Boot loader content was not rendered');
    const markStyle = window.getComputedStyle(mark);
    const loaderStyle = window.getComputedStyle(loader);
    return {
      animationName: markStyle.animationName,
      animationDuration: markStyle.animationDuration,
      transitionDuration: loaderStyle.transitionDuration,
      messageAnimationDuration: window.getComputedStyle(message).animationDuration,
    };
  });
  expect(motion).toEqual({
    animationName: 'field4d-logo-breathe',
    animationDuration: '1.8s',
    transitionDuration: '0.25s',
    messageAnimationDuration: '0.4s',
  });

  await expect(page.getByRole('heading', { name: 'Sign in to Field4D' })).toBeVisible();
  const visibleDurationMs = Date.now() - loaderVisibleAt;
  expect(visibleDurationMs).toBeGreaterThanOrEqual(650);
  expect(visibleDurationMs).toBeLessThan(4_000);
  await expect(page.getByTestId('app-boot-loader')).toHaveCount(0);
  console.log(JSON.stringify({ initialMessage, visibleDurationMs }));
});

test('login retains production card geometry and loads all CSS assets', async ({ page }) => {
  await installAuthResolutionDelay(page, 1_200);
  const failedResponses: Array<{ url: string; status: number }> = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedResponses.push({ url: response.url(), status: response.status() });
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const navigation = page.goto('/', { waitUntil: 'commit' });
  await navigation;
  await expect(page.getByRole('heading', { name: 'Sign in to Field4D' })).toBeVisible();

  const geometry = await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll('h2'))
      .find((element) => element.textContent?.includes('Sign in to Field4D'));
    const headingGroup = heading?.parentElement;
    const card = headingGroup?.parentElement;
    const wrapper = card?.parentElement;
    const overlay = card?.previousElementSibling;
    const logo = headingGroup?.querySelector('img');
    const googleButton = document.querySelector('.gsi-material-button');
    const emailSummary = document.querySelector('summary');

    const inspect = (element: Element | null | undefined) => {
      if (!element) throw new Error('Expected login element was not rendered');
      const style = window.getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
        display: style.display,
        position: style.position,
        maxWidth: style.maxWidth,
        padding: style.padding,
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius,
        fontSize: style.fontSize,
      };
    };

    return {
      wrapper: inspect(wrapper),
      card: inspect(card),
      overlay: inspect(overlay),
      logo: inspect(logo),
      googleButton: inspect(googleButton),
      emailSummary: inspect(emailSummary),
    };
  });

  expect(geometry.wrapper).toMatchObject({
    x: 0, y: 0, width: 1440, height: 900, display: 'flex', position: 'fixed',
  });
  expect(geometry.card).toMatchObject({
    x: 480,
    width: 480,
    maxWidth: '480px',
    padding: '40px 32px',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: '16px',
  });
  expect(geometry.card.height).toBeGreaterThanOrEqual(387);
  expect(geometry.card.height).toBeLessThanOrEqual(388);
  expect(geometry.overlay).toMatchObject({
    x: 0,
    y: 0,
    width: 1440,
    height: 900,
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  });
  expect(geometry.logo).toMatchObject({ width: 177, height: 112 });
  expect(geometry.googleButton).toMatchObject({ height: 40, fontSize: '14px' });
  expect(geometry.googleButton.width).toBeGreaterThanOrEqual(414);
  expect(geometry.googleButton.width).toBeLessThanOrEqual(415);
  expect(geometry.emailSummary).toMatchObject({ height: 44, fontSize: '14px' });
  expect(geometry.emailSummary.width).toBeGreaterThanOrEqual(412);
  expect(geometry.emailSummary.width).toBeLessThanOrEqual(413);
  expect(failedResponses).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('unauthenticated dashboard route resolves through the loader and remains protected', async ({ page }) => {
  await installAuthResolutionDelay(page, 1_200);
  const navigation = page.goto('/#/dashboard', { waitUntil: 'commit' });
  await expect(page.getByTestId('app-boot-loader')).toBeVisible();
  await navigation;

  await expect(page.getByRole('heading', { name: 'Sign in to Field4D' })).toBeVisible();
  await expect(page).toHaveURL(/\/#\/$/);
  await expect(page.getByTestId('dashboard-shell')).toHaveCount(0);
});

test('slow auth boot rotates through multiple messages without delaying login', async ({ page }) => {
  await installAuthResolutionDelay(page, 9_000);
  const navigation = page.goto('/', { waitUntil: 'commit' });
  const label = page.locator('.field4d-loading-logo__label');
  await expect(page.getByTestId('app-boot-loader')).toBeVisible();
  await navigation;
  const firstMessage = await label.innerText();
  expect(bootMessages).toContain(firstMessage);

  const transitions = await page.getByTestId('field4d-loading-logo').evaluate((loader) => (
    new Promise<Array<{ message: string; at: number }>>((resolve) => {
      const observed: Array<{ message: string; at: number }> = [];
      let previousMessage = loader.querySelector('.field4d-loading-logo__label')?.textContent || '';
      const observer = new MutationObserver(() => {
        const message = loader.querySelector('.field4d-loading-logo__label')?.textContent || '';
        if (!message || message === previousMessage) return;
        previousMessage = message;
        observed.push({ message, at: performance.now() });
        if (observed.length === 2) {
          observer.disconnect();
          resolve(observed);
        }
      });
      observer.observe(loader, { childList: true, subtree: true });
    })
  ));

  const secondMessage = transitions[0].message;
  expect(bootMessages).toContain(secondMessage);
  const thirdMessage = transitions[1].message;
  expect(bootMessages).toContain(thirdMessage);
  expect(new Set([firstMessage, secondMessage, thirdMessage]).size).toBe(3);
  const fullRotationIntervalMs = transitions[1].at - transitions[0].at;
  expect(fullRotationIntervalMs).toBeGreaterThanOrEqual(3_500);
  expect(fullRotationIntervalMs).toBeLessThan(4_300);

  await expect(page.getByRole('heading', { name: 'Sign in to Field4D' })).toBeVisible();
  await expect(page.getByTestId('app-boot-loader')).toHaveCount(0);
  console.log(JSON.stringify({
    firstMessage,
    secondMessage,
    thirdMessage,
    fullRotationIntervalMs,
  }));
});

test('authenticated root redirects to dashboard and refresh retains the session', async ({ page }) => {
  await installAuthenticatedSession(page);
  await installAuthResolutionDelay(page, 1_200);
  let requestCount = 0;

  await page.route('**/api/permissions?**', async (route) => {
    requestCount += 1;
    await fulfillPermissions(route);
  });

  const navigation = page.goto('/', { waitUntil: 'commit' });
  await expect(page.getByTestId('app-boot-loader')).toBeVisible();
  await navigation;
  await expect(page.getByTestId('dashboard-shell')).toBeVisible();
  await expect(page).toHaveURL(/\/#\/dashboard$/);
  await expect(page.getByLabel('Select System')).toBeEnabled();
  expect(requestCount).toBe(1);

  const refresh = page.reload({ waitUntil: 'commit' });
  await expect(page.getByTestId('app-boot-loader')).toBeVisible();
  await refresh;
  await expect(page.getByTestId('dashboard-shell')).toBeVisible();
  await expect(page).toHaveURL(/\/#\/dashboard$/);
  await expect.poll(() => requestCount).toBe(2);
});

test('authenticated boot transitions to dashboard shell before fresh permissions complete', async ({ page }) => {
  await installAuthenticatedSession(page);
  await installAuthResolutionDelay(page, 1_200);
  let requestCount = 0;
  let responseReleased = false;
  let releasePermissionResponse: () => void = () => undefined;
  const permissionResponseGate = new Promise<void>((resolve) => {
    releasePermissionResponse = resolve;
  });

  await page.route('**/api/permissions?**', async (route) => {
    requestCount += 1;
    await permissionResponseGate;
    responseReleased = true;
    await fulfillPermissions(route);
  });

  const navigationStarted = Date.now();
  const navigation = page.goto('/#/dashboard', { waitUntil: 'commit' });
  await expect(page.getByTestId('app-boot-loader')).toBeVisible();
  await navigation;
  await expect(page.getByTestId('dashboard-shell')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-shell')).toBeVisible();
  const shellVisibleMs = Date.now() - navigationStarted;

  await expect.poll(() => requestCount).toBe(1);
  expect(responseReleased).toBe(false);
  await expect(page.getByRole('button', { name: 'Log Out' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Data Viewer/ })).toBeVisible();
  await expect(page.getByTestId('dashboard-main-frame')).toBeVisible();
  await expect(page.getByText('Loading fresh access details...')).toBeVisible();
  await expect(page.getByTestId('field4d-loading-logo')).toHaveCount(0);
  await expect(page.getByTestId('permission-placeholder-owner')).toBeDisabled();
  await expect(page.getByTestId('permission-placeholder-system')).toBeDisabled();
  await expect(page.getByTestId('permission-placeholder-experiment')).toBeDisabled();

  const panelBefore = await page.getByTestId('permission-panel').boundingBox();
  expect(panelBefore).not.toBeNull();

  releasePermissionResponse();
  await expect(page.getByLabel('Select System')).toBeEnabled();
  const usableSelectorsMs = Date.now() - navigationStarted;
  await expect(page.getByLabel('Select Owner')).toBeEnabled();
  await expect(page.getByLabel('Select System').locator('option')).toHaveCount(3);
  await page.waitForTimeout(150);
  expect(requestCount).toBe(1);

  const panelAfter = await page.getByTestId('permission-panel').boundingBox();
  expect(panelAfter).not.toBeNull();
  expect(Math.abs((panelAfter?.x ?? 0) - (panelBefore?.x ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((panelAfter?.y ?? 0) - (panelBefore?.y ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((panelAfter?.width ?? 0) - (panelBefore?.width ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((panelAfter?.height ?? 0) - (panelBefore?.height ?? 0))).toBeLessThanOrEqual(12);

  console.log(JSON.stringify({ shellVisibleMs, usableSelectorsMs, requestCount }));
});

test('permission failure keeps the shell and supports a fresh explicit retry', async ({ page }) => {
  await installAuthenticatedSession(page);
  await installAuthResolutionDelay(page, 1_200);
  let requestCount = 0;

  await page.route('**/api/permissions?**', async (route) => {
    requestCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 350));
    await fulfillPermissions(route, requestCount === 1 ? 503 : 200);
  });

  const navigation = page.goto('/#/dashboard', { waitUntil: 'commit' });
  await expect(page.getByTestId('app-boot-loader')).toBeVisible();
  await navigation;
  await expect(page.getByTestId('dashboard-shell')).toBeVisible();
  await expect(page.getByTestId('permission-error-state')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log Out' })).toBeVisible();
  await expect(page.getByText('Access details unavailable')).toBeVisible();
  await expect(page.getByLabel('Select System')).toHaveCount(0);
  expect(requestCount).toBe(1);

  await page.getByRole('button', { name: 'Retry access check' }).click();
  await expect(page.getByText('Loading fresh access details...')).toBeVisible();
  await expect(page.getByTestId('field4d-loading-logo')).toHaveCount(0);
  await expect(page.getByLabel('Select System')).toBeEnabled();
  await expect(page.getByTestId('permission-error-state')).toHaveCount(0);
  expect(requestCount).toBe(2);
});

test('reduced motion keeps logo and message transitions static while timing still resolves', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAuthResolutionDelay(page, 4_500);
  const navigation = page.goto('/', { waitUntil: 'commit' });
  await expect(page.getByTestId('app-boot-loader')).toBeVisible();
  await navigation;

  const label = page.locator('.field4d-loading-logo__label');
  const initialMessage = await label.innerText();
  expect(bootMessages).toContain(initialMessage);

  const motion = await page.getByTestId('app-boot-loader').evaluate((loader) => {
    const mark = loader.querySelector('[data-testid="field4d-loading-logo-mark"]');
    const labelElement = loader.querySelector('.field4d-loading-logo__label');
    if (!mark || !labelElement) throw new Error('Boot loader content was not rendered');
    const markStyle = window.getComputedStyle(mark);
    const labelStyle = window.getComputedStyle(labelElement);
    const loaderStyle = window.getComputedStyle(loader);
    return {
      logoAnimation: markStyle.animationName,
      messageAnimation: labelStyle.animationName,
      loaderTransition: loaderStyle.transitionDuration,
      transform: markStyle.transform,
      opacity: markStyle.opacity,
    };
  });
  expect(motion).toEqual({
    logoAnimation: 'none',
    messageAnimation: 'none',
    loaderTransition: '0s',
    transform: 'none',
    opacity: '1',
  });

  await expect.poll(() => label.innerText()).not.toBe(initialMessage);
  await expect(page.getByRole('heading', { name: 'Sign in to Field4D' })).toBeVisible();
});
