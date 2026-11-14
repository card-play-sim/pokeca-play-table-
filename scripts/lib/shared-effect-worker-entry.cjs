"use strict";
process.on("disconnect", () => process.exit(0));
try {
  const worker = require(process.argv[2]);
  if (
    worker.idempotent !== true ||
    typeof worker.version !== "string" ||
    !worker.version ||
    typeof worker.run !== "function"
  )
    throw Error("WORKER_REQUIRES_VERSION_AND_IDEMPOTENT_CONTRACT");
  let busy = false;
  process.on("message", async ({ task, context }) => {
    if (busy) {
      process.send({ requestId: context.attemptId, error: "WORKER_BUSY" });
      return;
    }
    busy = true;
    try {
      const result = await worker.run(task, context);
      if (process.connected)
        process.send({ requestId: context.attemptId, result });
    } catch (e) {
      if (process.connected)
        process.send({
          requestId: context.attemptId,
          error: e.stack || e.message,
        });
    } finally {
      busy = false;
    }
  });
  process.send({
    ready: true,
    version: worker.version,
    contextFingerprint: worker.contextFingerprint || "",
  });
} catch (e) {
  if (process.connected) process.send({ startError: e.message });
  process.exitCode = 2;
}
