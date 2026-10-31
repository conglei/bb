// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectPluginEntry } from "@bb/server-contract";
import { createQueryClientTestHarness } from "@/test/queryClientTestHarness";
import { pluginProjectSettingsViewQueryKey } from "@/hooks/queries/query-keys";
import { PluginProjectSettingsForm } from "./PluginProjectSettings";
import { ProjectPluginsSection } from "@/components/settings/ProjectPluginsSection";
import { sdk } from "@/lib/sdk";

vi.mock("@/lib/sdk", () => ({
  sdk: {
    projects: {
      plugins: { list: vi.fn(), set: vi.fn() },
    },
  },
}));

vi.mock("@/lib/ws", () => ({
  wsManager: { subscribe: vi.fn(), unsubscribe: vi.fn() },
}));

interface RecordedRequest {
  url: string;
  init: RequestInit | undefined;
}

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const PROJECT_VIEW = {
  ok: true,
  schema: {
    goal: { type: "string", label: "Goal" },
    autoTriage: {
      type: "boolean",
      label: "Triage new threads",
      default: false,
    },
  },
  values: { goal: "ship", autoTriage: false },
};

function stubProjectSettingsFetch(): RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, init });
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as {
          values: Record<string, unknown>;
        };
        return jsonOk({
          ...PROJECT_VIEW,
          values: { ...PROJECT_VIEW.values, ...body.values },
        });
      }
      return jsonOk(PROJECT_VIEW);
    }),
  );
  return requests;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("PluginProjectSettingsForm", () => {
  it("loads the project's values and autosaves through the project route", async () => {
    const requests = stubProjectSettingsFetch();
    const { wrapper, queryClient } = createQueryClientTestHarness();
    render(<PluginProjectSettingsForm pluginId="kept" projectId="proj_1" />, {
      wrapper,
    });

    const goal = (await screen.findByLabelText("Goal")) as HTMLInputElement;
    expect(goal.value).toBe("ship");
    expect(requests[0]?.url).toBe(
      "/api/v1/plugins/kept/projects/proj_1/settings",
    );

    fireEvent.change(goal, { target: { value: "ship faster" } });
    fireEvent.blur(goal);
    const put = await vi.waitFor(() => {
      const request = requests.find(
        (candidate) => candidate.init?.method === "PUT",
      );
      expect(request).toBeDefined();
      return request;
    });
    expect(put?.url).toBe("/api/v1/plugins/kept/projects/proj_1/settings");
    expect(JSON.parse(String(put?.init?.body))).toEqual({
      values: { goal: "ship faster" },
    });
    await vi.waitFor(() =>
      expect(
        queryClient.getQueryData(
          pluginProjectSettingsViewQueryKey("proj_1", "kept"),
        ),
      ).toEqual({
        schema: PROJECT_VIEW.schema,
        values: { goal: "ship faster", autoTriage: false },
      }),
    );

    fireEvent.click(screen.getByRole("switch", { name: "Triage new threads" }));
    await vi.waitFor(() =>
      expect(
        requests.filter((candidate) => candidate.init?.method === "PUT"),
      ).toHaveLength(2),
    );
    expect(JSON.parse(String(requests.at(-1)?.init?.body))).toEqual({
      values: { autoTriage: true },
    });
  });

  it("renders nothing when the plugin has no project settings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: false, error: "none" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const { wrapper } = createQueryClientTestHarness();
    const { container } = render(
      <PluginProjectSettingsForm pluginId="plain" projectId="proj_1" />,
      { wrapper },
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});

describe("ProjectPluginsSection project settings", () => {
  it("shows the form only under plugins that are on for the project and define project settings", async () => {
    stubProjectSettingsFetch();
    const entries: ProjectPluginEntry[] = [
      {
        pluginId: "kept",
        name: "Kept",
        icon: null,
        enabled: true,
        source: "project",
        hasProjectSettings: true,
      },
      {
        pluginId: "notes",
        name: "Notes",
        icon: null,
        enabled: false,
        source: "default",
        hasProjectSettings: true,
      },
      {
        pluginId: "git",
        name: "Git",
        icon: "GitBranch",
        enabled: true,
        source: "default",
        hasProjectSettings: false,
      },
    ];
    vi.mocked(sdk.projects.plugins.list).mockResolvedValue(entries);
    const { wrapper } = createQueryClientTestHarness();
    render(<ProjectPluginsSection projectId="proj_1" />, { wrapper });

    await screen.findByRole("switch", { name: "Use Kept in this project" });
    expect(
      await screen.findAllByTestId("plugin-project-settings-form"),
    ).toHaveLength(1);
    expect(screen.getByLabelText("Goal")).toBeDefined();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      "/api/v1/plugins/kept/projects/proj_1/settings",
    );
  });
});
