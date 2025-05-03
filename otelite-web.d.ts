export type SpanAttributeValue = string | number | boolean;
export type SpanAttributeMap = Record<string, SpanAttributeValue>;

export interface OtelCollectorConfig {
    /** Full URL to the collector endpoint (e.g., https://example.com/v1/traces) */
    url: string;
    /** Optional custom headers (e.g., Authorization, X-Tenant-ID) */
    headers?: Record<string, string>;
}

export interface OteliteConfig {
    /** One or more Otel collectors to send traces to */
    collectors: OtelCollectorConfig[];
  
    /** Logical name of the app or service (e.g., 'checkout-ui') */
    serviceName: string;
  
    /** Version of the service (e.g., '1.2.3' or git commit SHA) */
    serviceVersion: string;
  
    /** Runtime environment (e.g., 'production', 'staging') */
    deploymentEnvironment: string;
  
    /** Domains or hostnames to attach trace headers to */
    traceOrigins?: string[];
  
    /**
     * URLs that should be excluded from span creation.
     * Can be a string (matched via includes), RegExp, or custom function.
     */
    excludeUrls?: (string | RegExp | ((url: string) => boolean))[];
  
    /** Enable capturing resource timing spans */
    captureResourceSpans?: boolean;
  
    /** Enable capturing Core Web Vitals (LCP, CLS, FID, etc) */
    captureWebVitals?: boolean;
  
    /** Enable tracking client-side history API navigations */
    captureSoftNavigations?: boolean;

    /** Enable tracking client-side JS errors */
    captureJSErrors?: boolean,
  
    /** How often to flush spans in ms (default: 5000) */
    batchInterval?: number;
  
    /** Max number of spans to batch per flush (default: 20) */
    maxBatchSize?: number;
  
    /** Key-value tags to include on every span */
    globalAttributes?: SpanAttributeMap;
}

export function initOtelite(config: OtelTrackerConfig): void;

export function recordCustomSpan(
    name: string,
    attributes?: SpanAttributeMap,
    startTime?: number,
    endTime?: number,
    spanKind?: number
): void;

export function updateGlobalAttributes(
    attributes: SpanAttributeMap
): void;