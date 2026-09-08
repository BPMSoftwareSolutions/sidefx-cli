import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import Parser from 'stream-json/Parser.js';
import Filter from 'stream-json/filters/Filter.js';
import Stringer from 'stream-json/Stringer.js';
import { SidefxError } from './errors.mjs';

// The terminal returns the capability outcome. The bootstrap additionally emits
// repeated kernel history at the envelope root; it is not part of that outcome.
// Filter by path segments so identically named fields inside an outcome survive.
const historyFields = new Set(['executions', 'observations', 'nestedExecutions', 'nestedObservations']);

export async function readDeliveryResult(source, { maxResultBytes = 32 * 1024 * 1024,
  maxWireBytes = 512 * 1024 * 1024 } = {}) {
  let wireBytes = 0, resultBytes = 0;
  const chunks = [];
  const wireLimit = new Transform({ transform(chunk, encoding, callback) {
    wireBytes += chunk.length;
    callback(wireBytes > maxWireBytes
      ? new SidefxError('DELIVERY_OUTPUT_LIMIT', 'Estate transport output exceeded its bounded limit.', 4)
      : null, chunk);
  } });
  const output = new Writable({ write(chunk, encoding, callback) {
    resultBytes += chunk.length;
    if (resultBytes > maxResultBytes) return callback(new SidefxError('DELIVERY_OUTPUT_LIMIT',
      'Estate result exceeded 32 MiB.', 4));
    chunks.push(chunk);
    callback();
  } });
  let rootSeen = false;
  const root = new Transform({ objectMode: true, transform(token, encoding, callback) {
    if (!rootSeen) {
      rootSeen = true;
      if (token.name !== 'startObject') return callback(new SidefxError('DELIVERY_PROTOCOL_REJECTED',
        'The estate returned no canonical result object.', 4));
    }
    callback(null, token);
  } });
  try {
    await pipeline(source, wireLimit, new Parser({ packStrings: false, packNumbers: false }), root,
      new Filter({ filter: stack => stack.length === 0 || !historyFields.has(stack[0]) }),
      new Stringer(), output);
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof SidefxError) throw error;
    throw new SidefxError('DELIVERY_PROTOCOL_REJECTED', 'The estate returned no canonical JSON result.', 4);
  }
}
