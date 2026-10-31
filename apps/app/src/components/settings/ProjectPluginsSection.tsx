import type { ProjectPluginEntry } from "@bb/server-contract";
import { Button } from "@bb/shared-ui/button";
import { Switch } from "@bb/shared-ui/switch";
import { PluginItemIcon } from "@/components/plugin/PluginIcon";
import { PluginProjectSettingsForm } from "@/components/plugin/PluginProjectSettings";
import {
  SettingsBadge,
  SettingsRow,
  SettingsRowList,
  SettingsSection,
} from "@/components/ui/settings-section";
import { useSetProjectPluginEnabled } from "@/hooks/mutations/project-mutations";
import { useProjectPlugins } from "@/hooks/queries/project-plugins-query";

const PLUGINS_DESCRIPTION =
  "Which running plugins take part in this project. A plugin turned off here hides its views, tools, skills and instructions in this project only. A project-bound plugin is on in one project at a time; turning it on here moves it from its current project.";

type SetEnabled = (enabled: boolean | null) => void;

function SingleScopeControls({
  entry,
  projectId,
  pending,
  setEnabled,
}: {
  entry: ProjectPluginEntry;
  projectId: string;
  pending: boolean;
  setEnabled: SetEnabled;
}) {
  if (entry.ownerProjectId === projectId) {
    return (
      <>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setEnabled(null)}
        >
          Turn off
        </Button>
        <Switch
          checked
          disabled={pending}
          aria-label={`Use ${entry.name} in this project`}
          onCheckedChange={(checked) => {
            if (!checked) setEnabled(null);
          }}
        />
      </>
    );
  }
  if (entry.ownerProjectId !== null) {
    return (
      <>
        <span className="text-sm text-muted-foreground">
          On in project {entry.ownerProjectName ?? entry.ownerProjectId}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => setEnabled(true)}
        >
          Move here
        </Button>
      </>
    );
  }
  return (
    <>
      <span className="text-sm text-muted-foreground">Off everywhere</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => setEnabled(true)}
      >
        Turn on here
      </Button>
    </>
  );
}

function AnyScopeControls({
  entry,
  pending,
  setEnabled,
}: {
  entry: ProjectPluginEntry;
  pending: boolean;
  setEnabled: SetEnabled;
}) {
  return (
    <>
      {entry.source === "project" ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setEnabled(null)}
        >
          Reset to default
        </Button>
      ) : null}
      <Switch
        checked={entry.enabled}
        disabled={pending}
        aria-label={`Use ${entry.name} in this project`}
        onCheckedChange={(checked) => setEnabled(checked)}
      />
    </>
  );
}

export function ProjectPluginsSection({ projectId }: { projectId: string }) {
  const pluginsQuery = useProjectPlugins({ projectId });
  const setEnabled = useSetProjectPluginEnabled();
  const entries = pluginsQuery.data ?? [];
  const pendingPluginId = setEnabled.isPending
    ? setEnabled.variables?.pluginId
    : undefined;

  return (
    <SettingsSection title="Plugins" description={PLUGINS_DESCRIPTION}>
      {pluginsQuery.isError ? (
        <p className="text-sm text-destructive" role="alert">
          Couldn't load the project's plugins.
        </p>
      ) : pluginsQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No plugins are running.</p>
      ) : (
        <SettingsRowList>
          {entries.map((entry) => {
            const pending = pendingPluginId === entry.pluginId;
            const setEntryEnabled: SetEnabled = (enabled) =>
              setEnabled.mutate({
                projectId,
                pluginId: entry.pluginId,
                enabled,
              });
            const ownedHere =
              entry.scope === "single" && entry.ownerProjectId === projectId;
            return (
              <div key={entry.pluginId} className="py-2.5 first:pt-0 last:pb-0">
                <SettingsRow
                  className="py-0 first:pt-0 last:pb-0"
                  data-testid="project-plugin-row"
                >
                  <PluginItemIcon
                    pluginId={entry.pluginId}
                    icon={entry.icon}
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="min-w-0 truncate">{entry.name}</span>
                    {entry.scope === "single" ? (
                      <SettingsBadge>
                        {ownedHere ? "on in this project" : "project-bound"}
                      </SettingsBadge>
                    ) : entry.source === "project" ? (
                      <SettingsBadge>project override</SettingsBadge>
                    ) : null}
                  </div>
                  {entry.scope === "single" ? (
                    <SingleScopeControls
                      entry={entry}
                      projectId={projectId}
                      pending={pending}
                      setEnabled={setEntryEnabled}
                    />
                  ) : (
                    <AnyScopeControls
                      entry={entry}
                      pending={pending}
                      setEnabled={setEntryEnabled}
                    />
                  )}
                </SettingsRow>
                {entry.enabled && entry.hasProjectSettings ? (
                  <div className="mt-3 pl-7">
                    <PluginProjectSettingsForm
                      pluginId={entry.pluginId}
                      projectId={projectId}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </SettingsRowList>
      )}
    </SettingsSection>
  );
}
