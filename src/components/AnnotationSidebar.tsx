import React, { useState } from 'react';
import './annotationSidebar.css';

export type ReviewDetail = Record<string, string>;

export interface ReviewItem {
  name: string;
  block_ids: string | '無';
  detail?: ReviewDetail;
}

export interface AnnotationData {
  return_content: {
    review_results: Record<string, ReviewItem[]>;
  };
}

export interface Props {
  data: AnnotationData | null;
  // emitted when a card is selected; parent can listen to perform highlighting/scrolling
  onHighlight?: (blockIds: string | '無', result: string) => void;
}

export default function AnnotationSidebar({ data, onHighlight }: Props) {
  const [selected, setSelected] = useState<number | null>(null);

  if (!data) {
    return (
      <div className="annotation-empty" aria-live="polite">
        <p>請上傳 API 結果檔以顯示審核結果</p>
      </div>
    );
  }

  const reviewResults = data.return_content?.review_results || {};

  // preserve the same ordering as the original: 合規性, 合理性, 完整性 first
  const categoryOrder = ['合規性', '合理性', '完整性'];
  const orderedCats: string[] = [];
  categoryOrder.forEach((c) => {
    if (reviewResults[c]?.length) orderedCats.push(c);
  });
  Object.keys(reviewResults).forEach((c) => {
    if (!orderedCats.includes(c)) orderedCats.push(c);
  });

  function handleClick(idx: number, item: ReviewItem) {
    setSelected((prev) => (prev === idx ? idx : idx));
    const result = item.detail?.['審查結果'] || '';
    if (onHighlight) onHighlight(item.block_ids, result);
    const ev = new CustomEvent('annotation:highlight', {
      detail: { blockIds: item.block_ids, result },
    });
    window.dispatchEvent(ev);
  }

  function buildCard(item: ReviewItem, idx: number) {
    const result = item.detail?.['審查結果'] || '';
    const isFail = result === '不符合';

    return (
      <div
        key={idx}
        className={`review-card ${selected === idx ? 'card-selected' : ''}`}
        onClick={() => handleClick(idx, item)}
      >
        <div className="card-header">
          <span className={`card-badge ${isFail ? 'badge-fail' : 'badge-pass'}`}>
            {result || '—'}
          </span>
          <span className={`card-name ${isFail ? 'fail' : 'pass'}`}>{item.name}</span>
        </div>

        <div className="block-ids-hint">
          {item.block_ids === '無'
            ? '📄 條文對應：合約缺漏'
            : `📄 條文對應：第 ${item.block_ids} 區塊`}
        </div>

        <div className={`card-detail ${selected === idx ? 'open' : ''}`}>
          {['審查說明', '應當遵循的標準', '條文範例'].map((field) => {
            const txt = item.detail?.[field];
            if (!txt) return null;
            return (
              <div key={field}>
                <div className="detail-label">{field}</div>
                <div className="detail-text">{txt}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <aside id="annotationSidebar" className="annotation-sidebar">
      <div className="reviewHeader">
        <h2>違規條款分析</h2>
      </div>

      <div className="reviewCards">
        {orderedCats.map((cat) => (
          <section key={cat} className="cat-section">
            <div className="section-title">{cat}</div>
            {(reviewResults[cat] || []).map((item, i) => buildCard(item, i))}
          </section>
        ))}
      </div>
    </aside>
  );
}
