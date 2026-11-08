const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const icon=name=>`<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const sourceUrl=value=>{try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:'';}catch{return '';}};
const sourceLink=(url,label,ariaLabel=label)=>{const href=sourceUrl(url);return href?`<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(ariaLabel)}">${esc(label)}${icon('external')}</a>`:'<span class="source-unavailable">출처 링크 미제공</span>';};

// Explicitly reviewed topic IDs, not keyword guesses. Tests compare these keys
// with the shipped catalog, so new topics require a deliberate classification.
export const TOPIC_SCOPES=Object.freeze({
  value:'purchase',shipping:'purchase',care:'purchase',option:'purchase',box:'purchase',
  sound:'use',usb:'use',design:'use',comfort:'use',noise:'use',controls:'use',call:'use',pressure:'use',
  keys:'use',portable:'use',quiet:'use',connection:'use',weight:'use',protection:'use',manual:'use',
  taste:'use',easy:'use',splash:'use',storage:'use',bottles:'use',capacity:'use',residue:'use',
  moisture:'use',repeat:'purchase',texture:'use',scent:'use',unclear:'use',packaging:'purchase',
  child:'use',quality:'use',tape:'purchase',assembly:'use',variety:'use',goods:'purchase',
  expiry:'purchase',sour:'use',gifts:'purchase',lasting:'use',service:'purchase',leak:'purchase',giftMissing:'purchase',
  light:'use',sturdy:'use',color:'use',bread:'use',cooking:'use',cleaning:'use',accessories:'use',crumbs:'use',
  fit:'use',mismatch:'use',soft:'use',absorb:'use',thick:'use',quantity:'use',wipe:'use',wash:'use',
  price:'purchase',fresh:'use',basic:'use',preference:'purchase','shipping-fee':'purchase'
});
const scopeFor=topic=>Object.hasOwn(TOPIC_SCOPES,topic.id)?TOPIC_SCOPES[topic.id]:'unknown';
const scopeLabel=topic=>({use:'제품 사용',purchase:'구매·배송',unknown:'경험 구분 미확인'}[scopeFor(topic)]);
const scopeBadge=topic=>`<small class="mention-scope" data-experience="${scopeFor(topic)}">${scopeLabel(topic)}</small>`;
const allTopics=product=>['positive','negative'].flatMap(tone=>(product.reviewAnalysis.mentionGroups[tone]||[]).map(topic=>({...topic,tone})));
const excerptIndex=product=>new Map(product.reviewAnalysis.originalExcerpts.filter(review=>typeof review.text==='string'&&review.text.trim()).map(review=>[review.sourceReviewId,review]));

