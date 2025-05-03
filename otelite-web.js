const OteliteName = 'Otelite';
const OteliteVersion = '0.5.0';
const OteliteLang = 'JavaScript';

let spanBatch = [];
let isSending = false;

let config = {
  collectors: [],
  serviceName: 'My Web App',
  serviceVersion: '0.0.1',
  deploymentEnv: 'dev',
  traceOrigins: [],
  excludeUrls: [],
  captureResourceSpans: false,
  captureWebVitals: false,
  captureSoftNavigations: false,
  captureJSErrors: false,
  batchInterval: 5000,
  maxBatchSize: 20,
  globalAttributes: {}
};

function shouldAttachTraceHeaders(url) {
  try {
    const parsedUrl = new URL(url, window.location.origin);
    return config.traceOrigins.some(domain => parsedUrl.hostname.endsWith(domain));
  } catch (e) {
    return false;
  }
}

function isUrlExcluded(url) {
  if (!config.excludeUrls || config.excludeUrls.length === 0) {
    return false;
  }

  return config.excludeUrls.some(rule => {
    if (typeof rule === 'string') {
      return url.includes(rule);
    }
    if (rule instanceof RegExp) {
      return rule.test(url);
    }
    if (typeof rule === 'function') {
      return rule(url);
    }
    return false;
  });
}

function getBrowser() {
  const ua = navigator.userAgent;
  const data = { name: 'Unknown', version: '0', platform: navigator.platform };

  const safari = ua.match(/Version\/(\d+\.\d+).*Safari/);
  if (safari && !ua.match(/Chrome|CriOS|Edg/)) {
    data.name = 'Safari';
    data.version = safari[1];
    data.platform = /iPhone|iPad|iPod/i.test(ua) ? 'iOS' : 'macOS';
    return data;
  }

  const edge = ua.match(/EdgA?\/(\d+\.\d+\.\d+\.\d+)/);
  if (edge) {
    data.name = 'Microsoft Edge';
    data.version = edge[1];
    return data;
  }

  const chrome = ua.match(/(?:Chrome|CriOS)\/(\d+\.\d+\.\d+\.\d+)/);
  if (chrome) {
    data.name = /CriOS/.test(ua) ? 'Chrome iOS' : 'Chrome';
    data.version = chrome[1];
    return data;
  }

  const firefox = ua.match(/Firefox\/(\d+\.\d+)/);
  if (firefox) {
    data.name = 'Firefox';
    data.version = firefox[1];
    return data;
  }

  return data;
}

function applyGlobalAttributes(attributes = []) {
  const tags = Object.entries(config.globalAttributes || {}).map(([key, value]) => ({
    key,
    value: { stringValue: String(value) }
  }));
  return [...attributes, ...tags];
}

function toNano(ms) {
  return String(BigInt(Math.floor(ms)) * 1000000n);
}

function generateId(bytes) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function parseAndNormalizeUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return {
      normalized: `${parsed.origin}${parsed.pathname}`,
      query: parsed.search || ''
    };
  } catch (e) {
    return { normalized: rawUrl, query: '' };
  }
}

function scheduleFlush() {
  if (!isSending && spanBatch.length > 0) {
    setTimeout(flushBatch, config.batchInterval);
  }
}

function flushBatch() {
  if (spanBatch.length === 0 || isSending) return;

  isSending = true;
  const spans = spanBatch.splice(0, config.maxBatchSize);

  const browser = getBrowser();

  const payload = {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: config.serviceName } },
            { key: 'service.version', value: { stringValue: config.serviceVersion } },
            { key: 'deployment.environment', value: { stringValue: config.deploymentEnv } },
            { key: 'telemetry.sdk.name', value: { stringValue: OteliteName } },
            { key: 'telemetry.sdk.language', value: { stringValue: OteliteLang } },
            { key: 'telemetry.sdk.version', value: { stringValue: OteliteVersion } },
            { key: 'browser.name', value: { stringValue: `${browser.name}` } },
            { key: 'browser.version', value: { stringValue: `${browser.version}` } },
            { key: 'browser.platform', value: { stringValue: `${browser.platform}` } }
          ]
        },
        scopeSpans: [{ spans }]
      }
    ]
  };

  const bodyJson = JSON.stringify(payload);
  
  const promises = config.collectors.map(collector => {
    return fetch(`${collector.url}/v1/traces/`, {
        method: 'POST',
        body: bodyJson,
        headers: {
          'Content-Type': 'application/json',
          ...(collector.headers || {})
        },
        keepalive: true
      }).catch(e => console.error('Failed to send spans to collector', collector.url, e));
  });

  Promise.allSettled(promises).then(() => {
    isSending = false;
    scheduleFlush();
  });
}

