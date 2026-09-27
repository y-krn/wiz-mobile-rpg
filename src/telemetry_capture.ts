export type TelemetryState = "uninitialized" | "loading" | "ready" | "disabled";

export type TelemetryProperties = Record<string, unknown>;

export interface TelemetryCaptureClient {
  capture(eventName: string, properties: TelemetryProperties): unknown;
}

interface QueuedTelemetryEvent {
  eventName: string;
  properties: TelemetryProperties;
}

const PRE_INIT_BUFFER_LIMIT = 64;

let client: TelemetryCaptureClient | null = null;
let state: TelemetryState = "uninitialized";
let pendingEvents: QueuedTelemetryEvent[] = [];

function removeUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.filter(item => item !== undefined).map(removeUndefined);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, removeUndefined(item)])
    );
  }
  return value;
}

function captureWithClient(eventName: string, properties: TelemetryProperties): void {
  if (!client) return;
  try {
    const result: unknown = client.capture(eventName, properties);
    if (result !== null && (typeof result === "object" || typeof result === "function")) {
      const catchMethod: unknown = Reflect.get(result, "catch");
      if (typeof catchMethod === "function") {
        Reflect.apply(catchMethod, result, [() => {}]);
      }
    }
  } catch {
    // Analytics must never affect gameplay.
  }
}

function flushPendingEvents(): void {
  const events = pendingEvents;
  pendingEvents = [];
  events.forEach(({ eventName, properties }) => captureWithClient(eventName, properties));
}

export function captureTelemetryEvent(
  schemaVersion: number,
  eventName: string,
  properties: TelemetryProperties
): void {
  const normalizedValue = removeUndefined({ schemaVersion, ...properties });
  if (normalizedValue === null || typeof normalizedValue !== "object" || Array.isArray(normalizedValue)) return;
  const normalizedProperties = Object.fromEntries<unknown>(Object.entries(normalizedValue));
  if (client) {
    captureWithClient(eventName, normalizedProperties);
    return;
  }
  if (state !== "loading") return;

  if (pendingEvents.length >= PRE_INIT_BUFFER_LIMIT) pendingEvents.shift();
  pendingEvents.push({ eventName, properties: normalizedProperties });
}

export function isTelemetryAvailable(): boolean {
  return state === "loading" || state === "ready";
}

export function setTelemetryState(nextState: TelemetryState): void {
  state = nextState;
}

export function attachTelemetryClient(nextClient: TelemetryCaptureClient): void {
  client = nextClient;
  state = "ready";
  flushPendingEvents();
}

export function disableTelemetry(): void {
  client = null;
  state = "disabled";
  pendingEvents = [];
}

export function setTelemetryClientForTests(nextClient: TelemetryCaptureClient | null): void {
  const queuedEvents = nextClient ? pendingEvents : [];
  pendingEvents = [];
  client = nextClient;
  state = nextClient ? "ready" : "disabled";
  queuedEvents.forEach(({ eventName, properties }) => captureWithClient(eventName, properties));
}

export function setTelemetryInitializationForTests(enabled: boolean): void {
  client = null;
  state = enabled ? "loading" : "disabled";
  pendingEvents = [];
}
