# Changelog

All notable public changes to AuctorForge will be documented here.

## Unreleased

### Added

- Open-source repository documentation: README, quick start, architecture overview, roadmap, privacy notes, security policy, contribution guide, and code of conduct.
- GitHub issue templates for bugs, feature requests, and workflow/template proposals.
- Environment template for local development.
- OpenSpec change plan for the first public product improvements.

### Changed

- Public project identity is standardized on `AuctorForge`.
- Local runtime, generated dependency, and test-output directories are excluded from Git.

### Verified

- `openspec validate --all`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e`
