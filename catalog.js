import data from './data/catalog.viewer.json';

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const icon=name=>`<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const number=value=>Number(value).toLocaleString('ko-KR');
const products=data.products;
const byId=new Map(products.map(product=>[product.id,product]));
const categories=[['all','전체','grid'],['digital','가전·디지털','digital'],['kitchen','주방','kitchen'],['beauty','뷰티','beauty'],['living','생활·인테리어','living'],['food','식품','food'],['fashion','패션','fashion'],['hobby','취미','hobby']];
const categoryNames=Object.fromEntries(categories.map(([id,name])=>[id,name]));
const savedKey='review-magnifier:catalog-saved';
const state={page:'home',category:'all',query:'',sort:'reviews',layout:'grid',saved:new Set(),compare:[],dialogProduct:null};
let dialogTrigger=null,toastTimer;
try {const saved=JSON.parse(localStorage.getItem(savedKey)||'[]');if(Array.isArray(saved))state.saved=new Set(saved.filter(id=>byId.has(id)));} catch { /* Memory-only saving remains available. */ }
if('scrollRestoration' in history)history.scrollRestoration='manual';

function notify(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,2800);}
function go(page='home',values={}){
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(values))if(value&&value!=='all'&&value!=='reviews')params.set(key,value);
  const hash=`#${page}${params.size?'?'+params:''}`;
  if(location.hash===hash)route();else location.hash=hash;
}
function sortedProducts(){
  const query=state.query.toLocaleLowerCase('ko').replace(/\s/g,'');
  return products.filter(product=>{
    if(state.page==='saved'&&!state.saved.has(product.id))return false;
    if(state.category!=='all'&&product.category!==state.category)return false;
    if(!query)return true;
    const haystack=[product.name,product.brand,product.sourceTitle,product.categoryName,product.subtitle,product.lead,product.good,product.caution,...product.tags,...product.reviews.flatMap(review=>[review.topic,review.title,review.summary])].join(' ').toLocaleLowerCase('ko').replace(/\s/g,'');
    return haystack.includes(query);
  }).sort((a,b)=>state.sort==='name'?a.name.localeCompare(b.name,'ko'):state.sort==='rating'?(b.sourceRating-a.sourceRating||b.sourceReviewCount-a.sourceReviewCount):(b.sourceReviewCount-a.sourceReviewCount));
}
function renderCategories(){
  if($('#category-nav').children.length){$$('[data-category]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.category===state.category)));return;}
  $('#category-nav').innerHTML=categories.map(([id,name,glyph])=>`<button class="category-button" data-category="${id}" aria-pressed="${state.category===id}"><span class="category-icon">${icon(glyph)}</span><span>${name}</span></button>`).join('');
}
function productCard(product,index){
  const saved=state.saved.has(product.id),compared=state.compare.includes(product.id);
  return `<article class="product-card" data-product="${product.id}"><div class="product-media"><button class="product-photo-button" data-open="${product.id}" aria-label="${esc(product.name)} 제품 사진과 후기 보기"><img class="product-photo" src="${product.imageData}" alt="${esc(product.brand+' '+product.name)} 판매처 제품 사진" loading="eager" decoding="async" width="600" height="600"></button>${state.sort==='reviews'&&state.page!=='saved'?`<span class="product-rank ${index<3?'top-rank':''}" aria-label="선택 범위의 판매처 리뷰 수 ${index+1}위">${String(index+1).padStart(2,'0')}</span>`:''}<button class="save-button" data-save="${product.id}" aria-label="${esc(product.name)} 찜하기" aria-pressed="${saved}">${icon('bookmark')}</button></div>
  <div class="product-copy"><span class="product-brand">${esc(product.brand)} · ${esc(product.categoryName)}</span><button class="product-name-button" data-open="${product.id}"><h2>${esc(product.name)}</h2></button><p class="product-subtitle">${esc(product.subtitle)}</p><div class="review-metrics" title="11번가 해당 판매 페이지에 표시된 평점과 전체 리뷰 수"><span class="rating-star" aria-hidden="true">★</span><b>${product.sourceRating.toFixed(1)}</b><span class="metrics-divider" aria-hidden="true"></span><span>판매처 리뷰 <b>${number(product.sourceReviewCount)}</b></span></div>
  <button class="review-preview" data-open="${product.id}" aria-label="${esc(product.name)} 장점과 아쉬운 점 읽기"><span class="review-preview-label">후기를 읽어보니</span><p>${esc(product.lead)}</p><span class="preview-caution">체크 · ${esc(product.caution)}</span></button><div class="card-actions"><button class="review-detail-button" data-open="${product.id}" aria-label="${esc(product.name)} 후기 요약 ${product.reviews.length}개 읽기">후기 요약 ${product.reviews.length}개${icon('arrow')}</button><button class="compare-button" data-compare="${product.id}" aria-pressed="${compared}" aria-label="${esc(product.name)} 비교에 담기"><span class="compare-checkbox">${icon('check')}</span>비교</button></div></div></article>`;
}
function renderBrowse(){
  const list=sortedProducts(),savedPage=state.page==='saved';
  $('#browse-title').textContent=savedPage?'다시 보고 싶은 제품을 모았어요.':state.query?'찾던 제품의 후기를 살펴보세요.':state.category==='all'?'사진으로 찾고, 후기로 고르세요.':`${categoryNames[state.category]} 제품, 써본 이야기는?`;
  $('#section-kicker').textContent=savedPage?'내가 찜한 제품':'써본 사람의 이야기';
  $('#result-count').textContent=list.length;
  $('#result-context').textContent=state.category==='all'?'공개 구매 후기 요약':categoryNames[state.category];
  $('#sort-select').value=state.sort;
  $('#product-search').value=state.query;
  $('#product-grid').dataset.layout=state.layout;
  $('#product-grid').innerHTML=list.map(productCard).join('');
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
    return `<button class="side-review" data-open="${product.id}"><img src="${product.imageData}" alt="" width="44" height="47"><span><small>${esc(product.name)}</small><strong>${esc(review.title)}</strong><span class="side-topic">${esc(review.topic)} · 11번가 원문 요약</span></span></button>`;
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
function openProduct(id){
  const p=byId.get(id);if(!p)return;
  dialogTrigger=document.activeElement;state.dialogProduct=id;
  $('#dialog-label').textContent=`${p.categoryName} · 공개 구매 후기 요약`;
  $('#dialog-content').innerHTML=`<div class="detail-product"><img src="${p.imageData}" alt="${esc(p.name)} 판매처 사진" width="180" height="160"><div><span class="detail-brand">${esc(p.brand)}</span><h2 id="dialog-title">${esc(p.name)}</h2><p class="product-subtitle">${esc(p.subtitle)}</p><div class="detail-source-metrics"><span>판매처 표시 평점 <b>${p.sourceRating.toFixed(1)}</b></span><span>판매처 전체 리뷰 <b>${number(p.sourceReviewCount)}개</b></span></div><div class="detail-product-actions"><a class="button primary" href="${p.sourceUrl}" target="_blank" rel="noopener noreferrer" aria-label="${esc(p.name)} 11번가 원문 페이지 새 창에서 보기">원문 페이지 보기${icon('external')}</a><button class="button secondary" data-save="${id}" aria-pressed="${state.saved.has(id)}">${icon('bookmark')}찜하기</button></div></div></div>
  <div class="opinion-summary"><div><small>좋았다는 의견</small><strong>${esc(p.good)}</strong></div><div><small>함께 확인할 점</small><strong>${esc(p.caution)}</strong></div></div><div class="reviews-heading"><h3>후기 요약 ${p.reviews.length}개</h3><span>확인한 공개 후기 ${p.reviewSampleCount}개 중 선별</span></div>
  ${p.reviews.map(review=>`<article class="review-summary-item"><header><span class="review-topic">${esc(review.topic)}</span><span>11번가 · ${esc(review.author)}</span></header><h3>${esc(review.title)}</h3><p>${esc(review.summary)}</p><footer><span>원문 요약</span><span>작성일 미제공</span><span>광고 여부 미확인</span><a href="${review.sourceUrl}" target="_blank" rel="noopener noreferrer" aria-label="${esc(review.author)} 후기의 원문 상품 페이지 새 창에서 보기">출처 보기${icon('external')}</a></footer></article>`).join('')}
  <div class="detail-callout">상품 페이지에 공개된 일부 후기를 읽고 재구성한 요약이에요. 작성자의 개인 경험이며, 판매처 전체 리뷰를 대표하지 않아요. 실구매·실사용과 광고 여부는 별도로 인증하지 않았어요. 같은 페이지에 여러 옵션·이전 모델 후기가 섞일 수 있어요.</div><p class="detail-source-list">수집: ${esc(p.collectedAt.slice(0,10))} · 출처: <a href="${p.sourceUrl}" target="_blank" rel="noopener noreferrer">${esc(p.sourceTitle)}</a><br>판매 상태·구성과 가격은 원문에서 다시 확인해 주세요. 개별 리뷰로 바로 이동하는 링크가 없어 원문 상품 페이지를 연결했어요.</p>`;
  if(!$('#product-dialog').open)$('#product-dialog').showModal();
  $('#product-dialog').scrollTop=0;
}
function renderComparison(){
  const chosen=state.compare.map(id=>byId.get(id));
  if(chosen.length<2){$('#comparison-content').innerHTML=`<div class="empty-state">${icon('compare')}<h2>비교할 제품을 두 개 이상 골라주세요.</h2><p>제품 목록에서 비교를 누르면 최대 세 개를 나란히 볼 수 있어요.</p><button class="button primary" data-reset>제품 고르러 가기</button></div>`;return;}
  const cross=chosen.some(p=>p.category!==chosen[0].category);
  $('#comparison-content').innerHTML=`<p class="compare-notice">${cross?'서로 다른 제품군을 선택했어요. 용도가 다른 제품의 별점으로 우열을 판단하기보다 후기 내용을 비교해 보세요.':'같은 제품군의 후기 내용을 나란히 볼 수 있어요.'} 평점과 리뷰 수는 각 판매 페이지 기준이에요.</p><div class="comparison-grid" data-count="${chosen.length}">${chosen.map(p=>`<article class="comparison-column"><img class="comparison-photo" src="${p.imageData}" alt="${esc(p.name)}" width="240" height="160"><span class="product-brand">${esc(p.brand)}</span><h2>${esc(p.name)}</h2><div class="comparison-cell"><small>판매처 리뷰 · 표시 평점</small><p><strong>${number(p.sourceReviewCount)}개</strong> · ${p.sourceRating.toFixed(1)}점</p></div><div class="comparison-cell good"><small>좋았다는 의견</small><p>${esc(p.good)}</p></div><div class="comparison-cell"><small>함께 확인할 점</small><p>${esc(p.caution)}</p></div><div class="comparison-cell"><small>모아본 표본 · 화면 요약</small><p>${p.reviewSampleCount}개 확인 · ${p.reviews.length}개 요약</p></div><button class="review-detail-button" data-open="${p.id}">출처와 후기 읽기${icon('arrow')}</button><button class="text-button" data-compare="${p.id}" aria-label="${esc(p.name)} 비교에서 빼기">선택에서 빼기</button></article>`).join('')}</div>`;
}
function renderStandards(){
  $('#standards-content').innerHTML=`<section><h2>실제 제품 12개, 공개 후기 ${data.reviewSampleCount}개</h2><p>2026년 11월 5일 11번가의 공개 상품 페이지에서 제품 사진과 노출된 후기 표본을 소량 수집했어요. 디지털·주방·뷰티·생활·식품·패션·취미의 임의 예시 제품이며, 시장 전체를 조사한 순위가 아니에요.</p></section><section><h2>숫자는 이렇게 읽어주세요.</h2><ul><li><strong>판매처 리뷰 수</strong>: 해당 상품 페이지가 표시한 전체 리뷰 수예요. 수집한 후기 수와 달라요.</li><li><strong>별점</strong>: 원문에 ‘판매자 평점’으로 표시된 값이에요. 후기돋보기가 계산한 통합 제품 평점이 아니에요.</li><li><strong>후기 요약</strong>: 실제 공개 후기를 읽고 재구성한 내용이에요. 이번에는 ${data.summaryCount}개를 선별해 정리했어요.</li><li><strong>판매처 리뷰 많은 순</strong>: 이번 12개 표본의 해당 판매처 리뷰 수만 비교한 순서예요. 종합 인기·품질 순위가 아니에요.</li></ul></section><section><h2>확인하지 못한 정보도 남겨두었어요.</h2><p>작성일과 사용 기간은 공개 요약 영역에서 확인되지 않아 임의로 넣지 않았어요. 작성자가 2년 사용 등을 직접 언급한 경우에만 요약에 반영했어요. 광고 여부·실구매·제품 진위는 별도 인증하지 않았어요. 사진의 구성과 후기는 여러 옵션이나 이전 모델을 포함할 수 있어요.</p></section><section><h2>제품별 원문 출처</h2><p>개별 후기 고유 링크가 제공되지 않아 원문 상품 페이지의 리뷰 영역에서 확인할 수 있어요. 원문이 수정되거나 상품 판매가 종료될 수 있어요.</p><div class="source-table-scroll"><table><thead><tr><th scope="col">제품</th><th scope="col">확인한 후기</th><th scope="col">원문</th></tr></thead><tbody>${products.map(p=>`<tr><td>${esc(p.name)}</td><td>${p.reviewSampleCount}개</td><td><a href="${p.sourceUrl}" target="_blank" rel="noopener noreferrer" aria-label="${esc(p.name)} 11번가 출처 새 창에서 보기">11번가 ↗</a></td></tr>`).join('')}</tbody></table></div></section>`;
}
function route(){
  if($('#product-dialog').open)$('#product-dialog').close();
  const [page,search='']=location.hash.slice(1).split('?'),params=new URLSearchParams(search);
  state.page=['saved','compare','standards'].includes(page)?page:'home';
  state.category=Object.hasOwn(categoryNames,params.get('category'))?params.get('category'):'all';
  state.query=(params.get('q')||'').slice(0,80);
  state.sort=['reviews','rating','name'].includes(params.get('sort'))?params.get('sort'):'reviews';
  $('#browse-view').hidden=!['home','saved'].includes(state.page);$('#compare-view').hidden=state.page!=='compare';$('#standards-view').hidden=state.page!=='standards';
  $$('[data-nav]').forEach(link=>link.dataset.nav===state.page?link.setAttribute('aria-current','page'):link.removeAttribute('aria-current'));
  renderCategories();
  if(state.page==='compare')renderComparison();else if(state.page==='standards')renderStandards();else renderBrowse();
  syncActions();window.scrollTo({top:0,behavior:'instant'});
}
document.addEventListener('click',event=>{
  const target=event.target.closest('button,a');if(!target)return;
  if(target.hasAttribute('data-open'))return openProduct(target.dataset.open);
  if(target.hasAttribute('data-save'))return toggleSave(target.dataset.save);
  if(target.hasAttribute('data-compare'))return toggleCompare(target.dataset.compare);
  if(target.hasAttribute('data-category'))return go(state.page==='saved'?'saved':'home',{category:target.dataset.category,sort:state.sort});
  if(target.hasAttribute('data-layout')){state.layout=target.dataset.layout;renderBrowse();syncActions();return;}
  if(target.hasAttribute('data-reset'))return go('home');
  if(target.hasAttribute('data-query-clear'))return go(state.page,{category:state.category,sort:state.sort});
  if(target.hasAttribute('data-standards'))return go('standards');
  if(target.hasAttribute('data-compare-clear')){state.compare=[];syncActions();if(state.page==='compare')renderComparison();return;}
});
$('#search-form').addEventListener('submit',event=>{event.preventDefault();go('home',{q:$('#product-search').value.trim()});});
$('.skip-link').addEventListener('click',event=>{event.preventDefault();$('#main').focus();$('#main').scrollIntoView({block:'start'});});
$('#product-search').addEventListener('search',()=>{if(!$('#product-search').value&&state.query)go('home');});
$('#sort-select').addEventListener('change',event=>go(state.page,{category:state.category,q:state.query,sort:event.target.value}));
$('#open-comparison').addEventListener('click',()=>{if(state.compare.length>=2)go('compare');});
$('#dialog-close').addEventListener('click',()=>$('#product-dialog').close());
$('#product-dialog').addEventListener('close',()=>{if(dialogTrigger?.isConnected)dialogTrigger.focus({preventScroll:true});else $(`[data-open="${state.dialogProduct}"]`)?.focus({preventScroll:true});});
$('#product-dialog').addEventListener('click',event=>{if(event.target!==$('#product-dialog'))return;const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();});
document.addEventListener('error',event=>{if(event.target instanceof HTMLImageElement){event.target.alt='사진을 표시하지 못했어요. 제품명과 후기는 계속 확인할 수 있어요.';event.target.classList.add('image-error');}},true);
window.addEventListener('hashchange',route);
$('#sample-total').textContent=`${data.reviewSampleCount}개`;$('#summary-total').textContent=`${data.summaryCount}개`;
route();
