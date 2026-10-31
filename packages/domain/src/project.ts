import { z } from "zod";

export const PERSONAL_PROJECT_ID = "proj_personal";

const projectKindValues = ["standard", "personal"] as const;
const projectKindSchema = z.enum(projectKindValues);
export type ProjectKind = z.infer<typeof projectKindSchema>;

export const PROJECT_ICON_NAME_PATTERN = /^[A-Za-z0-9]+$/;
export const PROJECT_ICON_NAME_MAX_LENGTH = 64;

export const projectIconNameSchema = z
  .string()
  .min(1)
  .max(PROJECT_ICON_NAME_MAX_LENGTH)
  .regex(
    PROJECT_ICON_NAME_PATTERN,
    "Project icon must be a bb icon name (letters and digits only)",
  );

export const projectSchema = z.object({
  id: z.string(),
  kind: projectKindSchema,
  name: z.string(),
  icon: projectIconNameSchema.nullable(),
  gitRemoteUrl: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Project = z.infer<typeof projectSchema>;

const projectSourceTypeValues = ["local_path"] as const;
const projectSourceTypeSchema = z.enum(projectSourceTypeValues);
export type ProjectSourceType = z.infer<typeof projectSourceTypeSchema>;

const baseProjectSourceSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  isDefault: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const localPathProjectSourceSchema = baseProjectSourceSchema.extend({
  type: z.literal("local_path"),
  hostId: z.string(),
  path: z.string(),
});
export type LocalPathProjectSource = z.infer<
  typeof localPathProjectSourceSchema
>;

export const projectSourceSchema = localPathProjectSourceSchema;
export type ProjectSource = z.infer<typeof projectSourceSchema>;

export function isLocalPathProjectSource(
  source: ProjectSource,
): source is LocalPathProjectSource {
  return source.type === "local_path";
}

export function findLocalPathProjectSourceForHost(
  sources: readonly ProjectSource[],
  hostId: string,
): LocalPathProjectSource | undefined {
  return sources.find(
    (source): source is LocalPathProjectSource =>
      source.type === "local_path" && source.hostId === hostId,
  );
}
