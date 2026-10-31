import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setProjectPluginEnabled } from "../../../src/services/plugins/project-plugin-scope.js";
import { internalAuthHeaders } from "../../helpers/commands.js";
import { readJson } from "../../helpers/json.js";
import {
  seedEnvironment,
  seedHostSession,
  seedProjectWithSource,
  seedThread,
} from "../../helpers/seed.js";
import { withTestHarness } from "../../helpers/test-app.js";

let pluginsDir: string;

beforeEach(async () => {
  pluginsDir = await mkdtemp(join(tmpdir(), "bb-project-plugin-tools-"));
});

afterEach(async () => {
  await rm(pluginsDir, { recursive: true, force: true });
});

async function writeToolPlugin(): Promise<string> {
  const rootDir = join(pluginsDir, "bb-plugin-scoped");
  await mkdir(rootDir, { recursive: true });
  await writeFile(
    join(rootDir, "package.json"),
    JSON.stringify({
      name: "bb-plugin-scoped",
      version: "0.1.0",
      bb: {
        name: "Scoped tools fixture",
        description: "Per-project tool guard fixture.",
        branding: { icon: "Zap" },
        server: "./server.ts",
      },
    }),
  );
  await writeFile(
    join(rootDir, "server.ts"),
    `
      export default function plugin(bb) {
        bb.agents.registerTool({
          name: "scoped_echo",
          description: "Echo",
          parameters: { type: "object" },
          execute: () => "ran",
        });
      }
    `,
  );
  return rootDir;
}

describe("internal tool-call guard for per-project plugin enablement", () => {
  it("refuses a plugin tool whose plugin is turned off for the thread's project", async () => {
    await withTestHarness(async (harness) => {
      const entry = await harness.pluginService.installPath(
        await writeToolPlugin(),
      );
      expect(entry.status).toBe("running");

      const { session } = seedHostSession(harness.deps);
      const { project: onProject } = seedProjectWithSource(harness.deps, {
        hostId: session.hostId,
        path: "/tmp/scoped-on",
      });
      const { project: offProject } = seedProjectWithSource(harness.deps, {
        hostId: session.hostId,
        name: "Off",
        path: "/tmp/scoped-off",
      });
      setProjectPluginEnabled(harness.db, harness.hub, {
        projectId: offProject.id,
        pluginId: "scoped",
        enabled: false,
      });

      const threadFor = (projectId: string) => {
        const environment = seedEnvironment(harness.deps, {
          hostId: session.hostId,
          projectId,
          path: join(harness.config.dataDir, `ws-${projectId}`),
        });
        return seedThread(harness.deps, {
          projectId,
          environmentId: environment.id,
          status: "active",
        });
      };
      const call = (threadId: string) =>
        harness.app.request("/internal/session/tool-call", {
          method: "POST",
          headers: internalAuthHeaders(harness),
          body: JSON.stringify({
            sessionId: session.id,
            threadId,
            providerThreadId: `provider-${threadId}`,
            turnId: `turn-${threadId}`,
            callId: `call-${threadId}`,
            tool: "scoped_echo",
            arguments: {},
          }),
        });

      const allowed = await call(threadFor(onProject.id).id);
      expect(allowed.status).toBe(200);
      await expect(readJson(allowed)).resolves.toEqual({
        success: true,
        contentItems: [{ type: "inputText", text: "ran" }],
      });

      const refused = await call(threadFor(offProject.id).id);
      expect(refused.status).toBe(200);
      const body = (await readJson(refused)) as {
        success: boolean;
        contentItems: Array<{ text: string }>;
      };
      expect(body.success).toBe(false);
      expect(body.contentItems[0]?.text).toContain(
        '"scoped" plugin is turned off for this project',
      );
    });
  });
});
