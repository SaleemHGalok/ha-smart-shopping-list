# Development and publishing

This guide is for contributors and maintainers. For installation and card configuration, see the [README](../README.md).

Use Node.js 24 and Home Assistant 2026.10.1 with Python 3.14.2+. CI pins the matching Home Assistant test fixtures. Docker uses the moving `stable` image; verify upgrades before using them on your main instance.

## HACS publication prerequisites

HACS cannot install private repositories. Before publishing, make the repository public, set an About description, and add topics such as `home-assistant`, `hacs`, `custom-integration`, and `lovelace`. GitHub recognizes the included MIT license once it is on the default branch. Local brand icons are bundled in the integration's `brand/` directory.

CI runs HACS validation only for public repositories; private repositories still run backend, frontend, hassfest, JSON and Compose checks. Review the publication check before announcing HACS availability. Being installable as a custom repository does not mean the project is listed in the HACS default store.

## Windows development with Docker Desktop and VS Code

Use Docker Desktop in **Linux containers** mode (WSL2 recommended), start its daemon, and open this repository in VS Code. Run from the repository root in PowerShell:

```powershell
npm ci
npm run build
npm run dev:start
npm run dev:logs
```

Visit **http://localhost:8124**, finish Home Assistant onboarding, then follow the integration and resource setup in the [README](../README.md). Create your own account during onboarding; the repository has no credentials. The container mounts the isolated `dev/ha-config` as `/config`, the integration read-only, and `frontend/dist` read-only as `/config/www/smart-shopping-list`. Port 8124 maps to Home Assistant's 8123. No host networking or privileged container is needed.

```powershell
npm run dev:stop
```

`docker compose down` stops and removes the container while retaining the local configuration and shopping data. Runtime state, secrets, authentication, databases, logs, local environment files and dependency folders are ignored by Git. Only the seed `dev/ha-config/configuration.yaml` is tracked. Do not add production credentials to that file.

After frontend edits, run `npm run build`, change the resource query version (for example `?v=dev2`) and refresh every browser/app. In development you may instead register `/local/smart-shopping-list/smart-shopping-card.js?v=dev2`. Register only one resource URL to avoid duplicate module loading. After Python edits, run `docker compose restart homeassistant`. Updating the integration in HACS also requires a restart and browser cache refresh.

## Testing

```powershell
npm ci
npm test
npm run build
docker compose config --quiet
```

Backend testing uses real Home Assistant fixtures, including Store persistence and authenticated WebSocket clients. Home Assistant's Python environment is Linux-oriented; use WSL2 or Linux CI with Python 3.14.2+:

```sh
python3.14 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements-test.txt
python -m pytest -q
```

Tests cover mutations, bad inputs, concurrent writes, write rollback, persistence, config flow, restart/reload, subscriptions, two clients, frontend forms, history, failed API calls and cleanup. DOM tests use Happy DOM, not a real Home Assistant browser. For manual acceptance, open manage and store cards on two devices, add an item, edit quantity, purchase, verify history, restore, delete, and restart the container to verify persistence. Check both light/dark themes and a narrow phone viewport. Automated tests do not replace this live check.

## Architecture and API

- `custom_components/smart_shopping_list/`: UI config flow, persistent list, WebSocket API and bundled resource.
- `frontend/src/`: dependency-free browser module; build copies it into `frontend/dist/` and integration `www/`.
- `tests/backend/`, `tests/frontend/`: pytest and Node DOM suites.
- `.github/workflows/`: frontend/backend tests, HACS/hassfest checks, Compose validation and a manually dispatched artifact build.

The singleton integration stores `{items, revision}` using Home Assistant Store version 1 under `.storage/smart_shopping_list`. Each item has UUID `id`, trimmed `name`, positive finite numeric `quantity`, optional `unit`, boolean `purchased`, UTC ISO `created_at` and nullable UTC ISO `purchased_at`. Names allow 1â€“200 characters; units allow 0â€“40. Active/history views filter the purchased flag. History has no automatic expiration.

Authenticated Home Assistant users share read/write access to this household list. There are no entity-based per-user permissions, service actions or separate lists. The static JavaScript resource contains no shopping data.

Send operations through Home Assistant's authenticated WebSocket connection:

```javascript
await hass.callWS({type: 'smart_shopping_list/command', action: 'add', name: 'Milk', quantity: 2, unit: 'L'});
await hass.callWS({type: 'smart_shopping_list/command', action: 'edit', item_id: id, quantity: 3});
await hass.callWS({type: 'smart_shopping_list/command', action: 'purchase', item_id: id});
await hass.callWS({type: 'smart_shopping_list/command', action: 'restore', item_id: id});
await hass.callWS({type: 'smart_shopping_list/command', action: 'delete', item_id: id});
await hass.callWS({type: 'smart_shopping_list/command', action: 'get'});
await hass.callWS({type: 'smart_shopping_list/command', action: 'clear_history'});
const unsubscribe = await hass.connection.subscribeMessage(snapshot => console.log(snapshot), {
  type: 'smart_shopping_list/subscribe'
});
// Call unsubscribe() when the consumer disconnects.
```

Commands return a full `{items, revision}` snapshot; subscribe sends one immediately and after every saved mutation. Subscription registration and initial snapshot occur without yielding, avoiding a missed-update window. The frontend ignores older revisions. Home Assistant's connection helper renews subscriptions after transport reconnection. A single async lock serializes read-modify-save operations; atomic storage writes finish before in-memory state and events advance. Failed writes preserve the previous snapshot. A small Store subclass surfaces otherwise logged write failures through its protected `_async_write_data` hook; recheck this hook when upgrading beyond the pinned Home Assistant version. Concurrent edits use last successful write wins; purchase/restore are idempotent. Requests cannot change an item's name or metadata after creation.

## Packaging

Keep the built `custom_components/smart_shopping_list/www/smart-shopping-card.js` committed. `npm run build` must reproduce it exactly. The manual Package workflow creates an installable integration folder ZIP and standalone JS artifact without publishing or pushing. For a release, bump manifest/package versions, rebuild, run CI, create a GitHub release and attach the artifacts. The HACS integration configuration downloads the integration folder directly; the standalone JS can also be manually registered. This repository is configured as a HACS integration, not two independent HACS repository categories.

## Development troubleshooting

If Docker cannot connect, start Docker Desktop in Linux containers mode and confirm `docker version` shows both client and server. Port 8124 must be available.

For a record of executed checks and limitations, see [VALIDATION.md](../VALIDATION.md).

Implementation references: [Home Assistant WebSocket extensions](https://developers.home-assistant.io/docs/frontend/extending/websocket-api), [async static paths](https://developers.home-assistant.io/blog/2024/06/18/async_register_static_paths/), [2026.10.1 source](https://github.com/home-assistant/core/tree/2026.10.1), and [HACS integration packaging](https://www.hacs.dev/docs/publish/integration/).
