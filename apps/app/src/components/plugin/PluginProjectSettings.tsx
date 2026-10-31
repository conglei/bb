import { useQueryClient } from "@tanstack/react-query";
import { AutosavingPluginSetting } from "@/components/plugin/PluginSettings";
import { applyPluginProjectSettingsView } from "@/hooks/cache-owners/plugin-cache-owner";
import {
  updatePluginProjectSettings,
  usePluginProjectSettingsView,
} from "@/hooks/queries/plugin-settings-queries";

export function PluginProjectSettingsForm({
  pluginId,
  projectId,
}: {
  pluginId: string;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const viewQuery = usePluginProjectSettingsView({ pluginId, projectId });
  const view = viewQuery.data ?? null;
  if (view === null || Object.keys(view.schema).length === 0) return null;

  return (
    <div className="space-y-4" data-testid="plugin-project-settings-form">
      {Object.entries(view.schema).map(([key, descriptor]) => (
        <AutosavingPluginSetting
          key={key}
          descriptor={descriptor}
          mutationScopeId={`plugin-project-setting:${projectId}:${pluginId}:${key}`}
          settingKey={key}
          storedValue={view.values[key]}
          saveValue={(values) =>
            updatePluginProjectSettings(fetch, pluginId, projectId, values)
          }
          onSaved={(saved) =>
            applyPluginProjectSettingsView({
              queryClient,
              pluginId,
              projectId,
              view: saved,
            })
          }
        />
      ))}
    </div>
  );
}
