import {
  execHostFile,
  sanitizeInheritedChildProcessEnv,
} from "@bb/process-utils";
import type { HostDaemonOnlineRpcResult } from "@bb/host-daemon-contract";
import { ExpectedCommandDispatchError } from "../command-dispatch-support.js";

const execFileAsync = execHostFile;

export const CHOOSE_FOLDER_SCRIPT = [
  "activate",
  "with timeout of 86400 seconds",
  "try",
  'POSIX path of (choose folder with prompt "Choose a project folder")',
  "on error number -128",
  'return ""',
  "end try",
  "end timeout",
].join("\n");

export async function pickHostFolder(): Promise<
  HostDaemonOnlineRpcResult<"host.pick_folder">
> {
  if (process.platform !== "darwin") {
    throw new ExpectedCommandDispatchError(
      "unsupported_platform",
      "Folder picker is only supported on macOS",
    );
  }

  let stdout: string;
  try {
    const result = await execFileAsync(
      "osascript",
      ["-e", CHOOSE_FOLDER_SCRIPT],
      {
        env: sanitizeInheritedChildProcessEnv({ env: process.env }),
      },
    );
    stdout = result.stdout;
  } catch (error) {
    throw new ExpectedCommandDispatchError(
      "folder_picker_failed",
      `Folder picker failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const selectedPath = stdout.trim();
  return { path: selectedPath === "" ? null : selectedPath.replace(/\/$/, "") };
}
