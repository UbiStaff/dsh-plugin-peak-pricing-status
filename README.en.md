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

1. Download or clone this repository and place the entire directory at `plugins/peak-pricing-status/` inside your active DSH profile. A common macOS Desktop profile location is:
   ```text
   ~/.dsh/profiles/desktop/plugins/peak-pricing-status/
   ```
2. **Back up** the profile's `cordis.patch.yml`. Append the following entry to its existing YAML list without replacing other configuration or duplicating the plugin ID:
   ```yaml
   - insert:
       - id: peak-pricing-status
         name: ./plugins/peak-pricing-status/lib/index.js
   ```
   See [examples/cordis.patch.example.yml](examples/cordis.patch.example.yml). New plugins must use `insert`; a top-level `- id:` entry only attempts to override an existing plugin.
3. Choose **Restart App and Host** in DSH.
4. Select an official DeepSeek provider and check for the dot to the left of the model selector. It should disappear when you switch to another provider.

No `npm install` is required. This package contains no account credentials, API keys, personal profile configuration, or DSH application code.

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

Remove this plugin's `insert` entry from your profile patch while preserving other entries, then restart the app and host. You may then delete the plugin directory.
