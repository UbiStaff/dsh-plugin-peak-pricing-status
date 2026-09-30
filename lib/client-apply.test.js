/**
 * Prove the browser half actually reaches the slot registry.
 *
 * The bundle is a classic script whose only side effect is
 * `window.__ModuleLoader__.load({id, factory})`; this harness captures that
 * registration, hands the factory a `require` and a minimal Client context, and
 * asserts `apply` registers the indicator on `conversation.input.right` — and
 * registers nothing when the slot service is absent.
 *
 * Run: node lib/client-apply.test.js
 */
import assert from "node:assert/strict";

/** Captured bundle registration, filled by the stub loader below. */
let registration;

globalThis.window = {
  __ModuleLoader__: {
    load(value) {
      registration = value;
    },
  },
};

await import("./client.js");
assert.notEqual(registration, undefined, "the bundle registered with window.__ModuleLoader__");
assert.equal(registration.id, "dsh-plugin-peak-pricing-status", "bundle id");

/** The only module the bundle asks for; hooks are resolved at render time. */
const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
  useEffect: () => {},
  useLayoutEffect: () => {},
  useRef: (initial) => ({ current: initial }),
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
};
const module = registration.factory((specifier) => {
  assert.equal(specifier, "react", `the bundle required ${specifier}`);
  return fakeReact;
});

/** Record one minimal Client context's service reads and effects. */
function createContext(services, loggerShape = "plain") {
  const effects = [];
  const warnings = [];
  const infos = [];
  const sink = {
    info: (...args) => infos.push(args),
    warn: (...args) => warnings.push(args),
  };
  return {
    effects,
    warnings,
    infos,
    ctx: {
      get: (name) => services[name],
      effect: (callback, label) => {
        const disposer = callback();
        effects.push({ label, disposer });
        return () => disposer?.();
      },
      /* Cordis exposes a callable scoped-logger factory on the Host; a Client
         context may expose the plain logger instead. Both shapes are covered. */
      logger: loggerShape === "factory" ? () => sink : sink,
    },
  };
}

/* 1. With the slot service present, one registration lands on the left cell. */
const registered = [];
const withSlots = createContext({
  slots: { register: (options, component) => (registered.push({ options, component }), () => {}) },
  styles: { insert: () => () => {} },
});
module.apply(withSlots.ctx);
/* apply() starts the calendar fetch; let its rejection settle before judging logs. */
await new Promise((resolve) => setTimeout(resolve, 0));

assert.equal(registered.length, 1, "exactly one slot registration");
const [{ options, component }] = registered;
assert.equal(options.name, "conversation.input.right", "registered on the composer's left tool cell");
assert.equal(options.id, "peak-pricing-status", "cell id");
assert.equal(options.order, 10, "order puts the dot before the model selector");
assert.equal(typeof component, "function", "the registered value is a component");
/* With no DOM there is no bundle URL to derive, so exactly one warning is expected. */
assert.equal(withSlots.warnings.length, 1, "only the calendar fetch warns without a document");
assert.match(String(withSlots.warnings[0][0]), /calendar unavailable/, "the warning names the fetch failure");

/* The component must tolerate the props a slot actually passes. */
const noopSelector = (selector) => selector(undefined);
const element = component({ useSession: noopSelector, sessionId: "s" });
assert.equal(element, null, "unknown selection hides the indicator safely");
for (const provider of ["deepseek-account", "deepseek-official", "deepseek", "factory", "openrouter", undefined]) {
  const rendered = component({ modelProjection: {
    subscribe: () => () => {},
    getSnapshot: () => ({ next: { provider, model: "deepseek-flash" } }),
  } });
  if (["deepseek-account", "deepseek-official", "deepseek"].includes(provider)) {
    assert.equal(rendered?.props.className, "dsh-peak-dot-root", `${provider} shows the dot`);
  } else {
    assert.equal(rendered, null, `${provider} is hidden even with a DeepSeek model name`);
  }
}
assert.equal(component({ modelProjection: {
  subscribe: () => () => {},
  getSnapshot: () => ({ next: { provider: "factory", model: "gpt-6-astra" }, lastUsed: { provider: "deepseek-account", model: "deepseek-flash" } }),
} }), null, "next selection overrides the previous DeepSeek model");
assert.deepEqual(options.inject("s"), { modelProjection: undefined }, "missing sessions service degrades safely");
const projection = { subscribe: () => () => {}, getSnapshot: () => ({ next: { provider: "deepseek-account", model: "deepseek-flash" } }) };
let projectionName;
let injectedOptions;
const projectionContext = createContext({
  slots: { register: (value) => { injectedOptions = value; return () => {}; } },
  sessions: { binding: (id) => {
    assert.equal(id, "session-under-test");
    return { session: { projections: { faceOf: (name) => { projectionName = name; return projection; } } } };
  } },
});
module.apply(projectionContext.ctx);
const injected = injectedOptions.inject("session-under-test");
assert.equal(projectionName, "modelSelection", "uses the actual model projection");
assert.equal(injected.modelProjection, projection, "passes the projection face without copying it");
assert.equal(component(injected)?.type, "div", "projection-backed component renders");

