# Local validation — 2026-10-12

Executed successfully:
- `npm test`: 10 Happy DOM frontend tests passed.
- `npm run build`: generated standalone and integration-bundled assets.
- `node --check frontend/src/smart-shopping-card.js`: syntax valid.
- Python 3.12 `compileall` for integration and backend tests: syntax valid only; not a Home Assistant compatibility test.
- `docker compose config --quiet`: Compose configuration valid.

Not executed:
- Backend pytest / Home Assistant integration runtime: bundled Python is 3.12.14, below the target's 3.14.2 requirement; pytest and Home Assistant are absent. An isolated Python 3.14 download was attempted, but installation failed with Windows Access Denied while renaming the downloaded interpreter. Linux CI is configured for Python 3.14 and HA 2026.10.1; CI has not been run here.
- Container startup, onboarding, real browser/mobile/theme checks and restart acceptance: `docker version` found the client but could not connect to the Docker engine pipe; Docker daemon is unavailable.
- HACS and hassfest checks: configured in CI but not executed locally.

No integration, live UI, Docker runtime or HACS validation is claimed as passing. Happy DOM tests exercise the card with mocked Home Assistant connections.

Compatibility note: the durable Store wrapper overrides Home Assistant's protected `_async_write_data` hook to propagate errors that Store otherwise swallows. This was checked against the 2026.10.1 source but still needs the backend regression suite and live validation.

## Clear History follow-up

- `npm test`: all 13 frontend tests passed, including confirmation/cancel, preserving active items, failure handling and history-only visibility.
- `npm run build`: bundled and standalone card rebuilt successfully.
- Python syntax compilation passed. Added backend persistence, notification, rollback and two-client WebSocket tests; backend pytest remains unrun because the available local environment lacks the required Home Assistant/test dependencies. No additional Python packages were installed for this change.
