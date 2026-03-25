# Review Highlight Feature — GitHub Copilot 開發 Todolist

> 目標：點擊右側審核卡片時，左側 docx-editor 對應條文範圍以純 UI 方式高亮（不修改文件內容），並自動捲動到該位置。

---

## 背景說明（給 Copilot 的上下文）

- 專案路徑：`D:\git\docviewer`
- 頁面入口：`examples/vite/public/annotation.html`
- 左側 editor：`examples/vite/src/App.tsx`，使用 `@eigenpal/docx-js-editor` 套件，底層為 ProseMirror
- 左側 editor 透過 `<iframe src="/?embed=1">` 嵌入在 annotation.html 中
- 右側卡片資料結構：每張卡有 `block_ids`（如 `"7"` 或 `"5,6"`），對應 `contract_chunks` 的 key
- `contract_chunks[id].content` 是該條款的完整文字內容
- 高亮必須是**純 UI 層**（ProseMirror Decoration），不寫入文件、存檔不保留

### 關鍵 API（已確認可用）

```typescript
// DocxEditorRef（editorRef.current）
editorRef.current.getEditorRef()          // → PagedEditorRef

// PagedEditorRef
pagedRef.getView()                         // → EditorView（ProseMirror）
pagedRef.getState()                        // → EditorState
pagedRef.dispatch(tr)                      // → 套用 transaction
pagedRef.scrollToPosition(pmPos: number)   // → 捲動到指定 PM 位置

// PagedEditorProps
externalPlugins?: Plugin[]                 // → 掛入外部 ProseMirror plugin
```

---

## Task 1：新增 `reviewHighlightPlugin.ts`

**檔案路徑：** `examples/vite/src/reviewHighlightPlugin.ts`

### 1-1 定義 PluginKey

```typescript
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { EditorView } from 'prosemirror-view';

export const reviewHighlightKey = new PluginKey<DecorationSet>('reviewHighlight');
```

### 1-2 建立 ProseMirror Plugin（export `reviewHighlightPlugin`）

建立一個 plugin，其 state 持有 `DecorationSet`：

- `init`：回傳 `DecorationSet.empty`
- `apply(tr, old)`：
  - 取 `tr.getMeta(reviewHighlightKey)`
  - 若值為 `DecorationSet` → 回傳新的
  - 若值為 `null`（代表清除）→ 回傳 `DecorationSet.empty`
  - 否則 → `old.map(tr.mapping, tr.doc)`（跟著文件變動，高亮不消失）
- `props.decorations(state)`：回傳 `reviewHighlightKey.getState(state)`

### 1-3 實作 `setReviewHighlight` 函式

```typescript
export function setReviewHighlight(
  view: EditorView,
  pagedRef: { scrollToPosition: (pos: number) => void },
  blockIds: string[],
  chunks: Record<string, { content: string }>,
  result: string // '不符合' | '符合'
): void;
```

邏輯步驟：

1. 決定 CSS class：
   - `result === '不符合'` → `'hl-review-fail'`
   - 其他 → `'hl-review-pass'`

2. 對每個 `blockId`，執行文字搜尋：
   - 取 `chunks[blockId]?.content`，若無則跳過
   - 取 content **前 20 個字**，去除所有空白後作為 `anchorText`
   - 走訪 `view.state.doc`，使用 `doc.forEach((node, pos) => { ... })`
   - 對每個段落節點（`node.type.name === 'paragraph'`）：
     - 取 `node.textContent.replace(/\s/g, '')` 作為 `normalizedText`
     - 若 `normalizedText.includes(anchorText)` → 命中
     - 命中後，記錄此段落 `pos`（起點），並繼續往下掃直到下一個包含新 `article_no` 文字（如「第X條」）的段落為止
     - 將範圍內所有段落的 `[pos, pos + node.nodeSize]` 加入清單

3. 對每個命中範圍建立：

   ```typescript
   Decoration.node(from, to, { class: hlClass });
   ```

4. 組合 DecorationSet：

   ```typescript
   const decoSet = DecorationSet.create(view.state.doc, allDecorations);
   ```

5. 套用：

   ```typescript
   view.dispatch(view.state.tr.setMeta(reviewHighlightKey, decoSet));
   ```

