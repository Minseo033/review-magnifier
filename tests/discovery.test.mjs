import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,copyFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {JSDOM} from 'jsdom';
import {canonicalSource,searchProducts,filterReviews,readRoute,routeHash,validSaved,validateReview} from '../discovery-logic.mjs';
import {prepareLibrary,reviewDigest} from '../scripts/discovery-policy.mjs';
const registry=JSON.parse(readFileSync(new URL('../data/discovery-registry.json',import.meta.url)));
const data=prepareLibrary(registry),product=data.products[0],id=product.id;
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const bundle=readFileSync(new URL('../discovery.bundle.js',import.meta.url),'utf8');
function app(t,{hash='#home',blocked=false,mobile=false}={}){
 const dom=new JSDOM(html,{url:'https://review.test/'+hash,runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,d=w.document,errors=[];
 t.after(()=>dom.window.close());w.scrollTo=()=>{};
 if(mobile)w.innerWidth=390;
 if(blocked)Object.defineProperty(w,'localStorage',{get(){throw new w.DOMException('blocked','SecurityError');}});
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
 w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
 w.addEventListener('error',event=>errors.push(event.error));
 w.eval(bundle);t.after(()=>assert.deepEqual(errors,[]));
 const settle=()=>new Promise(resolve=>w.setTimeout(resolve,15));
 const click=async selector=>{const n=d.querySelector(selector);assert.ok(n,selector);n.click();await settle();};
 const route=async hash=>{w.location.hash=hash;await settle();};
 const select=async(selector,value)=>{const n=d.querySelector(selector);assert.ok(n,selector);n.focus();n.value=value;n.dispatchEvent(new w.Event('change',{bubbles:true}));await settle();};
 return {w,d,click,route,select,settle};
}
test('only active approved records publish; source totals are canonical unique posts',()=>{
 assert.equal(data.products.length,1);assert.equal(data.reviews.length,10);
 assert.deepEqual(Object.fromEntries(['shorts','reels','video','blog'].map(f=>[f,data.reviews.filter(r=>r.format===f).length])),{shorts:4,reels:0,video:2,blog:4});
 assert.equal(new Set(data.reviews.map(r=>canonicalSource(r.url).key)).size,10);
 assert.equal(data.excluded,undefined);
 for(const status of ['candidate','held','excluded','inactive']){
  const copy=structuredClone(registry);copy.reviews[0].review.status=status;assert.equal(prepareLibrary(copy).reviews.length,9);
 }
 const copy=structuredClone(registry);delete copy.reviews[0].active;assert.equal(prepareLibrary(copy).reviews.length,9);
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
 run('status',candidate.id,'approved','--reviewer','테스트 검토자','--reason','원문 대조');assert.equal(prepareLibrary(current()).reviews.length,1);
 assert.throws(()=>run('add',join(temp,'candidate.json')),/이미 등록/);
 run('status',candidate.id,'inactive','--reviewer','테스트 검토자','--reason','원문 재확인');assert.equal(prepareLibrary(current()).reviews.length,0);
});
test('source identity ignores tracking and rejects unsafe or unsupported URLs',()=>{
 assert.equal(canonicalSource('https://youtu.be/yn13puTnnkM?t=3').key,canonicalSource('https://www.youtube.com/shorts/yn13puTnnkM').key);
 assert.equal(canonicalSource('https://m.blog.naver.com/syxaa/224460479696?x=1').key,'naver:syxaa/224460479696');
 for(const url of ['javascript:alert(1)','http://youtube.com/watch?v=yn13puTnnkM','https://youtube.com.evil.test/watch?v=yn13puTnnkM','https://user:pass@youtube.com/watch?v=yn13puTnnkM'])assert.throws(()=>canonicalSource(url));
});
test('Korean/English aliases find the exact line; unrelated lines and unknown conditions return empty',()=>{
 for(const q of ['퓌 올데이 쿠션','fwee cushion','FWEE ALL DAY','올데쿠','퓌블랙쿠션'])assert.equal(searchProducts(data.products,q).length,1,q);
 assert.equal(searchProducts(data.products,'글래스').length,0);
 assert.equal(filterReviews(data.reviews,{skin:'추정 피부'}).length,0);
 const filtered=filterReviews(data.reviews,{format:'blog',skin:'건성',shade:'19N'});assert.equal(filtered.length,1);
 const params={topic:'지속력과 무너짐',skin:'건성',sort:'oldest'};assert.equal(readRoute(routeHash('product/'+id,params)).topic,params.topic);
 assert.deepEqual(validSaved('{bad',new Set(['x'])),[]);
 assert.deepEqual(validSaved('["x","x","unknown"]',new Set(['x'])),['x']);
});
test('home, search and invalid product routes expose truthful data with escaped query input',async t=>{
 const {w,d,route,settle}=app(t);assert.equal(d.documentElement.dataset.appReady,'true');assert.equal(d.querySelectorAll('[data-review]').length,10);assert.equal(d.querySelectorAll('iframe').length,0);
 d.querySelector('#hero-query').value='fwee cushion';d.querySelector('.hero-search').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();assert.equal(d.querySelectorAll('.product-feature').length,1);
 await route('#search?q='+encodeURIComponent('<img src=x onerror=alert(1)>'));assert.equal(d.querySelector('.page-heading img'),null);assert.match(d.querySelector('.empty-state').textContent,/아직/);
 await route('#product/unknown');assert.match(d.querySelector('.empty-state').textContent,/찾을 수/);
});
test('date sorting applies globally across formats and survives reload in a shareable route',async t=>{
 const {d,select}=app(t,{hash:'#product/'+id});
 const ids=()=>[...d.querySelectorAll('[data-review]')].map(n=>n.dataset.review);
 assert.deepEqual(ids(),filterReviews(data.reviews,{}).map(r=>r.id));
 await select('#review-sort','oldest');assert.deepEqual(ids(),filterReviews(data.reviews,{sort:'oldest'}).map(r=>r.id));
 assert.equal(d.activeElement.id,'review-sort');
});
test('mobile filter state stays open after changing condition; empty reels reset recovers',async t=>{
 const {w,d,click,select}=app(t,{hash:'#product/'+id,mobile:true});assert.equal(d.querySelector('.filter-panel').open,false);d.querySelector('.filter-panel').open=true;
 await select('[data-filter="skin"]','건성');assert.equal(d.querySelector('.filter-panel').open,true);assert.equal(d.querySelectorAll('[data-review]').length,2);assert.match(w.location.hash,/skin=/);
 await click('[data-format="reels"]');assert.equal(d.querySelectorAll('[data-review]').length,0);assert.match(d.querySelector('.empty-state').textContent,/릴스/);
 await click('[data-reset-filters]');assert.equal(d.querySelectorAll('[data-review]').length,10);
});
test('product and review saves persist; deleting last saved review moves focus to recovery content',async t=>{
 const {w,d,click,route}=app(t);await click('[data-save-type="products"]');await click('[data-save-type="reviews"]');assert.match(d.querySelector('.saved-count').textContent,/2/);
 await route('#saved');assert.equal(d.querySelectorAll('[data-review]').length,1);await click('[data-save-type="reviews"]');assert.match(d.querySelector('.empty-state').textContent,/아직 저장/);assert.equal(d.activeElement.id,'main');
 assert.deepEqual(JSON.parse(w.localStorage.getItem('review-magnifier:v5:reviews')),[]);await click('[data-saved-tab="products"]');assert.equal(d.querySelectorAll('.product-feature').length,1);
});
test('blocked storage stays usable in memory and a cross-tab clear updates the current view',async t=>{
 const blocked=app(t,{blocked:true});assert.equal(blocked.d.querySelector('#storage-note').hidden,false);await blocked.click('[data-save-type="products"]');assert.equal(blocked.d.querySelector('.saved-count').textContent,'1');
 const {w,d,click,route}=app(t);await click('[data-save-type="products"]');await route('#saved?tab=products');w.localStorage.clear();w.dispatchEvent(new w.StorageEvent('storage',{key:null}));assert.equal(d.querySelectorAll('.product-feature').length,0);
});
test('playback is user-triggered, single-player, no autoplay, and always has original fallback',async t=>{
 const {d,click,route}=app(t);await click('[data-play]');assert.equal(d.querySelectorAll('iframe').length,1);const frame=d.querySelector('iframe');assert.match(frame.src,/youtube-nocookie/);assert.match(frame.src,/autoplay=0/);assert.ok(d.querySelector('#player-original').href.startsWith('https://www.youtube.com/'));
 await click('#close-player');assert.equal(d.querySelectorAll('iframe').length,0);await click('[data-play]');await route('#saved');assert.equal(d.querySelectorAll('iframe').length,0);
});
test('share fallback, offline notice, broken image and keyboard skip remain recoverable',async t=>{
 const {w,d,click}=app(t,{hash:'#product/'+id});await click('[data-share]');assert.equal(d.querySelector('#share-dialog').open,true);assert.match(d.querySelector('#share-url').value,new RegExp('#product/'+id+'$'));d.querySelector('#share-dialog').close();
 const image=d.querySelector('.play-preview img');image.dispatchEvent(new w.Event('error'));assert.equal(image.hidden,true);assert.ok(d.querySelector('.image-missing'));
 Object.defineProperty(w.navigator,'onLine',{value:false});w.dispatchEvent(new w.Event('offline'));assert.equal(d.querySelector('#offline').hidden,false);
 await click('.skip');assert.equal(w.location.hash,'#product/'+id);assert.equal(d.activeElement.id,'main');
});
