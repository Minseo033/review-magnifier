import data from './data/catalog.viewer.json';
import {renderReviewSummary,renderMentionSection,renderMentionGroups,renderOriginalReviews} from './review-insights.js';

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const icon=name=>`<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const number=value=>Number(value).toLocaleString('ko-KR');
const productUrl=id=>`#product/${encodeURIComponent(id)}`;
const siteTitle='후기돋보기 — 제품은 한눈에, 후기는 자세히';
const products=data.products;
const byId=new Map(products.map(product=>[product.id,product]));
const reviewOrder=(a,b)=>b.sourceReviewCount-a.sourceReviewCount||a.id.localeCompare(b.id);
const featuredProducts=[...products].sort(reviewOrder).slice(0,3);
const featuredIds=new Set(featuredProducts.map(product=>product.id));
// Shuffle once per page load so navigating or saving never moves a product.
const shuffledProducts=[...products];
for(let i=shuffledProducts.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffledProducts[i],shuffledProducts[j]]=[shuffledProducts[j],shuffledProducts[i]];}
const randomPosition=new Map(shuffledProducts.map((product,index)=>[product.id,index]));
const categories=[['all','전체','grid'],['digital','가전·디지털','digital'],['kitchen','주방','kitchen'],['beauty','뷰티','beauty'],['living','생활·인테리어','living'],['food','식품','food'],['fashion','패션','fashion'],['hobby','취미','hobby']];
const categoryNames=Object.fromEntries(categories.map(([id,name])=>[id,name]));
const savedKey='review-magnifier:catalog-saved';
const state={page:'home',category:'all',query:'',sort:'recommended',layout:'grid',saved:new Set(),compare:[],product:null,mentionMinimum:1};
const rememberedReturn=history.state?.productReturn;
let productReturn=rememberedReturn&&/^#(?:home|saved|compare)(?:\?|$)/.test(rememberedReturn.hash)&&Number.isFinite(rememberedReturn.scroll)?rememberedReturn:{hash:'#home',scroll:0,trigger:null,layout:'grid'},toastTimer;
state.layout=productReturn.layout==='list'?'list':'grid';
try {const saved=JSON.parse(localStorage.getItem(savedKey)||'[]');if(Array.isArray(saved))state.saved=new Set(saved.filter(id=>byId.has(id)));} catch { /* Memory-only saving remains available. */ }
if('scrollRestoration' in history)history.scrollRestoration='manual';