6. 取第一個 `from` 位置捲動：
   ```typescript
   if (firstPos !== null) pagedRef.scrollToPosition(firstPos);
   ```

### 1-4 實作 `clearReviewHighlight` 函式

```typescript
export function clearReviewHighlight(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(reviewHighlightKey, null));
}
```

---

## Task 2：修改 `App.tsx`

**檔案路徑：** `examples/vite/src/App.tsx`

### 2-1 Import 新模組

在檔案頂部加入：

```typescript
import {
  reviewHighlightPlugin,
  setReviewHighlight,
  clearReviewHighlight,
} from './reviewHighlightPlugin';
```

### 2-2 確認 `externalPlugins` prop 是否可用

先在 `DocxEditor.tsx` 搜尋 `externalPlugins`：

- **若已有** → 直接在 `<DocxEditor>` 加 `externalPlugins={[reviewHighlightPlugin]}`
- **若沒有** → 先完成 Task 4 再回來

### 2-3 在 `<DocxEditor>` 加入 plugin

```tsx
<DocxEditor
  ref={editorRef}
  // ... 其他原有 props 不變 ...
  externalPlugins={[reviewHighlightPlugin]} // ← 新增這行
/>
```

### 2-4 新增 postMessage 監聽 useEffect

在 `App()` 函式內，緊接在 `editorRef` 宣告之後加入（useEffect dependency array 為空）：

```typescript
useEffect(() => {
  const handler = (event: MessageEvent) => {
    if (event.data?.type !== 'HIGHLIGHT_BLOCKS') return;

    const { blockIds, result, chunks } = event.data as {
      blockIds: string[];
      result: string;
      chunks: Record<string, { content: string }>;
    };

    const pagedRef = editorRef.current?.getEditorRef();
    const view = pagedRef?.getView();
    if (!view || !pagedRef) return;

    setReviewHighlight(view, pagedRef, blockIds, chunks, result);
  };

  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}, []);
```

---

## Task 3：加入 CSS（`styles.css`）

**檔案路徑：** `examples/vite/src/styles.css`

在檔案末尾加入：

```css
/* ── 審核高亮（純 UI 層，ProseMirror Decoration） ── */

/* 不符合 → 紅色 */
.hl-review-fail {
  background-color: rgba(255, 180, 180, 0.5) !important;
  outline: 2px solid rgba(192, 57, 43, 0.35);
  border-radius: 2px;
}

/* 符合 → 黃色 */
.hl-review-pass {
  background-color: rgba(255, 245, 100, 0.5) !important;
  outline: 2px solid rgba(180, 160, 0, 0.25);
  border-radius: 2px;
}
```

---

## Task 4：確認並修改 `DocxEditor.tsx`（視情況）

**檔案路徑：** `packages/react/src/components/DocxEditor.tsx`

### 4-1 搜尋 `externalPlugins`

在檔案中搜尋字串 `externalPlugins`。

**情況 A：已有** → Task 4 完成，不需修改。

**情況 B：未有** → 執行以下兩個修改：

在 `DocxEditorProps` interface 加入：

```typescript
/** External ProseMirror plugins passed through to the inner PagedEditor. */
externalPlugins?: import('prosemirror-state').Plugin[]
```

找到 render 裡的 `<PagedEditor ... />` 元件，加入 prop：

```tsx
<PagedEditor
  // ... 原有 props 不變 ...
  externalPlugins={props.externalPlugins} // ← 新增這行
/>
```

---

## Task 5：修改 `annotation.html`

**檔案路徑：** `examples/vite/public/annotation.html`

### 5-1 找到現有的 `highlightBlocks` 函式

在 `<script>` 區塊中找到：

```javascript
function highlightBlocks(blockIds, result) {
  // ... 目前的實作 ...
}
```

### 5-2 完整替換為 postMessage 版本

