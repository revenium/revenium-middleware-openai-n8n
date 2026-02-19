# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.8] - 2026-02-19

### Added

- Tool metering support (meterTool, reportToolCall, setToolContext)
- outputFields feature for automatic result extraction
- Fetch timeout to sendToolEvent

### Fixed

- meterTool sync throw and DRY violation in reportToolCall

## [0.1.7] - 2026-02-06

### Added

- Public allowlist for npm publishing

## [0.1.6] - 2026-01-21

### Added

- Prompt capture functionality (opt-in via REVENIUM_CAPTURE_PROMPTS)
- System prompt, input messages, and output response tracking
- Automatic credential sanitization with 13 comprehensive patterns
- Summary printer for human-readable and JSON output
- Support for teamId in credentials
- Support for printSummary configuration

### Changed

- Enhanced credential sanitization with 13 comprehensive patterns
- Added support for AWS access keys (AKIA\*)
- Added support for GitHub tokens (ghp*\*, ghs*\*)
- Added support for JWT tokens
- Improved API key, token, password, and secret detection
- More specific pattern matching for OpenAI project keys (sk-proj-\*)
- More specific pattern matching for Anthropic keys (sk-ant-\*)
- More specific pattern matching for Perplexity keys (pplx-\*)
- Updated UsageMetadata interface with capturePrompts and maxPromptSize
- Updated CreateCompletionRequest with prompt fields
- Updated ReveniumOpenAICredentials with printSummary and teamId

### Security

- Strengthened credential sanitization to prevent accidental exposure
- Pattern order optimized for security (most specific patterns first)

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
