import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { MarkdownProps } from "@get-bb/plugin-sdk";
import {
  MarkdownPreview,
  type MarkdownThreadMentions,
} from "@/components/ui/markdown-preview";
import {
  buildCodeFenceRendererRegistry,
  CodeFenceRendererHost,
} from "@/components/ui/markdown-code-fence-renderers";
import type { MarkdownLinkRouting } from "@/components/ui/markdown-link-routing";
import { buildMarkdownDocumentLinkRouting } from "@/components/ui/markdown-document-link-routing";
import { buildMarkdownMessageLinkRouting } from "@/components/ui/markdown-message-link-routing";
import type { MarkdownPreviewLinkHandler } from "@/components/ui/markdown-link";
import { useThreadTimelineNavigation } from "@/components/thread/timeline/ThreadTimelineNavigationContext";
import { useAppNavigationHost } from "@/lib/app-navigation-host";
import {
  EMPTY_PLUGIN_SLOT_SNAPSHOT,
  getPluginSlotSnapshot,
  subscribePluginSlots,
} from "@/lib/plugin-slots";

const PLUGIN_MARKDOWN_THREAD_MENTIONS: MarkdownThreadMentions = {
  mentions: [],
  preserveSoftBreaks: false,
};

export function PluginMarkdown({
  content,
  className,
  experimental_document,
  experimental_codeFences,
}: MarkdownProps) {
  const timelineNavigation = useThreadTimelineNavigation();
  const onOpenLocalFileLink = timelineNavigation?.onOpenLocalFileLink;
  const threadId = timelineNavigation?.threadId;
  const workspaceRootPath = timelineNavigation?.workspaceRootPath;
  const navigation = useAppNavigationHost();
  const onOpenLink = useCallback<MarkdownPreviewLinkHandler>(
    ({ href }) => navigation.openUrl({ url: href }),
    [navigation],
  );
  const linkRouting = useMemo<MarkdownLinkRouting>(() => {
    const messageRouting = buildMarkdownMessageLinkRouting({
      onOpenLink,
      onOpenLocalFileLink,
      threadId,
      workspaceRootPath,
    }) ?? { onOpenLink };
    return experimental_document === undefined
      ? messageRouting
      : buildMarkdownDocumentLinkRouting({
          document: experimental_document,
          messageRouting,
          openFilePreview: navigation.openFilePreview,
        });
  }, [
    experimental_document,
    navigation.openFilePreview,
    onOpenLink,
    onOpenLocalFileLink,
    threadId,
    workspaceRootPath,
  ]);
  const codeFenceRendererSlots = useSyncExternalStore(
    subscribePluginSlots,
    () => getPluginSlotSnapshot().codeFenceRenderers,
    () => EMPTY_PLUGIN_SLOT_SNAPSHOT.codeFenceRenderers,
  );
  const codeFenceRendererRegistry = useMemo(
    () =>
      experimental_codeFences === undefined
        ? null
        : buildCodeFenceRendererRegistry(codeFenceRendererSlots),
    [codeFenceRendererSlots, experimental_codeFences],
  );
  const codeFenceMessage = useMemo(
    () =>
      experimental_codeFences === undefined
        ? null
        : {
            id: experimental_codeFences.id,
            threadId: experimental_codeFences.threadId,
            turnId: experimental_codeFences.turnId ?? null,
            projectId: experimental_codeFences.projectId ?? null,
          },
    [experimental_codeFences],
  );

  const markdown = (
    <MarkdownPreview
      allowHtml
      content={content}
      className={className}
      linkRouting={linkRouting}
      threadMentions={PLUGIN_MARKDOWN_THREAD_MENTIONS}
    />
  );
  if (
    codeFenceRendererRegistry === null ||
    codeFenceRendererRegistry.size === 0 ||
    codeFenceMessage === null
  ) {
    return markdown;
  }
  return (
    <CodeFenceRendererHost
      registry={codeFenceRendererRegistry}
      message={codeFenceMessage}
      streaming={false}
    >
      {markdown}
    </CodeFenceRendererHost>
  );
}
