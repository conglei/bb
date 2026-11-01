import { z } from "zod";
import { uiCodeThemeDeclarationSchema } from "./code-theme.js";
import {
  isNamespacedGlyph,
  isPluginOwnedIconPath,
  PLUGIN_ICON_NAME_MAX_LENGTH,
  PLUGIN_ICON_NAME_PATTERN,
  PLUGIN_ICONS_MAX_COUNT,
} from "./plugin-icon.js";

const requiredManifestString = z.string().trim().min(1);

const pluginBrandingIconsSchema = z
  .record(
    z
      .string()
      .max(
        PLUGIN_ICON_NAME_MAX_LENGTH,
        `icon names are at most ${PLUGIN_ICON_NAME_MAX_LENGTH} characters`,
      )
      .regex(
        PLUGIN_ICON_NAME_PATTERN,
        'icon names use lowercase letters, digits and "-", starting with a letter or digit',
      ),
    requiredManifestString.refine(
      (path) =>
        isPluginOwnedIconPath(path) && path.toLowerCase().endsWith(".svg"),
      {
        message:
          'icon paths are plugin-relative .svg files starting with "./" (for example "./icons/receipt.svg")',
      },
    ),
  )
  .refine((icons) => Object.keys(icons).length <= PLUGIN_ICONS_MAX_COUNT, {
    message: `a plugin declares at most ${PLUGIN_ICONS_MAX_COUNT} icons`,
  });

const pluginBrandingSchema = z
  .object({
    icon: requiredManifestString.optional(),
    logo: z
      .object({
        light: requiredManifestString,
        dark: requiredManifestString.optional(),
      })
      .strict()
      .optional(),
    experimental_icons: pluginBrandingIconsSchema.optional(),
  })
  .strict()
  .superRefine((branding, context) => {
    if (
      branding.icon !== undefined &&
      isPluginOwnedIconPath(branding.icon) &&
      !branding.icon.toLowerCase().endsWith(".svg")
    ) {
      context.addIssue({
        code: "custom",
        path: ["icon"],
        message:
          'plugin-owned branding.icon paths must point at an .svg file (for example "./assets/icon.svg")',
      });
    }
    if (branding.icon !== undefined && isNamespacedGlyph(branding.icon)) {
      context.addIssue({
        code: "custom",
        path: ["icon"],
        message: `"${branding.icon}" is a namespaced glyph ("<pluginId>/<name>"), which names a declared icon from a tool presentation or a provider declaration; branding.icon is the plugin's own mark, so name a host glyph ("Zap") or the SVG file itself ("./icons/logo.svg")`,
      });
    }
  })
  .refine(
    (branding) => branding.icon !== undefined || branding.logo !== undefined,
    {
      message: "must declare at least branding.icon or branding.logo.light",
    },
  );

export const pluginProjectDefaultSchema = z.enum(["on", "off"]);
export type PluginProjectDefault = z.infer<typeof pluginProjectDefaultSchema>;

export const pluginProjectScopeSchema = z.enum(["any", "single"]);
export type PluginProjectScope = z.infer<typeof pluginProjectScopeSchema>;

export const pluginWorkspaceManifestSchema = z
  .object({
    seed: requiredManifestString.optional(),
    name: requiredManifestString.optional(),
  })
  .strict();
export type PluginWorkspaceManifest = z.infer<
  typeof pluginWorkspaceManifestSchema
>;

const pluginBbManifestSchema = z
  .object({
    name: requiredManifestString,
    description: requiredManifestString,
    branding: pluginBrandingSchema,
    experimental_providers: z
      .array(
        z
          .object({
            kind: z.enum(["agent"]),
            id: requiredManifestString,
            displayName: requiredManifestString,
          })
          .strict(),
      )
      .optional(),
    experimental_projectDefault: pluginProjectDefaultSchema.optional(),
    experimental_projectScope: pluginProjectScopeSchema.optional(),
    experimental_workspace: pluginWorkspaceManifestSchema.optional(),
    server: requiredManifestString,
    app: requiredManifestString.optional(),
    host: requiredManifestString.optional(),
    skills: z.array(requiredManifestString).optional(),
    themes: z
      .array(
        z
          .object({
            id: z
              .string()
              .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
              .max(64),
            name: requiredManifestString,
            description: requiredManifestString.optional(),
            css: requiredManifestString,
            codeTheme: uiCodeThemeDeclarationSchema.optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict()
  .superRefine((bb, context) => {
    if (
      bb.experimental_projectScope === "single" &&
      bb.experimental_projectDefault === "on"
    ) {
      context.addIssue({
        code: "custom",
        path: ["experimental_projectDefault"],
        message:
          'experimental_projectScope "single" gives the plugin a workspace of its own and defaults it off in other projects; drop experimental_projectDefault or set it to "off"',
      });
    }
  });

export const pluginPackageJsonSchema = z
  .object({
    name: requiredManifestString,
    version: requiredManifestString,
    engines: z
      .object({
        bb: requiredManifestString.optional(),
        bbPluginSdk: requiredManifestString.optional(),
      })
      .optional(),
    bb: pluginBbManifestSchema,
  })
  .passthrough();

export type PluginPackageJson = z.infer<typeof pluginPackageJsonSchema>;
