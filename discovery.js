import data from './data/discovery.public.json';
import homeSections from './data/home-sections.json';
import {FORMAT_LABELS,TOPICS,escapeHtml as esc,searchProducts,filterReviews,readRoute,routeHash,validSaved} from './discovery-logic.mjs';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const productMap=new Map(data.products.map(p=>[p.id,p])),reviewMap=new Map(data.reviews.map(r=>[r.id,r]));
const keys={products:'review-magnifier:v5:products',reviews:'review-magnifier:v5:reviews'};
const paths={search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',bookmark:'<path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16l-6-4Z"/>',arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',external:'<path d="M14 4h6v6m-1-5-9 9M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',play:'<path d="m9 5 11 7-11 7Z"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',filter:'<path d="M4 7h16M4 17h16M9 4v6m6 4v6"/>',check:'<path d="m5 12 4 4L19 6"/>',share:'<path d="M12 16V3m-5 5 5-5 5 5M5 12v8h14v-8"/>'};
const icon=name=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]||paths.arrow}</svg>`;
let storageBlocked=false,toastTimer,previousRoute;
function loadSaved(type){try{return new Set(validSaved(localStorage.getItem(keys[type]),type==='products'?productMap:reviewMap));}catch{storageBlocked=true;return new Set();}}
let saved={products:loadSaved('products'),reviews:loadSaved('reviews')},state=readRoute(location.hash);
const date=value=>value?value.replaceAll('-','.'): '작성일 미표기';
const counts=list=>Object.fromEntries(Object.keys(FORMAT_LABELS).map(format=>[format,list.filter(r=>r.format===format).length]));
const salesRank=p=>p.ranking?.source==='oliveyoung'&&p.ranking.kind==='sales'&&Number.isSafeInteger(p.ranking.rank)&&p.ranking.rank>0?p.ranking.rank:Number.MAX_SAFE_INTEGER;
const saveButton=(type,id,small=false)=>`<button class="${small?'icon-button save-overlay':'save-button'}" data-save="${esc(id)}" data-save-type="${type}" aria-pressed="${saved[type].has(id)}" aria-label="${esc(type==='reviews'?reviewMap.get(id).title:productMap.get(id).fullName)} ${saved[type].has(id)?'저장 취소':'저장'}">${icon('bookmark')}${small?'':`<span>${saved[type].has(id)?'저장됨':'저장'}</span>`}</button>`;
function notify(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>{$('#toast').hidden=true;},3500);}
function navigate(page,values={}){const hash=routeHash(page,values);if(hash===location.hash)render();else location.hash=hash;}
function brand(){return '<a class="wordmark" href="#home" aria-label="후기돋보기 홈"><img src="assets/discovery/mark.svg" width="34" height="34" alt=""><span>후기돋보기</span></a>';}
function searchForm(className='',value=''){return `<form class="search-form ${className}" role="search"><label class="sr-only" for="${className==='hero-search'?'hero-query':'header-query'}">제품명 또는 브랜드 검색</label>${icon('search')}<input id="${className==='hero-search'?'hero-query':'header-query'}" name="q" type="search" placeholder="제품명, 브랜드로 후기 찾기" value="${esc(value)}" maxlength="100" autocomplete="off"><button type="submit" ${className==='hero-search'?'class="button"':''}>검색</button></form>`;}
function header(){
  $('#header').innerHTML=`<div class="container header-row">${brand()}<nav aria-label="주 메뉴"><a href="#home" ${['home','search','product'].includes(state.page)?'aria-current="page"':''}>제품 둘러보기</a><a href="#saved" ${state.page==='saved'?'aria-current="page"':''}>저장함 <span class="saved-count">${saved.products.size+saved.reviews.size}</span></a></nav>${searchForm('header-search',state.page==='search'?state.q:'')}</div>`;
  $('#footer').innerHTML=`<div class="container footer-row"><div>${brand()}<p>사기 전, 구매 근거와 원문을 함께.</p></div><div><a href="#standards">후기를 모으는 기준</a><a href="#privacy">저장·개인정보 안내</a><a href="mailto:kim6323b@naver.com">자료 수정 요청</a><small>작성자의 표시와 공개 원문을 확인합니다. 구매 증빙을 인증하지 않습니다.</small></div></div>`;
}
function productCard(p,detail=false){
 const list=data.reviews.filter(r=>r.productId===p.id),total=counts(list),heading=detail?'h1':'h2';
 const photo=`<img src="${esc(p.image)}" width="220" height="220" alt="${esc(p.fullName)} 공식 제품 사진">`;
 return `<article class="product-feature${detail?' product-detail-feature':''}">
  ${detail?`<div class="product-visual">${photo}</div>`:`<a class="product-visual" href="#product/${esc(p.id)}" aria-label="${esc(p.fullName)} 후기 보기">${photo}</a>`}
  <div class="product-feature-copy"><span class="brand-label">${esc(p.brand)}</span>
   <${heading}>${detail?esc(p.name):`<a href="#product/${esc(p.id)}">${esc(p.name)}</a>`}</${heading}>
   <p>쇼츠부터 블로그까지, 작성자의 구매 표시와 원문을 함께 살펴보세요.</p>
   <div class="product-format-counts">${Object.entries(total).filter(([,n])=>n).map(([format,n])=>`<span>${FORMAT_LABELS[format]} <b>${n}</b></span>`).join('')}<span class="source-total">출처 ${list.length}개</span></div>
   <div class="product-feature-actions">${detail?'':`<a class="button" href="#product/${esc(p.id)}">후기 모아보기 ${icon('arrow')}</a>`}${saveButton('products',p.id)}${detail?`<button class="save-button" data-share="${esc(p.id)}">${icon('share')}<span>공유</span></button>`:''}</div>
  </div>
  <div class="product-note"><span>확인한 제품</span><p>${esc(p.fullName)}</p><small>작성자가 밝힌 구매 표시와 사용 조건을 확인해 보세요.</small>${detail?`<a class="quiet-link" href="${esc(p.officialUrl)}" target="_blank" rel="noopener noreferrer">공식 제품 확인 ${icon('external')}</a>`:''}</div>
 </article>`;
}
function evidence(r){const d=r.disclosure;return `<details class="evidence"><summary>${icon('check')} 작성자 내돈내산 표기 <span>근거 보기</span></summary><div class="evidence-body"><p class="evidence-quote">“${esc(d.evidence.quote)}” <small>${esc(d.evidence.location)}</small></p><dl><div><dt>확인 범위</dt><dd>${d.checkedAreas.map(esc).join(', ')}</dd></div><div><dt>확인하지 못한 범위</dt><dd>${d.uncheckedAreas.map(esc).join(', ')}</dd></div><div><dt>원문 확인</dt><dd>${date(r.link.checkedAt)}</dd></div><div><dt>제품 일치</dt><dd>${esc(r.matchEvidence.quote)} <small>(${esc(r.matchEvidence.location)})</small></dd></div></dl><p class="small-note">작성자의 자기표시와 구매 증빙 인증은 달라요. 광고가 전혀 없다는 보장은 아닙니다.</p></div></details>`;}
function conditionChips(r){return Object.values(r.conditions).filter(Boolean).map(c=>`<span title="${esc(c.location+': '+c.quote)}">${esc(c.value)}</span>`).join('');}
function reviewCard(r){
  const video=['shorts','video'].includes(r.format),short=r.format==='shorts',mins=r.durationSeconds?`${Math.floor(r.durationSeconds/60)}:${String(r.durationSeconds%60).padStart(2,'0')}`:'',url=r.format==='shorts'?`https://www.youtube.com/shorts/${r.externalId}`:r.url;
  return `<article class="review-card ${short?'short-card':video?'video-card':'blog-card'}" data-review="${r.id}">${video?`<div class="video-preview"><button class="play-preview" data-play="${r.id}" aria-label="${esc(r.title)} 재생"><img loading="lazy" src="${esc(r.thumbnail)}" width="480" height="360" alt="${esc(r.author)} 영상 썸네일"><span class="play-symbol">${icon('play')}</span><span class="video-length">${mins}</span><span class="format-on-photo">${short?'Shorts':'YouTube'}</span></button>${saveButton('reviews',r.id,true)}</div>`:''}<div class="review-copy"><div class="review-byline"><span class="platform-label ${r.platform}">${r.platform==='youtube'?'YouTube':r.platform==='naver'?'N':'Instagram'}</span><span>${esc(r.author)}</span><time datetime="${r.publishedAt||''}">${date(r.publishedAt)}</time>${!video?saveButton('reviews',r.id,true):''}</div><h3>${video?`<button data-play="${r.id}">${esc(r.title)}</button>`:`<a href="${url}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a>`}</h3>${!short?`<p class="editorial-summary"><span>편집 요약</span>${esc(r.summary)}</p>`:''}${r.excerpt?`<blockquote><span>원문 발췌</span>“${esc(r.excerpt)}”</blockquote>`:''}<div class="condition-chips">${conditionChips(r)}</div>${evidence(r)}<a class="original-link" href="${url}" target="_blank" rel="noopener noreferrer">${video?'영상 원문 보기':r.format==='reels'?'릴스 원문 보기':'블로그 원문 읽기'} ${icon('external')}</a></div></article>`;
}
function empty(title,description,action='home'){return `<section class="empty-state">${icon(action==='filter'?'filter':'search')}<h2>${esc(title)}</h2><p>${esc(description)}</p>${action==='filter'?'<button class="button secondary" data-reset-filters>필터 초기화</button>':'<a class="button secondary" href="#home">제품 후기 찾아보기</a>'}</section>`;}
function reviewSections(list){if(!list.length)return empty('조건에 맞는 후기가 없어요','다른 형식이나 주제로 찾아보세요.','filter');const groups=[['shorts','짧게 보는 사용 경험','쇼츠에서 직접 살펴보세요','shorts-grid'],['video','길게 살펴보는 영상','시간 경과와 사용 과정을 함께','videos-grid'],['reels','릴스에서 보는 사용 경험','Instagram 원문에서 살펴보세요','blogs-grid'],['blog','글로 읽는 사용 경험','사용 조건과 아쉬웠던 점까지','blogs-grid']];return groups.map(([f,title,sub,cls])=>{const items=list.filter(r=>r.format===f);return items.length?`<section class="review-section"><div class="section-heading"><h2>${title} <span>${items.length}</span></h2><p>${sub}</p></div><div class="${cls}">${items.map(reviewCard).join('')}</div></section>`:'';}).join('');}
const productShapes={
 bottle:'<rect x="25" y="28" width="30" height="43" rx="7"/><path d="M32 28V15h16v13M32 15h16M30 48h20"/>',
 tube:'<path d="m28 18 4 48h16l4-48ZM32 66v6h16v-6M29 25h22M36 48h8"/>',
 tint:'<rect x="29" y="31" width="22" height="41" rx="5"/><path d="M29 32V13h22v19M34 48h12"/>',
 lipstick:'<path d="M28 48h24v25H28ZM31 48V25l18-10v33M32 62h16"/>',
 compact:'<circle cx="40" cy="43" r="25"/><circle cx="40" cy="43" r="18"/><path d="M25 48h30"/>',
 dropper:'<rect x="25" y="37" width="30" height="35" rx="6"/><path d="M31 37V27h18v10M35 27V13h10v14M32 53h16"/>',
 jar:'<rect x="19" y="39" width="42" height="29" rx="7"/><rect x="18" y="30" width="44" height="10" rx="3"/><path d="M31 54h18"/>'
};
function browseProductCard(p){
 const list=data.reviews.filter(r=>r.productId===p.id),total=counts(list);
 return `<article class="browse-product-card" data-product="${esc(p.id)}">
  <a class="browse-product-main" href="#product/${esc(p.id)}" aria-label="${esc(p.fullName)} 후기 ${list.length}개 모아보기">
   <div class="browse-product-media"><img src="${esc(p.image)}" width="360" height="240" alt="${esc(p.fullName)} 공식 제품 사진"></div>
   <div class="browse-product-copy"><span class="brand-label">${esc(p.brand)}</span><h3>${esc(p.name)}</h3>
    <ul class="browse-product-sources" aria-label="공개된 후기 형식">${Object.entries(total).filter(([,n])=>n).map(([format,n])=>`<li>${FORMAT_LABELS[format]} ${n}</li>`).join('')}</ul>
    <span class="browse-product-cta">후기 ${list.length}개 모아보기 ${icon('arrow')}</span>
   </div>
  </a>${saveButton('products',p.id,true)}
 </article>`;
}
function preparingCard(slot){
 return `<article class="preparing-card" aria-label="${esc(slot.label)} 제품 준비 중">
  <div class="preparing-visual"><svg class="product-outline" viewBox="0 0 80 88" aria-hidden="true">${productShapes[slot.shape]||productShapes.bottle}</svg><span class="preparing-status">제품 준비 중</span></div>
  <div class="preparing-copy"><h3>${esc(slot.label)}</h3><p>제품별 후기를 준비하고 있어요.</p></div>
 </article>`;
}
function home(){
 const sections=homeSections.filter(section=>state.category==='all'||section.id===state.category);
 return `<section class="home-intro product-home-intro" aria-labelledby="home-title">
  <div><h1 id="home-title">사기 전, 내돈내산 후기부터.</h1><p>궁금한 제품을 고르고, 구매 표시와 원문을 함께 살펴보세요.</p></div>
  <div class="home-search-wrap">${searchForm('hero-search')}<p class="search-hint">이렇게 찾아보세요 <button data-query="퓌 올데이 쿠션">퓌 올데이 쿠션</button></p></div>
 </section>
 <div class="home-category-nav" role="group" aria-label="제품 카테고리">
  ${[{id:'all',label:'전체'},...homeSections].map(section=>`<button data-home-category="${section.id}" aria-pressed="${state.category===section.id}">${section.label}</button>`).join('')}
 </div>
 ${!data.products.length?'<p class="home-source-note publication-empty" role="status">공개 후기를 준비하고 있어요. 직접 구매 근거와 원문 검토를 마친 제품부터 공개합니다.</p>':''}
 <div class="product-collections">${sections.map(section=>{
  const products=data.products.filter(p=>p.category===section.id).sort((a,b)=>salesRank(a)-salesRank(b));
  const preparing=section.preparing.filter(slot=>!products.some(p=>p.slot===slot.label));
  return `<section class="product-collection" aria-labelledby="collection-${section.id}">
   <div class="collection-heading"><div><h2 id="collection-${section.id}">${section.label}</h2><p>${section.description}</p></div>${products.length?'<span class="collection-availability">후기 공개 중</span>':'<span class="collection-preparing">상품 준비 중</span>'}</div>
   <div class="browse-product-grid">${products.map(browseProductCard).join('')}${preparing.map(preparingCard).join('')}</div>
  </section>`;
 }).join('')}</div>
 <div class="home-criteria-note">${icon('check')}<p>후기마다 작성자의 구매 표시와 원문 출처, 확인한 범위를 함께 안내해요.</p><a href="#standards">후기를 모으는 기준 ${icon('arrow')}</a></div>`;
}

