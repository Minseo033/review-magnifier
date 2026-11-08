import data from './data/catalog.viewer.json';
import {renderReviewSummary,renderMentionSection,renderMentionGroups,renderOriginalReviews} from './review-insights.js';
import {matchesProduct,parseSelection,readRoute} from './catalog-logic.mjs';
import site from './config/site.json';

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const icon=name=>`<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const number=value=>Number(value).toLocaleString('ko-KR');
const rating=value=>Number.isFinite(value)?value.toFixed(1):'미제공';
const productUrl=id=>`#product/${encodeURIComponent(id)}`;
const publicProductUrl=id=>new URL(productUrl(id),site.url).href;
const siteTitle='후기돋보기 — 요약보다 근거, 원문과 함께';
const products=data.products;
const collectionDates=[...new Set(products.map(product=>product.collectedAt.slice(0,10)))].sort();
const collectionPeriod=collectionDates[0]===collectionDates.at(-1)?collectionDates[0].replaceAll('-','.'):collectionDates[0].replaceAll('-','.')+'–'+collectionDates.at(-1).replaceAll('-','.');
const byId=new Map(products.map(product=>[product.id,product]));
const reviewOrder=(a,b)=>b.sourceReviewCount-a.sourceReviewCount||a.id.localeCompare(b.id);
const catalogPosition=new Map(products.map((product,index)=>[product.id,index]));
const categories=[['all','전체','grid'],['essentials','생필품','essentials'],['digital','가전·디지털','digital'],['kitchen','주방','kitchen'],['beauty','뷰티','beauty'],['living','생활·인테리어','living'],['food','식품','food'],['fashion','패션','fashion'],['hobby','취미','hobby']];
const categoryNames=Object.fromEntries(categories.map(([id,name])=>[id,name]));
const savedKey='review-magnifier:catalog-saved',compareKey='review-magnifier:catalog-compare',layoutKey='review-magnifier:catalog-layout';
const state={page:'home',category:'all',query:'',sort:'recommended',layout:'grid',saved:new Set(),compare:[],product:null,mentionMinimum:1};
const rememberedReturn=history.state?.productReturn;
let productReturn=rememberedReturn&&/^#(?:home|saved|compare)(?:\?|$)/.test(rememberedReturn.hash)&&Number.isFinite(rememberedReturn.scroll)?rememberedReturn:{hash:'#home',scroll:0,trigger:null,layout:'grid'},toastTimer;
state.layout=productReturn.layout==='list'?'list':'grid';
try {state.saved=new Set(parseSelection(localStorage.getItem(savedKey),byId));state.compare=parseSelection(localStorage.getItem(compareKey),byId,3);state.layout=localStorage.getItem(layoutKey)==='list'?'list':state.layout;} catch { /* Memory-only use remains available. */ }
if('scrollRestoration' in history)history.scrollRestoration='manual';

