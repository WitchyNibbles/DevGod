import { readActiveTaskContext, readHookPayload } from "./hook-utils.mjs";
import { evaluateSessionStart } from "./hook-policy.mjs";

const payload = await readHookPayload();
const context = await readActiveTaskContext();
process.stdout.write(JSON.stringify(evaluateSessionStart(payload, context)));
