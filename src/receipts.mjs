import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { digest, readJson, writeJson, redact } from './data.mjs';
import { errorRecord, requireValue, SidefxError } from './errors.mjs';

export const isExecutionId = value => /^exec-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);

export class ReceiptStore {
  constructor(stateRoot) { this.root = path.join(path.resolve(stateRoot), 'executions'); }

  file(id) {
    requireValue(isExecutionId(id), 'EXECUTION_ID_REJECTED', 'Use the exact exec-UUID returned by sfx invoke or evaluate.', 2);
    return path.join(this.root, `${id}.json`);
  }

  async save(receipt, exclusive = false) {
    const safe = redact(receipt);
    await writeJson(this.file(receipt.executionId), { ...safe, receiptDigest: digest(safe) }, { exclusive });
    return { ...safe, receiptDigest: digest(safe) };
  }

  async read(id) {
    const record = await readJson(this.file(id));
    const { receiptDigest, ...receipt } = record;
    requireValue(receipt.executionId === id && receipt.receiptType === 'sfx-execution-testimony.v1'
      && digest(receipt) === receiptDigest,
    'RECEIPT_INTEGRITY_FAILED', `Receipt ${id} does not match its recorded digest.`, 4);
    return record;
  }

  async list() {
    let files;
    try { files = await readdir(this.root); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    const records = await Promise.all(files.filter(file => file.endsWith('.json')).map(file => this.read(file.slice(0, -5))));
    return records.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map(record => ({
      executionId: record.executionId, capabilityId: record.capability.capabilityId,
      verb: record.verb, executionState: record.executionState, startedAt: record.startedAt,
    }));
  }

  async execute({ verb, subject, capability, estateManifestDigest, input, context = null }, operation) {
    const executionId = `exec-${randomUUID()}`;
    const receipt = {
      receiptType: 'sfx-execution-testimony.v1', evidenceScope: 'LOCAL_DELIVERY_TESTIMONY',
      executionId, verb, subject, context,
      startedAt: new Date().toISOString(), executionState: 'RUNNING', estateManifestDigest,
      capability: {
        capabilityId: capability.capabilityId, capabilityVersion: capability.capabilityVersion,
        capsuleDigest: capability.capsuleDigest, capabilityAuthorityDigest: capability.capabilityAuthorityDigest,
        userStory: capability.userStory, experience: capability.experience,
        rootScenarioId: capability.rootScenarioId, providers: capability.providers,
        ...(capability.runtimeManifestDigest ? { runtimeManifestDigest: capability.runtimeManifestDigest,
          authorityScope: capability.authorityScope, managedAdmission: capability.managedAdmission } : {}),
      },
      inputDigest: input === undefined ? null : digest(input),
    };
    // Fail before executing an effect if its delivery receipt cannot be recorded.
    await this.save(receipt, true);
    let execution;
    try {
      execution = await operation();
    } catch (error) {
      receipt.executionState = 'DELIVERY_FAILED';
      receipt.finishedAt = new Date().toISOString();
      receipt.error = errorRecord(error);
      try { await this.save(receipt); } catch (storageError) {
        throw new SidefxError('RECEIPT_FINALIZATION_FAILED',
          `Execution ${executionId} failed and its final receipt could not be saved: ${storageError.message}`, 4,
          { executionId, deliveryError: errorRecord(error) });
      }
      error.details = { ...error.details, executionId };
      throw error;
    }
    receipt.executionState = 'RETURNED';
    receipt.finishedAt = new Date().toISOString();
    receipt.result = execution.result;
    receipt.resultDigest = digest(execution.result);
    receipt.resultStorage = 'SECRET_FIELDS_REDACTED';
    receipt.executionEstateManifestDigest = execution.estateManifestDigest;
    if (execution.runtimeManifestDigest) receipt.executionRuntimeManifestDigest = execution.runtimeManifestDigest;
    let saved;
    try { saved = await this.save(receipt); } catch (error) {
      throw new SidefxError('RECEIPT_FINALIZATION_FAILED',
        `Execution ${executionId} returned, but its final receipt could not be saved. Do not blindly repeat an effect.`, 4,
        { executionId, cause: error.message });
    }
    return { executionId, receiptDigest: saved.receiptDigest, evidenceScope: receipt.evidenceScope,
      executionState: receipt.executionState, result: execution.result };
  }
}

export function explainReceipt(receipt) {
  return {
    executionId: receipt.executionId,
    intent: receipt.capability.userStory?.intent ?? null,
    capability: receipt.capability,
    inputDigest: receipt.inputDigest,
    executionState: receipt.executionState,
    // Preserve the runtime's own nested outcome and scenario testimony verbatim.
    result: receipt.result ?? null,
    error: receipt.error ?? null,
    evidence: {
      scope: receipt.evidenceScope, estateManifestDigest: receipt.estateManifestDigest,
      receiptDigest: receipt.receiptDigest, resultDigest: receipt.resultDigest ?? null,
      startedAt: receipt.startedAt, finishedAt: receipt.finishedAt ?? null,
    },
  };
}
