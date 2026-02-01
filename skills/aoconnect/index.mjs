import { readFileSync } from "node:fs";
import { message, createDataItemSigner, spawn, result, dryrun, monitor, unmonitor, connect } from "@permaweb/aoconnect";

/**
 * Send a message to an ao Process
 * @param {string} processId - The ao Process ID to send a message to
 * @param {Object} options - Message options
 * @param {string} options.data - Message data (optional, will generate random if not provided)
 * @param {Array} options.tags - Message tags
 * @param {string} options.walletPath - Path to Arweave wallet JSON (required)
 * @returns {Promise<Object>} Message result
 */
export async function messageAo(processId, options = {}) {
  const { data, tags, walletPath } = options;

  if (!walletPath) {
    throw new Error("walletPath is required. Please provide a path to your Arweave wallet JSON file.");
  }

  try {
    const wallet = JSON.parse(readFileSync(walletPath, "utf-8"));
    const signer = createDataItemSigner(wallet);

    const response = await message({
      process: processId,
      tags: tags || [],
      data: data || undefined,
      signer,
    });

    return response;
  } catch (error) {
    throw new Error(`Failed to send message: ${error.message}`);
  }
}

/**
 * Read the result of an ao Message evaluation
 * @param {Object} options - Result options
 * @param {string} options.message - The message to evaluate
 * @param {string} options.process - The ao Process ID
 * @returns {Promise<Object>} Result object
 */
export async function resultAo(options) {
  const { message, process } = options;

  if (!message || !process) {
    throw new Error("message and process are required");
  }

  try {
    const response = await result({
      message,
      process,
    });

    return response;
  } catch (error) {
    throw new Error(`Failed to read result: ${error.message}`);
  }
}

/**
 * Dry run a message (doesn't save to memory)
 * @param {Object} options - Dry run options
 * @param {string} options.message - The message to dry run
 * @param {string} options.process - The ao Process ID
 * @returns {Promise<Object>} Dry run result
 */
export async function dryrunAo(options) {
  const { message, process } = options;

  if (!message || !process) {
    throw new Error("message and process are required");
  }

  try {
    const response = await dryrun({
      message,
      process,
    });

    return response;
  } catch (error) {
    throw new Error(`Failed to dry run: ${error.message}`);
  }
}

/**
 * Spawn an ao Process
 * @param {Object} options - Spawn options
 * @param {string} options.module - The arweave TxID of the ao Module
 * @param {string} options.scheduler - The Arweave wallet address of a Scheduler Unit
 * @param {string} options.walletPath - Path to Arweave wallet JSON (required)
 * @param {Object} options.tags - Tags for the spawn message
 * @returns {Promise<Object>} Spawn result
 */
export async function spawnAo(options) {
  const { module, scheduler, walletPath, tags = [] } = options;

  if (!module || !scheduler || !walletPath) {
    throw new Error("module, scheduler, and walletPath are required");
  }

  try {
    const wallet = JSON.parse(readFileSync(walletPath, "utf-8"));
    const signer = createDataItemSigner(wallet);

    const response = await spawn({
      module,
      scheduler,
      tags,
      signer,
    });

    return response;
  } catch (error) {
    throw new Error(`Failed to spawn process: ${error.message}`);
  }
}

/**
 * Monitor messages
 * @param {Object} options - Monitor options
 * @param {string} options.process - The ao Process ID to monitor
 * @param {Function} options.onMessage - Callback for new messages
 * @returns {Promise<Object>} Monitor ID
 */
export async function monitorAo(options) {
  const { process, onMessage } = options;

  if (!process || typeof onMessage !== "function") {
    throw new Error("process and onMessage callback are required");
  }

  try {
    const monitorId = monitor({
      process,
      onMessage,
    });

    return monitorId;
  } catch (error) {
    throw new Error(`Failed to start monitoring: ${error.message}`);
  }
}

/**
 * Stop monitoring messages
 * @param {string} monitorId - Monitor ID returned from monitorAo
 */
