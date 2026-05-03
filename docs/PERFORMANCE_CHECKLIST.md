# NIKIAI Performance Checklist

Use this checklist before beta releases and after large UI, dependency, or routing changes. The goal is to keep NIKIAI fast enough for real study sessions without turning performance work into speculative rewrites.

## Automated Gates

Run these before release:

```bash
npm run test:performance
npx tsc --noEmit
npm run lint
npm run test
npm run test:e2e
npm run build
```

The performance check verifies:

- `app/page.tsx` stays under the documented coordinator-size budget.
- Screenshot capture keeps `html2canvas` out of the initial client module.
- Server-only heavy dependencies do not get imported into `app/page.tsx`.
- Playwright output folders stay ignored by Git and ESLint.
- This checklist includes manual Lighthouse and mobile checks.

## Build Health

- Run `npm run build` before a release candidate.
- Review the Next.js route summary for unusually large route output.
- If build output grows noticeably, inspect what changed before optimizing.
- Do not add a bundle analyzer dependency unless a release branch specifically needs it.

## Manual Lighthouse Checks

Run Lighthouse or browser performance tooling against a production build:

- Desktop home page load.
- Mobile home page load at a 390px-wide viewport.
- Empty chat state.
- Chat with several rendered math blocks.
- Artifact workspace open.
- Knowledge Base panel open.

Track:

- Largest Contentful Paint.
- Total Blocking Time.
- Cumulative Layout Shift.
- Main-thread long tasks.
- JavaScript transfer size.

## Client Bundle Watchpoints

- Keep `app/page.tsx` as a coordinator, not a dumping ground for new heavy logic.
- Keep `html2canvas` lazy-loaded for screenshot/export paths.
- Do not import `openai`, server-only Supabase admin helpers, ingestion scripts, or Node-only modules into client components.
- Be cautious with large markdown/math/rendering packages in new always-visible components.
- Prefer existing extracted components and hooks before adding new state to `app/page.tsx`.

## Mobile Responsiveness

- Verify the composer remains visible after:
  - opening/closing sidebar
  - expanding/collapsing Study Controls
  - opening attachment tools
  - opening Artifact workspace
- Verify math blocks scroll/read comfortably and do not force page-wide overflow.
- Test on a small viewport and with the virtual keyboard open when possible.

## Runtime Work

- Avoid polling unless the feature truly needs it.
- Keep Knowledge Base and artifact library fetches scoped to visible/intentional actions where possible.
- Avoid repeated localStorage parsing inside render-heavy paths.
- Abort or ignore stale async work when sessions, chats, or users change.

## Deferred Performance Work

- Bundle analyzer branch with route-by-route budgets.
- Lighthouse CI with stable thresholds.
- Real-device mobile profiling.
- Large-chat virtualization review.
- Artifact editor/render splitting if the workspace grows further.
