# Otelite

A lightweight, web focused Otel library.

Otel libraries in the wild either shipped an entire gRPC implementation to the browser or include a large amount of sub-dependencies bloating the overall size of your application.

Otelite focuses on being small and easy to work with.

- Lightweight (18kb uncompressed, 4kb brotli compressed)
- Zero external dependencies

## Features

- Measures network requests via either `fetch` or `XHR`
- Measures resource such as initial files (index.html, CSS, JS) - optional
- Measures web vitals - optional
- Measures soft navigations for SPAs - optional
- Measures JS errors - optional
- Add domains that should have tracing attached
- Exclude certain URLs from tracking
- Send to multiple Otel collectors

## Setup

Import the library and adjust its configuration to fit your application

NPM: https://www.npmjs.com/package/otelite

```
npm i otelite
```


```js
import { initOtelite, recordCustomSpan, updateGlobalAttributes } from './otelite-web.js';

const config = {
  collectors: [ // At least 1 collector required
    {
      url: 'YOUR_OTEL_COLLECTOR_URL', // OTLP/HTTP endpoint
      headers: { 'Authorization': 'Bearer mytoken123'} // optional custom headers required for your collector
    }
  ],
  serviceName: 'My Web App', // Your application name
  serviceVersion: '0.0.1', // Your application version
  deploymentEnv: 'dev', // Your application environment
  traceOrigins: [], // Domains to attach traceparent/tracestate headers
  excludeUrls: [ // Exclude URLs from being tracked
    '/analytics/ping', // strings
    /\.socketjs-node/, // regex
    url => url.startsWith('https://analytics.example.com') // functions
  ],
  captureResourceSpans: false, // Optional feature
  captureWebVitals: false, // Optional feature
  captureSoftNavigations: false, // Optional feature
  captureJSErrors: false, // Optional feature
  batchInterval: 5000, // How often to ping collectors (ms)
  maxBatchSize: 20, // How many items to send each ping
  globalAttributes: {} // Apply global attributes to all span measurements
}

// Call once when your application boots up
initOtelite(config);


// ---- Custom measurements: e.g CTA clicks ----------------------------
//
// trigger when clicking CTA link
recordCustomSpan('CTA Link Click', { someInfo: 'details' });


// ----- Update Global Attributes with information at runtime -----------
//
// e.g tie spans together with session information
updateGlobalAttributes({
  userSessionID: `${SESSION_ID}`
});
```