export function unmonitorAo(monitorId) {
  if (!monitorId) {
    throw new Error("monitorId is required");
  }

  try {
    unmonitor(monitorId);
  } catch (error) {
    throw new Error(`Failed to stop monitoring: ${error.message}`);
  }
}

/**
 * Connect to ao nodes with custom configuration
 * @param {Object} config - Connection config
 * @param {string} config.MU_URL - Message Unit URL
 * @param {string} config.CU_URL - Compute Unit URL
 * @param {string} config.GATEWAY_URL - Arweave gateway URL
 * @returns {Object} aoconnect functions
 */
export function connectAo(config = {}) {
  try {
    const ao = connect(config);
    return ao;
  } catch (error) {
    throw new Error(`Failed to connect: ${error.message}`);
  }
}

/**
 * Get connection info
 * @param {Object} config - Connection config
 * @returns {Object} Connected aoconnect functions
 */
export function getConnection(config = {}) {
  return connect(config);
}

// CLI mode
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  try {
    switch (command) {
      case "message": {
        const walletPath = args.find((arg, i) => arg === "--wallet" && args[i + 1]);
        const processId = args.find((arg, i) => arg.startsWith("--process") && !arg.includes("="));
        const data = args.find((arg, i) => arg.startsWith("--data="));

        if (!walletPath || !processId) {
          console.error("Usage: node index.mjs message --wallet <path> --process <id> [--data=<string>]");
          process.exit(1);
        }

        const response = await messageAo(processId, {
          walletPath,
          data: data?.replace("--data=", ""),
        });

        console.log(JSON.stringify(response, null, 2));
        break;
      }

      case "result": {
        const message = args.find((arg, i) => arg.startsWith("--message="));
        const process = args.find((arg, i) => arg.startsWith("--process="));

        if (!message || !process) {
          console.error("Usage: node index.mjs result --message=<id> --process=<id>");
          process.exit(1);
        }

        const response = await resultAo({
          message: message.replace("--message=", ""),
          process: process.replace("--process=", ""),
        });

        console.log(JSON.stringify(response, null, 2));
        break;
      }

      case "dryrun": {
        const message = args.find((arg, i) => arg.startsWith("--message="));
        const process = args.find((arg, i) => arg.startsWith("--process="));

        if (!message || !process) {
          console.error("Usage: node index.mjs dryrun --message=<id> --process=<id>");
          process.exit(1);
        }

        const response = await dryrunAo({
          message: message.replace("--message=", ""),
          process: process.replace("--process=", ""),
        });

        console.log(JSON.stringify(response, null, 2));
        break;
      }

      case "spawn": {
        const walletPath = args.find((arg, i) => arg === "--wallet" && args[i + 1]);
        const module = args.find((arg, i) => arg.startsWith("--module="));
        const scheduler = args.find((arg, i) => arg.startsWith("--scheduler="));

        if (!walletPath || !module || !scheduler) {
          console.error(
            "Usage: node index.mjs spawn --wallet <path> --module=<id> --scheduler=<address>"
          );
          process.exit(1);
        }

        const response = await spawnAo({
          walletPath,
          module: module.replace("--module=", ""),
          scheduler: scheduler.replace("--scheduler=", ""),
        });

        console.log(JSON.stringify(response, null, 2));
        break;
      }

      default:
        console.log("aoconnect skill CLI");
        console.log("");
        console.log("Commands:");
        console.log("  message    Send a message to an ao process");
        console.log("  result     Read the result of an ao message evaluation");
        console.log("  dryrun     Dry run a message without saving to memory");
        console.log("  spawn      Spawn an ao process");
        console.log("");
        console.log("Examples:");
        console.log("  node index.mjs message --wallet ./wallet.json --process <id> --data=<string>");
        console.log("  node index.mjs result --message=<id> --process=<id>");
        console.log("  node index.mjs spawn --wallet ./wallet.json --module=<id> --scheduler=<address>");
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
