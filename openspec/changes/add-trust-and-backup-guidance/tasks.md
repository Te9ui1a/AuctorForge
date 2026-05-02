## 1. Documentation

- [x] 1.1 Add a public author trust research document with source links and AuctorForge-specific positioning.
- [x] 1.2 Link the research document from README near privacy and roadmap positioning.
- [x] 1.3 Update release notes or roadmap if the new trust guidance changes public-readiness status.

## 2. Test-First Coverage

- [x] 2.1 Add startup tests for the backup guidance region and key local-folder copy.
- [x] 2.2 Add startup tests proving create/import/sample actions remain available.
- [x] 2.3 Add tests that model-provider boundary copy stays visible.

## 3. Startup UI

- [x] 3.1 Add a compact "稿件安全与备份" module to the startup page.
- [x] 3.2 Keep the module informational and avoid promising automatic export.
- [x] 3.3 Style the module consistently with the current startup layout.

## 4. Verification

- [x] 4.1 Run focused startup tests.
- [x] 4.2 Run `openspec validate --all`.
- [x] 4.3 Run `pnpm test`.
- [x] 4.4 Run `pnpm build`.
- [x] 4.5 Run forbidden-brand scan.
- [x] 4.6 Run `pnpm test:e2e`.
