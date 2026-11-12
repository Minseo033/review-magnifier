import sourceData from './data/self-funded-reviews.json' with {type:'json'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const external='<svg class="icon" aria-hidden="true"><use href="#i-external"/></svg>';
const play='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7Z" fill="currentColor"/></svg>';
const formatNames={all:'전체',video:'영상',text:'텍스트',blog:'블로그'};
const safeUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.href:'';}catch{return '';}};
// Never infer self-purchase from a rating, shopping review, keyword, or lack of an ad label.
export function eligibleReview(review){
  if(!review||typeof review!=='object')return false;
  return review.selfPurchase===true&&review.reviewed===true&&review.commercialDisclosureFound===false&&!!review.disclosure&&!!review.disclosureLocation&&!!review.checkedAt&&!!safeUrl(review.url)&&['video','blog'].includes(review.format)&&(/내돈내산/.test(review.disclosure))&&(review.format!=='video'||/^[A-Za-z0-9_-]{11}$/.test(review.videoId));
}
export const reviewsFor=id=>(sourceData.products[id]||[]).filter(eligibleReview);
export const hasSelfFundedDetail=id=>Object.hasOwn(sourceData.products,id);
export function filteredReviews(id,format='all',topic='all'){
  return reviewsFor(id).filter(r=>(format==='all'||(format==='text'?!!r.excerpt:r.format===format))&&(topic==='all'||r.topics.includes(topic)));
}
function sourceProof(r){return `<details class="rf-proof"><summary>내돈내산 표시 근거</summary><p>${esc(r.disclosureLocation)}에 <q>${esc(r.disclosure)}</q>라고 표시되어 있어요.</p><p>${esc(r.checkedAt)} 원문 확인. 확인한 제목·본문·설명에 협찬 또는 제휴 수수료 표시가 있는 자료는 제외했어요. 작성자의 표시 기준이며 구매 영수증을 대조한 인증은 아니에요.</p></details>`;}
function reviewCard(r,format){
 const isVideo=r.format==='video',isText=format==='text';
 return `<article class="rf-card ${isVideo?'rf-card-video':'rf-card-blog'}" data-review-source="${esc(r.id)}">
  ${isVideo?`<div class="rf-video-shell"><button class="rf-video-preview" data-review-play="${esc(r.id)}" aria-label="${esc(r.title)} 영상 재생"><img src="${esc(r.thumbnail)}" width="640" height="360" alt="${esc(r.title)} 영상 썸네일" loading="lazy"><span class="rf-play">${play}</span><span class="rf-duration">${esc(r.duration)}</span></button></div>`:''}
  <div class="rf-card-body"><div class="rf-card-meta"><span class="rf-platform">${esc(isText?'텍스트 · '+r.platform:r.platform)}</span><span class="rf-purchase">내돈내산 명시</span></div>
  <h3><a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a></h3>
  <p class="rf-byline">${esc(r.author)} <span>· ${esc(r.date.replaceAll('-','.'))}</span></p>
  ${r.excerpt?`<figure class="rf-excerpt"><figcaption>${esc(r.excerptLabel)}</figcaption><blockquote>“${esc(r.excerpt)}”</blockquote></figure>`:''}
  <p class="rf-description">${esc(r.description)} <small>후기돋보기 요약</small></p>
  <div class="rf-tags">${r.topics.map(t=>`<span>${esc(t)}</span>`).join('')}<span class="rf-model">${esc(r.model)}</span></div>
  ${sourceProof(r)}
  <a class="rf-source" href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener noreferrer">${isVideo?'YouTube에서 원본 보기':isText?'발췌한 블로그 원문 보기':'블로그 후기 전체 읽기'}${external}</a>
  ${isVideo?'<p class="rf-video-note">재생 시 YouTube에 연결돼요. 재생되지 않으면 원본을 열어주세요.</p>':''}</div></article>`;
}
export function renderSelfFundedDetail(p,returnHash){
 const reviews=reviewsFor(p.id),topics=[...new Set(reviews.flatMap(r=>r.topics))];
 return `<div class="rf-detail"><nav class="rf-breadcrumb" aria-label="현재 위치"><a href="${esc(returnHash)}" data-product-return>← 제품 목록</a><span>에어팟 프로 2 후기</span></nav>
 <header class="rf-product"><img class="product-hero-photo" src="${esc(p.image)}" width="112" height="112" alt="${esc(p.name)} 제품 사진"><div><p class="rf-eyebrow">APPLE · 에어팟 프로 2</p><h1 id="product-title" tabindex="-1">${esc(p.name)}</h1><p>직접 사고, 써본 사람들의 이야기.</p></div><div class="rf-product-actions"><button class="button secondary" data-save="${esc(p.id)}" aria-pressed="false"><svg class="icon" aria-hidden="true"><use href="#i-bookmark"/></svg><span data-save-label>찜하기</span></button><button class="rf-share" data-share="${esc(p.id)}" aria-label="제품 후기 링크 복사"><svg class="icon" aria-hidden="true"><use href="#i-share"/></svg></button></div></header>
 <div class="share-fallback" id="share-fallback" hidden><label for="share-address">이 제품의 후기 주소</label><input id="share-address" readonly><p>주소를 선택해 복사해 주세요.</p></div>
 <section class="rf-intro" aria-labelledby="rf-heading"><div><h2 id="rf-heading">내돈내산 후기</h2><p>영상 · 텍스트 · 블로그 원문을 한곳에서.</p></div><div class="rf-intro-count"><strong>${reviews.length}</strong><span>개의 내돈내산 표시 후기</span></div></section>
 <div class="rf-boundary"><svg class="icon" aria-hidden="true"><use href="#i-check"/></svg><p>작성자 내돈내산 표시 기준 <span>· 구매 증빙 인증은 아니에요.</span></p><details><summary>선정 기준</summary><p>내돈내산 표시가 없거나, 협찬·제품 제공·제휴 수수료 표시가 확인된 자료는 제외해요. 긍정과 부정 후기를 모두 포함하며, 작성자와 원문 출처를 연결해요. 자동 광고 판별은 제공하지 않아요.</p><p>2022~2023년 후기예요. Lightning과 USB-C 모델의 차이, 현재 펌웨어와 기능은 원문 작성 시점을 함께 확인해 주세요.</p></details></div>
 <section class="rf-collection" aria-label="내돈내산 후기 모음"><div class="rf-filterbar"><div class="rf-formats" role="group" aria-label="후기 형식">${Object.entries(formatNames).map(([key,label])=>`<button data-review-format="${key}" aria-pressed="${key==='all'}">${label}<span>${filteredReviews(p.id,key).length}</span></button>`).join('')}</div><p class="rf-count" id="rf-count"></p></div><div class="rf-topics" role="group" aria-label="후기 주제"><span>궁금한 점</span>${['all',...topics].map(t=>`<button data-review-topic="${esc(t)}" aria-pressed="${t==='all'}">${t==='all'?'전체':esc(t)}</button>`).join('')}</div><div id="rf-live-status" class="sr-only" role="status"></div><div class="rf-grid" id="rf-grid"></div><p class="rf-original-notice">후기는 각 작성자의 개인 경험이에요. 텍스트는 짧은 원문 발췌이며, 전체 내용과 사진은 원문에서 확인할 수 있어요.</p></section>
 <a class="rf-return" data-product-return href="${esc(returnHash)}">다른 제품 둘러보기 →</a></div>`;
}
export function updateSelfFundedFeed(root,id,format='all',topic='all'){
 const reviews=filteredReviews(id,format,topic),grid=root.querySelector('#rf-grid');if(!grid)return;
 root.querySelectorAll('[data-review-format]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.reviewFormat===format)));
 root.querySelectorAll('[data-review-topic]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.reviewTopic===topic)));
 grid.innerHTML=reviews.length?reviews.map(r=>reviewCard(r,format)).join(''):`<div class="rf-empty"><h3>이 조건에 맞는 후기는 아직 없어요.</h3><p>내돈내산 근거가 없는 후기로 채우지 않아요.</p><button data-review-reset>전체 후기 보기</button></div>`;
 root.querySelector('#rf-count').textContent=`${reviews.length}개 후기`;
 root.querySelector('#rf-live-status').textContent=`${formatNames[format]} · ${topic==='all'?'전체 주제':topic} · ${reviews.length}개 후기`;
}
export function playSelfFundedVideo(root,id,reviewId){
 const r=reviewsFor(id).find(r=>r.id===reviewId&&r.format==='video');if(!r)return;
 const card=[...root.querySelectorAll('[data-review-source]')].find(c=>c.dataset.reviewSource===reviewId),shell=card?.querySelector('.rf-video-shell');if(!shell)return;
 // YouTube embeds are contact-on-click only, without autoplay or tracking scripts in the host page.
 shell.innerHTML=`<iframe src="https://www.youtube-nocookie.com/embed/${esc(r.videoId)}?rel=0" title="${esc(r.title)}" allow="encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
}
