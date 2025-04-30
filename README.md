# OTELite

An OTEL library that doesn't weigh a ton.

OTELite is built with size and performance in mind, noticing that current OTEL libraries either shipped an entire gRPC implementation or included sub-dependencies bloating their overall size and the size of your application.

OTELite focuses on being small and easy to work with

- Lightweight (15kb uncompressed, 3.3kb brotli compressed)
- Zero external dependencies
- Written from scratch with key features

## Features

- Measures network requests via either `fetch` or `XHR`
- Measures resource such as initial files (index.html, CSS, JS) - optional
- Measures web vitals - optional
- Measures soft navigations for SPAs - optional
- Add domains that should have tracing attached
- Exclude certain URLs from tracking
- Send to multiple OTEL collectors

## Setup

Import the library and adjust its configuration to fit your application:

```js
import { initOtelite, recordUserActionSpan, updateGlobalAttributes } from './otelite-web.js';

// defaults
const config = {
  collectors: [ // At least 1 collector required
    {
      url: 'YOUR_OTEL_COLLECTOR_URL',
      headers: { 'Authorization': 'Bearer mytoken123'} // optional custom headers required for your collector
    }
  ],
  serviceName: 'browser-app', // Your application name
  serviceVersion: 'unknown', // Your application version
  deploymentEnv: 'production', // Your environment
  traceOrigins: [], // Allowed domains for traceparent/tracestate
  excludeUrls: [ // Excluded URLs from being tracked
    '/analytics/ping',
    /\.socketjs-node/,
    url => url.startsWith('https://analytics.example.com')
  ],
  captureResourceSpans: true, // Optional feature
  captureWebVitals: true, // Optional feature
  captureSoftNavigations: true, // Optional feature
  batchInterval: 5000, // How often to ping collectors (ms)
  maxBatchSize: 20, // How many items to send each ping
  globalAttributes: {} // Apply global attributes to all span measurements
}

// Call once when your application boots up
initOtelite(config);


// ---- Custom measurements: e.g CTA clicks ----------------------------
//
// trigger when clicking CTA link
recordUserActionSpan('CTA Link Click', { someInfo: 'details', });


// ----- Update Global Attributes with information at runtime -----------
//
// e.g tie spans together with session information
updateGlobalAttributes({
  userSessionID: `${SESSION_ID}`,
  deviceOS: ``
});
```