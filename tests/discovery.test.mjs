import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,copyFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {canonicalSource,searchProducts,filterReviews,readRoute,routeHash,validSaved,validateReview} from '../discovery-logic.mjs';
import {prepareLibrary,reviewDigest} from '../scripts/discovery-policy.mjs';
const sourceRegistry=JSON.parse(readFileSync(new URL('../data/discovery-registry.json',import.meta.url)));
// Synthetic human approval exists in memory only, to exercise the app independently
// of the operator's real approval queue. It is never written to the public dataset.
const registry=structuredClone(sourceRegistry);
delete registry.publicationAuthorization;
registry.reviews=registry.reviews.filter(r=>r.productId==='fwee-all-day-black'&&r.disclosure.kind==='self_declared').map(r=>{
 r.active=true;r.review={...r.review,status:'approved',reviewerKind:'human',reviewedBy:'UI test fixture',reviewedAt:'2026-11-12',reason:'Synthetic UI test approval, never published'};
 r.link={...r.link,status:'available'};r.review.contentSha256=reviewDigest(r);return r;
});
const homeSections=JSON.parse(readFileSync(new URL('../data/home-sections.json',import.meta.url)));
const data=prepareLibrary(registry),id='fwee-all-day-black',productReviews=data.reviews.filter(r=>r.productId===id);
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
async function testBundle(library){
 const result=await build({entryPoints:[fileURLToPath(new URL('../discovery.js',import.meta.url))],bundle:true,write:false,format:'iife',target:'es2020',plugins:[{name:'memory-only-library',setup(builder){
  builder.onLoad({filter:/discovery\.public\.json$/},()=>({contents:JSON.stringify(library),loader:'json'}));
 }}]});
 return result.outputFiles[0].text;
}
const bundle=await testBundle(data),liveData=prepareLibrary(sourceRegistry),liveBundle=await testBundle(liveData);
function app(t,{hash='#home',blocked=false,mobile=false,script=bundle,lastFeatured,blockedSession=false}={}){
 const dom=new JSDOM(html,{url:'https://review.test/'+hash,runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,d=w.document,errors=[];
 t.after(()=>dom.window.close());w.scrollTo=()=>{};
 if(mobile)w.innerWidth=390;
 if(blocked)Object.defineProperty(w,'localStorage',{get(){throw new w.DOMException('blocked','SecurityError');}});
 if(blockedSession)Object.defineProperty(w,'sessionStorage',{get(){throw new w.DOMException('blocked','SecurityError');}});
 else if(lastFeatured)w.sessionStorage.setItem('review-magnifier:v5:last-home-short',lastFeatured);
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
 w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
 w.addEventListener('error',event=>errors.push(event.error));
 w.eval(script);t.after(()=>assert.deepEqual(errors,[]));
 const settle=()=>new Promise(resolve=>w.setTimeout(resolve,15));
 async function act(action,expectedHash){
  const before=w.location.hash;
  let complete;const changed=new Promise(resolve=>{complete=resolve;});
  const onHash=()=>{if(!expectedHash||w.location.hash===expectedHash)complete();};
  w.addEventListener('hashchange',onHash);
  try{
   action();
   if((expectedHash&&expectedHash!==before)||w.location.hash!==before){
    let timer;
    try{await Promise.race([changed,new Promise((_,reject)=>{timer=w.setTimeout(()=>reject(Error('화면 전환 시간 초과: '+w.location.hash)),2000);})]);}
    finally{w.clearTimeout(timer);}
   }
   await settle();
  }finally{w.removeEventListener('hashchange',onHash);}
 }
 const click=async selector=>{const n=d.querySelector(selector);assert.ok(n,selector);const href=n.getAttribute('href');await act(()=>n.click(),href?.startsWith('#')&&!n.matches('.skip')?href:undefined);};
 const route=async hash=>{await act(()=>{w.location.hash=hash;},hash);};
 const select=async(selector,value)=>{const n=d.querySelector(selector);assert.ok(n,selector);await act(()=>{n.focus();n.value=value;n.dispatchEvent(new w.Event('change',{bubbles:true}));});};
 return {w,d,click,route,select,settle};
}
test('only active approved records publish; source totals are canonical unique posts',()=>{
 assert.ok(productReviews.length>0);
 assert.deepEqual(new Set(data.products.map(p=>p.id)),new Set(data.reviews.map(r=>r.productId)));
 assert.ok(data.reviews.every(r=>r.disclosure.kind==='self_declared'&&r.disclosure.evidence?.quote&&r.disclosure.evidence?.location));
 assert.equal(new Set(data.reviews.map(r=>canonicalSource(r.url).key)).size,data.reviews.length);
 assert.equal(data.excluded,undefined);
 for(const status of ['candidate','held','excluded','inactive']){
  const copy=structuredClone(registry);copy.reviews.find(r=>r.id===productReviews[0].id).review.status=status;assert.equal(prepareLibrary(copy).reviews.length,data.reviews.length-1);
 }
 const copy=structuredClone(registry);delete copy.reviews.find(r=>r.id===productReviews[0].id).active;assert.equal(prepareLibrary(copy).reviews.length,data.reviews.length-1);
 const missing=structuredClone(registry),review=missing.reviews.find(r=>r.id===productReviews[0].id);
 review.disclosure.kind='not_observed';review.disclosure.evidence=null;review.review.contentSha256=reviewDigest(review);
 assert.throws(()=>prepareLibrary(missing),/구매|내돈내산/);
 const automated=structuredClone(registry);automated.reviews[0].review.reviewerKind='ai';assert.throws(()=>prepareLibrary(automated),/사람|human|검토/);
});
test('real publication records its review method separately from memory-only human fixtures',async t=>{
 assert.ok(liveData.reviews.every(r=>r.review.status==='approved'));
 for(const r of liveData.reviews.filter(r=>r.review.reviewerKind==='ai'))assert.ok(sourceRegistry.publicationAuthorization.approved.some(entry=>entry.id===r.id&&entry.contentSha256===reviewDigest(r)));
 assert.deepEqual(JSON.parse(readFileSync(new URL('../data/discovery-registry.json',import.meta.url))),sourceRegistry);
 const {d,route}=app(t,{script:liveBundle});
 assert.equal(d.querySelectorAll('.browse-product-card[data-product]').length,liveData.products.length);
 if(!liveData.products.length){
  assert.ok(d.querySelector('.publication-empty'));
  assert.equal(d.querySelectorAll('[data-review],[data-play]').length,0);
 }
 await route('#standards');assert.ok(d.querySelector('.reading-page').textContent.includes(`제품 ${liveData.products.length}개`));
});
test('user-authorized AI review is restricted to the pinned records and never becomes human review',()=>{
 const record=structuredClone(data.reviews[0]);record.review.reviewerKind='ai';
 const copy={...structuredClone(registry),reviews:[record],publicationAuthorization:{mode:'user_authorized_agent_review',authorizedAt:'2026-11-13',instruction:'이 자료를 사이트에 적용하고 배포',approved:[{id:record.id,contentSha256:reviewDigest(record)}]}};
 assert.equal(prepareLibrary(copy).reviews[0].review.reviewerKind,'ai');
 const revoked=structuredClone(copy);delete revoked.publicationAuthorization;assert.throws(()=>prepareLibrary(revoked),/승인/);
 const changed=structuredClone(copy);changed.reviews[0].summary='unreviewed revision';changed.reviews[0].review.contentSha256=reviewDigest(changed.reviews[0]);assert.throws(()=>prepareLibrary(changed),/승인/);
 const extra=structuredClone(copy),unlisted=structuredClone(data.reviews[1]);unlisted.review.reviewerKind='ai';extra.reviews.push(unlisted);assert.throws(()=>prepareLibrary(extra),/승인/);
});
test('multiple cosmetics keep their reviews separate and sort by captured rank within a category',async t=>{
 const fixture=structuredClone(sourceRegistry);
 fixture.reviews=fixture.reviews.filter(r=>r.disclosure.kind==='self_declared').map(r=>{
  r.active=true;r.review={status:'approved',reviewerKind:'human',reviewedBy:'memory-only multi-product fixture',reviewedAt:'2026-11-13',reason:'Synthetic test only; never written or published',contentSha256:reviewDigest(r)};return r;
 });
 const library=prepareLibrary(fixture),script=await testBundle(library);
 const {d,route}=app(t,{script});
 assert.equal(d.querySelectorAll('.browse-product-card').length,library.products.length);
 for(const section of homeSections){
  const expected=library.products.filter(p=>p.category===section.id).sort((a,b)=>(a.ranking?.rank??9999)-(b.ranking?.rank??9999)).map(p=>p.id);
  assert.deepEqual([...d.querySelectorAll(`[aria-labelledby="collection-${section.id}"] [data-product]`)].map(n=>n.dataset.product),expected);
 }
 for(const p of library.products){
  await route('#product/'+p.id);
  const expected=library.reviews.filter(r=>r.productId===p.id).map(r=>r.id).sort();
  assert.deepEqual([...d.querySelectorAll('[data-review]')].map(n=>n.dataset.review).sort(),expected);
 }
 assert.deepEqual(JSON.parse(readFileSync(new URL('../data/discovery-registry.json',import.meta.url))),sourceRegistry);
});
test('changed content requires fresh approval and conflicting commercial findings cannot publish',()=>{
 const copy=structuredClone(registry);copy.reviews[0].summary='unreviewed change';assert.throws(()=>prepareLibrary(copy),/재검토/);
 copy.reviews[0].disclosure.findings=['제품제공'];copy.reviews[0].review.contentSha256=reviewDigest(copy.reviews[0]);assert.throws(()=>prepareLibrary(copy),/광고/);
 const unavailable=structuredClone(registry);unavailable.reviews[0].link.status='unavailable';assert.throws(()=>prepareLibrary(unavailable),/접근/);
});
test('product mismatch, missing disclosure scope, undocumented conditions and duplicate originals fail closed',()=>{
 for(const mutate of [r=>r.productVersion='다른 버전',r=>r.conditions.skinType={value:'추정'},r=>r.disclosure.uncheckedAreas=null,r=>r.disclosure.evidence=null]){
  const record=structuredClone(data.reviews[0]);mutate(record);assert.throws(()=>validateReview(record,data.products));
 }
 const copy=structuredClone(registry),duplicate=structuredClone(copy.reviews[0]);duplicate.id='another-excerpt';duplicate.review.contentSha256=reviewDigest(duplicate);copy.reviews.push(duplicate);assert.throws(()=>prepareLibrary(copy),/원문 중복/);
});
test('Shorts use platform format evidence and accept genuine 63-second Shorts',()=>{
 const record=data.reviews.find(r=>r.externalId==='yn13puTnnkM');assert.equal(record.durationSeconds,63);assert.equal(record.format,'shorts');validateReview(record,data.products);
 const bad=structuredClone(record);delete bad.formatEvidence;assert.throws(()=>validateReview(bad,data.products),/쇼츠/);
});
test('operator can register privately, approve with evidence, reject duplicates and deactivate',t=>{
 const temp=mkdtempSync(join(tmpdir(),'review-operator-'));t.after(()=>rmSync(temp,{recursive:true,force:true}));
 mkdirSync(join(temp,'scripts'));mkdirSync(join(temp,'data'));
 for(const file of ['discovery-logic.mjs','scripts/reviews.mjs','scripts/discovery-policy.mjs'])copyFileSync(new URL('../'+file,import.meta.url),join(temp,file));
 const registryFile=join(temp,'data/discovery-registry.json');writeFileSync(registryFile,JSON.stringify({...registry,reviews:[]}));
 const candidate=structuredClone(data.reviews[0]);writeFileSync(join(temp,'candidate.json'),JSON.stringify(candidate));
 const run=(...args)=>execFileSync(process.execPath,[join(temp,'scripts/reviews.mjs'),...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const current=()=>JSON.parse(readFileSync(registryFile));
 run('add',join(temp,'candidate.json'));assert.equal(current().reviews[0].review.status,'candidate');assert.equal(prepareLibrary(current()).reviews.length,0);
 assert.throws(()=>run('status',candidate.id,'approved'),/reviewer/);assert.equal(current().reviews[0].review.status,'candidate');
 assert.throws(()=>run('status',candidate.id,'approved','--reviewer','테스트 검토자','--reason','원문 대조'),/human|사람/);
 run('status',candidate.id,'approved','--reviewer','테스트 검토자','--human-confirmed','--reason','원문 대조');assert.equal(prepareLibrary(current()).reviews.length,1);
 assert.throws(()=>run('add',join(temp,'candidate.json')),/이미 등록/);
 run('status',candidate.id,'inactive','--reviewer','테스트 검토자','--reason','원문 재확인');assert.equal(prepareLibrary(current()).reviews.length,0);
});
test('source identity ignores tracking and rejects unsafe or unsupported URLs',()=>{
 assert.equal(canonicalSource('https://www.instagram.com/reels/DanEWkeyTVe/?igsh=tracking').url,'https://www.instagram.com/reel/DanEWkeyTVe/');
 assert.equal(canonicalSource('https://youtu.be/yn13puTnnkM?t=3').key,canonicalSource('https://www.youtube.com/shorts/yn13puTnnkM').key);
 assert.equal(canonicalSource('https://m.blog.naver.com/syxaa/224460479696?x=1').key,'naver:syxaa/224460479696');
 for(const url of ['javascript:alert(1)','http://youtube.com/watch?v=yn13puTnnkM','https://youtube.com.evil.test/watch?v=yn13puTnnkM','https://user:pass@youtube.com/watch?v=yn13puTnnkM'])assert.throws(()=>canonicalSource(url));
});
test('Korean/English aliases find the exact line; unrelated lines and unknown conditions return empty',()=>{
 for(const q of ['퓌 올데이 쿠션','fwee cushion','FWEE ALL DAY','올데쿠','퓌블랙쿠션'])assert.ok(searchProducts(data.products,q).some(p=>p.id===id),q);
 assert.ok(!searchProducts(data.products,'글래스').some(p=>p.id===id));
 assert.equal(filterReviews(data.reviews,{skin:'추정 피부'}).length,0);
 const filtered=filterReviews(productReviews,{format:'blog',skin:'건성',shade:'19N'});assert.equal(filtered.length,1);
 const params={topic:'지속력과 무너짐',skin:'건성',sort:'oldest'};assert.equal(readRoute(routeHash('product/'+id,params)).topic,params.topic);
 assert.deepEqual(validSaved('{bad',new Set(['x'])),[]);
 assert.deepEqual(validSaved('["x","x","unknown"]',new Set(['x'])),['x']);
});
test('home, search and invalid product routes expose truthful data with escaped query input',async t=>{
 const {w,d,route,settle}=app(t);assert.equal(d.documentElement.dataset.appReady,'true');assert.equal(d.querySelectorAll('[data-review]').length,0);assert.equal(d.querySelectorAll('.browse-product-card[data-product]').length,data.products.length);assert.equal(d.querySelectorAll('iframe').length,0);
 d.querySelector('#hero-query').value='fwee cushion';d.querySelector('.hero-search').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();assert.equal(d.querySelectorAll('.product-feature').length,searchProducts(data.products,'fwee cushion').length);
 await route('#search?q='+encodeURIComponent('<img src=x onerror=alert(1)>'));assert.equal(d.querySelector('.page-heading img'),null);assert.match(d.querySelector('.empty-state').textContent,/아직/);
 await route('#product/unknown');assert.match(d.querySelector('.empty-state').textContent,/찾을 수/);
});
test('home selects products, opens the complete review detail, and returns to the product home',async t=>{
 const {w,d,click}=app(t);
 assert.equal(d.querySelectorAll('.review-card').length,0);assert.equal(d.querySelectorAll('[data-play]').length,1);
 for(const product of data.products){
  const {id:productId}=product;
  await click(`.browse-product-card[data-product="${productId}"] a[href="#product/${productId}"]`);
  assert.equal(w.location.hash,'#product/'+productId);
  assert.deepEqual(new Set([...d.querySelectorAll('[data-review]')].map(n=>n.dataset.review)),new Set(data.reviews.filter(r=>r.productId===productId).map(r=>r.id)));
  assert.equal(d.querySelectorAll('.browse-product-card').length,0);assert.ok(d.querySelector('[data-format="shorts"]'));
  await click('.breadcrumb a[href="#home"]');
  assert.equal(w.location.hash,'#home');assert.equal(d.querySelectorAll('.browse-product-card[data-product]').length,data.products.length);assert.equal(d.querySelectorAll('[data-review]').length,0);
 }
});
test('home category navigation is shareable, distinguishes preparation slots, and restores all products',async t=>{
 const {w,d,click,route}=app(t,{mobile:true});
 for(const {id:category} of homeSections){
  await click(`[data-home-category="${category}"]`);
  assert.equal(new URLSearchParams(w.location.hash.split('?')[1]).get('category'),category);
  assert.equal(d.querySelector(`[data-home-category="${category}"]`).getAttribute('aria-pressed'),'true');
  const shown=[...d.querySelectorAll('.browse-product-card[data-product]')].map(n=>n.dataset.product);
  assert.deepEqual(new Set(shown),new Set(data.products.filter(p=>p.category===category).map(p=>p.id)));
  const ranks=shown.map(id=>data.products.find(p=>p.id===id).ranking?.rank??Number.MAX_SAFE_INTEGER);
  assert.deepEqual(ranks,[...ranks].sort((a,b)=>a-b));
  assert.equal(d.querySelectorAll('[data-review],iframe').length,0);
  assert.ok(d.querySelectorAll('[data-featured-review]').length<=1);
  for(const pick of d.querySelectorAll('[data-featured-review]'))assert.equal(data.products.find(p=>p.id===data.reviews.find(r=>r.id===pick.dataset.featuredReview).productId).category,category);
 }
 await route('#home?category=base');assert.equal(d.querySelectorAll('.browse-product-card[data-product]').length,data.products.filter(p=>p.category==='base').length);
 assert.equal(d.querySelector('[data-home-category="base"]').getAttribute('aria-pressed'),'true');
 await click('[data-home-category="all"]');assert.equal(d.querySelectorAll('.browse-product-card[data-product]').length,data.products.length);
 assert.equal(d.querySelector('[data-home-category="all"]').getAttribute('aria-pressed'),'true');
});
test('home shows one playable original, preserves it while browsing, and changes it on a new load',async t=>{
 const {d,route,click}=app(t);
 const pick=d.querySelector('[data-featured-review]'),review=data.reviews.find(r=>r.id===pick.dataset.featuredReview);
 assert.ok(review);assert.equal(review.format,'shorts');assert.equal(d.querySelectorAll('[data-featured-review]').length,1);assert.equal(d.querySelectorAll('iframe').length,0);
 assert.ok(pick.querySelector('.evidence'));assert.match(pick.querySelector('.home-video-original').href,/youtube.com\/shorts\//);
 await click('.home-video-poster');assert.equal(d.querySelectorAll('iframe').length,1);await click('#close-player');
 await route('#saved');await route('#home');assert.equal(d.querySelector('[data-featured-review]').dataset.featuredReview,review.id);
 const next=app(t,{lastFeatured:review.id});assert.notEqual(next.d.querySelector('[data-featured-review]').dataset.featuredReview,review.id);
 const blocked=app(t,{blockedSession:true});assert.equal(blocked.d.querySelectorAll('[data-featured-review]').length,1);
});
test('preparing products cannot be opened, saved or played and are not fabricated search results',async t=>{
 const {d,route}=app(t);const slots=[...d.querySelectorAll('.preparing-card')];
 const expected=homeSections.flatMap(s=>s.preparing.filter(slot=>!data.products.some(p=>p.category===s.id&&p.slot===slot.label)));
 assert.deepEqual(slots.map(n=>n.querySelector('h3').textContent),expected.map(slot=>slot.label));
 for(const slot of slots){
  assert.match(slot.textContent,/준비\s*중/);assert.equal(slot.querySelector('a,button,[data-save],[data-play],[data-product],[data-review]'),null);
  assert.equal(slot.hasAttribute('data-product'),false);assert.equal(slot.hasAttribute('tabindex'),false);
 }
 const notRegistered=expected.find(slot=>!searchProducts(data.products,slot.label).length);
 if(notRegistered){await route('#search?q='+encodeURIComponent(notRegistered.label));assert.equal(d.querySelectorAll('.product-feature').length,0);assert.ok(d.querySelector('.empty-state'));}
});
test('product detail preserves the previous home source sections and their original evidence',t=>{
 for(const mobile of [false,true]){
  const {d}=app(t,{hash:'#product/'+id,mobile});
  const feature=d.querySelector('.product-feature');assert.ok(feature);assert.match(feature.textContent,/올데이 커버 블랙 쿠션/);
  assert.ok(feature.querySelector('[data-save-type="products"]'));assert.ok(feature.querySelector('[data-share]'));
  assert.equal(d.querySelector('.explore-layout,.filter-rail,.product-heading,.review-feed'),null);
  const sections=[...d.querySelectorAll('.review-section')];
  const groups=[['shorts','.shorts-grid',/짧게 보는 사용 경험/],['video','.videos-grid',/길게 살펴보는 영상/],['reels','.reels-grid',/릴스에서 보는 사용 경험/],['blog','.blogs-grid',/글로 읽는 사용 경험/]].filter(([format])=>productReviews.some(r=>r.format===format));
  assert.equal(sections.length,groups.length);
  for(const [index,[format,grid,title]] of groups.entries()){
   const section=sections[index];assert.ok(section.querySelector(grid));assert.match(section.querySelector('h2').textContent,title);
   assert.deepEqual(new Set([...section.querySelectorAll('[data-review]')].map(card=>card.dataset.review)),new Set(productReviews.filter(r=>r.format===format).map(r=>r.id)));
  }
  assert.equal(d.querySelectorAll('.evidence').length,productReviews.length);assert.equal(d.querySelectorAll('.original-link').length,productReviews.length);
  const filter=d.querySelector('.inline-review-filters details.filter-panel');assert.ok(filter);assert.equal(filter.open,false);
  for(const card of d.querySelectorAll('[data-review]')){
   const review=data.reviews.find(r=>r.id===card.dataset.review),link=card.querySelector('.original-link');
   assert.equal(canonicalSource(link.href).key,canonicalSource(review.url).key);
   const evidence=card.querySelector('.evidence');evidence.open=true;
   assert.match(evidence.textContent,/확인 범위/);assert.match(evidence.textContent,/확인하지 못한 범위/);
   if(review.disclosure.evidence)assert.ok(evidence.textContent.includes(review.disclosure.evidence.quote));
  }
 }
});
test('date sorting applies within source formats and survives reload in a shareable route',async t=>{
 const {w,d,select}=app(t,{hash:'#product/'+id});
 const assertDateOrder=(document,sort)=>{
  for(const [format,grid] of [['shorts','.shorts-grid'],['video','.videos-grid'],['blog','.blogs-grid']]){
   const ids=[...document.querySelectorAll(grid+' [data-review]')].map(n=>n.dataset.review).filter(id=>productReviews.some(r=>r.id===id&&r.format===format));
   assert.deepEqual(ids,filterReviews(productReviews,{format,sort}).map(r=>r.id));
  }
 };
 assert.match(d.querySelector('#review-sort').closest('label').textContent,/형식별/);
 assertDateOrder(d,'newest');
 await select('#review-sort','oldest');assertDateOrder(d,'oldest');assert.match(w.location.hash,/sort=oldest/);
 assert.equal(d.activeElement.id,'review-sort');
 const reloaded=app(t,{hash:w.location.hash});assert.equal(reloaded.d.querySelector('#review-sort').value,'oldest');assertDateOrder(reloaded.d,'oldest');
});
test('mobile filter state stays open after changing condition; empty reels reset recovers',async t=>{
 const {w,d,click,select}=app(t,{hash:'#product/'+id,mobile:true});assert.equal(d.querySelector('.filter-panel').open,false);d.querySelector('.filter-panel').open=true;
 await select('[data-filter="skin"]','건성');assert.equal(d.querySelector('.filter-panel').open,true);assert.equal(d.querySelectorAll('[data-review]').length,2);assert.match(w.location.hash,/skin=/);
 await click('[data-format="reels"]');assert.equal(d.querySelectorAll('[data-review]').length,0);assert.match(d.querySelector('.empty-state').textContent,/릴스/);
 await click('[data-reset-filters]');assert.equal(d.querySelectorAll('[data-review]').length,productReviews.length);
});
test('product and review saves persist; deleting last saved review moves focus to recovery content',async t=>{
 const {w,d,click,route}=app(t,{hash:'#product/'+id});await click('[data-save-type="products"]');await click('[data-save-type="reviews"]');assert.match(d.querySelector('.saved-count').textContent,/2/);
 await route('#saved');assert.equal(d.querySelectorAll('[data-review]').length,1);await click('[data-save-type="reviews"]');assert.match(d.querySelector('.empty-state').textContent,/아직 저장/);assert.equal(d.activeElement.id,'main');
 assert.deepEqual(JSON.parse(w.localStorage.getItem('review-magnifier:v5:reviews')),[]);await click('[data-saved-tab="products"]');assert.equal(d.querySelectorAll('.product-feature').length,1);
});
test('blocked storage stays usable in memory and a cross-tab clear updates the current view',async t=>{
 const blocked=app(t,{blocked:true,hash:'#product/'+id});assert.equal(blocked.d.querySelector('#storage-note').hidden,false);await blocked.click('[data-save-type="products"]');assert.equal(blocked.d.querySelector('.saved-count').textContent,'1');
 const {w,d,click,route}=app(t,{hash:'#product/'+id});await click('[data-save-type="products"]');await route('#saved?tab=products');w.localStorage.clear();w.dispatchEvent(new w.StorageEvent('storage',{key:null}));assert.equal(d.querySelectorAll('.product-feature').length,0);
});
test('playback is user-triggered, single-player, no autoplay, and always has original fallback',async t=>{
 const {d,click,route}=app(t,{hash:'#product/'+id});await click('[data-play]');assert.equal(d.querySelectorAll('iframe').length,1);const frame=d.querySelector('iframe');assert.match(frame.src,/youtube-nocookie/);assert.match(frame.src,/autoplay=0/);assert.ok(d.querySelector('#player-original').href.startsWith('https://www.youtube.com/'));
 await click('#close-player');assert.equal(d.querySelectorAll('iframe').length,0);await click('[data-play]');await route('#saved');assert.equal(d.querySelectorAll('iframe').length,0);
});
test('share fallback, offline notice, broken image and keyboard skip remain recoverable',async t=>{
 const {w,d,click}=app(t,{hash:'#product/'+id});await click('[data-share]');assert.equal(d.querySelector('#share-dialog').open,true);assert.match(d.querySelector('#share-url').value,new RegExp('#product/'+id+'$'));d.querySelector('#share-dialog').close();
 const image=d.querySelector('.play-preview img');image.dispatchEvent(new w.Event('error'));assert.equal(image.hidden,true);assert.ok(d.querySelector('.image-missing'));
 Object.defineProperty(w.navigator,'onLine',{value:false});w.dispatchEvent(new w.Event('offline'));assert.equal(d.querySelector('#offline').hidden,false);
 await click('.skip');assert.equal(w.location.hash,'#product/'+id);assert.equal(d.activeElement.id,'main');
});

test('published library and renderer load separately in their production order',async t=>{
 const production=readFileSync(new URL('../discovery.data.js',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../discovery.bundle.js',import.meta.url),'utf8');
 const {d,route}=app(t,{script:production});
 assert.equal(d.querySelectorAll('.browse-product-card[data-product]').length,liveData.products.length);
 await route('#standards');assert.match(d.querySelector('.reading-page').textContent,new RegExp('후기 '+liveData.reviews.length+'개'));
});
test('real reels retain their original source, load one Instagram frame on request and can be saved',async t=>{
 const reel=liveData.reviews.find(r=>r.format==='reels');assert.ok(reel,'검토된 실제 릴스');
 const {d,click,route}=app(t,{hash:'#product/'+reel.productId+'?format=reels',script:liveBundle});
 assert.equal(d.querySelectorAll('iframe').length,0);assert.ok(d.querySelector('.reel-card'));
 const card=d.querySelector(`[data-review="${reel.id}"]`);assert.equal(card.querySelector('.original-link').href,reel.url);assert.match(card.querySelector('.reel-photo-label').textContent,/제품 사진/);
 await click(`[data-review="${reel.id}"] [data-play]`);assert.equal(d.querySelectorAll('iframe').length,1);assert.equal(d.querySelector('iframe').src,reel.url+'embed/captioned/');assert.match(d.querySelector('#player-original').textContent,/Instagram/);
 await click('#close-player');assert.equal(d.querySelectorAll('iframe').length,0);
 await click(`[data-save="${reel.id}"]`);await route('#saved');assert.ok(d.querySelector(`[data-review="${reel.id}"]`));
 const missing=structuredClone(reel);delete missing.formatEvidence;assert.throws(()=>validateReview(missing,liveData.products),/릴스/);
});
test('a home reel identifies its product photo and opens the same checked original',async t=>{
 const reel=liveData.reviews.find(r=>r.format==='reels'),library={...liveData,products:liveData.products.filter(p=>p.id===reel.productId),reviews:[reel]};
 const {d,click}=app(t,{script:await testBundle(library)});
 const featured=d.querySelector('[data-featured-review]');assert.equal(featured.dataset.featuredReview,reel.id);assert.match(featured.querySelector('.home-video-platform').textContent,/Instagram 릴스/);assert.match(featured.querySelector('img').alt,/제품 사진/);assert.equal(featured.querySelector('.video-length'),null);
 await click('.home-video-poster');assert.equal(d.querySelectorAll('iframe').length,1);assert.equal(d.querySelector('iframe').src,reel.url+'embed/captioned/');
});


test('video reader keeps source context and saves without reloading playback',async t=>{
 const review=productReviews.find(r=>r.platform==='youtube');
 const {d,click,route}=app(t,{hash:'#product/'+id});
 await click(`[data-play="${review.id}"]`);
 const frame=d.querySelector('#player-frame iframe'),details=d.querySelector('#player-details');
 assert.equal(details.querySelector('h3').textContent,review.title);
 assert.equal(details.querySelector('.player-byline strong').textContent,review.author);
 assert.equal(details.querySelector('.player-review-text>p').textContent,review.summary);
 assert.equal(details.querySelector('.evidence-quote').textContent.includes(review.disclosure.evidence.quote),true);
 assert.equal(details.querySelector('.player-product').hash,'#product/'+review.productId);
 await click('#player-details [data-save]');
 assert.equal(d.querySelector('#player-frame iframe'),frame,'저장 중 플레이어는 유지');
 assert.equal(d.querySelector('#player').open,true);
 assert.equal(details.querySelector('[data-save]').getAttribute('aria-pressed'),'true');
 assert.equal(d.activeElement,details.querySelector('[data-save]'));
 await click('#player-details .player-product');assert.equal(d.querySelector('#player').open,false);assert.equal(details.children.length,0);
 await route('#saved');assert.ok(d.querySelector(`[data-review="${review.id}"]`));
});
test('each Instagram reader shows its own checked summary and captioned official source',async t=>{
 for(const reel of liveData.reviews.filter(r=>r.format==='reels')){
  const {d,click}=app(t,{hash:'#product/'+reel.productId+'?format=reels',script:liveBundle});
  await click(`[data-review="${reel.id}"] [data-play]`);
  const details=d.querySelector('#player-details');
  assert.equal(details.querySelector('.player-byline strong').textContent,reel.author);
  assert.equal(details.querySelector('time').textContent,reel.publishedAt?reel.publishedAt.replaceAll('-','.'): '작성일 미표기');
  assert.equal(details.querySelector('.player-review-text>p').textContent,reel.summary);
  assert.equal(d.querySelector('#player-frame iframe').src,reel.url+'embed/captioned/');
  assert.match(d.querySelector('#player-help').textContent,/본문/);
  assert.match(d.querySelector('#player-source-note').textContent,/원문에서 재생/);
  assert.equal(d.querySelectorAll('video').length,0,'별도 복제한 영상이 없음');
  assert.equal(d.querySelector('#player-original').href,reel.url);
  await click('#close-player');
 }
});
