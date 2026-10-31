import { describe, expect, it } from "vitest";
import { readJson } from "../helpers/json.js";
import { seedHostSession, seedProjectWithSource } from "../helpers/seed.js";
import { withTestHarness, type TestAppHarness } from "../helpers/test-app.js";

function patchProject(
  app: TestAppHarness["app"],
  projectId: string,
  body: unknown,
) {
  return app.request(`/api/v1/projects/${projectId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("public project icon", () => {
  it("sets, keeps, and clears the project icon through the update route", async () => {
    await withTestHarness(async (harness) => {
      const { host } = seedHostSession(harness.deps, { id: "host-icon" });
      const { project } = seedProjectWithSource(harness.deps, {
        hostId: host.id,
      });

      const set = await patchProject(harness.app, project.id, {
        icon: "Beaker",
      });
      expect(set.status).toBe(200);
      expect(await readJson(set)).toMatchObject({
        id: project.id,
        icon: "Beaker",
      });

      const renamed = await patchProject(harness.app, project.id, {
        name: "Renamed",
      });
      expect(await readJson(renamed)).toMatchObject({
        name: "Renamed",
        icon: "Beaker",
      });

      const listed = await harness.app.request("/api/v1/projects");
      expect(await readJson(listed)).toMatchObject([
        { id: project.id, icon: "Beaker" },
      ]);

      const cleared = await patchProject(harness.app, project.id, {
        icon: null,
      });
      expect(cleared.status).toBe(200);
      expect(await readJson(cleared)).toMatchObject({ icon: null });
    });
  });

  it("rejects icon names that are not plain bb icon names", async () => {
    await withTestHarness(async (harness) => {
      const { host } = seedHostSession(harness.deps, { id: "host-icon-bad" });
      const { project } = seedProjectWithSource(harness.deps, {
        hostId: host.id,
      });

      for (const icon of ["", "Not an icon", "<svg>", "a".repeat(65)]) {
        const response = await patchProject(harness.app, project.id, { icon });
        expect(response.status).toBe(400);
      }
      const empty = await patchProject(harness.app, project.id, {});
      expect(empty.status).toBe(400);

      const show = await harness.app.request(`/api/v1/projects/${project.id}`);
      expect(await readJson(show)).toMatchObject({ icon: null });
    });
  });
});
