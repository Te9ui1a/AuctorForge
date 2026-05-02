# Privacy And Manuscript Safety

AuctorForge is designed for writers, so unpublished text and project materials deserve special care.

## What Can Be Sensitive

- Draft chapters
- Outlines
- Character notes
- Worldbuilding
- Review notes
- Prompt templates with story details
- Model API keys
- Local project paths
- Request logs

## Local Files

The app works with local project files and workflow assets. Before using valuable manuscript material, confirm:

- Where the project folder is located
- Which files the app creates or edits
- Whether backups exist
- How to export your work

## Remote Model Providers

If a feature calls a remote model service, the service may receive text from your project. Depending on the feature, that may include chapter drafts, outlines, character notes, review instructions, or chat messages.

Before enabling a model provider:

- Read the provider's data policy
- Test with fictional content
- Avoid pasting private full manuscripts until you trust the setup
- Keep API keys out of Git

## Public Repository Checklist

Before publishing or sharing the repository, check for:

- `.env`
- API keys and tokens
- Unpublished manuscript material
- Local project folders
- Test logs with request payloads
- Screenshots containing private text
- Personal filesystem paths

## Maintainer Notes

Future hosted or sync features should document:

- What is uploaded
- Who processes it
- How long it is retained
- Whether it is used for training
- How users can delete it