function recordHTTPSpan({ url, method, status, startTime, duration, error, extraAttributes = [] }) {
  const isError = error || status >= 400;

  const span = {
    traceId: generateId(16),
    spanId: generateId(8),
    name: `HTTP ${method} ${url}`,
    kind: 3,
    startTimeUnixNano: toNano(startTime),
    endTimeUnixNano: toNano(startTime + duration),
    attributes: applyGlobalAttributes([
      { key: 'http.method', value: { stringValue: method } },
      { key: 'http.url', value: { stringValue: url } },
      { key: 'http.status_code', value: { intValue: status || 0 } },
      { key: 'duration_ms', value: { doubleValue: duration } },
      ...(extraAttributes || [])
    ]),
    status: {
      code: isError ? 2 : 1,
      message: isError ? (error?.message || `HTTP ${status}`) : ''
    }
  };

  if (isError && error?.message) {
    span.attributes.push({
      key: 'error.message',
      value: { stringValue: error.message }
    });
  }

  spanBatch.push(span);
  if (spanBatch.length >= config.maxBatchSize) {
    flushBatch();
  } else {
    scheduleFlush();
  }
}

function buildTraceContext() {
  const traceId = generateId(16);
  const spanId = generateId(8);
  const traceFlags = '01';
  const traceparent = `00-${traceId}-${spanId}-${traceFlags}`;
  const tracestate = 'frontend=1';

  return { traceId, spanId, traceparent, tracestate };
}

function patchFetch() {
  const originalFetch = window.fetch;
  window.fetch = async function (input, init = {}) {
    const method = (init.method || 'GET').toUpperCase();
    const rawUrl = typeof input === 'string' ? input : input.url;
    const { normalized: url, query } = parseAndNormalizeUrl(rawUrl);

    if (url.includes(`/v1/traces`) || isUrlExcluded(url)) {
      return originalFetch(input, init);
    }

    const startTime = performance.now();
    const { traceId, spanId, traceparent, tracestate } = buildTraceContext();

    init.headers = new Headers(init.headers || {});

    if (shouldAttachTraceHeaders(url)) {
      init.headers.set('traceparent', traceparent);
      init.headers.set('tracestate', tracestate);
    }

    try {
      const response = await originalFetch(input, init);
      const duration = performance.now() - startTime;
      recordHTTPSpan({ traceId, spanId, url, method, status: response.status, startTime: performance.timeOrigin + startTime, duration, extraAttributes: query ? [{ key: 'http.query', value: { stringValue: query } }] : [] });
      return response;
    } catch (error) {
      const duration = performance.now() - startTime;
      recordHTTPSpan({ traceId, spanId, url, method, status: 0, startTime: performance.timeOrigin + startTime, duration, error, extraAttributes: query ? [{ key: 'http.query', value: { stringValue: query } }] : [] });
      throw error;
    }
  };
}

function patchXHR() {
  const OriginalXHR = window.XMLHttpRequest;

  function PatchedXHR() {
    const xhr = new OriginalXHR();
    let startTime = 0;
    let url = '';
    let urlQuery = '';
    let method = 'GET';
    let hasErrored = false;
    let traceId = '';
    let spanId = '';
    let shouldAttach = false;
    let traceparent = '';
    let tracestate = '';

    const open = xhr.open;
    xhr.open = function (m, u, ...args) {
      method = m.toUpperCase();
      const rawUrl = u;
      const parsed = parseAndNormalizeUrl(rawUrl);
      url = parsed.normalized;
      urlQuery = parsed.query;
      shouldAttach = shouldAttachTraceHeaders(u);
      return open.call(this, m, u, ...args);
    };

    const send = xhr.send;
    xhr.send = function (...args) {

      if (url.includes(`/v1/traces`) || isUrlExcluded(url)) {
        return send.apply(this, args);
      }

      const traceCtx = buildTraceContext();
      traceId = traceCtx.traceId;
      spanId = traceCtx.spanId;
      traceparent = traceCtx.traceparent;
      tracestate = traceCtx.tracestate;

      startTime = performance.now();
      hasErrored = false;

      xhr.addEventListener('readystatechange', () => {
        if (xhr.readyState === 1 && shouldAttach) {
          try {
            xhr.setRequestHeader('traceparent', traceparent);
            xhr.setRequestHeader('tracestate', tracestate);
          } catch (e) {}
        }
      });

      const finalize = () => {
        const duration = performance.now() - startTime;
        const start = performance.timeOrigin + startTime;
        const status = hasErrored ? 0 : xhr.status;

        recordHTTPSpan({
          traceId,
          spanId,
          url,
          method,
          status,
          startTime: start,
          duration,
          error: hasErrored ? new Error('XHR network error or abort') : undefined,
          extraAttributes: urlQuery ? [{ key: 'http.query', value: { stringValue: urlQuery } }] : []
        });
      };

      xhr.addEventListener('error', () => { hasErrored = true; });
      xhr.addEventListener('abort', () => { hasErrored = true; });
      xhr.addEventListener('loadend', finalize);

      return send.apply(this, args);
    };

    return xhr;
  }

  window.XMLHttpRequest = PatchedXHR;
}