function notify(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,2800);}
function persist(key,value){try{localStorage.setItem(key,value);return true;}catch{return false;}}
function go(page='home',values={}){
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(values))if(value&&value!=='all'&&value!=='recommended')params.set(key,value);
  const hash=`#${page}${params.size?'?'+params:''}`;
  if(location.hash===hash)route();else location.hash=hash;
}
function sortedProducts(){
  return products.filter(product=>{
    if(state.page==='saved'&&!state.saved.has(product.id))return false;
    if(state.category!=='all'&&product.category!==state.category)return false;
    return matchesProduct(product,state.query);
  }).sort((a,b)=>state.sort==='name'?a.name.localeCompare(b.name,'ko'):state.sort==='rating'?(b.sourceRating-a.sourceRating||reviewOrder(a,b)):state.sort==='reviews'?reviewOrder(a,b):catalogPosition.get(a.id)-catalogPosition.get(b.id));
}
function renderCategories(){
  const nav=$('#category-nav');
  if(nav.children.length)$$('[data-category]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.category===state.category)));
  else nav.innerHTML=categories.map(([id,name,glyph])=>`<button class="category-button" data-category="${id}" aria-pressed="${state.category===id}"><span class="category-icon">${icon(glyph)}</span><span>${name}</span></button>`).join('');
  if(nav.dataset.activeCategory!==state.category&&nav.scrollWidth>nav.clientWidth){const selected=nav.querySelector('[aria-pressed="true"]');nav.scrollLeft=selected.offsetLeft-nav.offsetLeft-(nav.clientWidth-selected.offsetWidth)/2;}
  nav.dataset.activeCategory=state.category;
  updateCategoryScroll();
}
function updateCategoryScroll(){const nav=$('#category-nav');$('.category-wrap').dataset.more=String(nav.scrollLeft+nav.clientWidth<nav.scrollWidth-2);}
function productCard(product,rank=0,priority=false){
  const saved=state.saved.has(product.id),compared=state.compare.includes(product.id);
  return `<article class="product-card" data-product="${product.id}"><div class="product-media"><a class="product-photo-button" data-open="${product.id}" aria-label="${esc(product.name)} 제품 사진과 후기 보기" href="${productUrl(product.id)}"><img class="product-photo" src="${product.image}" alt="${esc(product.brand+' '+product.name)} 판매처 제품 사진" loading="${priority?'eager':'lazy'}" ${priority?'fetchpriority="high"':''} decoding="async" draggable="false" width="600" height="600"></a>${rank?`<span class="product-rank ${rank<=3?'top-rank':''}" aria-label="선택 범위의 판매처 리뷰 수 ${rank}위">${String(rank).padStart(2,'0')}</span>`:''}<button class="save-button" data-save="${product.id}" aria-label="${esc(product.name)} ${saved?'찜 해제':'찜하기'}" aria-pressed="${saved}">${icon('bookmark')}</button></div>
  <div class="product-copy"><span class="product-brand">${esc(product.brand)} · ${esc(product.categoryName)}</span><a class="product-name-button" data-open="${product.id}" href="${productUrl(product.id)}"><h2>${esc(product.name)}</h2></a>
  <a class="review-preview" data-open="${product.id}" aria-label="${esc(product.name)} 장점과 아쉬운 점 읽기" href="${productUrl(product.id)}"><span class="review-preview-label">분석한 후기 표본 <b>${product.reviewSampleCount}개</b></span><p>${esc(factualPreview(product))}</p><span class="preview-caution"><span>살펴볼 점</span>${esc(product.caution)}</span></a><p class="product-subtitle">${esc(product.subtitle)}</p><div class="review-metrics"><span>판매처 리뷰 ${number(product.sourceReviewCount)}개</span><span class="metrics-divider" aria-hidden="true"></span><span>표시 평점 ${rating(product.sourceRating)}</span></div><div class="card-actions"><a class="review-detail-button" data-open="${product.id}" aria-label="${esc(product.name)} 원문 후기와 요약 읽기" href="${productUrl(product.id)}">원문 후기·요약${icon('arrow')}</a><button class="compare-button" data-compare="${product.id}" aria-pressed="${compared}" aria-label="${esc(product.name)} ${compared?'비교에서 빼기':'비교에 담기'}"><span class="compare-checkbox">${icon('check')}</span><span data-compare-label>${compared?'비교 중':'비교'}</span></button></div></div></article>`;
}
function factualPreview(product){
  const topics=[...product.reviewAnalysis.mentionGroups.positive,...product.reviewAnalysis.mentionGroups.negative].sort((a,b)=>b.count-a.count);
  return topics[0]?topics[0].label+' · '+topics[0].count+'개 후기에서 언급':'주제별 판단에 필요한 후기 부족';
}
function renderReadingExample(){
  const product=byId.get('airpods');
  const excerpt=product.reviewAnalysis.originalExcerpts.find(review=>review.sourceReviewId==='523553297');
  return `<div class="reading-example"><div class="example-intro"><span class="eyebrow">후기 하나, 이렇게 살펴봅니다</span><h2>별점이 높아도,<br>내용은 다를 수 있으니까.</h2><p>좋다는 말만 모으지 않고, 원문에서 확인되는 경험과 아직 모르는 것을 나눕니다.</p><a class="button primary" data-open="airpods" href="${productUrl('airpods')}">실제 후기 살펴보기${icon('arrow')}</a><span class="demo-boundary">시범 서비스 · 광고 자동 판별은 제공하지 않습니다.</span></div><div class="example-document"><div class="example-product"><img src="${product.image}" alt="" width="60" height="60"><div><strong>AirPods Pro 2</strong><span>11번가 · 원문 표시 별점 5 / 5</span></div><span class="source-label">원문 발췌</span></div><blockquote>${esc(excerpt.text)}</blockquote><p class="example-attribution">${esc(excerpt.author)} · 후기 일부</p><dl class="reading-checks"><div><dt>원문에서 확인</dt><dd>이 구매 건에는 애플케어가 포함되지 않았다는 경험</dd></div><div><dt>해석할 때 주의</dt><dd>제품 성능이 아닌 구매 구성의 이야기입니다. 다른 옵션에 그대로 적용할 수 없습니다.</dd></div><div><dt>판단할 수 없음</dt><dd>광고 여부 · 실제 구매 인증 · 현재 판매 구성</dd></div></dl><a class="text-link" data-open="airpods" href="${productUrl('airpods')}">요약과 다른 원문 대조하기${icon('arrow')}</a></div></div>`;
}
function renderBrowse(){
  const list=sortedProducts(),savedPage=state.page==='saved';
  const showFeatured=!savedPage&&!state.query&&state.category==='all'&&state.sort==='recommended';
  const remaining=list;
  $('#browse-title').textContent=savedPage?'다시 읽고 싶은 제품 후기':state.query?'찾던 제품의 후기를 살펴보세요.':showFeatured?'좋다는 후기, 근거부터 살펴보세요.':state.category==='all'?'제품별로 모아 읽는 후기':`${categoryNames[state.category]} 제품, 써본 이야기는?`;
  $('#browse-intro').hidden=!showFeatured;
  $('#browse-intro').textContent=`11번가 공개 후기 ${data.reviewSampleCount}개를 정리한 ${products.length}개 제품의 데모입니다. 과장된 표현을 가려 읽는 첫 단계로, 요약과 원문을 함께 제공합니다.`;
  $('#section-kicker').textContent=savedPage?'내가 찜한 제품':'원문으로 확인하는 후기';
  $('#result-count').textContent=list.length;
  $('#result-context').textContent=state.category==='all'?'공개 구매 후기 요약':categoryNames[state.category];
  $('#sort-select').value=state.sort;
  $('#sort-select option[value="recommended"]').textContent='기본순';
  $('#product-search').value=state.query;
  $('#featured-products').hidden=!showFeatured;
  $('#featured-grid').dataset.layout=state.layout;
  $('#featured-grid').innerHTML=showFeatured?renderReadingExample():'';
  $('#discovery-heading').hidden=!showFeatured||!remaining.length;
  $('#discovery-description').textContent=`${remaining.length}개 예시 제품 · 실제 후기 표본 기준, 품질 순위가 아닙니다.`;
  $('#product-grid').dataset.layout=state.layout;
  $('#product-grid').innerHTML=remaining.map((product,index)=>productCard(product,state.sort==='reviews'&&!savedPage?index+1:0,!showFeatured&&index<3)).join('');
  $('#empty-state').hidden=!!list.length;$('#catalog-end').hidden=!list.length;
  if(!list.length){
    const noSaved=savedPage&&!state.saved.size;
    $('#empty-title').textContent=noSaved?'아직 찜한 제품이 없어요.':'찾는 제품이 아직 없어요.';
    $('#empty-description').textContent=noSaved?'제품의 북마크를 눌러 다시 보고 싶은 후기를 모아두세요. 이 브라우저에 저장돼요.':state.category!=='all'?'선택한 분류에 맞는 결과가 없어요. 분류를 지우거나 다른 검색어로 찾아보세요.':'현재는 등록된 20개 예시 제품 안에서만 검색합니다. 실시간 수집 기능은 아직 제공하지 않습니다.';
  }
  $('#saved-note').hidden=!savedPage;
  $('#search-context').hidden=!state.query&&state.category==='all';
  $('#search-context').innerHTML=`${state.query?`<button class="filter-chip" data-query-clear aria-label="검색어 ${esc(state.query)} 지우기">${esc(state.query)}${icon('close')}</button>`:''}${state.category!=='all'?`<button class="filter-chip" data-category="all" aria-label="${categoryNames[state.category]} 분류 지우기">${categoryNames[state.category]}${icon('close')}</button>`:''}<button class="filter-reset" data-filter-reset>조건 초기화</button>`;
  $('#browse-status').textContent=`${savedPage?'찜한 ':''}${state.query?'검색 결과 ':''}${list.length}개 제품${state.category!=='all'?', '+categoryNames[state.category]:''}`;
  $$('button[data-layout]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.layout===state.layout)));
  renderSidebar(list.length?list:products);
}
function renderSidebar(list){
  const preferred=['keyboard','illy','lantern','brita'];
  const chosen=[...list].sort((a,b)=>{const ia=preferred.indexOf(a.id),ib=preferred.indexOf(b.id);return (ia<0?99:ia)-(ib<0?99:ib);}).slice(0,4);
  $('#side-review-list').innerHTML=chosen.map(product=>{
    const review=product.reviews[0];
    return `<a class="side-review" data-open="${product.id}" href="${productUrl(product.id)}"><img src="${product.image}" alt="" loading="lazy" width="44" height="47"><span><small>${esc(product.name)}</small><strong>${esc(review.title)}</strong><span class="side-topic">${esc(review.topic)} · 원문을 읽고 정리</span></span></a>`;
  }).join('');
}
function syncActions(){
  $('#saved-count').textContent=state.saved.size;$('#compare-count').textContent=state.compare.length;$('#compare-count').hidden=!state.compare.length;
  $$('[data-save]').forEach(button=>{const saved=state.saved.has(button.dataset.save);button.setAttribute('aria-pressed',String(saved));button.setAttribute('aria-label',`${byId.get(button.dataset.save).name} ${saved?'찜 해제':'찜하기'}`);const label=button.querySelector('[data-save-label]');if(label)label.textContent=saved?'찜한 제품':'찜하기';});
  $$('[data-compare]').forEach(button=>{const selected=state.compare.includes(button.dataset.compare);button.setAttribute('aria-pressed',String(selected));button.setAttribute('aria-label',`${byId.get(button.dataset.compare).name} ${selected?'비교에서 빼기':'비교에 담기'}`);const label=button.querySelector('[data-compare-label]');if(label)label.textContent=selected?'비교 중':'비교';});
  $('#compare-tray').hidden=state.compare.length===0||state.page==='compare';
  $('#tray-products').innerHTML=state.compare.map(id=>{const p=byId.get(id);return `<div class="tray-product"><img src="${p.image}" alt="" width="43" height="43"><span>${esc(p.name)}</span><button data-compare="${id}" aria-label="${esc(p.name)} 비교에서 빼기">${icon('close')}</button></div>`;}).join('');
  $('#tray-count').textContent=state.compare.length<2?'1개 선택 · 1개 더 골라주세요':`${state.compare.length}/3개 선택`;
  $('#open-comparison').disabled=state.compare.length<2;$$('[data-compare-clear]').forEach(button=>button.disabled=!state.compare.length);
  document.documentElement.style.setProperty('--tray-height',$('#compare-tray').hidden?'0px':`${$('#compare-tray').getBoundingClientRect().height+24}px`);
}
function toggleSave(id){
  if(!byId.has(id))return;
  const wasSaved=state.saved.has(id);wasSaved?state.saved.delete(id):state.saved.add(id);
  const persisted=persist(savedKey,JSON.stringify([...state.saved]));
  if(state.page==='saved'){renderBrowse();$('#main').focus({preventScroll:true});}syncActions();
  notify((wasSaved?'찜한 제품에서 뺐어요.':'찜한 제품에 저장했어요.')+(!persisted?' 이 창을 닫으면 저장이 사라져요.':''));
}
function toggleCompare(id){
  if(!byId.has(id))return;
  if(state.compare.includes(id))state.compare=state.compare.filter(value=>value!==id);
  else if(state.compare.length>=3)return notify('비교는 한 번에 3개까지 할 수 있어요. 먼저 선택한 제품을 빼 주세요.');
  else state.compare.push(id);
  const persisted=persist(compareKey,JSON.stringify(state.compare));
  if(state.page==='compare')renderComparison();syncActions();
  if(!persisted)notify('이 브라우저에서는 저장이 제한돼요. 창을 닫기 전까지 비교할 수 있어요.');
}
function renderProduct(){
  const p=byId.get(state.product);
  if(!p){
    document.title='제품을 찾을 수 없어요 — 후기돋보기';
    $('#product-view').innerHTML=`<div class="empty-state">${icon('search')}<h1 id="product-title" tabindex="-1">제품을 찾을 수 없어요.</h1><p>주소를 다시 확인하거나 다른 제품의 후기를 찾아보세요.</p><a class="button primary" href="#home">전체 제품 보기</a></div>`;
    return;
  }
  document.title=`${p.name} 후기 — 후기돋보기`;
  $('#product-view').innerHTML=`
    <nav class="product-breadcrumb" aria-label="현재 위치"><a href="${esc(productReturn.hash)}" data-product-return>${icon('arrow')}목록으로</a><span>${esc(p.categoryName)}</span><span aria-current="page">제품 후기</span></nav>
    <header class="product-page-header"><div><span class="product-page-brand">${esc(p.brand)} · ${esc(p.categoryName)}</span><h1 id="product-title" tabindex="-1">${esc(p.name)}</h1><p>${esc(p.subtitle)}</p><span class="product-evidence-line">${p.collectedAt.slice(0,10).replaceAll('-','.')} 수집 · 분석한 후기 표본 <b>${p.reviewSampleCount}개</b> · 출처 ${esc(p.source)}</span></div><div class="product-header-tools"><img class="product-mobile-photo" src="${p.image}" alt="${esc(p.name)} 판매처 제품 사진" width="88" height="88"><button class="share-button" data-share="${p.id}">${icon('share')}링크 복사</button></div></header>
    <div class="share-fallback" id="share-fallback" hidden><label for="share-address">이 제품의 후기 주소</label><input id="share-address" readonly value="${esc(publicProductUrl(p.id))}"><p>주소를 선택해 복사해 주세요.</p></div>
    <nav class="detail-section-nav" aria-label="제품 후기 안에서 이동"><button data-detail-jump="review-summary">후기 요약</button><button data-detail-jump="review-mentions">긍정·아쉬움</button><button data-detail-jump="product-reviews">원문 후기</button><button data-detail-jump="product-source-info">출처</button></nav>
    <div class="product-detail-layout">
      <div class="review-reading">
        ${renderReviewSummary(p)}
        ${renderMentionSection(p,state.mentionMinimum)}
        ${renderOriginalReviews(p)}
        <section class="product-source-info" id="product-source-info" aria-labelledby="product-source-title" tabindex="-1"><h2 id="product-source-title">출처와 수집 범위</h2><p>${esc(p.collectedAt.slice(0,10).replaceAll('-','.'))} 수집 · 11번가 공개 상품 페이지</p><a class="product-source-link" href="${esc(p.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(p.sourceTitle)}${icon('external')}</a><details><summary>후기를 읽기 전에 확인해 주세요.</summary><p>요약·주제별 언급 수는 수집한 원문 표본 기준이며 판매처 전체 리뷰를 대표하지 않아요. 원문 발췌는 짧은 원문 발췌이고, 내용을 고치지 않았어요. 작성자의 개인 경험으로, 실구매·실사용·광고 여부는 별도로 인증하지 않았어요. 같은 상품 페이지에 여러 옵션이나 이전 모델 후기가 섞일 수 있어요. 작성일은 제공되지 않았어요.</p><p>개별 리뷰로 이동하는 링크가 없어 원문 상품 페이지를 연결했어요. 판매 상태·구성·가격은 원문에서 다시 확인해 주세요.</p></details></section>
        <a class="product-return-bottom text-link" href="${esc(productReturn.hash)}" data-product-return>다른 제품의 후기도 둘러보기${icon('arrow')}</a>
      </div>
      <aside class="product-info-rail" aria-label="제품 정보"><img class="product-rail-photo" src="${p.image}" alt="${esc(p.name)} 판매처 제품 사진" width="300" height="250"><div class="product-rail-copy"><h2>이번에 확인한 자료</h2><dl><div class="sample-stat"><dt>분석한 후기 표본</dt><dd>${p.reviewSampleCount}개</dd></div><div><dt>판매처 전체 리뷰</dt><dd>${number(p.sourceReviewCount)}개</dd></div><div><dt>판매처 표시 평점</dt><dd>${rating(p.sourceRating)} / 5</dd></div></dl><p>수집 당시 해당 판매 페이지 기준<br>전체 리뷰와 확인한 표본 수는 달라요.</p></div><div class="product-rail-actions"><button class="button primary" data-save="${p.id}" aria-pressed="${state.saved.has(p.id)}">${icon('bookmark')}<span data-save-label>찜하기</span></button><button class="button secondary" data-compare="${p.id}" aria-pressed="${state.compare.includes(p.id)}">${icon('compare')}<span data-compare-label>비교</span></button></div><a class="product-original-link" href="${esc(p.sourceUrl)}" target="_blank" rel="noopener noreferrer">판매처 원문 페이지${icon('external')}</a><div class="product-reading-links" hidden><button data-detail-jump="review-summary">후기 요약${icon('arrow')}</button><button data-detail-jump="review-mentions">긍정·아쉬움 언급 수${icon('arrow')}</button><button data-detail-jump="product-reviews">원문 발췌${icon('arrow')}</button><button data-detail-jump="product-source-info">출처와 수집 범위${icon('arrow')}</button></div></aside>
    </div>`;
}
function renderComparison(){
  const chosen=state.compare.map(id=>byId.get(id));
  if(chosen.length<2){$('#comparison-content').innerHTML=`<div class="empty-state">${icon('compare')}<h2>${chosen.length?'한 개만 더 고르면 비교할 수 있어요.':'비교할 제품을 두 개 이상 골라주세요.'}</h2><p>${chosen.length?`선택한 제품: ${esc(chosen[0].name)}`:'목록의 비교 버튼을 눌러 최대 세 개를 나란히 볼 수 있어요.'}</p><button class="button primary" data-reset>제품 고르러 가기</button><p class="storage-note">선택은 이 브라우저에 저장돼요.</p></div>`;return;}
  const cross=chosen.some(p=>p.category!==chosen[0].category);
  $('#comparison-content').innerHTML=`<p class="compare-notice">${cross?'서로 다른 분류의 제품을 골랐어요. ':''}용도와 사용 상황을 함께 보고 비교해 주세요. 평점과 전체 리뷰 수는 각 판매 페이지의 표시값이에요.</p><p class="storage-note">비교 선택은 이 브라우저에 저장되며, 다른 기기와 연동되지 않아요.</p><p class="comparison-scroll-note" ${chosen.length<3?'hidden':''}>옆으로 밀어 ${chosen.length}개 제품의 후기를 비교해 보세요.</p><div class="comparison-grid" data-count="${chosen.length}" tabindex="0" role="region" aria-label="선택한 제품의 후기 비교. 좁은 화면에서는 좌우로 스크롤할 수 있어요.">${chosen.map(p=>`<article class="comparison-column"><img class="comparison-photo" src="${p.image}" alt="${esc(p.name)}" width="240" height="160"><span class="product-brand">${esc(p.brand)}</span><h2>${esc(p.name)}</h2><div class="comparison-cell sample-stat"><small>분석한 후기 표본</small><p><strong>${p.reviewSampleCount}개</strong> · ${p.reviews.length}개 요약</p></div><div class="comparison-cell good"><small>좋았다는 의견</small><p>${esc(p.good)}</p></div><div class="comparison-cell"><small>함께 확인할 점</small><p>${esc(p.caution)}</p></div><div class="comparison-cell"><small>판매처 전체 리뷰 · 표시 평점</small><p>${number(p.sourceReviewCount)}개 · ${rating(p.sourceRating)} / 5</p></div><a class="review-detail-button" data-open="${p.id}" href="${productUrl(p.id)}">출처와 후기 읽기${icon('arrow')}</a><button class="text-button" data-compare="${p.id}" aria-label="${esc(p.name)} 비교에서 빼기">선택에서 빼기</button></article>`).join('')}</div>`;
}
function renderPrivacy(){
  $('#privacy-content').innerHTML=`<section><h2>찜·비교는 이 브라우저에 저장돼요.</h2><p>선택한 제품 번호와 목록 표시 방식을 브라우저 저장 공간에 보관해요. 회원 계정이나 서버와 동기화하지 않으므로 다른 기기에서는 이어지지 않아요. 브라우저 데이터를 삭제하거나 비공개 창을 닫으면 저장 내용이 사라질 수 있어요.</p><button class="button secondary" data-local-clear ${!state.saved.size&&!state.compare.length?'disabled':''}>이 브라우저의 찜·비교 비우기</button></section><section><h2>현재 제공하는 기능과 수집 범위</h2><p>회원가입·후기 작성·결제 기능은 제공하지 않아요. 검색어는 화면 주소의 # 뒤에 표시되고, 별도 검색 서버로 보내지 않아요. 앱 코드에는 광고·분석 추적 도구를 연결하지 않았어요.</p><p>페이지를 제공하는 호스팅 업체의 접속 정보 처리는 해당 업체 정책을 확인해 주세요. <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener noreferrer">GitHub 개인정보 안내 ↗</a></p></section><section><h2>외부 원문으로 이동할 때</h2><p>원문 링크를 누르면 판매처 사이트가 새 창에서 열려요. 그곳의 로그인·구매·개인정보 처리에는 해당 사이트 정책이 적용돼요.</p></section><section><h2>자료 오류·수정 요청</h2><p>${site.contactEmail?`<a href="mailto:${esc(site.contactEmail)}">${esc(site.contactEmail)}</a>로 제품 이름과 원문 주소를 알려주세요.`:`현재는 <a href="${esc(site.supportUrl)}" target="_blank" rel="noopener noreferrer">공개 자료 오류 게시판 ↗</a>에서 제보할 수 있어요. 공개 게시판이므로 연락처 등 개인정보는 적지 마세요. 정식 운영 문의 창구는 준비 중이에요.`}</p><p>이 페이지는 현재 구현된 저장 동작을 설명하는 안내예요. 문의는 위 이메일로 접수해요. 정식 운영에 필요한 정책은 운영 주체와 데이터 처리 범위를 확정한 뒤 보완할 예정이에요.</p></section>`;
}
function renderStandards(){
  $('#standards-content').innerHTML=`<section><h2>실제 제품 ${products.length}개, 공개 후기 ${data.reviewSampleCount}개</h2><p>${collectionPeriod}에 11번가의 공개 상품 페이지에서 제품 사진과 노출된 후기 표본을 소량 수집했어요. 생필품·디지털·주방·뷰티·생활·식품·패션·취미의 예시 제품이며, 시장 전체를 조사한 순위가 아니에요.</p></section><section><h2>제품은 어떤 순서로 보이나요?</h2><p>첫 화면은 실제 원문을 대조하는 예시와 고정된 기본순으로 제품을 보여줍니다. 인기도나 품질 순위가 아니며, 검색·카테고리와 찜 목록에는 해당하는 모든 제품을 보여줘요. 리뷰 수·평점·이름순을 직접 고르면 선택한 기준으로 전체 목록을 정렬해요. 실제 조회수와 실시간 인기도는 수집하지 않아요.</p></section><section><h2>숫자는 이렇게 읽어주세요.</h2><ul><li><strong>판매처 리뷰 수</strong>: 해당 상품 페이지가 표시한 전체 리뷰 수예요. 수집한 후기 수와 달라요.</li><li><strong>별점</strong>: 원문에 ‘판매자 평점’으로 표시된 값이에요. 후기돋보기가 계산한 통합 제품 평점이 아니에요.</li><li><strong>후기 요약</strong>: 실제 공개 후기를 읽고 재구성한 내용이에요. 이번에는 ${data.summaryCount}개를 선별해 정리했어요.</li><li><strong>판매처 리뷰 많은 순</strong>: 이번 ${products.length}개 제품의 해당 판매처 리뷰 수만 비교한 순서예요. 종합 인기·품질 순위가 아니에요.</li></ul></section><section><h2>요약·원문 발췌·언급 수를 구분해요.</h2><p>후기 요약은 원문을 읽고 정리한 글이에요. 일반 후기는 문장을 고치지 않은 짧은 원문 발췌로, 전체 글은 출처에서 볼 수 있어요. 언급 수는 수집한 표본을 주제별로 분류한 결과이며 같은 후기의 같은 주제는 한 번만 세요. 한 후기가 여러 주제에 포함될 수 있고, 별점만으로 긍정·부정을 판단하지 않았어요.</p></section><section><h2>확인하지 못한 정보도 남겨두었어요.</h2><p>작성일과 사용 기간은 공개 요약 영역에서 확인되지 않아 임의로 넣지 않았어요. 작성자가 2년 사용 등을 직접 언급한 경우에만 요약에 반영했어요. 광고 여부·실구매·제품 진위는 별도 인증하지 않았어요. 사진의 구성과 후기는 여러 옵션이나 이전 모델을 포함할 수 있어요.</p></section><section><h2>제품별 원문 출처</h2><p>개별 후기 고유 링크가 제공되지 않아 원문 상품 페이지의 리뷰 영역에서 확인할 수 있어요. 원문이 수정되거나 상품 판매가 종료될 수 있어요.</p><div class="source-table-scroll"><table><caption class="sr-only">등록된 제품별 원문 출처와 확인한 후기 표본 수</caption><thead><tr><th scope="col">제품</th><th scope="col">확인한 후기</th><th scope="col">원문</th></tr></thead><tbody>${products.map(p=>`<tr><td>${esc(p.name)}</td><td>${p.reviewSampleCount}개</td><td><a href="${p.sourceUrl}" target="_blank" rel="noopener noreferrer" aria-label="${esc(p.name)} 11번가 출처 새 창에서 보기">11번가 ↗</a></td></tr>`).join('')}</tbody></table></div></section>`;
}
function route(){
  const leavingProduct=state.page==='product';
  Object.assign(state,readRoute(location.hash,categoryNames));
  $('#main').dataset.page=state.page;document.documentElement.dataset.page=state.page;$('.sidebar').hidden=true;
  $('.category-wrap').hidden=!['home','saved'].includes(state.page);
  $('#browse-view').hidden=!['home','saved'].includes(state.page);$('#compare-view').hidden=state.page!=='compare';$('#standards-view').hidden=state.page!=='standards';$('#product-view').hidden=state.page!=='product';
  $('#privacy-view').hidden=state.page!=='privacy';
  document.title=({saved:'찜한 제품',compare:'제품 비교',standards:'수집 기준과 출처',privacy:'저장·개인정보 안내'}[state.page]||'')?( {saved:'찜한 제품',compare:'제품 비교',standards:'수집 기준과 출처',privacy:'저장·개인정보 안내'}[state.page]+' — 후기돋보기'):siteTitle;
  $$('[data-nav]').forEach(link=>link.dataset.nav===state.page?link.setAttribute('aria-current','page'):link.removeAttribute('aria-current'));
  renderCategories();
  if(state.page==='product')renderProduct();else if(state.page==='compare')renderComparison();else if(state.page==='standards')renderStandards();else if(state.page==='privacy')renderPrivacy();else renderBrowse();
  syncActions();
  if(state.page==='product'){history.replaceState({...history.state,productReturn},'');$('#product-title').focus({preventScroll:true});}
  if(leavingProduct&&location.hash===productReturn.hash){
    const returnHash=location.hash;
    requestAnimationFrame(()=>{
      if(location.hash!==returnHash)return;
      const trigger=$$('[data-open]').find(link=>link.dataset.open===productReturn.trigger&&(!productReturn.triggerClass||link.className===productReturn.triggerClass)&&link.getClientRects().length);
      (trigger||$('#main')).focus({preventScroll:true});window.scrollTo({top:productReturn.scroll,behavior:'instant'});
    });
  }else{window.scrollTo({top:0,behavior:'instant'});if(leavingProduct)$('#main').focus({preventScroll:true});}
}
document.addEventListener('click',event=>{
  const target=event.target.closest('button,a');
  if(!target){
    const card=event.target.closest('.product-card');
    if(card&&card.dataset.product){
      if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      if(state.page!=='product')productReturn={hash:location.hash||'#home',scroll:window.scrollY,trigger:card.dataset.product,triggerClass:'product-card',layout:state.layout};
      event.preventDefault();return go(`product/${card.dataset.product}`);
    }
    return;
  }
  if(target.hasAttribute('data-open')){
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    if(state.page!=='product')productReturn={hash:location.hash||'#home',scroll:window.scrollY,trigger:target.dataset.open,triggerClass:target.className,layout:state.layout};
    event.preventDefault();return go(`product/${target.dataset.open}`);
  }
  if(target.hasAttribute('data-detail-jump')){const section=document.getElementById(target.dataset.detailJump);section?.focus({preventScroll:true});section?.scrollIntoView({block:'start',behavior:'instant'});return;}
  if(target.hasAttribute('data-share')){const address=publicProductUrl(target.dataset.share);if(navigator.clipboard?.writeText)navigator.clipboard.writeText(address).then(()=>notify('제품 후기 링크를 복사했어요.'),()=>{$('#share-fallback').hidden=false;$('#share-address').focus();$('#share-address').select();});else{$('#share-fallback').hidden=false;$('#share-address').focus();$('#share-address').select();}return;}
  if(target.hasAttribute('data-save'))return toggleSave(target.dataset.save);
  if(target.hasAttribute('data-compare'))return toggleCompare(target.dataset.compare);
  if(target.hasAttribute('data-category'))return go(state.page==='saved'?'saved':'home',{category:target.dataset.category,q:state.query,sort:state.sort});
  if(target.hasAttribute('data-layout')){state.layout=target.dataset.layout;persist(layoutKey,state.layout);renderBrowse();syncActions();return;}
  if(target.hasAttribute('data-reset'))return go('home');
  if(target.hasAttribute('data-query-clear'))return go(state.page,{category:state.category,sort:state.sort});
  if(target.hasAttribute('data-filter-reset'))return go(state.page==='saved'?'saved':'home');
  if(target.hasAttribute('data-search-suggestion'))return go('home',{q:target.dataset.searchSuggestion});
  if(target.hasAttribute('data-standards'))return go('standards');
  if(target.hasAttribute('data-compare-clear')){state.compare=[];persist(compareKey,'[]');syncActions();if(state.page==='compare')renderComparison();notify('비교 선택을 비웠어요.');return;}
  if(target.hasAttribute('data-local-clear')){state.saved.clear();state.compare=[];persist(savedKey,'[]');persist(compareKey,'[]');syncActions();renderPrivacy();$('#privacy-title').focus({preventScroll:true});notify('이 브라우저의 찜·비교 선택을 비웠어요.');return;}
});
$('#product-view').addEventListener('change',event=>{
  if(event.target.id!=='mention-minimum')return;
  state.mentionMinimum=[1,2,3].includes(Number(event.target.value))?Number(event.target.value):1;
  const product=byId.get(state.product);if(!product)return;
  $('#mention-groups').innerHTML=renderMentionGroups(product,state.mentionMinimum);
  $('#mention-filter-status').textContent=`${state.mentionMinimum}개 후기 이상에서 언급된 항목`;
});
$('#search-form').addEventListener('submit',event=>{event.preventDefault();go('home',{q:$('#product-search').value.trim()});});
$('.skip-link').addEventListener('click',event=>{event.preventDefault();$('#main').focus();$('#main').scrollIntoView({block:'start'});});
$('#product-search').addEventListener('search',()=>{if(!$('#product-search').value&&state.query)go('home');});
$('#sort-select').addEventListener('change',event=>go(state.page,{category:state.category,q:state.query,sort:event.target.value}));
$('#open-comparison').addEventListener('click',()=>{if(state.compare.length>=2)go('compare');});
document.addEventListener('error',event=>{if(event.target instanceof HTMLImageElement&&!event.target.dataset.fallback){event.target.dataset.fallback='true';event.target.alt='제품 사진을 불러오지 못했어요. 제품명과 후기는 계속 확인할 수 있어요.';event.target.classList.add('image-error');event.target.src='assets/brand/image-unavailable.svg';}},true);
window.addEventListener('hashchange',route);$('#category-nav').addEventListener('scroll',updateCategoryScroll,{passive:true});
window.addEventListener('storage',event=>{if([savedKey,compareKey].includes(event.key)){try{state.saved=new Set(parseSelection(localStorage.getItem(savedKey),byId));state.compare=parseSelection(localStorage.getItem(compareKey),byId,3);}catch{return;}if(['home','saved'].includes(state.page))renderBrowse();else if(state.page==='compare')renderComparison();else if(state.page==='privacy')renderPrivacy();syncActions();}});
const updateHeader=()=>document.documentElement.style.setProperty('--header-height',`${$('.site-header').getBoundingClientRect().height}px`);
if('ResizeObserver' in window){const observer=new ResizeObserver(()=>{updateHeader();updateCategoryScroll();document.documentElement.style.setProperty('--tray-height',$('#compare-tray').hidden?'0px':`${$('#compare-tray').getBoundingClientRect().height+24}px`);});observer.observe($('.site-header'));observer.observe($('#compare-tray'));}
updateHeader();
$('#browse-collection-period').textContent=`${collectionDates[0].slice(5).replace('-','.')}–${collectionDates.at(-1).slice(5).replace('-','.')} 수집`;$('#product-total').textContent=`${products.length}개`;$('#collection-period').textContent=`${collectionPeriod} 수집 · 실시간 갱신 전`;$('#sample-total').textContent=`${data.reviewSampleCount}개`;$('#summary-total').textContent=`${data.summaryCount}개`;$('#excerpt-total').textContent=`${data.originalExcerptCount}개`;
route();
document.documentElement.dataset.appReady='true';
window.dispatchEvent(new Event('review:ready'));
