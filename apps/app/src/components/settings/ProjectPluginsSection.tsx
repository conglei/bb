import { Button } from "@bb/shared-ui/button";
import { Switch } from "@bb/shared-ui/switch";
import { PluginItemIcon } from "@/components/plugin/PluginIcon";
import {
  SettingsBadge,
  SettingsRow,
  SettingsRowList,
  SettingsSection,
} from "@/components/ui/settings-section";
import { useSetProjectPluginEnabled } from "@/hooks/mutations/project-mutations";
import { useProjectPlugins } from "@/hooks/queries/project-plugins-query";

const PLUGINS_DESCRIPTION =
  "Which running plugins take part in this project. A plugin turned off here hides its views, tools, skills and instructions in this project only.";

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
            return (
              <SettingsRow
                key={entry.pluginId}
                data-testid="project-plugin-row"
              >
                <PluginItemIcon
                  pluginId={entry.pluginId}
                  icon={entry.icon}
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="min-w-0 truncate">{entry.name}</span>
                  {entry.source === "project" ? (
                    <SettingsBadge>project override</SettingsBadge>
                  ) : null}
                </div>
                {entry.source === "project" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      setEnabled.mutate({
                        projectId,
                        pluginId: entry.pluginId,
                        enabled: null,
                      })
                    }
                  >
                    Reset to default
                  </Button>
                ) : null}
                <Switch
                  checked={entry.enabled}
                  disabled={pending}
                  aria-label={`Use ${entry.name} in this project`}
                  onCheckedChange={(checked) =>
                    setEnabled.mutate({
                      projectId,
                      pluginId: entry.pluginId,
                      enabled: checked,
                    })
                  }
                />
              </SettingsRow>
            );
          })}
        </SettingsRowList>
      )}
    </SettingsSection>
  );
}