function captureInitialResourceSpans() {
  const resources = performance.getEntriesByType('resource');

  if (!resources.length) return;

  const { traceId, spanId: parentSpanId } = buildTraceContext();
  const pageStart = performance.timeOrigin;
  const pageEnd = pageStart + performance.now();

  let totalEncodedBytes = 0;

  for (const resource of resources) {
    totalEncodedBytes += resource.encodedBodySize || 0;

    const { spanId } = buildTraceContext();

    if (resource.initiatorType === 'fetch' || resource.initiatorType === 'xmlhttprequest') continue;

    const url = resource.name;
    const startTime = performance.timeOrigin + resource.startTime;
    const duration = resource.duration;
    const encodedBytes = resource.encodedBodySize || 0;
    const decodedBytes = resource.decodedBodySize || 0;
    const transferSize = resource.transferSize || 0;

    spanBatch.push({
      traceId,
      spanId,
      parentSpanId,
      name: `Resource: ${resource.initiatorType}`,
      kind: 3,
      startTimeUnixNano: toNano(startTime),
      endTimeUnixNano: toNano(startTime + duration),
      attributes: [
        { key: 'http.url', value: { stringValue: url } },
        { key: 'resource.initiator_type', value: { stringValue: resource.initiatorType } },
        { key: 'duration_ms', value: { doubleValue: duration } },
        { key: 'resource.encoded_body_size', value: { intValue: encodedBytes } },
        { key: 'resource.decoded_body_size', value: { intValue: decodedBytes } },
        { key: 'resource.transfer_size', value: { intValue: transferSize } }
      ],
      status: { code: 1, message: '' }
    });
  }

  spanBatch.push({
    traceId,
    spanId: parentSpanId,
    name: 'Initial Resources',
    kind: 3,
    startTimeUnixNano: toNano(pageStart),
    endTimeUnixNano: toNano(pageEnd),
    attributes: [
      { key: 'group.type', value: { stringValue: 'resources' } },
      { key: 'page.url', value: { stringValue: window.location.href } },
      { key: 'resource.total_encoded_bytes', value: { intValue: totalEncodedBytes } }
    ],
    status: { code: 1, message: '' }
  });

  flushBatch();
}

function captureWebVitals() {
  if (!PerformanceObserver) return;

  const vitals = {};

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === 'largest-contentful-paint') {
        vitals.lcp = entry.startTime;
      } else if (entry.entryType === 'first-input') {
        vitals.fid = entry.processingStart - entry.startTime;
      } else if (entry.entryType === 'layout-shift' && !entry.hadRecentInput) {
        vitals.cls = (vitals.cls || 0) + entry.value;
      }
    }
  });

  observer.observe({ type: 'largest-contentful-paint', buffered: true });
  observer.observe({ type: 'first-input', buffered: true });
  observer.observe({ type: 'layout-shift', buffered: true });

  window.addEventListener('beforeunload', () => {
    if (Object.keys(vitals).length === 0) return;

    const { traceId, spanId } = buildTraceContext();
    const start = performance.timeOrigin;
    const end = start + performance.now();

    const vitalsSpan = {
      traceId,
      spanId,
      name: 'Web Vitals',
      kind: 1,
      startTimeUnixNano: toNano(start),
      endTimeUnixNano: toNano(end),
      attributes: [],
      status: { code: 1, message: '' }
    };

    if (vitals.lcp != null) {
      vitalsSpan.attributes.push({ key: 'lcp_ms', value: { doubleValue: vitals.lcp } });
    }
    if (vitals.fid != null) {
      vitalsSpan.attributes.push({ key: 'fid_ms', value: { doubleValue: vitals.fid } });
    }
    if (vitals.cls != null) {
      vitalsSpan.attributes.push({ key: 'cls', value: { doubleValue: vitals.cls } });
    }

    spanBatch.push(vitalsSpan);
    flushBatch();
  });
}