function search(){const found=searchProducts(data.products,state.q);return `<div class="page-heading"><div><span class="breadcrumb">제품 검색</span><h1>${state.q?`‘${esc(state.q)}’ 검색 결과`:'어떤 제품의 후기가 궁금하세요?'}</h1><p>${found.length}개 제품 · 이름, 브랜드, 별칭에서 찾았어요</p></div></div>${found.length?found.map(p=>productCard(p)).join(''):empty('아직 모아둔 제품이 없어요','브랜드명이나 다른 제품명으로 검색해 보세요.')}`;}
function filterSelect(name,label,values){return !values.length?'':`<label class="filter-select"><span>${label}</span><select name="${name}" data-filter="${name}"><option value="">전체</option>${values.map(v=>`<option value="${esc(v)}" ${state[name]===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`;}
function filters(list){const topics=TOPICS.filter(t=>list.some(r=>r.topics.includes(t))),values=field=>[...new Set(list.map(r=>r.conditions[field]?.value).filter(Boolean))];return `<div class="inline-review-filters"><details class="filter-panel"><summary>${icon('filter')} 후기 골라보기 <span>${[state.topic,state.skin,state.shade,state.duration].filter(Boolean).length||''}</span></summary><div class="filter-body"><fieldset><legend>궁금한 사용 경험</legend><div class="topic-options"><button data-topic="" aria-pressed="${!state.topic}">모든 주제</button>${topics.map(t=>`<button data-topic="${esc(t)}" aria-pressed="${state.topic===t}">${esc(t)}</button>`).join('')}</div></fieldset><div class="condition-filters"><h3>작성자가 밝힌 사용 조건</h3>${filterSelect('skin','피부 타입',values('skinType'))}${filterSelect('shade','사용 호수',values('shade'))}${filterSelect('duration','시간 경과',values('duration'))}</div><p class="filter-help">표기된 정보만 사용해요. 같은 조건이어도 사용 경험은 다를 수 있어요.</p><button class="reset-link" data-reset-filters>선택 초기화</button></div></details></div>`;}
function product(){
 const p=productMap.get(state.id);
 if(!p)return empty('제품을 찾을 수 없어요','주소를 확인하거나 다른 제품의 후기를 찾아보세요.');
 const all=data.reviews.filter(r=>r.productId===p.id),filtered=filterReviews(all,state),total=counts(all);
 return `<nav class="breadcrumb" aria-label="현재 위치"><a href="#home">제품 둘러보기</a><span>/</span><span>${esc(p.brand)}</span></nav>
 ${productCard(p,true)}
 <div class="home-source-note">${icon('check')} 작성자가 직접 구매했다고 밝힌 후기만 모았어요. <a href="#standards">기준 보기</a></div>
 <div class="product-detail-reviews">
  <div class="format-tabs" role="group" aria-label="후기 콘텐츠 형식"><button data-format="all" aria-pressed="${state.format==='all'}">전체 <span>${all.length}</span></button>${Object.entries(FORMAT_LABELS).map(([format,label])=>`<button data-format="${format}" aria-pressed="${state.format===format}">${label} <span>${total[format]}</span></button>`).join('')}</div>
  ${filters(all)}
  <div class="results-toolbar"><p><strong>${filtered.length}</strong>개 후기 출처${state.topic?` <span class="current-filter">${esc(state.topic)}</span>`:''}</p><label>형식별 정렬 <select id="review-sort"><option value="newest" ${state.sort==='newest'?'selected':''}>작성일 최신순</option><option value="oldest" ${state.sort==='oldest'?'selected':''}>작성일 오래된순</option></select></label></div>
  ${state.format==='reels'&&!total.reels?empty('아직 공개한 릴스 후기가 없어요','직접 구매 표기와 원문을 확인할 수 있는 릴스를 확보하면 추가할게요.','filter'):reviewSections(filtered)}
  <p class="source-boundary">후기 한 원문은 하나의 출처로 세어요. 인용·요약·임베드는 중복 집계하지 않아요.</p>
 </div>`;
}
function savedPage(){const type=state.tab==='products'?'products':'reviews',items=type==='products'?data.products.filter(p=>saved.products.has(p.id)):data.reviews.filter(r=>saved.reviews.has(r.id));return `<div class="page-heading"><h1>다시 보고 싶은 후기</h1><p>이 브라우저에 저장돼요. 다른 기기와 자동으로 이어지지 않아요.</p></div><div class="format-tabs saved-tabs"><button data-saved-tab="reviews" aria-pressed="${type==='reviews'}">저장한 후기 <span>${saved.reviews.size}</span></button><button data-saved-tab="products" aria-pressed="${type==='products'}">저장한 제품 <span>${saved.products.size}</span></button></div>${!items.length?empty('아직 저장한 '+(type==='products'?'제품':'후기')+'가 없어요','마음에 드는 후기나 제품의 저장 버튼을 눌러 모아보세요.'):type==='products'?items.map(p=>productCard(p)).join(''):reviewSections(filterReviews(items,{}))}`;}
function standards(){
 const total=counts(data.reviews);
 return `<article class="reading-page">
  <div class="page-heading"><span class="breadcrumb">후기를 모으는 기준</span><h1>후기를 고를 때,<br>출처부터 살펴봐요.</h1><p>여러 플랫폼에 흩어진 사용 경험을 제품별로 모읍니다.</p></div>
  <section><h2>어떤 후기가 올라오나요?</h2><p>실제 제품이 일치하고 작성자가 직접 구매했다고 밝힌 후기를 사람이 확인한 뒤 공개해요. 제목·본문·영상 설명에서 확인한 구매 표기와 원문 위치를 카드에서 볼 수 있어요.</p><p>화장품 후보를 고를 때 올리브영 판매 랭킹을 참고합니다. 공개 목록에는 기준을 충족하는 후기를 확보한 제품이 올라오며, 판매 순위를 실시간으로 보여주는 화면은 아니에요.</p></section>
  <section><h2>무엇을 확인했나요?</h2><p>AI 도구는 공개 텍스트와 메타데이터를 수집해 검토 후보를 준비합니다. 공개 전에는 사람이 원문과 직접 구매 근거, 광고 고지 여부를 확인하고 승인해야 해요. 확인한 범위를 후기마다 기록합니다. 이미지·영상 장면·음성에만 있는 표시는 확인하지 못했으므로 후기마다 검토 범위를 보여드려요.</p><p>작성자가 직접 구매했다고 밝힌 사실을 확인한 것이며, 영수증을 검증하거나 광고가 전혀 없음을 보증하는 건 아니에요.</p></section>
  <section><h2>이런 콘텐츠는 제외해요</h2><p>직접 구매 근거를 찾지 못했거나, 원문을 확인할 수 없는 후기는 공개하지 않아요. 광고·협찬·제품 제공·체험단·후기 보상·구매금 환급·제휴 수수료 표시가 있으면 내돈내산 표기가 있어도 제외해요.</p></section>
  <section><h2>사용 조건은 작성자가 밝힌 만큼만</h2><p>피부 타입·톤·호수·사용 기간은 원문에 기재된 정보만 사용해요. 얼굴 사진으로 추정하지 않아요. 편집 요약과 원문 발췌를 구분하며, 서로 다른 촬영 조건을 객관적인 성능 비교로 바꾸지 않아요.</p></section>
  <section><h2>현재 모아둔 범위</h2><p>제품 ${data.products.length}개의 후기 ${data.reviews.length}개 출처를 모았어요. 쇼츠 ${total.shorts}개, 일반 영상 ${total.video}개, 릴스 ${total.reels}개, 블로그 ${total.blog}개입니다. 목록은 ${date(data.updatedAt)}에 갱신했어요.</p><p>원문은 삭제·변경될 수 있어요. 오류를 발견하면 <a href="mailto:kim6323b@naver.com">자료 수정 요청</a>으로 알려주세요.</p></section>
 </article>`;
}
function privacy(){return `<article class="reading-page"><div class="page-heading"><h1>저장·개인정보 안내</h1><p>지금 사이트에서 사용하는 정보와 저장 방식이에요.</p></div><section><h2>저장 목록은 이 브라우저에</h2><p>저장한 제품과 후기의 ID만 브라우저 저장 공간에 보관해요. 계정·서버와 동기화하지 않습니다. 브라우저 데이터를 지우거나 비공개 창을 닫으면 목록이 사라질 수 있어요.</p><button class="button secondary" data-clear-saved ${!saved.products.size&&!saved.reviews.size?'disabled':''}>저장 목록 비우기</button></section><section><h2>검색과 영상 재생</h2><p>제품 검색과 필터는 공개된 목록 안에서 처리해요. 검색어는 주소의 # 뒤에 표시되며 별도 검색 서버로 전송하지 않아요. 방문 분석·광고 추적 도구를 직접 설치하지 않았어요.</p><p>영상 썸네일은 YouTube 서버에서 불러옵니다. 재생 버튼을 누르면 YouTube의 개인정보 보호 강화 도메인으로 연결돼요. 이때 해당 플랫폼의 네트워크 요청과 정보 처리가 발생합니다. 원문을 열면 해당 사이트의 정책이 적용돼요.</p></section><section><h2>공개 원문과 수정 요청</h2><p>원문 전체와 블로그 사진을 복제하지 않고 제목·짧은 인용·편집 요약·출처를 제공합니다. 사이트는 GitHub Pages에서 제공해요.</p><a class="quiet-link" href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener noreferrer">GitHub 개인정보 안내 ${icon('external')}</a></section></article>`;}
function render(){
 const next=readRoute(location.hash),changed=!previousRoute||previousRoute.page!==next.page||previousRoute.id!==next.id;
 const focus=document.activeElement?.dataset,focusFilter=focus?.filter,focusTopic=focus?.topic,focusFormat=focus?.format,focusSort=document.activeElement?.id==='review-sort',focusHomeCategory=focus?.homeCategory;
 const filterOpen=$('.filter-panel')?.open;
 state=next;document.documentElement.dataset.page=state.page;header();document.title=(state.page==='product'&&productMap.has(state.id)?productMap.get(state.id).fullName+' 후기':state.page==='saved'?'저장함':state.page==='search'?'제품 검색':'사기 전, 내돈내산 후기부터')+' · 후기돋보기';
 $('#main').innerHTML=({home,search,product,saved:savedPage,standards,privacy}[state.page]||home)();$('#storage-note').hidden=!storageBlocked;
 if(!changed&&filterOpen!==undefined&&$('.filter-panel'))$('.filter-panel').open=filterOpen;
 if(changed){$('#main').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
 else if(focusHomeCategory!==undefined)$$('[data-home-category]').find(n=>n.dataset.homeCategory===focusHomeCategory)?.focus({preventScroll:true});
 else if(focusSort)$('#review-sort')?.focus({preventScroll:true});
 else if(focusFilter)$$('[data-filter]').find(n=>n.dataset.filter===focusFilter)?.focus({preventScroll:true});
 else if(focusTopic!==undefined)$$('[data-topic]').find(n=>n.dataset.topic===focusTopic)?.focus({preventScroll:true});
 else if(focusFormat!==undefined)$$('[data-format]').find(n=>n.dataset.format===focusFormat)?.focus({preventScroll:true});
 previousRoute=state;
}
function changeFilters(values){navigate('product/'+state.id,{format:state.format,topic:state.topic,skin:state.skin,shade:state.shade,duration:state.duration,sort:state.sort,...values});}
function persist(){for(const type of ['products','reviews'])try{localStorage.setItem(keys[type],JSON.stringify([...saved[type]]));}catch{storageBlocked=true;}$('#storage-note').hidden=!storageBlocked;}
document.addEventListener('submit',event=>{if(event.target.matches('.search-form')){event.preventDefault();navigate('search',{q:new FormData(event.target).get('q').trim()});}});
document.addEventListener('click',async event=>{
 const target=event.target.closest('button,a');if(!target)return;
 if(target.matches('.skip')){event.preventDefault();$('#main').focus();return;}
 if(target.hasAttribute('data-home-category'))navigate('home',{category:target.dataset.homeCategory});
 if(target.dataset.query)navigate('search',{q:target.dataset.query});
 if(target.hasAttribute('data-format'))changeFilters({format:target.dataset.format});
 if(target.hasAttribute('data-topic'))changeFilters({topic:target.dataset.topic});
 if(target.hasAttribute('data-reset-filters'))changeFilters({format:'all',topic:'',skin:'',shade:'',duration:''});
 if(target.dataset.savedTab)navigate('saved',{tab:target.dataset.savedTab});
 if(target.dataset.save){const type=target.dataset.saveType,id=target.dataset.save,adding=!saved[type].has(id);adding?saved[type].add(id):saved[type].delete(id);persist();render();notify(adding?'저장함에 담았어요':'저장을 취소했어요');$$('[data-save]').find(n=>n.dataset.save===id&&n.dataset.saveType===type)?.focus({preventScroll:true});if(!document.activeElement?.closest('[data-save]'))$('#main').focus({preventScroll:true});}
 if(target.hasAttribute('data-clear-saved')){saved={products:new Set(),reviews:new Set()};persist();render();notify('저장 목록을 비웠어요');}
 if(target.dataset.play){const r=reviewMap.get(target.dataset.play);if(!r||r.platform!=='youtube')return;$('#player-frame').replaceChildren();$('#player-frame').className=r.format==='shorts'?'portrait':'landscape';const frame=document.createElement('iframe');frame.src=`https://www.youtube-nocookie.com/embed/${r.externalId}?rel=0&autoplay=0`;frame.title=r.title;frame.allow='encrypted-media; picture-in-picture; fullscreen';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';$('#player-frame').append(frame);$('#player-title').textContent=r.title;$('#player-original').href=r.url;$('#player').showModal();}
 if(target.dataset.share){const url=new URL(location.href);url.hash='product/'+target.dataset.share;try{await navigator.clipboard.writeText(url.href);notify('제품 후기 주소를 복사했어요');}catch{$('#share-url').value=url.href;$('#share-dialog').showModal();$('#share-url').focus();$('#share-url').select();}}
});
document.addEventListener('change',event=>{if(event.target.dataset.filter)changeFilters({[event.target.dataset.filter]:event.target.value});if(event.target.id==='review-sort')changeFilters({sort:event.target.value});});
$('#close-player').addEventListener('click',()=>$('#player').close());$('#player').addEventListener('close',()=>$('#player-frame').replaceChildren());
window.addEventListener('hashchange',()=>{if($('#player').open)$('#player').close();render();});
window.addEventListener('storage',event=>{if(event.key===null||Object.values(keys).includes(event.key)){saved={products:loadSaved('products'),reviews:loadSaved('reviews')};render();}});
document.addEventListener('error',event=>{if(event.target instanceof HTMLImageElement){event.target.hidden=true;event.target.parentElement.classList.add('image-missing');}},true);
const connection=()=>{$('#offline').hidden=navigator.onLine!==false;};window.addEventListener('online',connection);window.addEventListener('offline',connection);connection();
render();document.documentElement.dataset.appReady='true';