function notify(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,2800);}
function go(page='home',values={}){
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(values))if(value&&value!=='all'&&value!=='recommended')params.set(key,value);
  const hash=`#${page}${params.size?'?'+params:''}`;
  if(location.hash===hash)route();else location.hash=hash;
}
function sortedProducts(){
  const query=state.query.toLocaleLowerCase('ko').replace(/\s/g,'');
  return products.filter(product=>{
    if(state.page==='saved'&&!state.saved.has(product.id))return false;
    if(state.category!=='all'&&product.category!==state.category)return false;
    if(!query)return true;
    const haystack=[product.name,product.brand,product.sourceTitle,product.categoryName,product.subtitle,product.lead,product.good,product.caution,...product.tags,...product.reviews.flatMap(review=>[review.topic,review.title,review.summary]),...product.reviewAnalysis.originalExcerpts.map(review=>review.text)].join(' ').toLocaleLowerCase('ko').replace(/\s/g,'');
    return haystack.includes(query);
  }).sort((a,b)=>state.sort==='name'?a.name.localeCompare(b.name,'ko'):state.sort==='rating'?(b.sourceRating-a.sourceRating||reviewOrder(a,b)):state.sort==='reviews'?reviewOrder(a,b):randomPosition.get(a.id)-randomPosition.get(b.id));
}
function renderCategories(){
  if($('#category-nav').children.length){$$('[data-category]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.category===state.category)));return;}
  $('#category-nav').innerHTML=categories.map(([id,name,glyph])=>`<button class="category-button" data-category="${id}" aria-pressed="${state.category===id}"><span class="category-icon">${icon(glyph)}</span><span>${name}</span></button>`).join('');
}
function productCard(product,rank=0){
  const saved=state.saved.has(product.id),compared=state.compare.includes(product.id);
  return `<article class="product-card" data-product="${product.id}"><div class="product-media"><a class="product-photo-button" data-open="${product.id}" aria-label="${esc(product.name)} 제품 사진과 후기 보기" href="${productUrl(product.id)}"><img class="product-photo" src="${product.imageData}" alt="${esc(product.brand+' '+product.name)} 판매처 제품 사진" loading="eager" decoding="async" width="600" height="600"></a>${rank?`<span class="product-rank ${rank<=3?'top-rank':''}" aria-label="선택 범위의 판매처 리뷰 수 ${rank}위">${String(rank).padStart(2,'0')}</span>`:''}<button class="save-button" data-save="${product.id}" aria-label="${esc(product.name)} 찜하기" aria-pressed="${saved}">${icon('bookmark')}</button></div>
  <div class="product-copy"><span class="product-brand">${esc(product.brand)} · ${esc(product.categoryName)}</span><a class="product-name-button" data-open="${product.id}" href="${productUrl(product.id)}"><h2>${esc(product.name)}</h2></a>
  <a class="review-preview" data-open="${product.id}" aria-label="${esc(product.name)} 장점과 아쉬운 점 읽기" href="${productUrl(product.id)}"><span class="review-preview-label">후기를 읽어보니</span><p>${esc(product.lead)}</p><span class="preview-caution">체크 · ${esc(product.caution)}</span></a><p class="product-subtitle">${esc(product.subtitle)}</p><div class="review-metrics" title="11번가 해당 판매 페이지에 표시된 평점과 전체 리뷰 수"><span class="rating-star" aria-hidden="true">★</span><b>${product.sourceRating.toFixed(1)}</b><span class="metrics-divider" aria-hidden="true"></span><span>판매처 리뷰 <b>${number(product.sourceReviewCount)}</b></span></div><div class="card-actions"><a class="review-detail-button" data-open="${product.id}" aria-label="${esc(product.name)} 원문 후기와 요약 읽기" href="${productUrl(product.id)}">원문 후기·요약${icon('arrow')}</a><button class="compare-button" data-compare="${product.id}" aria-pressed="${compared}" aria-label="${esc(product.name)} 비교에 담기"><span class="compare-checkbox">${icon('check')}</span>비교</button></div></div></article>`;
}
function renderBrowse(){
  const list=sortedProducts(),savedPage=state.page==='saved';
  const showFeatured=!savedPage&&!state.query&&state.category==='all'&&state.sort==='recommended';
  const remaining=showFeatured?list.filter(product=>!featuredIds.has(product.id)):list;
  $('#browse-title').textContent=savedPage?'다시 보고 싶은 제품을 모았어요.':state.query?'찾던 제품의 후기를 살펴보세요.':showFeatured?'리뷰가 많이 쌓인 제품':state.category==='all'?'사진으로 찾고, 후기로 고르세요.':`${categoryNames[state.category]} 제품, 써본 이야기는?`;
  $('#section-kicker').textContent=savedPage?'내가 찜한 제품':'써본 사람의 이야기';
  $('#result-count').textContent=list.length;
  $('#result-context').textContent=state.category==='all'?'공개 구매 후기 요약':categoryNames[state.category];
  $('#sort-select').value=state.sort;
  $('#sort-select option[value="recommended"]').textContent=showFeatured?'추천 + 랜덤':'랜덤순';
  $('#product-search').value=state.query;
  $('#featured-products').hidden=!showFeatured;
  $('#featured-grid').dataset.layout=state.layout;
  $('#featured-grid').innerHTML=showFeatured?featuredProducts.map((product,index)=>productCard(product,index+1)).join(''):'';
  $('#discovery-heading').hidden=!showFeatured||!remaining.length;
  $('#discovery-description').textContent=`${remaining.length}개 제품 · 새로 접속할 때마다 다른 순서로 보여드려요.`;
  $('#product-grid').dataset.layout=state.layout;
  $('#product-grid').innerHTML=remaining.map((product,index)=>productCard(product,state.sort==='reviews'&&!savedPage?index+1:0)).join('');
  $('#empty-state').hidden=!!list.length;$('#catalog-end').hidden=!list.length;
  if(!list.length){
    const noSaved=savedPage&&!state.saved.size;
    $('#empty-title').textContent=noSaved?'아직 찜한 제품이 없어요.':'찾는 제품이 아직 없어요.';
    $('#empty-description').textContent=noSaved?'제품 사진의 북마크를 눌러 다시 보고 싶은 후기를 모아두세요.':'제품명, 브랜드 또는 다른 카테고리로 찾아보세요.';
  }
  $('#search-context').hidden=!state.query;
  $('#search-context').innerHTML=state.query?`<span>‘${esc(state.query)}’ 검색 결과</span><button data-query-clear aria-label="검색어 지우기">검색 지우기${icon('close')}</button>`:'';
  $$('[data-layout]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.layout===state.layout)));
  renderSidebar(list.length?list:products);
}
function renderSidebar(list){
  const preferred=['keyboard','illy','lantern','brita'];
  const chosen=[...list].sort((a,b)=>{const ia=preferred.indexOf(a.id),ib=preferred.indexOf(b.id);return (ia<0?99:ia)-(ib<0?99:ib);}).slice(0,4);
  $('#side-review-list').innerHTML=chosen.map(product=>{
    const review=product.reviews[0];
    return `<a class="side-review" data-open="${product.id}" href="${productUrl(product.id)}"><img src="${product.imageData}" alt="" width="44" height="47"><span><small>${esc(product.name)}</small><strong>${esc(review.title)}</strong><span class="side-topic">${esc(review.topic)} · 11번가 원문 요약</span></span></a>`;
  }).join('');
}
function syncActions(){
  $('#saved-count').textContent=state.saved.size;$('#compare-count').textContent=state.compare.length;$('#compare-count').hidden=!state.compare.length;
  $$('[data-save]').forEach(button=>button.setAttribute('aria-pressed',String(state.saved.has(button.dataset.save))));
  $$('[data-compare]').forEach(button=>button.setAttribute('aria-pressed',String(state.compare.includes(button.dataset.compare))));
  $('#compare-tray').hidden=state.compare.length===0||state.page==='compare';
  $('#tray-products').innerHTML=state.compare.map(id=>{const p=byId.get(id);return `<div class="tray-product"><img src="${p.imageData}" alt="${esc(p.name)}" width="43" height="43"><button data-compare="${id}" aria-label="${esc(p.name)} 비교에서 빼기">${icon('close')}</button></div>`;}).join('');
  $('#tray-count').textContent=`${state.compare.length}/3 선택`;
  $('#open-comparison').disabled=state.compare.length<2;
}
function toggleSave(id){
  if(!byId.has(id))return;
  const wasSaved=state.saved.has(id);wasSaved?state.saved.delete(id):state.saved.add(id);
  let persisted=true;try{localStorage.setItem(savedKey,JSON.stringify([...state.saved]));}catch{persisted=false;}
  if(state.page==='saved'){renderBrowse();$('#main').focus({preventScroll:true});}syncActions();
  notify((wasSaved?'찜한 제품에서 뺐어요.':'찜한 제품에 저장했어요.')+(!persisted?' 이 창을 닫으면 저장이 사라져요.':''));
}
function toggleCompare(id){
  if(!byId.has(id))return;
  if(state.compare.includes(id))state.compare=state.compare.filter(value=>value!==id);
  else if(state.compare.length>=3)return notify('비교는 한 번에 3개까지 할 수 있어요. 먼저 선택한 제품을 빼 주세요.');
  else state.compare.push(id);
  if(state.page==='compare')renderComparison();syncActions();
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
    <header class="product-page-header"><div><span class="product-page-brand">${esc(p.brand)} · ${esc(p.categoryName)}</span><h1 id="product-title" tabindex="-1">${esc(p.name)}</h1><p>${esc(p.subtitle)}</p></div><img class="product-mobile-photo" src="${p.imageData}" alt="${esc(p.name)} 판매처 제품 사진" width="88" height="88"></header>
    <div class="product-detail-layout">
      <div class="review-reading">
        ${renderReviewSummary(p)}
        ${renderMentionSection(p,state.mentionMinimum)}
        ${renderOriginalReviews(p)}
        <section class="product-source-info" id="product-source-info" aria-labelledby="product-source-title" tabindex="-1"><h2 id="product-source-title">출처와 수집 범위</h2><p>${esc(p.collectedAt.slice(0,10).replaceAll('-','.'))} 수집 · 11번가 공개 상품 페이지</p><a class="product-source-link" href="${esc(p.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(p.sourceTitle)}${icon('external')}</a><details><summary>후기를 읽기 전에 확인해 주세요.</summary><p>요약·주제별 언급 수는 수집한 원문 표본 기준이며 판매처 전체 리뷰를 대표하지 않아요. 일반 후기는 짧은 원문 발췌이고, 내용을 고치지 않았어요. 작성자의 개인 경험으로, 실구매·실사용·광고 여부는 별도로 인증하지 않았어요. 같은 상품 페이지에 여러 옵션이나 이전 모델 후기가 섞일 수 있어요. 작성일은 제공되지 않았어요.</p><p>개별 리뷰로 이동하는 링크가 없어 원문 상품 페이지를 연결했어요. 판매 상태·구성·가격은 원문에서 다시 확인해 주세요.</p></details></section>
        <a class="product-return-bottom text-link" href="${esc(productReturn.hash)}" data-product-return>다른 제품의 후기도 둘러보기${icon('arrow')}</a>
      </div>
      <aside class="product-info-rail" aria-label="제품 정보"><img class="product-rail-photo" src="${p.imageData}" alt="${esc(p.name)} 판매처 제품 사진" width="300" height="250"><div class="product-rail-copy"><h2>제품 정보</h2><dl><div><dt>판매처 전체 리뷰</dt><dd>${number(p.sourceReviewCount)}개</dd></div><div><dt>판매처 표시 평점</dt><dd>${p.sourceRating.toFixed(1)} / 5</dd></div><div><dt>확인한 후기 표본</dt><dd>${p.reviewSampleCount}개</dd></div></dl><p>수집 당시 해당 판매 페이지 기준</p></div><div class="product-rail-actions"><button class="button primary" data-save="${p.id}" aria-pressed="${state.saved.has(p.id)}">${icon('bookmark')}찜하기</button><button class="button secondary" data-compare="${p.id}" aria-pressed="${state.compare.includes(p.id)}">${icon('compare')}비교에 담기</button></div><a class="product-original-link" href="${esc(p.sourceUrl)}" target="_blank" rel="noopener noreferrer">판매처 원문 페이지${icon('external')}</a><div class="product-reading-links"><button data-detail-jump="review-summary">후기 요약${icon('arrow')}</button><button data-detail-jump="review-mentions">긍정·아쉬움 언급 수${icon('arrow')}</button><button data-detail-jump="product-reviews">일반 후기 원문 발췌${icon('arrow')}</button><button data-detail-jump="product-source-info">출처와 수집 범위${icon('arrow')}</button></div></aside>
    </div>`;
}
function renderComparison(){
  const chosen=state.compare.map(id=>byId.get(id));
  if(chosen.length<2){$('#comparison-content').innerHTML=`<div class="empty-state">${icon('compare')}<h2>비교할 제품을 두 개 이상 골라주세요.</h2><p>제품 목록에서 비교를 누르면 최대 세 개를 나란히 볼 수 있어요.</p><button class="button primary" data-reset>제품 고르러 가기</button></div>`;return;}
  const cross=chosen.some(p=>p.category!==chosen[0].category);
  $('#comparison-content').innerHTML=`<p class="compare-notice">${cross?'서로 다른 제품군을 선택했어요. 용도가 다른 제품의 별점으로 우열을 판단하기보다 후기 내용을 비교해 보세요.':'같은 제품군의 후기 내용을 나란히 볼 수 있어요.'} 평점과 리뷰 수는 각 판매 페이지 기준이에요.</p><div class="comparison-grid" data-count="${chosen.length}">${chosen.map(p=>`<article class="comparison-column"><img class="comparison-photo" src="${p.imageData}" alt="${esc(p.name)}" width="240" height="160"><span class="product-brand">${esc(p.brand)}</span><h2>${esc(p.name)}</h2><div class="comparison-cell"><small>판매처 리뷰 · 표시 평점</small><p><strong>${number(p.sourceReviewCount)}개</strong> · ${p.sourceRating.toFixed(1)}점</p></div><div class="comparison-cell good"><small>좋았다는 의견</small><p>${esc(p.good)}</p></div><div class="comparison-cell"><small>함께 확인할 점</small><p>${esc(p.caution)}</p></div><div class="comparison-cell"><small>모아본 표본 · 화면 요약</small><p>${p.reviewSampleCount}개 확인 · ${p.reviews.length}개 요약</p></div><a class="review-detail-button" data-open="${p.id}" href="${productUrl(p.id)}">출처와 후기 읽기${icon('arrow')}</a><button class="text-button" data-compare="${p.id}" aria-label="${esc(p.name)} 비교에서 빼기">선택에서 빼기</button></article>`).join('')}</div>`;
}
function renderStandards(){
  $('#standards-content').innerHTML=`<section><h2>실제 제품 12개, 공개 후기 ${data.reviewSampleCount}개</h2><p>2026년 11월 5일 11번가의 공개 상품 페이지에서 제품 사진과 노출된 후기 표본을 소량 수집했어요. 디지털·주방·뷰티·생활·식품·패션·취미의 임의 예시 제품이며, 시장 전체를 조사한 순위가 아니에요.</p></section><section><h2>제품은 어떤 순서로 보이나요?</h2><p>첫 화면의 상위 3개는 등록된 제품 중 해당 판매처의 전체 리뷰 수가 많은 순서예요. 나머지는 새로 접속하거나 새로고침할 때 무작위로 섞어요. 탐색 중에는 순서를 유지하며, 검색·카테고리와 찜 목록에는 해당하는 모든 제품을 보여줘요. 리뷰 수·평점·이름순을 직접 고르면 선택한 기준으로 전체 목록을 정렬해요. 실제 조회수와 실시간 인기도는 수집하지 않아요.</p></section><section><h2>숫자는 이렇게 읽어주세요.</h2><ul><li><strong>판매처 리뷰 수</strong>: 해당 상품 페이지가 표시한 전체 리뷰 수예요. 수집한 후기 수와 달라요.</li><li><strong>별점</strong>: 원문에 ‘판매자 평점’으로 표시된 값이에요. 후기돋보기가 계산한 통합 제품 평점이 아니에요.</li><li><strong>후기 요약</strong>: 실제 공개 후기를 읽고 재구성한 내용이에요. 이번에는 ${data.summaryCount}개를 선별해 정리했어요.</li><li><strong>판매처 리뷰 많은 순</strong>: 이번 12개 표본의 해당 판매처 리뷰 수만 비교한 순서예요. 종합 인기·품질 순위가 아니에요.</li></ul></section><section><h2>요약·원문 발췌·언급 수를 구분해요.</h2><p>후기 요약은 원문을 읽고 정리한 글이에요. 일반 후기는 문장을 고치지 않은 짧은 원문 발췌로, 전체 글은 출처에서 볼 수 있어요. 언급 수는 수집한 표본을 주제별로 분류한 결과이며 같은 후기의 같은 주제는 한 번만 세요. 한 후기가 여러 주제에 포함될 수 있고, 별점만으로 긍정·부정을 판단하지 않았어요.</p></section><section><h2>확인하지 못한 정보도 남겨두었어요.</h2><p>작성일과 사용 기간은 공개 요약 영역에서 확인되지 않아 임의로 넣지 않았어요. 작성자가 2년 사용 등을 직접 언급한 경우에만 요약에 반영했어요. 광고 여부·실구매·제품 진위는 별도 인증하지 않았어요. 사진의 구성과 후기는 여러 옵션이나 이전 모델을 포함할 수 있어요.</p></section><section><h2>제품별 원문 출처</h2><p>개별 후기 고유 링크가 제공되지 않아 원문 상품 페이지의 리뷰 영역에서 확인할 수 있어요. 원문이 수정되거나 상품 판매가 종료될 수 있어요.</p><div class="source-table-scroll"><table><thead><tr><th scope="col">제품</th><th scope="col">확인한 후기</th><th scope="col">원문</th></tr></thead><tbody>${products.map(p=>`<tr><td>${esc(p.name)}</td><td>${p.reviewSampleCount}개</td><td><a href="${p.sourceUrl}" target="_blank" rel="noopener noreferrer" aria-label="${esc(p.name)} 11번가 출처 새 창에서 보기">11번가 ↗</a></td></tr>`).join('')}</tbody></table></div></section>`;
}
function route(){
  const leavingProduct=state.page==='product';
  const [path,search='']=location.hash.slice(1).split('?'),params=new URLSearchParams(search);
  const [page,productId='']=path.split('/');
  state.page=['saved','compare','standards','product'].includes(page)?page:'home';
  state.product=state.page==='product'?productId:null;
  state.category=Object.hasOwn(categoryNames,params.get('category'))?params.get('category'):'all';
  state.query=(params.get('q')||'').slice(0,80);
  state.sort=['reviews','rating','name','recommended'].includes(params.get('sort'))?params.get('sort'):'recommended';
  $('#main').dataset.page=state.page;
  $('.category-wrap').hidden=state.page==='product';
  $('#browse-view').hidden=!['home','saved'].includes(state.page);$('#compare-view').hidden=state.page!=='compare';$('#standards-view').hidden=state.page!=='standards';$('#product-view').hidden=state.page!=='product';
  document.title=siteTitle;
  $$('[data-nav]').forEach(link=>link.dataset.nav===state.page?link.setAttribute('aria-current','page'):link.removeAttribute('aria-current'));
  renderCategories();
  if(state.page==='product')renderProduct();else if(state.page==='compare')renderComparison();else if(state.page==='standards')renderStandards();else renderBrowse();
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
  const target=event.target.closest('button,a');if(!target)return;
  if(target.hasAttribute('data-open')){
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    if(state.page!=='product')productReturn={hash:location.hash||'#home',scroll:window.scrollY,trigger:target.dataset.open,triggerClass:target.className,layout:state.layout};
    event.preventDefault();return go(`product/${target.dataset.open}`);
  }
  if(target.hasAttribute('data-detail-jump')){const section=document.getElementById(target.dataset.detailJump);section?.focus({preventScroll:true});section?.scrollIntoView({block:'start',behavior:'instant'});return;}
  if(target.hasAttribute('data-save'))return toggleSave(target.dataset.save);
  if(target.hasAttribute('data-compare'))return toggleCompare(target.dataset.compare);
  if(target.hasAttribute('data-category'))return go(state.page==='saved'?'saved':'home',{category:target.dataset.category,sort:state.sort});
  if(target.hasAttribute('data-layout')){state.layout=target.dataset.layout;renderBrowse();syncActions();return;}
  if(target.hasAttribute('data-reset'))return go('home');
  if(target.hasAttribute('data-query-clear'))return go(state.page,{category:state.category,sort:state.sort});
  if(target.hasAttribute('data-standards'))return go('standards');
  if(target.hasAttribute('data-compare-clear')){state.compare=[];syncActions();if(state.page==='compare')renderComparison();return;}
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
document.addEventListener('error',event=>{if(event.target instanceof HTMLImageElement){event.target.alt='사진을 표시하지 못했어요. 제품명과 후기는 계속 확인할 수 있어요.';event.target.classList.add('image-error');}},true);
window.addEventListener('hashchange',route);
$('#sample-total').textContent=`${data.reviewSampleCount}개`;$('#summary-total').textContent=`${data.summaryCount}개`;$('#excerpt-total').textContent=`${data.originalExcerptCount}개`;
route();