// These topic/excerpt pairs were checked against the actual excerpt text.
// A shared review ID alone does not prove that its short excerpt discusses
// every topic assigned to the full review. Never guess a replacement pair.
const REPRESENTATIVE_TOPICS=Object.freeze({
  airpods:['positive','usb','523081898'],sony:['positive','sound','511124873'],keyboard:['positive','quiet','387754300'],
  illy:['negative','noise','499392950'],brita:['negative','capacity','455863227'],cream:['positive','texture','520464087'],
  lego:['negative','assembly','479040760'],haribo:['negative','sour','475552097'],downy:['positive','lasting','491733818'],
  lantern:['positive','light','496269797'],toaster:['negative','value','453449584'],crocs:['positive','comfort','514605269'],
  tissue:['positive','soft','537490625'],'paper-towel':['positive','quantity','513426729'],'wet-wipes':['positive','wipe','503822469'],
  detergent:['positive','wash','548963739'],shampoo:['negative','scent','522879595'],toothpaste:['positive','fresh','548950568'],
  'storage-bag':['positive','repeat','529937327'],'dish-soap':['negative','price','446707971'],
  'galaxy-s24':['positive','design','910283011'],'iphone-16':['positive','color','920384021'],'ipad-air':['positive','quality','930495031'],
  'buds3-pro':['positive','sound','940506041'],'macbook-air':['positive','quiet','950617051'],'apple-watch':['positive','comfort','960728061'],
  'ps5-slim':['positive','quality','970839071'],'switch-oled':['positive','quality','980940081'],'dyson-airwrap':['positive','quality','991051091'],
  'roborock-s8':['positive','cleaning','901162101'],stanbyme:['positive','portable','911273111'],'xiaomi-purifier':['positive','quiet','921384121'],
  'philips-shaver':['positive','comfort','931495131'],nespresso:['positive','taste','941506141'],'cuckoo-rice':['positive','sturdy','951617151'],
  'stanley-cup':['positive','lasting','961728161'],'ninja-blender':['positive','quality','971839171'],'shin-ramen':['positive','taste','981940181'],
  samdasoo:['positive','fresh','992051191'],hetbahn:['positive','taste','902162201'],'spam-classic':['positive','taste','912273211'],
  'maxim-kanu':['positive','easy','922384221'],'dr-g-cream':['positive','texture','932495231'],'laneige-lip':['positive','moisture','942506241'],
  'roundlab-sun':['positive','texture','952617251'],'anua-toner':['positive','quality','962728261'],'torriden-serum':['positive','moisture','972839271'],
  'nike-airforce':['positive','design','982940281'],'newbalance-574':['positive','comfort','993051291'],'spao-puffer':['positive','weight','903162301'],
  'gentle-monster':['positive','design','913273311'],'monami-153':['positive','quality','923384321'],'halli-galli':['positive','easy','933495331'],
  'kindle-paper':['positive','quality','943506341'],
  'manyo-cleansing':['positive','cleaning','90410001'],'cosrx-snail':['positive','moisture','90410011'],'aestura-atobarrier':['positive','moisture','90410021'],
  'mediheal-teatree':['positive','quality','90410031'],'d-alba-mist':['positive','moisture','90410041'],'cnp-propolis':['positive','quality','90410051'],
  'isoi-blemish':['positive','quality','90410061'],'clio-kill-cover':['positive','fit','90410071'],'romand-juicy':['positive','color','90410081'],
  'banila-co-clean':['positive','cleaning','90410091'],'innisfree-clay':['positive','cleaning','90410101'],'bioderma-sensibio':['positive','comfort','90410111'],
  'skin1004-ampoule':['positive','comfort','90410121'],'goodal-vitamin-c':['positive','quality','90410131'],'abib-gummy':['positive','fit','90410141'],
  'urbandecay-setter':['positive','lasting','90410151'],'hera-black-cushion':['positive','fit','90410161'],'sulwhasoo-first':['positive','absorb','90410171'],
  'espoir-cushion':['positive','fit','90410181'],'missha-time-revolution':['positive','moisture','90410191']
});
function renderRepresentative(product){
  const pair=Object.hasOwn(REPRESENTATIVE_TOPICS,product.id)?REPRESENTATIVE_TOPICS[product.id]:null;
  const topic=pair&&product.reviewAnalysis.mentionGroups[pair[0]]?.find(item=>item.id===pair[1]);
  const excerpt=topic&&product.reviewAnalysis.originalExcerpts.find(review=>review.sourceReviewId===pair[2]&&topic.reviewIds.includes(review.sourceReviewId)&&typeof review.text==='string'&&review.text.trim());
  if(!excerpt)return '<p class="representative-unavailable">이 요약에 연결할 원문 발췌는 포함되지 않았어요. 아래 주제별 출처에서 확인해 주세요.</p>';
  return `<figure class="summary-excerpt" data-review-id="${esc(excerpt.sourceReviewId)}" data-topic-id="${esc(topic.id)}"><figcaption>원문에서 읽기 · ${esc(topic.label)} ${scopeBadge(topic)}</figcaption><blockquote>${esc(excerpt.text)}</blockquote><footer><span>${esc(excerpt.author)} · 전체 후기를 대표하는 평가는 아닌, 일부 발췌예요.</span>${sourceLink(excerpt.sourceUrl,'원문 보기',`${excerpt.author}의 ${topic.label} 원문 상품 페이지 새 창에서 보기`)}</footer></figure>`;
}

