import { expect, test } from '@playwright/test';

const loginHeading = 'Sign in to Field4D';

test('unauthenticated root and dashboard remain on the login route', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: loginHeading })).toBeVisible();

  await page.goto('/#/dashboard');
  await expect(page).toHaveURL(/\/#\/$/);
  await expect(page.getByRole('heading', { name: loginHeading })).toBeVisible();
});

test('authenticated root redirects to dashboard and survives refresh', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('userData', JSON.stringify({
      email: 'routing-test@example.invalid',
      timestamp: Date.now(),
    }));
  });
  await page.route('**/api/permissions?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, permissions: [] }),
    });
  });

  await page.goto('/');
  await expect(page).toHaveURL(/\/#\/dashboard$/);

  await page.reload();
  await expect(page).toHaveURL(/\/#\/dashboard$/);
});
