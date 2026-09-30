# DeepSeek Peak Pricing Status

[简体中文](README.md) | **English**

A lightweight peak/off-peak indicator for **DeepSeek Harness (DSH)**. A small dot appears in the bottom-right composer toolbar, immediately to the left of the model selector, without modifying the selector itself.

> An unofficial community plugin. Its status is calculated from local time and a maintained calendar, not billing data. Actual charges are determined by your provider's current pricing policy.

## Features

- Pale green for off-peak hours; pale red for peak hours.
- Hover or focus to see the current phase, Beijing time, decision basis, peak windows, countdown to the next transition, and selected model.
- Recalculates every 30 seconds; boundary changes may therefore take up to approximately 30 seconds to appear.
- Visible only for provider IDs `deepseek-account`, `deepseek-official`, and `deepseek`. Unknown providers and third-party routes are hidden, even when their model names contain DeepSeek.
- Subscribes to the `modelSelection` projection and uses the additive `conversation.input.right` slot. Does not replace the model selector.
- No additional npm runtime dependencies or build step. React is supplied by the DSH client.

The current indicator's tooltip text is in Chinese. These bilingual READMEs do not add an English UI translation.

## Compatibility

Developed on macOS with DeepSeek Harness `0.2.0-rc.2`. Requires that version's client plugin, Session projection, and slot APIs; other versions have not been verified. Provider detection uses an explicit ID allowlist and does not validate the actual endpoint behind a custom provider.

## Installation

### Install through the DSH Plugins page (bundle)

1. Open **Plugins** in the DSH sidebar and choose the installation entry.
2. Enter this GitHub repository address:
   ```text
   https://github.com/UbiStaff/dsh-plugin-peak-pricing-status
   ```
3. Install and enable the bundle, then restart the app and host when prompted.
4. Select an official DeepSeek provider and check the indicator and model switching.

The included [cordis.patch.yml](cordis.patch.yml) adds the plugin automatically; no manual profile patch is needed. GitHub must be reachable and your DSH version must support bundle installation. **Bundle metadata and packed contents have been checked; actual DSH installation, activation, removal, and indicator visibility have not been end-to-end verified.**

### Migrate from a manual installation

Back up your profile configuration and remove the old manual `peak-pricing-status` insert entry before installing the bundle. Do not load both copies: duplicate IDs or slot conflicts may occur. Preserve unrelated configuration.

### Manual installation (fallback)

Download the entire repository to `plugins/peak-pricing-status/` in your active profile, append the [manual patch example](examples/cordis.patch.example.yml) to your existing profile patch, then restart the app and host. A common macOS Desktop profile is `~/.dsh/profiles/desktop/`. No `npm install` is needed; do not replace existing configuration.

This package contains no account credentials, API keys, personal profile configuration, or DSH application code.

## Calendar and time rules

The implementation uses fixed Beijing time (UTC+8):

- Peak windows on working days: 09:00–12:00 and 14:00–18:00, with exclusive upper bounds.
- Listed holidays are off-peak all day.
- Listed makeup workdays are treated as working days, including Saturdays and Sundays.
- Other weekends are off-peak.

A [2026 calendar](peak-calendar.json) is included, with its source URL recorded in the file. When a new holiday schedule is published, add the year under `schedules` with its `holidays`, `makeupWorkdays`, and source information. Missing years fall back to ordinary Monday–Friday rules and **cannot correctly exclude that year's holidays**; the tooltip indicates this fallback.

Refresh the page after editing the calendar or client script. Restart the host after changing plugin loading configuration. Reference: [DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/). Policies can change; this plugin is not a live pricing service.

## Development and tests

Node.js 22 or later is recommended. Run from the repository root:

```sh
npm test
```

Tests cover:

- 21 time-window cases, day/holiday/makeup-day boundaries, and next-transition calculations.
- Agreement between the client and pure algorithm module at 190 instants.
- Slot registration, delayed services, stylesheet lifecycle, model projection injection, and provider visibility filtering.

| File | Purpose |
| --- | --- |
| [lib/client.js](lib/client.js) | Handwritten classic script for rendering and client-side calculation |
| [lib/index.js](lib/index.js) | Host-side calendar diagnostics |
| [lib/peak-window.js](lib/peak-window.js) | Standalone time-window logic |
| [peak-calendar.json](peak-calendar.json) | Annual holiday and makeup-workday data |

The client cannot directly import the local algorithm module, so two implementations are maintained. Run all tests after modifying either one. These tests are not full browser end-to-end tests; manually check placement, hover behavior, colors, and model switching before releasing.

## Uninstallation

For a bundle installation, disable or remove it from the Plugins page and restart when prompted. For a manual installation, remove its insert entry while preserving other configuration, then restart.
