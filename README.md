# OTELite

An OTEL library that doesn't weigh a ton.

OTELite is built with size and performance in mind, noticing that current OTEL libraries either shipped an entire gRPC implementation or included sub-dependencies bloating the overall size.

OTELite focuses on being small

- Lightweight (11kb uncompressed, < 3kb brotli compressed)
- Zero external dependencies
- Written from scratch with key features

## Features

- Measures network requests via either `fetch` or `XHR`
- Measures resource such as initial files (index.html, CSS, JS) - optional
- Measures web vitals - optional
- Measures soft navigations for SPAs - optional

## Setup

Import the library and adjust its configuration to fit your application:

```js
import { initOtelite } from './otelite-web.js';

// defaults
const config = {
  collectors: [ // at least 1 collector required
    {
      url: 'YOUR_OTEL_COLLECTOR',
      headers: { 'Authorization': 'Bearer mytoken123'} // any custom headers required for your collector
    }
  ],
  serviceName: 'browser-app',
  serviceVersion: 'unknown',
  deploymentEnv: 'production',
  traceOrigins: [], // allowed domains for traceparent/tracestate
  excludeUrls: [ // excluded some URLs from being tracked
    '/hot-update',
    /\.sockjs-node/,
    url => url.startsWith('https://analytics.example.com')
  ]
  captureResourceSpans: true,
  captureWebVitals: true,
  captureSoftNavigations: true,
  batchInterval: 5000,
  maxBatchSize: 20
}

// call when your application boots up
initOtelite(config);
```
