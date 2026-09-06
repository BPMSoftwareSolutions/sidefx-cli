import http from 'node:http';
import https from 'node:https';
import { createHash } from 'node:crypto';

export function exchange({ url, method, headers, body, timeoutMs, maxResponseBytes }) {
  return new Promise(resolve => {
    const startedAt = new Date().toISOString();
    const start = performance.now();
    let request;
    let response;
    let finished = false;
    let attemptCount = 0;
    const finish = result => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ ...result, startedAt, completedAt: new Date().toISOString(),
        durationMilliseconds: Math.round(performance.now() - start), attemptCount, retryCount: 0,
        redirectsFollowed: 0, maximumResponseBytes: maxResponseBytes, timeoutMilliseconds: timeoutMs });
    };
    const timer = setTimeout(() => {
      finish({ transportDisposition: 'TIMED_OUT', httpStatus: response?.statusCode ?? null });
      response?.destroy(); request?.destroy();
    }, timeoutMs);
    try {
      request = (url.protocol === 'https:' ? https : http).request(url, { method, headers, agent: false }, incoming => {
        response = incoming;
        const chunks = [];
        let bytes = 0;
        incoming.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > maxResponseBytes) {
            finish({ transportDisposition: 'RESPONSE_BOUND_EXCEEDED', httpStatus: incoming.statusCode,
              bodyBytes: maxResponseBytes });
            incoming.destroy(); request.destroy();
          } else chunks.push(chunk);
        });
        incoming.on('error', () => finish({ transportDisposition: 'TRANSPORT_FAILED', httpStatus: incoming.statusCode }));
        incoming.on('end', () => {
          const body = Buffer.concat(chunks);
          finish({ transportDisposition: 'HTTP_RESPONSE_OBSERVED', httpStatus: incoming.statusCode,
            contentType: incoming.headers['content-type'] ?? null, bodyBytes: body.length,
            responseBodyDigest: `sha256:${createHash('sha256').update(body).digest('hex')}`,
            bodyText: body.toString('utf8') });
        });
      });
      request.on('error', () => finish({ transportDisposition: 'TRANSPORT_FAILED', httpStatus: response?.statusCode ?? null }));
      attemptCount = 1;
      request.end(body);
    } catch {
      finish({ transportDisposition: 'REQUEST_REJECTED', httpStatus: null });
      request?.destroy();
    }
  });
}
