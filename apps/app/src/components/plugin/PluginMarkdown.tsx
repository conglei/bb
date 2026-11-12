import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { MarkdownProps } from "@get-bb/plugin-sdk";
import { getEnvironmentFilePreviewSourceAtRef } from "@bb/client-core";
import { normalizeAbsoluteFilePath } from "@bb/shared-ui/lib/absolute-file-path";
import {
  MarkdownPreview,
  type MarkdownThreadMentions,
} from "@/components/ui/markdown-preview";
import { buildMarkdownFileRouting } from "@/components/ui/markdown-file-routing";
import {
  buildCodeFenceRendererRegistry,
  CodeFenceRendererHost,
} from "@/components/ui/markdown-code-fence-renderers";
import {
  useMessageLinkRouting,
  useThreadTimelineNavigation,
} from "@/components/thread/timeline/ThreadTimelineNavigationContext";
import { useAppNavigationHost } from "@/lib/app-navigation-host";
import {
  EMPTY_PLUGIN_SLOT_SNAPSHOT,
  getPluginSlotSnapshot,
  subscribePluginSlots,
} from "@/lib/plugin-slots";
import {
  buildEnvironmentFileContentUrl,
  buildThreadStorageRawContentUrl,
} from "@/lib/file-content-urls";
import { normalizeExperimentalLiveFileTarget } from "@/lib/live-file-navigation";
import { useLocalFileLinkOpener } from "@/hooks/useLocalFileLinkOpener";
import { useResolvedLiveFileRoot } from "@/hooks/useResolvedLiveFileTarget";

const PLUGIN_MARKDOWN_THREAD_MENTIONS: MarkdownThreadMentions = {
  mentions: [],
  preserveSoftBreaks: false,
};

function parsePluginMarkdownDocument(
  document: NonNullable<MarkdownProps["experimental_document"]>,
) {
  const target = normalizeExperimentalLiveFileTarget(document.target);
  const threadId: unknown = document.threadId;
  const documentRootPath: unknown = document.rootPath;
  const rootPath =
    typeof documentRootPath === "string"
      ? normalizeAbsoluteFilePath({ path: documentRootPath })
      : null;
  if (
    target === null ||
    target.kind === "host" ||
    rootPath === null ||
    typeof threadId !== "string" ||
    !threadId.trim() ||
    (target.kind === "thread-storage" && target.threadId !== threadId)
  ) {
    return null;
  }
  return { rootPath, target, threadId };
}

type PluginMarkdownDocument = NonNullable<
  ReturnType<typeof parsePluginMarkdownDocument>
>;

function usePluginMarkdownMessageRouting() {
  return useMessageLinkRouting(useThreadTimelineNavigation()?.threadId);
}

function PluginDocumentMarkdown({
  className,
  content,
  document,
}: Pick<MarkdownProps, "className" | "content"> & {
  document: PluginMarkdownDocument;
}) {
  const messageRouting = usePluginMarkdownMessageRouting();
  const navigation = useAppNavigationHost();
  const { rootPath, target, threadId } = document;
  const root = useResolvedLiveFileRoot(target);
  const hostId = root.status === "available" ? root.hostId : null;
  const { openLink } = useLocalFileLinkOpener({
    canOpenInEditor: true,
    hostId,
    openFilePreview: navigation.openFilePreview,
    threadStorage:
      target.kind === "thread-storage" ? { rootPath, threadId } : null,
    workspace:
      target.kind === "workspace"
        ? {
            environmentId: target.environmentId,
            rootPath,
            ...(target.experimental_ref === undefined
              ? {}
              : { experimental_ref: target.experimental_ref }),
          }
        : null,
  });
  const linkRouting = useMemo(
    () =>
      buildMarkdownFileRouting({
        hostId,
        path: target.path,
        rootPath,
        threadId,
        resolveRelativeSrc: (path) =>
          target.kind === "workspace"
            ? buildEnvironmentFileContentUrl(
                target.environmentId,
                getEnvironmentFilePreviewSourceAtRef(target.experimental_ref),
                path,
              )
            : buildThreadStorageRawContentUrl(threadId, path),
        openLink,
        openOutsideRoot: messageRouting?.localFile?.onOpenLink ?? (() => false),
      }),
    [hostId, messageRouting, openLink, rootPath, target, threadId],
  );
  return (
    <MarkdownPreview
      allowHtml
      content={content}
      className={className}
      linkRouting={linkRouting}
      threadMentions={PLUGIN_MARKDOWN_THREAD_MENTIONS}
    />
  );
}

function PluginMarkdownCodeFences({
  children,
  codeFences,
}: {
  children: ReactNode;
  codeFences: MarkdownProps["experimental_codeFences"];
}) {
  const codeFenceRendererSlots = useSyncExternalStore(
    subscribePluginSlots,
    () => getPluginSlotSnapshot().codeFenceRenderers,
    () => EMPTY_PLUGIN_SLOT_SNAPSHOT.codeFenceRenderers,
  );
  const codeFenceRendererRegistry = useMemo(
    () =>
      codeFences === undefined
        ? null
        : buildCodeFenceRendererRegistry(codeFenceRendererSlots),
    [codeFenceRendererSlots, codeFences],
  );
  const codeFenceMessage = useMemo(
    () =>
      codeFences === undefined
        ? null
        : {
            id: codeFences.id,
            threadId: codeFences.threadId,
            turnId: codeFences.turnId ?? null,
            projectId: codeFences.projectId ?? null,
          },
    [codeFences],
  );
  if (
    codeFenceRendererRegistry === null ||
    codeFenceRendererRegistry.size === 0 ||
    codeFenceMessage === null
  ) {
    return children;
  }
  return (
    <CodeFenceRendererHost
      registry={codeFenceRendererRegistry}
      message={codeFenceMessage}
      streaming={false}
    >
      {children}
    </CodeFenceRendererHost>
  );
}

export function PluginMarkdown({
  content,
  className,
  experimental_document,
  experimental_codeFences,
}: MarkdownProps) {
  const messageRouting = usePluginMarkdownMessageRouting();
  const document = useMemo(
    () =>
      experimental_document === undefined
        ? undefined
        : parsePluginMarkdownDocument(experimental_document),
    [experimental_document],
  );
  return (
    <PluginMarkdownCodeFences codeFences={experimental_codeFences}>
      {document ? (
        <PluginDocumentMarkdown
          className={className}
          content={content}
          document={document}
        />
      ) : (
        <MarkdownPreview
          allowHtml
          content={content}
          className={className}
          linkRouting={document === null ? {} : messageRouting}
          threadMentions={PLUGIN_MARKDOWN_THREAD_MENTIONS}
        />
      )}
    </PluginMarkdownCodeFences>
  );
}
