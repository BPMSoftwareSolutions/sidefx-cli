// Process isolation keeps the bootstrap's estate root and diagnostics out of the SDK.
// All validation, resolution, proof and execution remain bootstrap responsibilities.
import { pathToFileURL } from 'node:url';
import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { bytesDigest } from './data.mjs';

process.once('message', async request => {
  try {
    const runtime = await import(pathToFileURL(request.bootstrap).href);
    const manifestPath = path.join(process.cwd(), 'capsules', 'capsule-estate.manifest.json');
    const manifestDigest = bytesDigest(await readFile(manifestPath));
    const estate = runtime.loadEstate();
    const verification = runtime.verifyEstate(estate);
    if (bytesDigest(await readFile(manifestPath)) !== manifestDigest) {
      throw new Error('ESTATE_CHANGED: Estate generation changed during inspection.');
    }
    const identity = {
      estateManifestDigest: manifestDigest,
    };
    if (request.estateManifestDigest && request.estateManifestDigest !== identity.estateManifestDigest) {
      throw new Error('ESTATE_CHANGED: Estate generation changed before execution.');
    }
    let result;
    switch (request.operation) {
      case 'list': result = runtime.listCapsules(estate, request.query); break;
      case 'verify': result = { ...verification, durableLayout: runtime.assertCollapsedRepository() }; break;
      case 'inspect': {
        const inspection = runtime.inspectCapsule(request.capabilityId, estate);
        const capsule = estate.records.find(item => item.capsule.capabilityId === request.capabilityId).capsule;
        const feature = capsule.entries.find(entry => entry.entryRef.endsWith(`/${capsule.capabilityId}.feature`))
          ?? capsule.entries.find(entry => /\.feature(?:\.sidefx)?$/.test(entry.entryRef));
        let featureDocument = null;
        if (feature) {
          const require = createRequire(await realpath(request.bootstrap));
          const { generateMessages } = require('@cucumber/gherkin');
          const { IdGenerator, SourceMediaType } = require('@cucumber/messages');
          const messages = generateMessages(Buffer.from(feature.entryBytesBase64, 'base64').toString('utf8'),
            feature.entryRef, SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN,
            { includeSource: false, includeGherkinDocument: true, includePickles: false, newId: IdGenerator.incrementing() });
          if (messages.some(message => message.parseError)) throw new Error('FEATURE_REPRESENTATION_REJECTED: Capsule feature could not be parsed.');
          featureDocument = messages.find(message => message.gherkinDocument)?.gherkinDocument ?? null;
        }
        result = { inspection, capsule, featureDocument };
        break;
      }
      case 'resolve': {
        const inspection = runtime.inspectCapsule(request.capabilityId, estate);
        result = { inspection, dependencyResolution: runtime.resolveEstate(estate) };
        break;
      }
      case 'invoke':
      case 'evaluate': {
        const inspection = runtime.inspectCapsule(request.capabilityId, estate);
        if (inspection.capsuleDigest !== request.capsuleDigest) throw new Error('ESTATE_CHANGED: Selected capsule changed before execution.');
        result = request.operation === 'invoke'
          ? await runtime.invokeCapability(request.capabilityId, request.input, estate)
          : await runtime.proveDirectExecution(estate, new Set([request.capabilityId]));
        break;
      }
      default: throw new Error('OPERATION_REJECTED: Unknown bootstrap adapter operation.');
    }
    process.send({ ok: true, value: { ...identity, result } }, () => process.disconnect());
  } catch (error) {
    process.send({ ok: false, error: {
      code: /^[A-Z][A-Z0-9_]+:/.exec(error.message)?.[0].slice(0, -1) ?? 'RUNTIME_FAILED',
      message: error.message,
    } }, () => { process.disconnect(); process.exitCode = 1; });
  }
});