function patchHistoryNavigation() {
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  function recordNavigationSpan(fromUrl, toUrl) {
    const { traceId, spanId } = buildTraceContext();
    const start = performance.timeOrigin + performance.now();
    const end = start + 1;

    spanBatch.push({
      traceId,
      spanId,
      name: `Soft Navigation`,
      kind: 1,
      startTimeUnixNano: toNano(start),
      endTimeUnixNano: toNano(end),
      attributes: [
        { key: 'navigation.from', value: { stringValue: fromUrl } },
        { key: 'navigation.to', value: { stringValue: toUrl } }
      ],
      status: { code: 1, message: '' }
    });

    scheduleFlush();
  }

  history.pushState = function (...args) {
    const from = window.location.href;
    const result = originalPushState.apply(this, args);
    const to = window.location.href;
    recordNavigationSpan(from, to);
    return result;
  };

  history.replaceState = function (...args) {
    const from = window.location.href;
    const result = originalReplaceState.apply(this, args);
    const to = window.location.href;
    recordNavigationSpan(from, to);
    return result;
  };

  window.addEventListener('popstate', () => {
    const from = window.location.href;
    setTimeout(() => {
      const to = window.location.href;
      recordNavigationSpan(from, to);
    }, 0);
  });
}

export function recordCustomSpan(name, attributes = {}, startTime, endTime, spanKind) {
  const { traceId, spanId } = buildTraceContext();
  const start = performance.timeOrigin + performance.now();
  const end = start + 1;

  const attrs = Object.entries(attributes).map(([key, value]) => ({
    key,
    value: { stringValue: String(value) }
  }));

  spanBatch.push({
    traceId,
    spanId,
    name: `${name}`,
    kind: spanKind || 1,
    startTimeUnixNano: startTime || toNano(start),
    endTimeUnixNano: endTime || toNano(end),
    attributes: applyGlobalAttributes([
      ...attrs,
      ...(config.extraAttributes || [])
    ]),
    status: { code: 1, message: '' }
  });

  scheduleFlush();
}

function patchJsErrorHandler() {
  window.addEventListener('error', event => {
    const message = event.message || 'Unknown JS error';
    const url = event.filename || window.location.href;
    const lineNum = event.lineno ?? 0;
    const colNum = event.colno ?? 0;

    const trace = buildTraceContext();

    const startTime = Date.now();

    spanBatch.push({
      traceId: trace.traceId,
      spanId: trace.spanId,
      name: `JS Error: ${message}`,
      kind: 1,
      startTimeUnixNano: toNano(startTime),
      endTimeUnixNano: toNano(startTime + 1),
      attributes: applyGlobalAttributes([
        { key: 'error.line', value: { intValue: lineNum } },
        { key: 'error.column', value: { intValue: colNum } },
        { key: 'error.filename', value: { stringValue: url } },
        { key: 'error.message', value: { stringValue: message } },
        ...(config.extraAttributes || [])
      ]),
      status: {
        code: 2,
        message: message
      }
    });

    scheduleFlush();
  });

  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason;
    const message = typeof reason === 'string' ? reason : (reason?.message || 'Unhandled promise rejection');

    const trace = buildTraceContext();

    const startTime = Date.now();

    spanBatch.push({
      traceId: trace.traceId,
      spanId: trace.spanId,
      name: `Unhandled Promise Rejection`,
      kind: 1,
      startTimeUnixNano: toNano(startTime),
      endTimeUnixNano: toNano(startTime + 1),
      attributes: applyGlobalAttributes([
        { key: 'error.promise', value: { stringValue: message } },
        ...(config.extraAttributes || [])
      ]),
      status: {
        code: 2,
        message: message
      }
    });

    scheduleFlush();
  });
}

export function updateGlobalAttributes(newAttributes) {
  config.globalAttributes = {
    ...config.globalAttributes,
    ...newAttributes
  };
}

export function initOtelite(userConfig = {}) {
  config = { ...config, ...userConfig };

  if (!config.collectors.length) {
    console.error('Otelite init: at least 1 collector is required.');
    return;
  }

  patchFetch();
  patchXHR();

  if (config.captureSoftNavigations) {
    patchHistoryNavigation();
  }

  if (config.captureWebVitals) {
    captureWebVitals();
  }

  if (config.captureJSErrors) {
    patchJsErrorHandler();
  }

  if (document.readyState === 'complete') {
    if (config.captureResourceSpans) captureInitialResourceSpans();
  } else {
    window.addEventListener('load', () => {
      if (config.captureResourceSpans) captureInitialResourceSpans();
    });
  }

  window.addEventListener('beforeunload', flushBatch);
}