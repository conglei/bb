import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readJson } from "../helpers/json.js";
import { seedHostSession, seedProjectWithSource } from "../helpers/seed.js";
import { withTestHarness } from "../helpers/test-app.js";

let pluginsDir: string;

beforeEach(async () => {
  pluginsDir = await mkdtemp(join(tmpdir(), "bb-project-plugins-route-"));
});

afterEach(async () => {
  await rm(pluginsDir, { recursive: true, force: true });
});

async function writePlugin(
  name: string,
  projectDefault: "on" | "off" | undefined,
): Promise<string> {
  const rootDir = join(pluginsDir, name);
  await mkdir(rootDir, { recursive: true });
  await writeFile(
    join(rootDir, "package.json"),
    JSON.stringify({
      name,
      version: "0.1.0",
      bb: {
        name: `${name} fixture`,
        description: "Project plugin route fixture.",
        branding: { icon: "Zap" },
        server: "./server.ts",
        ...(projectDefault === undefined
          ? {}
          : { experimental_projectDefault: projectDefault }),
      },
    }),
  );
  await writeFile(
    join(rootDir, "server.ts"),
    "export default function plugin() {}",
  );
  return rootDir;
}

describe("project plugin routes", () => {
  it("lists running plugins with their defaults and stores per-project overrides", async () => {
    await withTestHarness(async (harness) => {
      await harness.pluginService.installPath(
        await writePlugin("bb-plugin-kept", "off"),
      );
      await harness.pluginService.installPath(
        await writePlugin("bb-plugin-notes", undefined),
      );
      const { host } = seedHostSession(harness.deps, {
        id: "host-project-plugins",
      });
      const { project } = seedProjectWithSource(harness.deps, {
        hostId: host.id,
      });

      const listed = await harness.app.request(
        `/api/v1/projects/${project.id}/plugins`,
      );
      expect(listed.status).toBe(200);
      expect(await readJson(listed)).toEqual([
        {
          pluginId: "kept",
          name: "bb-plugin-kept fixture",
          icon: "Zap",
          enabled: false,
          source: "default",
        },
        {
          pluginId: "notes",
          name: "bb-plugin-notes fixture",
          icon: "Zap",
          enabled: true,
          source: "default",
        },
      ]);

      const put = (pluginId: string, enabled: boolean | null) =>
        harness.app.request(
          `/api/v1/projects/${project.id}/plugins/${pluginId}`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ enabled }),
          },
        );

      const enabled = await put("kept", true);
      expect(enabled.status).toBe(200);
      expect(await readJson(enabled)).toEqual([
        expect.objectContaining({
          pluginId: "kept",
          enabled: true,
          source: "project",
        }),
        expect.objectContaining({
          pluginId: "notes",
          enabled: true,
          source: "default",
        }),
      ]);

      const reset = await put("kept", null);
      expect(await readJson(reset)).toEqual([
        expect.objectContaining({
          pluginId: "kept",
          enabled: false,
          source: "default",
        }),
        expect.objectContaining({
          pluginId: "notes",
          enabled: true,
          source: "default",
        }),
      ]);

      const unknown = await put("ghost", false);
      expect(unknown.status).toBe(404);

      const invalid = await harness.app.request(
        `/api/v1/projects/${project.id}/plugins/notes`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled: "no" }),
        },
      );
      expect(invalid.status).toBe(400);

      const missingProject = await harness.app.request(
        "/api/v1/projects/proj_missing/plugins",
      );
      expect(missingProject.status).toBe(404);
    });
  });
});
