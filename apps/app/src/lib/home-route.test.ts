import { describe, expect, it } from "vitest";
import { resolveHomeRoute } from "./home-route";

describe("resolveHomeRoute", () => {
  it("opens the chosen project's page on its default view", () => {
    expect(
      resolveHomeRoute({
        homeProjectId: "proj_kept",
        projectIds: new Set(["proj_kept", "proj_app"]),
      }),
    ).toEqual({ path: "/projects/proj_kept/views", projectId: "proj_kept" });
  });

  it("falls back to the new-thread screen without a choice, before projects load, or when the project is gone", () => {
    const compose = { path: "/", projectId: null };
    expect(
      resolveHomeRoute({ homeProjectId: null, projectIds: new Set(["proj_app"]) }),
    ).toEqual(compose);
    expect(
      resolveHomeRoute({ homeProjectId: "proj_kept", projectIds: null }),
    ).toEqual(compose);
    expect(
      resolveHomeRoute({
        homeProjectId: "proj_gone",
        projectIds: new Set(["proj_app"]),
      }),
    ).toEqual(compose);
  });
});
