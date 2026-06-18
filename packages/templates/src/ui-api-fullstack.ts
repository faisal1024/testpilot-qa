import type { Template, TemplateContext, TemplateFile } from './types.js'

const PLAYWRIGHT_CONFIG = `import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  // Run test files in parallel; tests within a file run in parallel too.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Cap workers in CI for stable, predictable runs; locally Playwright picks a
  // sensible default (roughly half your CPU cores). Override with --workers=N.
  workers: process.env.CI ? 2 : undefined,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
`

// Emitted as a plain object so a freshly-scaffolded project installs and runs
// without depending on the (currently unpublished) testpilot-qa package. Once
// testpilot-qa is installed you can switch to the typed helper:
//   import { defineConfig } from 'testpilot-qa'
//   export default defineConfig({ ... })
const TESTPILOT_CONFIG = `export default {
  testDir: 'tests',
  playwrightConfig: 'playwright.config.ts',
}
`

// The UI example renders inline HTML (no web server needed) so it passes
// offline, and demonstrates resilient, user-facing locators.
const UI_TEST = `import { expect, test } from '@playwright/test'

const SIGN_IN_PAGE =
  '<main>' +
  '<h1>Welcome back</h1>' +
  '<label>Email <input type="email" /></label>' +
  '<button type="submit">Sign in</button>' +
  '</main>'

test('renders the sign-in form with accessible locators', async ({ page }) => {
  await page.setContent(SIGN_IN_PAGE)

  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await page.getByLabel('Email').fill('user@example.com')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})
`

// A second, slightly richer UI example: a tiny interactive todo list rendered
// (with an inline script) via setContent. Offline, self-contained, and safe to
// run in parallel — each test gets its own isolated page. Easy to copy and
// extend. Uses getByLabel/getByRole and web-first assertions.
const TODO_TEST = `import { expect, test } from '@playwright/test'

const TODO_APP =
  '<main>' +
  '<h1>My tasks</h1>' +
  '<form id="add-task">' +
  '<label>New task <input name="task" /></label>' +
  '<button type="submit">Add</button>' +
  '</form>' +
  '<ul aria-label="Tasks"></ul>' +
  '<script>' +
  "document.getElementById('add-task').addEventListener('submit', (event) => {" +
  '  event.preventDefault();' +
  '  const input = event.target.elements.task;' +
  "  if (!input.value.trim()) return;" +
  "  const item = document.createElement('li');" +
  '  item.textContent = input.value;' +
  "  document.querySelector('ul').appendChild(item);" +
  "  input.value = '';" +
  '});' +
  '</script>' +
  '</main>'

test('adds a task to the list', async ({ page }) => {
  await page.setContent(TODO_APP)

  await page.getByLabel('New task').fill('Write a Playwright test')
  await page.getByRole('button', { name: 'Add' }).click()

  await expect(page.getByRole('listitem')).toHaveText('Write a Playwright test')
})
`

// The API example serves a tiny local endpoint so it passes offline and
// demonstrates Playwright's request fixture.
const API_TEST = `import { createServer, type Server } from 'node:http'
import { expect, test } from '@playwright/test'

let server: Server
let baseURL = ''

test.beforeAll(async () => {
  server = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ status: 'ok' }))
  })
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
  const address = server.address()
  if (address && typeof address === 'object') {
    baseURL = 'http://127.0.0.1:' + address.port
  }
})

test.afterAll(() => {
  server.close()
})

test('GET / returns a healthy status', async ({ request }) => {
  const response = await request.get(baseURL + '/')
  expect(response.ok()).toBeTruthy()
  expect(await response.json()).toEqual({ status: 'ok' })
})
`

const GITIGNORE = `node_modules/
test-results/
playwright-report/
blob-report/
playwright/.cache/
`

const E2E_WORKFLOW = `name: E2E
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
`

function packageJson(ctx: TemplateContext): string {
  const pkg = {
    name: ctx.projectName,
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts: {
      'test:e2e': 'playwright test',
      'test:e2e:ui': 'playwright test tests/ui',
      'test:e2e:api': 'playwright test tests/api',
      'test:e2e:parallel': 'playwright test --workers=2',
      'test:e2e:headed': 'playwright test --headed',
    },
    devDependencies: {
      '@playwright/test': '^1.49.0',
    },
  }
  return `${JSON.stringify(pkg, null, 2)}\n`
}

function readme(ctx: TemplateContext): string {
  return [
    `# ${ctx.projectName}`,
    '',
    'End-to-end tests powered by [Playwright](https://playwright.dev), scaffolded by TestPilot QA.',
    '',
    '## Quick start',
    '',
    '```bash',
    'npm install',
    'npx playwright install',
    'npm run test:e2e',
    '```',
    '',
    '## Running tests',
    '',
    '```bash',
    'npm run test:e2e            # all tests',
    'npm run test:e2e:ui         # UI tests only (tests/ui)',
    'npm run test:e2e:api        # API tests only (tests/api)',
    'npm run test:e2e:parallel   # run with 2 workers',
    'npm run test:e2e:headed     # run in a headed browser',
    '```',
    '',
    'Tests run in parallel by default (`fullyParallel: true`). Control concurrency',
    'with Playwright directly:',
    '',
    '```bash',
    'npx playwright test --workers=4',
    'npx playwright test tests/ui --workers=2',
    '```',
    '',
    'The sample tests are independent and avoid shared mutable state, so they are',
    'safe to run in parallel.',
    '',
    'You can also run the tests through TestPilot (a thin wrapper around Playwright',
    '— not a custom runner; all Playwright flags pass through after `--`):',
    '',
    '```bash',
    'npx testpilot-qa run',
    'npx testpilot-qa run -- --workers=2',
    'npx testpilot-qa run -- tests/ui --workers=2',
    '```',
    '',
    '## This project is plain Playwright',
    '',
    'Everything here is standard Playwright. TestPilot only scaffolded it — delete',
    '`testpilot.config.ts` and remove the `testpilot-qa` dependency and you still have',
    'a fully working Playwright suite (`npx playwright test`).',
    '',
  ].join('\n')
}

export const uiApiFullstack: Template = {
  id: 'ui-api-fullstack',
  description: 'A TypeScript Playwright project with UI and API example tests.',
  files(context: TemplateContext): TemplateFile[] {
    return [
      { path: 'package.json', content: packageJson(context) },
      { path: 'playwright.config.ts', content: PLAYWRIGHT_CONFIG },
      { path: 'testpilot.config.ts', content: TESTPILOT_CONFIG },
      { path: 'tests/ui/example.spec.ts', content: UI_TEST },
      { path: 'tests/ui/todo.spec.ts', content: TODO_TEST },
      { path: 'tests/api/example.spec.ts', content: API_TEST },
      { path: '.gitignore', content: GITIGNORE },
      { path: '.github/workflows/e2e.yml', content: E2E_WORKFLOW },
      { path: 'README.md', content: readme(context) },
    ]
  },
}
