const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const icon=name=>`<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export function renderReviewSummary(product){
  return `<section class="separate-review-summary" id="review-summary" aria-labelledby="review-summary-title" tabindex="-1">
    <header><h2 id="review-summary-title">후기 요약</h2><span>후기돋보기가 정리했어요</span></header>
    <p class="summary-overview">${esc(product.lead)}</p><p class="summary-scope">확인한 공개 후기 ${product.reviewSampleCount}개를 바탕으로 정리했어요. 일반 후기의 원문 발췌는 아래에서 따로 읽을 수 있어요.</p>
    <details class="summary-topics"><summary>주제별 요약 ${product.reviews.length}개 읽기${icon('arrow')}</summary><ul>${product.reviews.map(review=>`<li><strong>${esc(review.topic)}</strong><p>${esc(review.summary)}</p><a href="${esc(review.sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(review.topic)} 요약의 원문 상품 페이지 새 창에서 보기">요약 출처${icon('external')}</a></li>`).join('')}</ul></details>
  </section>`;
}

export function renderMentionGroups(product,minimum=1){
  const analysis=product.reviewAnalysis;
  const byId=new Map(analysis.reviewEvidence.map(review=>[review.sourceReviewId,review]));
  return [['positive','좋았다는 의견','check'],['negative','살펴볼 아쉬움','info']].map(([tone,title,glyph])=>{
    const topics=analysis.mentionGroups[tone].filter(topic=>topic.count>=minimum);
    return `<section class="mention-panel ${tone}" aria-label="${title}"><h3>${icon(glyph)}${title}</h3>${topics.length?topics.map(topic=>`<details class="mention-item" data-mention="${tone}:${topic.id}"><summary><span class="mention-copy"><strong>${esc(topic.label)}</strong><span>${esc(topic.description)}</span></span><span class="mention-count"><b>${topic.count}<small>개 후기</small></b><span>근거 보기${icon('arrow')}</span></span></summary><div class="mention-evidence"><p>이 주제를 언급한 원문 후기 ${topic.count}개</p><ul>${topic.reviewIds.map(id=>{const review=byId.get(id);return `<li><span>${esc(review.author)}<small>후기 번호 ${esc(id)}</small></span><a href="${esc(review.sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(review.author)}의 ${esc(topic.label)} 근거 원문 상품 페이지 새 창에서 보기">11번가 원문${icon('external')}</a></li>`;}).join('')}</ul></div></details>`).join(''):`<div class="mention-empty"><p>${minimum}개 이상에서 언급된 ${tone==='positive'?'장점':'아쉬움'}은 없어요.</p><span>${minimum>1?'기준을 1개 이상으로 낮추면 단일 의견도 볼 수 있어요.':'표본에 없는 경험까지 없다는 뜻은 아니에요.'}</span></div>`}</section>`;
  }).join('');
}

export function renderMentionSection(product,minimum=1){
  const analysis=product.reviewAnalysis;
  return `<section class="review-mentions" id="review-mentions" aria-labelledby="review-mentions-title" tabindex="-1"><div class="mention-section-heading"><div><h2 id="review-mentions-title">리뷰에서 나온 긍정과 아쉬움</h2><p>수집한 원문 ${analysis.reviewSampleCount}개 기준 · 제품 사용과 구매·배송 경험을 함께 봤어요.</p></div><div class="mention-filter"><label for="mention-minimum">최소 언급</label><select id="mention-minimum"><option value="1" ${minimum===1?'selected':''}>1개 후기 이상</option><option value="2" ${minimum===2?'selected':''}>2개 후기 이상</option><option value="3" ${minimum===3?'selected':''}>3개 후기 이상</option></select></div></div>
    <p id="mention-filter-status" class="sr-only" role="status">${minimum}개 후기 이상에서 언급된 항목</p><div class="mention-groups" id="mention-groups">${renderMentionGroups(product,minimum)}</div>
    <details class="mention-method"><summary>언급 수는 어떻게 셌나요?</summary><p>현재 수집한 ${analysis.reviewSampleCount}개 원문을 읽고 주제별로 분류했어요. 같은 후기에서 같은 주제를 여러 번 말해도 1개로 세며, 한 후기가 여러 주제나 긍정·부정 양쪽에 포함될 수 있어요. 각 항목을 누르면 근거 후기의 작성자와 출처를 볼 수 있어요.</p><p>막연한 기대나 다른 모델의 경험을 현재 제품의 경험으로 세지 않았어요. 특정 주제로 분류하지 않은 후기는 ${analysis.unclassifiedReviewCount}개예요. 이 숫자는 판매처 전체 리뷰의 집계나 긍정·부정 후기 비율이 아니에요. 별점으로 문장의 긍정·부정을 정하지 않았어요.</p></details>
  </section>`;
}

export function renderOriginalReviews(product){
  const excerpts=product.reviewAnalysis.originalExcerpts;
  return `<section class="product-reviews original-reviews" id="product-reviews" aria-labelledby="product-reviews-title" tabindex="-1"><div class="reading-heading"><h2 id="product-reviews-title">일반 후기 <span>${excerpts.length}</span></h2><span>11번가 원문 발췌</span></div><p class="review-editor-note">맞춤법·말투를 고치지 않은 짧은 원문 발췌예요. 전체 글은 원문 페이지에서 확인해 주세요.</p>
    ${excerpts.map(review=>`<article class="original-review" data-review-id="${esc(review.sourceReviewId)}"><header><div><strong>${esc(review.author)}</strong><span>11번가 · ${review.sourceRating?`원문 표시 별점 ${review.sourceRating} / 5`:'별점 미제공'}</span></div><span class="verbatim-label">${review.isExcerpt?'원문 일부':'원문'}</span></header><blockquote>${esc(review.text)}</blockquote><footer><span>작성일 미제공 · 광고 여부 미확인</span><a href="${esc(review.sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(review.author)} 후기의 전체 원문 상품 페이지 새 창에서 보기">원문 전체 보기${icon('external')}</a></footer></article>`).join('')}</section>`;
}