```javascript
function highlightBlocks(blockIds, result) {
  // 重置 banner
  missingBanner.style.display = 'none';

  // 無對應條文 → 顯示 banner
  if (!blockIds || blockIds === '無') {
    missingBanner.style.animation = 'none';
    missingBanner.offsetHeight; // force reflow，讓動畫重新觸發
    missingBanner.style.animation = '';
    missingBanner.style.display = 'block';
    return;
  }

  const ids = blockIds
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const frame = document.getElementById('editorFrame');
  if (!frame || !frame.contentWindow) return;

  const chunks = parsedData?.return_content?.contract_chunks;
  if (!chunks) return;

  // 發送給 iframe 內的 React App
  frame.contentWindow.postMessage(
    {
      type: 'HIGHLIGHT_BLOCKS',
      blockIds: ids,
      result: result,
      chunks: chunks,
    },
    '*'
  );
}
```

### 5-3 移除舊的 DOM 操作高亮相關 CSS（選用）

annotation.html 的 `<style>` 中有 `.t.hl-fail` / `.t.hl-pass` 等 CSS，以及 `contractContent.querySelectorAll('.t')` 相關邏輯，目前改用 postMessage 後這些不再需要，可以保留（無副作用）或清除。

---

## Task 6：測試驗證

### 6-1 本機啟動

```bash
cd D:\git\docviewer
bun run dev
# 開啟 http://localhost:5173/annotation.html
```

### 6-2 測試步驟（依序執行）

1. 開啟 `http://localhost:5173/annotation.html`
2. 在左側 iframe editor 中點擊 `Open DOCX`，載入任意 `.docx` 合約文件
3. 點擊右側 `📋 API 結果` 上傳 `test/智能審約API回傳審核結果.txt`
4. 點擊右側任一**不符合**的審核卡片

**預期結果：**

- ✅ 左側 editor 對應條款段落出現**紅色**背景高亮
- ✅ 頁面自動捲動到高亮段落，置中顯示
- ✅ 點擊其他卡片 → 舊高亮消失，新高亮出現
- ✅ 在 editor 中打字或點擊 → 高亮**不消失**（Decoration plugin 跟著 state 活著）
- ✅ 點擊**符合**的卡片 → 出現**黃色**高亮
- ✅ 存檔後重新開啟 docx → 高亮**不存在**（純 UI 層）

### 6-3 Debug 檢查清單

若高亮未出現，依序排查：

| 步驟                | 檢查方式                                                                       |
| ------------------- | ------------------------------------------------------------------------------ |
| ① message 有收到    | 在 App.tsx handler 加 `console.log('received', event.data)`                    |
| ② view 不為 null    | `console.log('view', view)`                                                    |
| ③ anchorText 有找到 | 在 `setReviewHighlight` 加 `console.log('anchor', anchorText, 'found', found)` |
| ④ plugin 有被掛上   | `console.log(view.state.plugins.map(p => p.spec))` 確認有 `reviewHighlight`    |
| ⑤ decoration 有套用 | DevTools → Elements → 檢查段落 DOM 是否有 `hl-review-fail` class               |
| ⑥ CSS 有載入        | DevTools → Styles → 搜尋 `.hl-review-fail`                                     |

---

## 檔案異動總覽

| 動作         | 檔案路徑                                                        |
| ------------ | --------------------------------------------------------------- |
| **新增**     | `examples/vite/src/reviewHighlightPlugin.ts`                    |
| **修改**     | `examples/vite/src/App.tsx`                                     |
| **修改**     | `examples/vite/src/styles.css`                                  |
| **修改**     | `examples/vite/public/annotation.html`                          |
| **可能修改** | `packages/react/src/components/DocxEditor.tsx`（Task 4 視情況） |

---

## 重要技術備忘

| 項目                               | 說明                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `Decoration.node(from, to, attrs)` | `from` = 段落節點起點 `pos`，`to` = `pos + node.nodeSize`                 |
| ProseMirror doc 走訪               | `doc.forEach((node, pos) => { if (node.type.name === 'paragraph') ... })` |
| 文字比對失敗時                     | 改用 `node.textContent.replace(/\s/g, '')` 後再比對                       |
| plugin 必須在初始化時傳入          | 不支援動態加入，`externalPlugins` 在 `<DocxEditor>` mount 時就要帶入      |
| postMessage origin                 | 目前用 `'*'`，production 環境改為明確的 origin                            |
| `block_ids` 格式                   | 可能是 `"7"` 或 `"5,6"`，annotation.html 已用 `split(',')` 處理           |
