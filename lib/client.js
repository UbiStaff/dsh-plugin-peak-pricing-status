/**
 * Browser half of the peak-pricing indicator.
 *
 * Renders one small dot immediately left of the composer's model selector
 * (`conversation.input.model` is an exclusive seat, so the dot takes the
 * additive seat beside it instead of reaching inside it):
 *
 *   muted green  — the current instant bills at DeepSeek's idle-period price
 *   muted red    — the current instant bills at the peak-period price
 *
 * The phase arithmetic mirrors `peak-window.js` in this package; the browser
 * cannot import that module (this bundle is a self-contained classic script),
 * so it is transcribed here and covered by the same table of cases there.
 * The holiday table is fetched from `peak-calendar.json` beside this bundle and
 * falls back to weekday-only arithmetic when unreadable.
 */

window.__ModuleLoader__.load({
  id: "dsh-plugin-peak-pricing-status",
  factory: (require) => {
    /** Package id, matching the loader row's name. */
    const PLUGIN_ID = "dsh-plugin-peak-pricing-status";

    /** Last path segment of {@link PLUGIN_ID}, as it appears in the plugin route. */
    const PLUGIN_SLUG = PLUGIN_ID.slice(PLUGIN_ID.lastIndexOf("/") + 1);

    /** Beijing is a fixed UTC+8 offset, so no time-zone database is needed. */
    const BEIJING_OFFSET_MS = 8 * 60 * 60_000;
    const MINUTE_MS = 60_000;
    const DAY_MS = 24 * 60 * MINUTE_MS;

    /** Peak windows inside a Beijing day, in minutes from midnight. */
    const PEAK_WINDOWS = [
      { start: 9 * 60, end: 12 * 60 },
      { start: 14 * 60, end: 18 * 60 },
    ];

    const WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    const SOURCE_URL = "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/";

    /** 1970-01-01 was a Thursday, used to derive weekdays from Beijing day numbers. */
    const EPOCH_WEEKDAY = 4;

    const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

    /**
     * Shift an instant onto the Beijing wall clock; the UTC fields of the result
     * are then the Beijing fields.
     * @param timestamp - instant in epoch milliseconds.
     * @returns the shifted instant.
     */
    function toBeijing(timestamp) {
      return new Date(timestamp + BEIJING_OFFSET_MS);
    }

    /**
     * Whole days since 1970-01-01 in Beijing.
     * @param timestamp - instant in epoch milliseconds.
     * @returns the Beijing day number.
     */
    function dayNumberOf(timestamp) {
      return Math.floor((timestamp + BEIJING_OFFSET_MS) / DAY_MS);
    }

    /**
     * Minutes elapsed inside the Beijing day.
     * @param timestamp - instant in epoch milliseconds.
     * @returns minutes since Beijing midnight.
     */
    function minuteOfDay(timestamp) {
      const shifted = toBeijing(timestamp);
      return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
    }

    /**
     * Weekday of a Beijing day number.
     * @param dayNumber - Beijing day number.
     * @returns `0` for Sunday through `6` for Saturday.
     */
    function weekdayOf(dayNumber) {
      return (((dayNumber + EPOCH_WEEKDAY) % 7) + 7) % 7;
    }

    /**
     * Beijing calendar date of an instant.
     * @param timestamp - instant in epoch milliseconds.
     * @returns the `YYYY-MM-DD` key.
     */
    function dateKeyOf(timestamp) {
      return toBeijing(timestamp).toISOString().slice(0, 10);
    }

    /**
     * Render an instant as a Beijing `HH:MM` reading.
     * @param timestamp - instant in epoch milliseconds.
     * @returns the clock text.
     */
    function clockOf(timestamp) {
      const shifted = toBeijing(timestamp);
      return `${String(shifted.getUTCHours()).padStart(2, "0")}:${String(shifted.getUTCMinutes()).padStart(2, "0")}`;
    }

    /**
     * Render an instant as `MM-DD 周X` in Beijing time.
     * @param timestamp - instant in epoch milliseconds.
     * @returns the date label.
     */
    function dayLabelOf(timestamp) {
      const shifted = toBeijing(timestamp);
      const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
      const day = String(shifted.getUTCDate()).padStart(2, "0");
      return `${month}-${day} ${WEEKDAY_NAMES[weekdayOf(dayNumberOf(timestamp))]}`;
    }

    /**
     * Collect `YYYY-MM-DD` keys from either raw strings or annotated entries.
     * @param rows - calendar rows.
     * @returns the accepted keys.
     */
    function keysOf(rows) {
      const keys = [];
      if (!Array.isArray(rows)) return keys;
      for (const row of rows) {
        const value = typeof row === "string" ? row : row?.date;
        if (typeof value === "string" && DAY_PATTERN.test(value.trim())) keys.push(value.trim());
      }
      return keys;
    }

    /**
     * Normalize one year's schedule into lookup sets.
     * @param year - year entry from the calendar file.
     * @returns the holiday and make-up-workday sets.
     */
    function scheduleOf(year) {
      return {
        holidays: new Set(keysOf(year?.holidays)),
        makeupWorkdays: new Set(keysOf(year?.makeupWorkdays)),
      };
    }

    /** An empty schedule: weekends idle, every weekday peak. */
    const EMPTY_SCHEDULE = scheduleOf(undefined);

    /**
     * Resolve the schedule covering a Beijing day number.
     * @param model - the loaded calendar model.
     * @param dayNumber - Beijing day number.
     * @returns the covering schedule, or the empty schedule when the year is unregistered.
     */
    function scheduleFor(model, dayNumber) {
      const year = new Date(dayNumber * DAY_MS).getUTCFullYear();
      return model.schedules[String(year)] ?? EMPTY_SCHEDULE;
    }

    /**
     * Why a day is idle, for the tooltip copy.
     * @param dayNumber - Beijing day number.
     * @param schedule - the covering schedule.
     * @returns `holiday`, `weekend`, or `undefined` on an ordinary workday.
     */
    function idleReasonOf(dayNumber, schedule) {
      if (schedule.holidays.has(new Date(dayNumber * DAY_MS).toISOString().slice(0, 10))) return "holiday";
      const weekday = weekdayOf(dayNumber);
      if (weekday === 0 || weekday === 6) return "weekend";
      return undefined;
    }

    /**
     * Whether a Beijing day bills at peak rates inside its peak windows.
     * @param dayNumber - Beijing day number.
     * @param schedule - the covering schedule.
     * @returns `true` for a workday.
     */
    function isPeakDay(dayNumber, schedule) {
      if (schedule.makeupWorkdays.has(new Date(dayNumber * DAY_MS).toISOString().slice(0, 10))) return true;
      return idleReasonOf(dayNumber, schedule) === undefined;
    }

    /**
     * Classify one instant.
     * @param timestamp - instant in epoch milliseconds.
     * @param model - the loaded calendar model.
     * @returns `true` when the instant bills at peak rates.
     */
    function isPeak(timestamp, model) {
      const dayNumber = dayNumberOf(timestamp);
      if (!isPeakDay(dayNumber, scheduleFor(model, dayNumber))) return false;
      const minute = minuteOfDay(timestamp);
      return PEAK_WINDOWS.some((window) => minute >= window.start && minute < window.end);
    }

    /**
     * Find the next instant whose phase differs from the current one.
     * @param timestamp - instant in epoch milliseconds.
     * @param model - the loaded calendar model.
     * @param peak - the phase at `timestamp`.
     * @returns the transition instant.
     */
    function nextTransition(timestamp, model, peak) {
      const dayNumber = dayNumberOf(timestamp);
      const midnight = new Date(dayNumber * DAY_MS).getTime() - BEIJING_OFFSET_MS;
      const boundaries = [];
      /* Holidays run for days, so scan far enough ahead to leave any run. */
      for (let offset = 0; offset <= 16; offset += 1) {
        for (const window of PEAK_WINDOWS) {
          boundaries.push(midnight + (offset * 24 * 60 + window.start) * MINUTE_MS);
          boundaries.push(midnight + (offset * 24 * 60 + window.end) * MINUTE_MS);
        }
      }
      boundaries.sort((left, right) => left - right);
      for (const boundary of boundaries) {
        if (boundary > timestamp && isPeak(boundary, model) !== peak) return boundary;
      }
      return timestamp + 24 * 60 * MINUTE_MS;
    }

    /**
     * Render a remaining duration as Chinese copy.
     * @param durationMs - remaining milliseconds.
     * @returns copy such as `2小时15分钟后`.
     */
    function countdownText(durationMs) {
      const totalMinutes = Math.max(0, Math.ceil(durationMs / MINUTE_MS));
      const days = Math.floor(totalMinutes / (24 * 60));
      const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
      const minutes = totalMinutes % 60;
      const parts = [];
      if (days > 0) parts.push(`${days}天`);
      if (hours > 0) parts.push(`${hours}小时`);
      if (minutes > 0 || parts.length === 0) parts.push(`${minutes}分钟`);
      return `${parts.join("")}后`;
    }

    /**
     * Resolve everything the indicator renders.
     * @param timestamp - instant in epoch milliseconds.
     * @param model - the loaded calendar model.
     * @returns the phase, colors, and tooltip lines.
     */
    function resolve(timestamp, model) {
      const dayNumber = dayNumberOf(timestamp);
      const peak = isPeak(timestamp, model);
      const transition = nextTransition(timestamp, model, peak);
      const reason = idleReasonOf(dayNumber, scheduleFor(model, dayNumber));
      const reasonText =
        reason === "holiday" ? "中国法定节假日" : reason === "weekend" ? "周末" : "工作日";
      return {
        peak,
        transition,
        countdown: countdownText(transition - timestamp),
        title: peak ? "高峰时段" : "空闲时段",
        detail: peak
          ? "DeepSeek 官方 API 高峰时段：按标准价格计费。"
          : "DeepSeek 官方 API 空闲时段：价格为高峰时段的一半（周末与法定节假日全天）。",
        lines: [
          `北京时间 ${dayLabelOf(timestamp)} ${clockOf(timestamp)}`,
          `今日按「${reasonText}」判定`,
          `高峰窗口：周一至周五 09:00-12:00、14:00-18:00`,
          `${clockOf(transition)} 切换为${isPeak(transition, model) ? "高峰" : "空闲"}时段（${countdownText(transition - timestamp)}）`,
        ],
      };
    }

    /** Muted phase colors; the theme tokens keep light and dark in step. */
    const CSS = `
.dsh-peak-dot-root{position:relative;display:flex;align-items:center;flex:none}
.dsh-peak-dot{box-sizing:border-box;width:7px;height:7px;border-radius:50%;cursor:help;flex:none}
.dsh-peak-dot-idle{background:var(--dsw-alias-state-success-primary,#22c55e);opacity:.55}
.dsh-peak-dot-peak{background:var(--dsw-alias-state-error-primary,#ec1313);opacity:.6}
.dsh-peak-dot-root:hover .dsh-peak-dot,.dsh-peak-dot-root:focus-within .dsh-peak-dot{opacity:.85}
.dsh-peak-dot:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4d6bfe));outline-offset:2px}
.dsh-peak-tip{position:fixed;z-index:2147483000;box-sizing:border-box;width:max-content;max-width:min(320px,calc(100vw - 24px));padding:8px 10px;border-radius:var(--dsw-radius-md,8px);border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.25));background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary,#111);box-shadow:var(--dsw-elevation-prominent,0 6px 24px rgba(0,0,0,.18));font-size:12px;line-height:18px;display:flex;flex-direction:column;gap:2px;pointer-events:none}
.dsh-peak-tip-title{display:flex;align-items:center;gap:6px;font-weight:600}
.dsh-peak-tip-detail{color:var(--dsw-alias-label-secondary,#555)}
.dsh-peak-tip-line{color:var(--dsw-alias-label-tertiary,#888);font-variant-numeric:tabular-nums}
`;

    /**
     * Derive the sibling-resource URL of this bundle.
     *
     * The bundle URL is a combo URL (`/plugins/??<entry id>/client.js&rev=…`); in
     * a batch the path is the shared `/plugins/` and the query holds several
     * comma-separated ids, so the shape is handled explicitly instead of through
     * URL path rules. The rev is kept because the server matches on it.
     * @param scriptSrc - this bundle's own script URL, when readable.
     * @param fileName - sibling resource file name.
     * @param origin - document origin, used to resolve a relative script URL.
     * @returns the absolute sibling URL.
     */
    function siblingUrl(scriptSrc, fileName, origin) {
      try {
        const url = new URL(scriptSrc, origin);
        if (url.search.startsWith("??")) {
          const search = url.search.slice(2);
          const revision = /(?:^|&)rev=([^&#]*)/.exec(search)?.[1];
          const tail = revision === undefined ? "" : `?rev=${revision}`;
          const at = search.indexOf(`${PLUGIN_ID}/`);
          if (at >= 0) return `/plugins/${search.slice(0, at + PLUGIN_ID.length + 1)}${fileName}${tail}`;
        }
        const onPath = url.pathname.lastIndexOf(`/${PLUGIN_SLUG}/`);
        if (onPath >= 0) return `${url.pathname.slice(0, onPath + PLUGIN_SLUG.length + 2)}${fileName}${url.search}`;
      } catch (error) {
        /* Falls through to the conventional path below. */
      }
      /* A batch URL's query describes other bundles' resources, so it is never
         forwarded to this package's own files. */
      return `/plugins/${PLUGIN_ID}/${fileName}`;
    }

    /**
     * Bound the plugin's own logging behind plain functions.
     *
     * The Host context exposes `ctx.logger` as a callable scoped-logger factory
     * (`ctx.logger(name).info(...)`), while a Client context may expose the plain
     * logger (`ctx.logger.info(...)`). Reaching the wrong shape throws
     * `…info is not a function`, which would abort registration itself — so the
     * shape is detected here and a logging failure can never break the feature.
     * @param ctx - the plugin context.
     * @returns safe `info`/`warn` sinks.
     */
    function logSinks(ctx) {
      const emit = (level, args) => {
        try {
          const logger = ctx?.logger;
          if (typeof logger === "function") {
            const scoped = logger(PLUGIN_ID);
            if (typeof scoped?.[level] === "function") scoped[level](...args);
            return;
          }
          if (typeof logger?.[level] === "function") logger[level](...args);
        } catch (error) {
          /* Logging must never be the reason a composer control fails to mount. */
        }
      };
      return {
        info: (...args) => emit("info", args),
        warn: (...args) => emit("warn", args),
      };
    }

    /**
     * Read one service from the plugin context without letting a context shape
     * difference throw. A dynamic Client context exposes more verbs than a static
     * one, so the read is probed rather than assumed.
     * @param ctx - the plugin context.
     * @param name - service name.
     * @returns the service, or `undefined` when the context cannot supply it.
     */
    function safeGet(ctx, name) {
      try {
        return typeof ctx?.get === "function" ? ctx.get(name) : undefined;
      } catch (error) {
        return undefined;
      }
    }

    /**
     * Plugin body: register the indicator into the composer's tool row.
     *
     * Registration is the one step that must not fail: a throw anywhere earlier in
     * this closure (an unresolvable `require`, a missing service, an unexpected
     * context shape) unmounts the whole plugin and leaves no trace in the page,
     * which is exactly how a "present in the boot manifest but absent from the
     * slot" symptom is produced. So the React runtime and the services are read
     * defensively, and every failure below degrades into a visible warning.
     * @param ctx - the Client plugin context.
     */
    function apply(ctx) {
      const log = logSinks(ctx);
      /* This plugin ships inside the user's own profile, so a throw here does not
         merely lose the indicator: the client kernel audits every boot entry and
         turns an inactive one into a failed application start. Nothing below may
         escape, whatever the context looks like. */
      try {
        let React;
        try {
          React = require("react");
        } catch (error) {
          /* Without React the component cannot render, so there is nothing to
             register; still, say so instead of vanishing. */
          log.warn("cannot load React from the client module table: %o", error);
          return;
        }

        /* Mounting order is not guaranteed: a plugin with no declared `inject` can be
           mounted before the slot registry exists, and giving up there leaves an
           empty composer cell with nothing in any log. Wait for it instead. */
        const ready = waitForSlots(ctx, log);
        if (ready === undefined) return;
        ready((slots) => {
          try {
            registerIndicator(ctx, log, React, slots);
          } catch (error) {
            log.warn("could not install the composer indicator: %o", error);
          }
        });
      } catch (error) {
        log.warn("apply failed; the composer indicator stays unmounted: %o", error);
      }
    }

    /**
     * Wait until the slot registry can be reached.
     *
     * The registry is reached through the documented dynamic-context read
     * (`ctx.get("slots")`), because a package mounted with no declared `inject`
     * may be mounted before any service exists; the wait is bounded so a truly
     * missing service still reports instead of hanging forever.
     * @param ctx - the Client plugin context.
     * @param log - safe log sinks.
     * @returns a callback that receives the registry once available, or `undefined`
     *   when the context exposes no way to schedule the wait.
     */
    function waitForSlots(ctx, log) {
      const registry = () => {
        const slots = safeGet(ctx, "slots");
        return slots?.register === undefined ? undefined : slots;
      };
      const immediate = registry();
      if (immediate !== undefined) return (use) => use(immediate);
      return (use) => {
        /* Poll until the registry appears: services are published as their own
           plugins mount, and this plugin declares no ordering. The global timer is
           used deliberately — `ctx.interval` may be gated on a declared timer
           service, and a throw from the wait must never reach the boot audit. */
        if (typeof setInterval !== "function") {
          log.warn("cannot schedule a slot-registry wait: no interval helper is available");
          return;
        }
        let finished = false;
        let attempts = 0;
        const handle = setInterval(tick, 250);
        const finish = () => {
          if (finished) return;
          finished = true;
          clearInterval(handle);
        };
        try {
          ctx?.effect?.(() => finish, "peak-pricing-status: slot-registry wait");
        } catch (error) {
          log.warn("could not tie the slot-registry wait to the plugin lifetime: %o", error);
        }

        /** One poll: register as soon as the registry answers, give up after ~10s. */
        function tick() {
          if (finished) return;
          attempts += 1;
          const slots = registry();
          if (slots !== undefined) {
            finish();
            use(slots);
            return;
          }
          if (attempts >= 40) {
            finish();
            log.warn("the slot service never appeared; the composer indicator stays unmounted");
          }
        }
      };
    }

    /**
     * Install the composer indicator once the slot registry is reachable.
     * @param ctx - the Client plugin context.
     * @param log - safe log sinks.
     * @param React - the React runtime from the client module table.
     * @param slots - the live slot registry.
     */
    function registerIndicator(ctx, log, React, slots) {
      try {
        ctx.effect(() => {
          if (typeof document === "undefined") return () => {};
          const tag = document.createElement("style");
          tag.dataset.plugin = PLUGIN_ID;
          tag.textContent = CSS;
          document.head.appendChild(tag);
          return () => tag.remove();
        }, "peak-pricing-status: styles");
      } catch (error) {
        log.warn("style installation failed, continuing without custom CSS: %o", error);
      }

      /* Readable only while this bundle's own script executes, so capture it here
         rather than inside the component, which renders much later. */
      const scriptSrc = typeof document === "undefined" ? undefined : document.currentScript?.src;

      /** Calendar state: fall back to weekday-only arithmetic until the file arrives. */
      const calendar = {
        model: { schedules: {} },
        listeners: new Set(),
      };

      /**
       * Resolve the calendar URL for this session.
       * @returns the absolute calendar URL.
       */
      function calendarUrl() {
        const script = scriptSrc ?? document.querySelector(`script[src*="${PLUGIN_ID}"]`)?.src;
        return siblingUrl(script, "peak-calendar.json", location.href);
      }

      /** Load the maintained holiday table once, then notify the mounted indicators. */
      async function loadCalendar() {
        try {
          const response = await fetch(calendarUrl(), { cache: "no-cache" });
          const raw = await response.json();
          const schedules = {};
          for (const [year, entry] of Object.entries(raw?.schedules ?? {})) schedules[year] = scheduleOf(entry);
          const years = Object.keys(schedules).sort();
          if (years.length === 0) {
            /* Silent fallbacks are invisible: say which years are on file. */
            log.warn("peak-calendar.json carries no schedules; using weekdays only");
          }
          calendar.model = {
            schedules,
            source: typeof raw?.source === "string" ? raw.source : undefined,
            pendingYears: Array.isArray(raw?.pendingYears) ? raw.pendingYears : [],
          };
        } catch (error) {
          log.warn("calendar unavailable, using weekdays only: %o", error);
        }
        for (const listener of [...calendar.listeners]) {
          try {
            listener();
          } catch (error) {
            log.warn("calendar listener failed: %o", error);
          }
        }
      }

      /** Subscribe one mounted indicator to calendar arrivals. */
      function useCalendar() {
        const [model, setModel] = React.useState(calendar.model);
        React.useEffect(() => {
          const listener = () => setModel(calendar.model);
          calendar.listeners.add(listener);
          listener();
          return () => calendar.listeners.delete(listener);
        }, []);
        return model;
      }

      /** Re-render on an interval so a phase change needs no reload. */
      function useNow(intervalMs) {
        const [now, setNow] = React.useState(() => Date.now());
        React.useEffect(() => {
          const timer = setInterval(() => setNow(Date.now()), intervalMs);
          return () => clearInterval(timer);
        }, [intervalMs]);
        return now;
      }

      /** Position the tooltip above the dot, clamped to the viewport. */
      function useTooltipPosition(open) {
        const anchorRef = React.useRef(null);
        const [position, setPosition] = React.useState(null);
        React.useLayoutEffect(() => {
          if (!open) {
            setPosition(null);
            return undefined;
          }
          const place = () => {
            const anchor = anchorRef.current;
            if (anchor === null) return;
            const rect = anchor.getBoundingClientRect();
            const width = 300;
            const left = Math.min(Math.max(12, rect.left + rect.width / 2 - width / 2), Math.max(12, window.innerWidth - width - 12));
            setPosition({ left, bottom: Math.max(12, window.innerHeight - rect.top + 8) });
          };
          place();
          window.addEventListener("resize", place);
          window.addEventListener("scroll", place, true);
          return () => {
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
          };
        }, [open]);
        return { anchorRef, position };
      }

      /**
       * The indicator itself: one dot, a tooltip on hover or focus.
       *
       * Only official DeepSeek provider selections show the indicator. Identity
       * comes from the real modelSelection projection, not the Session snapshot.
       * @param props - the standard Session seat shared by composer tool slots.
       * @returns the dot, plus its tooltip while open.
       */
      const emptySubscribe = () => () => {};
      const emptySnapshot = () => undefined;
      function PeakPricingDot({ modelDirectory, modelProjection }) {
        const selectionStore = modelDirectory ?? modelProjection;
        const selectionState = React.useSyncExternalStore(
          selectionStore ? (listener) => selectionStore.subscribe(listener) : emptySubscribe,
          selectionStore ? () => selectionStore.getSnapshot() : emptySnapshot,
          emptySnapshot,
        );
        // The selector's directory resolves an unset session selection to the
        // catalog default. A raw projection alone misses fresh blank sessions.
        const selection = modelDirectory ? selectionState?.current : selectionState?.next ?? selectionState?.lastUsed;
        const model = useCalendar();
        const now = useNow(30_000);
        const [hovered, setHovered] = React.useState(false);
        const [focused, setFocused] = React.useState(false);
        const open = hovered || focused;
        const { anchorRef, position } = useTooltipPosition(open);
        const state = resolve(now, model);
        const provider = selection?.provider;
        const modelId = selection?.model;
        /* Keep every hook above the visibility gate so live model switching is safe.
           Model names alone cannot distinguish official from third-party routes. */
        if (!["deepseek-account", "deepseek-official", "deepseek"].includes(provider)) return null;
        const selectionText =
          typeof provider === "string" && typeof modelId === "string" ? `当前模型 ${provider}/${modelId}` : undefined;
        return React.createElement(
          "div",
          {
            ref: anchorRef,
            className: "dsh-peak-dot-root",
            onMouseEnter: () => setHovered(true),
            onMouseLeave: () => setHovered(false),
          },
          React.createElement("span", {
            className: `dsh-peak-dot ${state.peak ? "dsh-peak-dot-peak" : "dsh-peak-dot-idle"}`,
            tabIndex: 0,
            role: "img",
            "aria-label": `${state.title}（北京时间；${state.lines.join("，")}）`,
            onFocus: () => setFocused(true),
            onBlur: () => setFocused(false),
          }),
          open && position !== null
            ? React.createElement(
                "div",
                { className: "dsh-peak-tip", style: { left: `${position.left}px`, bottom: `${position.bottom}px` }, role: "tooltip" },
                React.createElement(
                  "div",
                  { className: "dsh-peak-tip-title" },
                  React.createElement("span", {
                    className: `dsh-peak-dot ${state.peak ? "dsh-peak-dot-peak" : "dsh-peak-dot-idle"}`,
                  }),
                  React.createElement("span", null, state.title),
                ),
                React.createElement("div", { className: "dsh-peak-tip-detail" }, state.detail),
                ...state.lines.map((line, index) =>
                  React.createElement("div", { key: index, className: "dsh-peak-tip-line" }, line),
                ),
                selectionText === undefined
                  ? null
                  : React.createElement("div", { className: "dsh-peak-tip-line" }, selectionText),
              )
            : null,
        );
      }

      try {
        ctx.effect(
          () =>
            slots.register(
              {
                 name: "conversation.input.right",
                 id: "peak-pricing-status",
                 order: 10,
                 inject: (sessionId) => {
                   try {
                     const directories = safeGet(ctx, "modelDirectories");
                     if (directories) return { modelDirectory: directories.directoryFor(sessionId).store };
                     const sessions = safeGet(ctx, "sessions");
                     return {
                       modelProjection: sessions?.binding(sessionId)?.session.projections.faceOf("modelSelection"),
                     };
                   } catch (error) {
                     log.warn("model projection unavailable: %o", error);
                     return {};
                   }
                 },
               },
              PeakPricingDot,
            ),
          "peak-pricing-status: composer indicator",
        );
      } catch (error) {
        /* Registration is the whole point of this plugin: report the failure loudly
           instead of leaving an empty composer cell and no explanation. */
        log.warn("slot registration failed: %o", error);
        throw error;
      }

      try {
        loadCalendar().catch((error) => log.warn("calendar load rejected: %o", error));
      } catch (error) {
        log.warn("calendar load could not start: %o", error);
      }
      log.info("composer indicator registered on conversation.input.right");
    }

    return {
      apply,
      name: PLUGIN_ID,
      sourceUrl: SOURCE_URL,
      /* Exposed for `lib/client.test.js`, which compares this transcription
         against `lib/peak-window.js` on the same table of instants. */
      internals: { scheduleOf, isPeak, resolve, countdownText, siblingUrl },
    };
  },
});

/* served-revision bump 022442 */

/* served-revision bump 022726 */

/* served-revision bump 023341 */