export function renderReviewSummary(product){
  const topics=allTopics(product);
  const top=[...topics].sort((a,b)=>b.count-a.count)[0];
  const overview=top?`수집한 후기에서 ‘${top.label}’이 가장 많이 언급됐어요 · ${top.count}개 후기`:'현재 수집한 후기에서 집계된 주제가 없어요.';
  return `<section class="separate-review-summary" id="review-summary" aria-labelledby="review-summary-title" tabindex="-1">
    <header><h2 id="review-summary-title">후기 요약</h2><span>후기돋보기가 정리했어요</span></header>
    <p class="summary-overview">${esc(overview)}</p><p class="summary-scope">확인한 공개 후기 ${esc(product.reviewAnalysis.reviewSampleCount)}개를 바탕으로 정리했어요. 아래 원문 발췌 ${esc(product.reviewAnalysis.originalExcerpts.length)}개는 이 표본의 일부이며, 전체 후기나 의견 비율을 대표하지 않아요.</p>
    ${renderRepresentative(product)}
    <details class="summary-topics" open><summary>주제별 요약 ${esc(product.reviews.length)}개 읽기${icon('arrow')}</summary><ul>${product.reviews.map(review=>`<li><strong>${esc(review.topic)}</strong><p>${esc(review.summary)}</p>${sourceLink(review.sourceUrl,'요약 출처',`${review.topic} 요약의 원문 상품 페이지 새 창에서 보기`)}</li>`).join('')}</ul></details>
  </section>`;
}

export function renderMentionGroups(product,minimum=1){
  const analysis=product.reviewAnalysis;
  const byId=new Map(analysis.reviewEvidence.map(review=>[review.sourceReviewId,review]));
  const excerpts=excerptIndex(product);
  return [['positive','좋았다는 의견','check'],['negative','살펴볼 아쉬움','info']].map(([tone,title,glyph])=>{
    const topics=analysis.mentionGroups[tone].filter(topic=>topic.count>=minimum);
    return `<section class="mention-panel ${tone}" aria-label="${title}"><h3>${icon(glyph)}${title}</h3>${topics.length?topics.map(topic=>`<details class="mention-item" data-mention="${tone}:${esc(topic.id)}"><summary><span class="mention-copy">${scopeBadge(topic)}<strong>${esc(topic.label)}</strong><span>${esc(topic.description)}</span></span><span class="mention-count"><b>${esc(topic.count)}<small>개 후기</small></b><span>근거 보기${icon('arrow')}</span></span></summary><div class="mention-evidence"><p>이 주제를 언급한 원문 후기 ${esc(topic.count)}개</p><p class="evidence-note">발췌는 같은 후기의 일부예요. 이 주제에 관한 문장이 발췌에 없을 수 있으니 전체 원문도 확인해 주세요.</p><ul>${topic.reviewIds.map(id=>{
      const excerpt=excerpts.get(id);
      const review=byId.get(id)||excerpt;
      return `<li data-review-id="${esc(id)}"><div class="mention-evidence-copy"><span>${esc(review?.author||'작성자 미제공')}<small>후기 번호 ${esc(id)}</small></span>${excerpt?`<blockquote>${esc(excerpt.text)}</blockquote>`:'<p class="excerpt-unavailable">이 후기의 원문 텍스트는 현재 자료에 포함되지 않았어요. 출처에서 확인해 주세요.</p>'}</div>${sourceLink(review?.sourceUrl||product.sourceUrl,`${esc(product.source||'판매처')} 원문`,`${review?.author||'작성자 미제공'}의 ${topic.label} 근거 원문 상품 페이지 새 창에서 보기`)}</li>`;
    }).join('')}</ul></div></details>`).join(''):`<div class="mention-empty"><p>${esc(minimum)}개 이상에서 언급된 ${tone==='positive'?'장점':'아쉬움'}은 없어요.</p><span>${minimum>1?'기준을 1개 이상으로 낮추면 단일 의견도 볼 수 있어요.':'표본에 없는 경험까지 없다는 뜻은 아니에요.'}</span></div>`}</section>`;
  }).join('');
}

