# Testing Guide

This document covers unit/integration tests (Jest) and end-to-end tests (Playwright).

## Testing Stack

| Layer | Tools |
| --- | --- |
| Unit / component | Jest 30.x, Testing Library, jsdom |
| Coverage | V8 provider, HTML / LCOV / JUnit reports |
| End-to-end | Playwright (`e2e/`, `pnpm test:e2e`) |
| CI | GitHub Actions (`quality.yml`, `test.yml`, `ci.yml`) |

## Running Unit and Component Tests

### Run all tests

```bash
pnpm test
```

### Watch mode

```bash
pnpm test:watch
```

### Coverage

```bash
pnpm test:coverage
```

### Specific file or name pattern

```bash
pnpm test path/to/test-file.test.tsx
pnpm test --testNamePattern="Button"
pnpm test -- --runInBand components/recruitment/table.test.tsx
```

## Test File Structure

Colocate unit/component tests next to source with `.test.ts` / `.test.tsx`:

```text
components/
  ui/
    button.tsx
    button.test.tsx
app/
  page.tsx
  page.test.tsx
lib/
  utils.ts
  utils.test.ts
```

Playwright specs live under `e2e/`:

```text
e2e/
  recruitment-flow.spec.ts
  email-center.spec.ts
  email-prelaunch.spec.ts
  visual-smoke.spec.ts
```

## Writing Jest Tests

### Component example

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./button";

describe("Button", () => {
  it("renders a button with text", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: /click me/i })).toBeInTheDocument();
  });

  it("handles click events", async () => {
    const handleClick = jest.fn();
    const user = userEvent.setup();

    render(<Button onClick={handleClick}>Click me</Button>);
    await user.click(screen.getByRole("button"));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### Utility example

```typescript
import { cn } from "./utils";

describe("cn utility function", () => {
  it("merges class names correctly", () => {
    const result = cn("class1", "class2");
    expect(result).toBe("class1 class2");
  });
});
```

## Playwright End-to-End Tests

`pnpm test:e2e` runs `scripts/run-playwright-e2e.mjs`, which boots a temporary Next.js server and executes Playwright against Chromium.

### Prerequisites

- Local dependencies installed (`pnpm install`)
- Database available and migrated when the suite exercises real DB paths
- Optional `.env.local` values are loaded by the runner; missing secrets fall back to safe local defaults for Playwright

### Run

```bash
pnpm test:e2e
```

Current suites cover:

- Recruitment registration → persistence → admin grading / pass
- Administrator interview evaluation final approval
- Email center admin surfaces and webhook auth
- Visual smoke checks for desktop / mobile layout overflow

See [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) for the release-oriented e2e acceptance list.

## Coverage Reports

After `pnpm test:coverage`, reports are written to `coverage/`:

- HTML: `coverage/index.html`
- LCOV: `coverage/lcov.info`
- JUnit XML: `coverage/junit.xml`
- Clover XML: `coverage/clover.xml`

Open the HTML report:

```bash
# Windows
start coverage/index.html

# macOS
open coverage/index.html

# Linux
xdg-open coverage/index.html
```

## Jest Configuration

`jest.config.ts` includes:

- **Test environment**: jsdom for React component tests
- **Setup file**: `jest.setup.ts`
- **Path aliases**: mirrors `@/` from `tsconfig.json`
- **Coverage collection**: primarily `app/`, `components/`, and `lib/`
- **Reporters**: console + JUnit for CI

## Mocked Modules

`jest.setup.ts` mocks common Next.js modules such as:

- `next/image`
- `next/navigation` (`useRouter`, `usePathname`, `useSearchParams`)

## CI Integration

Tests run through GitHub Actions on:

- Push / PR to `master` or `develop` via `.github/workflows/ci.yml`
- Version tags via `.github/workflows/release.yml`
- Manual debugging via `workflow_dispatch` on reusable workflows

Typical pipeline:

1. Install dependencies
2. Lint and typecheck
3. Run Jest with coverage
4. Upload coverage / test artifacts when configured
5. Build the Next.js application
6. Run Playwright e2e when the workflow includes that job

Details live in [CI_CD.md](CI_CD.md).

### Optional Codecov

1. Sign up at [codecov.io](https://codecov.io)
2. Add the repository
3. Add `CODECOV_TOKEN` to GitHub repository secrets

## Best Practices

### 1. Test behavior, not internal state

```typescript
// ❌
expect(component.state.count).toBe(1);

// ✅
expect(screen.getByText("Count: 1")).toBeInTheDocument();
```

### 2. Prefer accessible queries

1. `getByRole`
2. `getByLabelText`
3. `getByPlaceholderText`
4. `getByText`
5. `getByTestId` only when no better query exists

### 3. Cover failure paths

Prefer tests that include empty states, unauthorized access, invalid input, and external dependency failure over happy-path-only snapshots.

### 4. Keep e2e focused

Use Playwright for critical user journeys. Keep pure logic and component edge cases in Jest.

## Troubleshooting

### Tests are slow

- Use `test.only()` during local debugging
- Prefer `pnpm test:watch` for changed files
- Use `--runInBand` when investigating flaky shared-state suites

### Module not found

- Confirm path aliases match between `jest.config.ts` and `tsconfig.json`
- Mock Next.js-only modules in `jest.setup.ts` when needed

### Coverage missing

- Confirm the file matches `collectCoverageFrom`
- Confirm it is not ignored by `coveragePathIgnorePatterns`

### Playwright server / env issues

- Confirm port `3101` is free or set `PLAYWRIGHT_PORT`
- Confirm `SESSION_SECRET` and database connectivity for DB-backed suites
- Prefer `LINK_USE_MOCK=true` for isolated local e2e unless intentionally testing real Link

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Testing Library Documentation](https://testing-library.com/docs/react-testing-library/intro/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Library Cheatsheet](https://testing-library.com/docs/react-testing-library/cheatsheet)
