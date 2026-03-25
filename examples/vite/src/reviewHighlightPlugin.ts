import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { EditorView } from 'prosemirror-view';

export const reviewHighlightKey = new PluginKey<DecorationSet>('reviewHighlight');

function createPlugin() {
  return new Plugin<DecorationSet>({
    key: reviewHighlightKey,
    state: {
      init() {
        return DecorationSet.empty;
      },
      apply(tr, old) {
        const meta = tr.getMeta(reviewHighlightKey);
        if (meta === null) return DecorationSet.empty;
        if (meta && meta instanceof DecorationSet) return meta;
        return old.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations(state) {
        return reviewHighlightKey.getState(state) as DecorationSet;
      },
    },
  });
}

export const reviewHighlightPlugin = createPlugin();

export function clearReviewHighlight(view: EditorView) {
  view.dispatch(view.state.tr.setMeta(reviewHighlightKey, null));
}

function normalizeText(s?: string) {
  return (s || '').replace(/\s+/g, '');
}

// Find paragraph ranges matching anchor text and create node decorations
export function setReviewHighlight(
  view: EditorView,
  pagedRef: { scrollToPosition: (pos: number) => void } | null,
  blockIds: string[],
  chunks: Record<string, { content?: string }>,
  result: string
) {
  if (!view) return;

  console.debug('[reviewHighlight] setReviewHighlight called', {
    blockIds,
    hasChunks: !!chunks,
    result,
  });

  const hlClass = result === '不符合' ? 'hl-fail' : 'hl-pass';
  const doc = view.state.doc;
  const decorations: Decoration[] = [];
  let firstFrom: number | null = null;

  // For each block id, find an anchor snippet and search the document for matching paragraphs
  for (const id of blockIds || []) {
    const content = chunks?.[id]?.content;
    if (!content) continue;
    const anchor = normalizeText(content.slice(0, 20));
    if (!anchor) continue;

    doc.descendants((node, pos) => {
      if (!node.isBlock || node.type.name !== 'paragraph') return true;
      const text = normalizeText(node.textContent);
      if (text.includes(anchor)) {
        console.debug('[reviewHighlight] match anchor', {
          id,
          from: pos,
          anchor,
          nodeTextSample: node.textContent.slice(0, 40),
        });
        const from = pos;
        let to = pos + node.nodeSize;
        let curPos = pos + node.nodeSize;
        while (curPos < doc.content.size) {
          const next = doc.nodeAt(curPos);
          if (!next) break;
          const nextText = normalizeText(next.textContent);
          if (/^第.{1,6}條/.test(nextText)) break;
          to = curPos + next.nodeSize;
          curPos = to;
        }
        // set class attr; include 't' prefix in case layout painter uses that class
        decorations.push(Decoration.node(from, to, { class: hlClass }));
        if (firstFrom === null) firstFrom = from;
      }
      return true;
    });
  }

  const decoSet = DecorationSet.create(view.state.doc, decorations);
  view.dispatch(view.state.tr.setMeta(reviewHighlightKey, decoSet));

  // Send diagnostic ack back to parent window (if embedded) so parent can log results
  try {
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      window.parent.postMessage(
        { type: 'HIGHLIGHT_ACK', decorations: decorations.length, firstFrom },
        '*'
      );
    }
  } catch (e) {
    // noop
  }

  // Diagnostic logs for debugging highlight application
  try {
    console.debug('[reviewHighlight] decorations:', decorations.length, 'firstFrom:', firstFrom);
    // Count matching elements in the rendered DOM (paged editor pages)
    const domMatches = document.querySelectorAll('.hl-review-fail, .hl-review-pass');
    console.debug('[reviewHighlight] dom matches:', domMatches.length);
  } catch (e) {
    // ignore when running in non-browser context
  }

  if (firstFrom !== null && pagedRef && typeof pagedRef.scrollToPosition === 'function') {
    try {
      pagedRef.scrollToPosition(firstFrom);
    } catch (e) {
      // noop
    }
  }
}

export default reviewHighlightPlugin;
