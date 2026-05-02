# Security Policy

## Reporting Security Issues

Please do not post exploitable security details, API keys, unpublished manuscripts, logs with personal paths, or private project files in public issues.

Before public release, maintainers should add a dedicated security contact channel such as GitHub Security Advisories or a project email address.

Useful reports include:

- Affected version or commit
- Reproduction steps
- Expected and actual impact
- Whether manuscript text, model credentials, local files, or model request logs are involved

## Sensitive Data

Do not commit:

- `.env`
- API keys or access tokens
- Model provider credentials
- Unpublished manuscript text
- Test databases with real content
- Logs that include local paths, request payloads, or secrets
- Screenshots with private project content

## Model Requests

Any feature that sends writing materials to a remote model service should make the data flow clear to the user:

- What text is sent
- Which service receives it
- Whether logs are retained
- Whether the request can be disabled
