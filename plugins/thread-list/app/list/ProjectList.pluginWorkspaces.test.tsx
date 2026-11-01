// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { afterEach, describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  installTestPluginRuntime,
  renderSlot,
} from "@get-bb/plugin-sdk/testing/app";
import {
  makePluginProject,
  makeSidebarThread,
  sdkResult,
} from "../model/fixtures.js";
import { preferencesReadyAtom } from "../preferences/preferences-sync.js";
import { sidebarOrganizationModeAtom } from "../preferences/atoms.js";

installTestPluginRuntime();

const { ProjectList } = await import("./ProjectList.js");
const { resetSidebarDataCacheForTest } =
  await import("../model/use-sidebar-data.js");

afterEach(() => {
  cleanup();
  resetSidebarDataCacheForTest();
});

function Harness({
  children,
  store,
}: {
  children: ReactNode;
  store: ReturnType<typeof createStore>;
}) {
  return (
    <TooltipProvider>
      <Provider store={store}>{children}</Provider>
    </TooltipProvider>
  );
}

function renderProjects() {
  const store = createStore();
  store.set(preferencesReadyAtom(), true);
  store.set(sidebarOrganizationModeAtom, "project");
  return renderSlot(
    { component: Harness },
    { children: <ProjectList activeThreadId={null} />, store },
    {
      sidebarThreads: {
        threads: [
          makeSidebarThread({ id: "thr_kept", projectId: "proj_kept" }),
          makeSidebarThread({ id: "thr_castro", projectId: "proj_castro" }),
        ],
        projects: [
          makePluginProject({
            id: "proj_kept",
            name: "Kept workspace",
            experimental_ownerPlugin: { id: "kept", name: "Kept", icon: null },
          }),
          makePluginProject({ id: "proj_castro", name: "Castro Coffee" }),
          makePluginProject({
            id: "proj_personal",
            name: "Personal",
            isPersonal: true,
          }),
        ],
        sections: [],
      },
      sdk: {
        threads: { update: sdkResult({ ok: true }) },
      },
    },
  );
}

describe("plugin workspaces in the project list", () => {
  it("lists them after the user's projects under the plugin's name", () => {
    const rendered = renderProjects();
    const projectIds = Array.from(
      rendered.container.querySelectorAll<HTMLElement>(
        "[data-sidebar-project-id]",
      ),
    ).map((element) => element.dataset.sidebarProjectId);
    expect(projectIds).toEqual(["proj_castro", "proj_kept"]);
    const workspaces = rendered.container.querySelector(
      "[data-sidebar-plugin-workspaces]",
    );
    expect(workspaces).not.toBeNull();
    expect(
      workspaces?.querySelector("[data-sidebar-project-id='proj_kept']"),
    ).not.toBeNull();
    expect(screen.getByText("Kept")).toBeTruthy();
    expect(screen.queryByText("Kept workspace")).toBeNull();
  });
});
