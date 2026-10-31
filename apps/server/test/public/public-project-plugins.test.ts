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
  projectScope?: "any" | "single",
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
        ...(projectScope === undefined
          ? {}
          : { experimental_projectScope: projectScope }),
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
          hasProjectSettings: false,
          scope: "any",
          ownerProjectId: null,
          ownerProjectName: null,
        },
        {
          pluginId: "notes",
          name: "bb-plugin-notes fixture",
          icon: "Zap",
          enabled: true,
          source: "default",
          hasProjectSettings: false,
          scope: "any",
          ownerProjectId: null,
          ownerProjectName: null,
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

  it("moves a single-scope plugin between projects and reports the owner to both", async () => {
    await withTestHarness(async (harness) => {
      await harness.pluginService.installPath(
        await writePlugin("bb-plugin-master", undefined, "single"),
      );
      const { host } = seedHostSession(harness.deps, {
        id: "host-single-scope",
      });
      const { project: projectA } = seedProjectWithSource(harness.deps, {
        hostId: host.id,
        name: "Alpha",
      });
      const { project: projectB } = seedProjectWithSource(harness.deps, {
        hostId: host.id,
        name: "Beta",
      });
      const put = (projectId: string, enabled: boolean | null) =>
        harness.app.request(`/api/v1/projects/${projectId}/plugins/master`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled }),
        });
      const list = async (projectId: string) =>
        readJson(
          await harness.app.request(`/api/v1/projects/${projectId}/plugins`),
        );

      expect(await list(projectA.id)).toEqual([
        expect.objectContaining({
          pluginId: "master",
          enabled: false,
          source: "default",
          scope: "single",
          ownerProjectId: null,
          ownerProjectName: null,
        }),
      ]);

      const onA = await put(projectA.id, true);
      expect(onA.status).toBe(200);
      expect(await readJson(onA)).toEqual([
        expect.objectContaining({
          enabled: true,
          source: "project",
          ownerProjectId: projectA.id,
          ownerProjectName: "Alpha",
        }),
      ]);

      const movedToB = await put(projectB.id, true);
      expect(await readJson(movedToB)).toEqual([
        expect.objectContaining({
          enabled: true,
          source: "project",
          ownerProjectId: projectB.id,
          ownerProjectName: "Beta",
        }),
      ]);
      expect(await list(projectA.id)).toEqual([
        expect.objectContaining({
          enabled: false,
          source: "default",
          ownerProjectId: projectB.id,
          ownerProjectName: "Beta",
        }),
      ]);

      await put(projectB.id, false);
      expect(await list(projectA.id)).toEqual([
        expect.objectContaining({ enabled: false, ownerProjectId: null }),
      ]);
    });
  });
});
