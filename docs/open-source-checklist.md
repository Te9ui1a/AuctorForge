# Open-Source Release Checklist

Use this before making AuctorForge public.

## Repository Safety

- [ ] No `.env` file is committed
- [ ] No API keys, tokens, cookies, or model credentials are committed
- [ ] No unpublished manuscript text is committed
- [ ] No local project data is committed
- [ ] No logs expose request payloads or personal paths
- [ ] Screenshots and demos use fictional content
- [x] Internal development history is excluded from Git

## Documentation

- [ ] README explains what AuctorForge is
- [ ] README includes real setup and run commands
- [ ] README links privacy, roadmap, and contribution docs
- [ ] License is present
- [ ] `.env.example` is present
- [ ] Quick start has been tested from a clean checkout
- [ ] Roadmap reflects current priorities

## Product Readiness

- [ ] First screen uses the AuctorForge brand
- [ ] Empty states are understandable to writers
- [ ] Model configuration failures are readable
- [ ] Local project storage is understandable
- [ ] Remote model request behavior is explained
- [ ] Export or backup guidance is documented

## Community

- [ ] Bug report issue template
- [ ] Feature request issue template
- [ ] Workflow/template proposal issue template
- [ ] Contribution guide
- [ ] Code of conduct
- [ ] Security policy
- [ ] Good first issues marked

## Release

- [x] Add screenshots or demo media
- [x] Draft first release notes
- [x] Add a short architecture overview
- [ ] Confirm Git repository state and remotes
- [ ] Tag the initial public release
