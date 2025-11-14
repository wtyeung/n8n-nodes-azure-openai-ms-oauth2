# Changelog

All notable changes to this project will be documented in this file.

## [1.1.2] - 2025-01-XX

### Fixed
- **Dynamic Token Refresh**: Model methods now fetch fresh OAuth2 tokens before each API call
  - Wraps `invoke()` and `stream()` methods to refresh tokens dynamically
  - Ensures token is always fresh even when model instance is reused across workflow executions
  - Solves issue where LangChain caches expired tokens in model instance

### Changed
- Improved token refresh mechanism to work at invocation time rather than initialization time

## [1.1.1] - 2025-01-14

### Added
- **Proactive Token Refresh**: Automatically checks OAuth2 token expiry before each API call and refreshes tokens 5 minutes before expiration
  - Prevents authentication failures from expired tokens
  - Workaround for n8n's limitation where OAuth2 tokens are only refreshed on 401 errors (not 403 errors)
  - Logs token refresh attempts for debugging

### Changed
- Improved error messages for OAuth2 authentication failures
- Enhanced token validation logic in the node

### Fixed
- Token not being renewed automatically when expired (addresses n8n OAuth2 framework limitation)