export function renderMentionSection(product,minimum=1){
  const analysis=product.reviewAnalysis;
  return `<section class="review-mentions" id="review-mentions" aria-labelledby="review-mentions-title" tabindex="-1"><div class="mention-section-heading"><div><h2 id="review-mentions-title">리뷰에서 나온 긍정과 아쉬움</h2><p>수집한 원문 ${esc(analysis.reviewSampleCount)}개 기준 · 주제마다 제품 사용과 구매·배송 경험을 구분했어요.</p></div><div class="mention-filter"><label for="mention-minimum">최소 언급</label><select id="mention-minimum"><option value="1" ${minimum===1?'selected':''}>1개 후기 이상</option><option value="2" ${minimum===2?'selected':''}>2개 후기 이상</option><option value="3" ${minimum===3?'selected':''}>3개 후기 이상</option></select></div></div>
    <p id="mention-filter-status" class="sr-only" role="status">${esc(minimum)}개 후기 이상에서 언급된 항목</p><div class="mention-groups" id="mention-groups">${renderMentionGroups(product,minimum)}</div>
    <details class="mention-method"><summary>언급 수는 어떻게 셌나요?</summary><p>현재 수집한 ${esc(analysis.reviewSampleCount)}개 원문을 읽고 주제별로 분류했어요. 같은 후기에서 같은 주제를 여러 번 말해도 1개로 세며, 한 후기가 여러 주제나 긍정·부정 양쪽에 포함될 수 있어요. 각 항목을 누르면 근거 후기의 작성자, 보유한 원문 발췌와 출처를 볼 수 있어요.</p><p>가격·재구매·판매처 구성·배송·응대는 구매·배송 경험으로, 성능·사용감·디자인은 제품 사용 경험으로 표시했어요. 구매·배송 의견을 제품 성능 평가로 보지는 않아요.</p><p>막연한 기대나 다른 모델의 경험을 현재 제품의 경험으로 세지 않았어요. 특정 주제로 분류하지 않은 후기는 ${esc(analysis.unclassifiedReviewCount)}개예요. 이 숫자는 판매처 전체 리뷰의 집계나 긍정·부정 후기 비율이 아니에요. 별점으로 문장의 긍정·부정을 정하지 않았어요.</p></details>
  </section>`;
}

export function renderOriginalReviews(product){
  const excerpts=product.reviewAnalysis.originalExcerpts;
  return `<section class="product-reviews original-reviews" id="product-reviews" aria-labelledby="product-reviews-title" tabindex="-1"><div class="reading-heading"><h2 id="product-reviews-title">원문 발췌 <span>${esc(excerpts.length)}</span></h2><span>${esc(product.source||'공개')} 후기 중 일부</span></div><p class="review-editor-note">수집한 ${esc(product.reviewAnalysis.reviewSampleCount)}개 후기 중 ${esc(excerpts.length)}개의 짧은 발췌예요. 맞춤법·말투를 고치지 않았으며 전체 글은 출처에서 확인할 수 있어요.</p><p class="review-editor-note ad-status-note">광고·협찬 여부를 확인할 정보가 없어 미확인으로 표시했어요. 광고가 아니라는 뜻은 아니에요.</p>
    ${excerpts.map(review=>`<article class="original-review" data-review-id="${esc(review.sourceReviewId)}"><header><div><strong>${esc(review.author)}</strong><span>${esc(product.source||'공개 후기')} · ${review.sourceRating?`원문 표시 별점 ${esc(review.sourceRating)} / 5`:'별점 미제공'}</span></div><span class="verbatim-label">${review.isExcerpt?'원문 일부':'원문'}</span></header><blockquote>${esc(review.text)}</blockquote><footer><span>작성일 미제공 · 광고 여부 미확인</span>${sourceLink(review.sourceUrl,'원문 전체 보기',`${review.author} 후기의 전체 원문 상품 페이지 새 창에서 보기`)}</footer></article>`).join('')}</section>`;
}