/* Fresh sessions use the same resolved default as the model selector. */
let current = { provider: "deepseek-account", model: "deepseek-flash" };
const directory = { subscribe: () => () => {}, getSnapshot: () => ({ current }) };
let directoryOptions;
const directoryContext = createContext({
  slots: { register: (value) => { directoryOptions = value; return () => {}; } },
  modelDirectories: { directoryFor: (id) => {
    assert.equal(id, "new-session");
    return { store: directory };
  } },
});
module.apply(directoryContext.ctx);
const freshProps = directoryOptions.inject("new-session");
assert.equal(freshProps.modelDirectory, directory);
assert.equal(component(freshProps)?.type, "div", "new session with official default shows indicator without explicit selection");
current = { provider: "factory", model: "deepseek-flash" };
assert.equal(component(freshProps), null, "third-party effective selection hides indicator");
current = null;
assert.equal(component({ ...freshProps, modelProjection: projection }), null, "loading directory does not fall back to stale last-used model");

assert.deepEqual(module.inject, ["slots", "modelDirectories", "sessions"], "wait for model services before mounting");
let fallbackOptions;
const brokenDirectory = createContext({
  slots: { register: (value) => { fallbackOptions = value; return () => {}; } },
  modelDirectories: { directoryFor: () => { throw new Error("unavailable directory"); } },
  sessions: { binding: () => ({ session: { projections: { faceOf: () => projection } } }) },
});
module.apply(brokenDirectory.ctx);
assert.equal(fallbackOptions.inject("existing-session").modelProjection, projection, "directory errors do not suppress the projection fallback");
assert.equal(component(fallbackOptions.inject("existing-session"))?.type, "div");

/* 2. A missing styles service must not lose the registration. */
const withoutStyles = createContext({ slots: { register: () => () => {} } });
module.apply(withoutStyles.ctx);
assert.equal(
  withoutStyles.warnings.filter((entry) => /slot service/.test(String(entry[0]))).length,
  0,
  "a missing styles service is not fatal",
);

/* 3. A registry that is not there yet must not lose the registration: without a
      declared `inject` this plugin can be mounted before the slot service exists,
      and giving up at that moment is exactly how an empty composer cell with no
      trace in any log is produced. The wait polls, then registers. */
const late = [];
let slotsAvailable = false;
const lateContext = createContext({
  styles: { insert: () => () => {} },
});
lateContext.ctx.get = (name) => (name === "slots" && slotsAvailable ? { register: (options) => (late.push(options), () => {}) } : undefined);
module.apply(lateContext.ctx);
assert.equal(late.length, 0, "nothing registers while the registry is missing");
slotsAvailable = true;
await new Promise((resolve) => setTimeout(resolve, 400));
assert.equal(late.length, 1, "the wait registers once the registry appears");
assert.equal(late[0].name, "conversation.input.right", "and it lands on the same cell");
assert.equal(
  lateContext.warnings.filter((entry) => /slot service never appeared/.test(String(entry[0]))).length,
  0,
  "the wait does not report a timeout after succeeding",
);

/* 4. Effects are installed through ctx.effect, so plugin unload can unwind them. */
assert.ok(withSlots.effects.length >= 1, "the registration is installed as an effect");
assert.equal(typeof withSlots.effects[0].disposer, "function", "the effect returns its disposer");

/* 5. Both logger shapes must be survivable, because registration runs after them:
      a wrong shape once threw `info is not a function` and lost the whole plugin. */
for (const shape of ["plain", "factory", "absent"]) {
  const registeredAgain = [];
  const variant = createContext(
    { slots: { register: (options) => (registeredAgain.push(options), () => {}) }, styles: { insert: () => () => {} } },
    shape,
  );
  if (shape === "absent") delete variant.ctx.logger;
  module.apply(variant.ctx);
  assert.equal(registeredAgain.length, 1, `registration survives a ${shape} logger`);
}

/* 6. The Host half must survive the same shapes, and report when it can. */
const hostHalf = await import("./index.js");
for (const shape of ["plain", "factory", "throwing", "absent"]) {
  const calls = [];
  const ctx = {
    logger:
      shape === "absent"
        ? undefined
        : shape === "throwing"
          ? () => {
              throw new TypeError("logger.info is not a function");
            }
          : shape === "factory"
            ? () => ({ info: (...args) => calls.push(args), warn: (...args) => calls.push(args) })
            : { info: (...args) => calls.push(args), warn: (...args) => calls.push(args) },
  };
  /* The assertion is that neither a throwing nor an absent logger escapes apply(). */
  hostHalf.apply(ctx, { scheduleYear: 2026 });
  if (shape === "throwing" || shape === "absent") assert.equal(calls.length, 0, `a ${shape} logger reports nothing`);
  else assert.equal(calls.length, 1, `the host half reports once with a ${shape} logger`);
}

/* A registered empty span needs real CSS even when no styles service exists. */
const tags = [];
globalThis.document = {
  createElement: () => ({ dataset: {}, remove() { tags.splice(tags.indexOf(this), 1); } }),
  head: { appendChild: (tag) => tags.push(tag) },
  querySelector: () => null,
};
const domContext = createContext({ slots: { register: () => () => {} } });
module.apply(domContext.ctx);
assert.equal(tags.length, 1, "CSS is installed without an invented styles service");
assert.match(tags[0].textContent, /width:7px;height:7px/, "the otherwise empty dot has dimensions");
assert.match(tags[0].textContent, /dsh-peak-dot-idle/, "phase colors are installed");
for (const effect of domContext.effects) effect.disposer?.();
assert.equal(tags.length, 0, "unloading removes owned styles");
delete globalThis.document;

console.log("client apply: registration, props tolerance, style lifecycle, and degradation all pass");
