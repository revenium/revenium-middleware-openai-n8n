# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.4] - 2025-11-21

### Changed
- Remove unstable `chatgpt-4o-latest` model alias
- Migrate API URLs from api.revenium.io to api.revenium.ai
- Fix API schema: `middlewareSource` field naming (camelCase)
- Add missing StopReason enum values

### Fixed
- Integration test endpoints and headers
- Validation logic for numeric values

## [0.1.0] - Initial Release

### Added
- ReveniumOpenAIChatModel node for n8n
- ReveniumAIAgent node for n8n
- Automatic usage metering to Revenium
- LangChain integration
- Support for OpenAI GPT-4o, GPT-4, and GPT-3.5 models
- Token usage tracking (prompt, completion, total)
- Cost and performance metrics monitoring
- Fire-and-forget async tracking (non-blocking)
- Circuit breaker for Revenium API resilience

