import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=readFileSync(new URL('../catalog.bundle.js',import.meta.url),'utf8');
const publicData=JSON.parse(readFileSync(new URL('../data/catalog.viewer.json',import.meta.url)));
const savedKey='review-magnifier:catalog-saved',compareKey='review-magnifier:catalog-compare';

function app(t,{hash='#home',saved=[],compare=[],storageBlocked=false}={}){
  const dom=new JSDOM(html,{url:`https://review.test/${hash}`,runScripts:'outside-only',pretendToBeVisual:true});
  t.after(()=>dom.window.close());
  const w=dom.window,d=w.document,errors=[];
  w.scrollTo=options=>{w.__lastScroll=options.top;};
  w.HTMLElement.prototype.scrollIntoView=function(){w.__scrolledElement=this;};
  // jsdom has no layout engine: these tests cover events, markup and state only.
  w.HTMLElement.prototype.getClientRects=function(){return this.closest('[hidden]')?[]:[{}];};
  w.localStorage.setItem(savedKey,JSON.stringify(saved));w.localStorage.setItem(compareKey,JSON.stringify(compare));
  if(storageBlocked)Object.defineProperty(w,'localStorage',{get(){throw new w.DOMException('blocked','SecurityError');}});
  w.addEventListener('error',event=>errors.push(event.error));
  w.eval(script);
  t.after(()=>assert.deepEqual(errors,[]));
  const settle=()=>new Promise(resolve=>w.setTimeout(()=>w.requestAnimationFrame(()=>w.requestAnimationFrame(resolve)),0));
  const click=async selector=>{const node=d.querySelector(selector);assert.ok(node,selector);node.click();await settle();};
  const route=async hash=>{w.location.hash=hash;await settle();};
  const search=async text=>{d.querySelector('#product-search').value=text;d.querySelector('#search-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();};
  return {w,d,click,route,search,settle};
}
test('home shows approved totals and all public product detail routes render without certification claims',async t=>{
  const {w,d,route}=app(t);
  assert.equal(d.documentElement.dataset.appReady,'true');
  assert.equal(d.querySelectorAll('#product-grid .product-card').length,20);
  assert.match(d.querySelector('#browse-title').textContent,/구매 전, 후기를 비교/);
  assert.equal(d.querySelector('#featured-products'),null);
  assert.equal(d.querySelector('#quick-tags').hidden,false);
  assert.equal(d.querySelector('#product-grid').getAttribute('aria-busy'),'false');
  for(const product of publicData.products){
    await route(`#product/${product.id}`);
    assert.equal(d.querySelector('#product-title').textContent,product.name);
    assert.match(w.document.title,/후기/);
    if(product.id==='airpods'){assert.equal(d.querySelectorAll('[data-review-source]').length,3);assert.equal(d.querySelector('.original-review'),null);assert.equal(d.querySelector('.quick-glance-dashboard'),null);}
    else assert.equal(d.querySelectorAll('.original-review').length,product.reviewAnalysis.originalExcerpts.length);
    assert.ok(!d.querySelector('#product-view').textContent.includes('팩트체크 완료'));
  }
});
test('saved search stays scoped, offers global recovery and preserves query in URL',async t=>{
  const {w,d,search,click}=app(t,{hash:'#saved',saved:['sony']});
  await search('물티슈');
  assert.match(w.location.hash,/^#saved\?/);
  assert.equal(d.querySelector('#result-count').textContent,'0');
  assert.equal(d.querySelector('#search-all').hidden,false);
  await click('#search-all');
  assert.match(w.location.hash,/^#home\?/);
  assert.equal(d.querySelector('#product-search').value,'물티슈');
  assert.ok(Number(d.querySelector('#result-count').textContent)>0);
});
test('filters compose, platform-only views hide the introduction, and empty reset stays in saved',async t=>{
  const {w,d,route,click,search}=app(t,{saved:['sony']});
  await route('#home?platform=coupang');
  assert.equal(d.querySelector('#browse-intro').hidden,true);
  assert.equal(d.querySelector('#result-count').textContent,'0');
  await click('#empty-reset');
  assert.equal(d.querySelector('#result-count').textContent,'20');
  await route('#saved?category=essentials');await search('소니');
  await click('#empty-reset');
  assert.equal(w.location.hash,'#saved');
  assert.equal(d.querySelector('#result-count').textContent,'1');
});
test('a summary topic opens its evidence even after a stricter minimum filter',async t=>{
  const {w,d,click}=app(t,{hash:'#product/sony'});
  const select=d.querySelector('#mention-minimum');select.value='3';select.dispatchEvent(new w.Event('change',{bubbles:true}));
  await click('[data-topic-jump="negative:noise"]');
  assert.equal(select.value,'1');
  const details=d.querySelector('[data-mention="negative:noise"]');
  assert.equal(details.open,true);
  assert.equal(d.activeElement,details.querySelector('summary'));
  assert.ok(details.querySelector('blockquote'));
});
test('comparison enforces three items, retains selections and supports undo after removal and clear',async t=>{
  const {w,d,click,route}=app(t);
  for(const id of ['airpods','sony','keyboard'])await click(`#product-grid [data-compare="${id}"]`);
  await click('#product-grid [data-compare="illy"]');
  assert.equal(JSON.parse(w.localStorage.getItem(compareKey)).length,3);
  assert.match(d.querySelector('#toast-message').textContent,/3개가 모두/);
  await click('#open-comparison');
  assert.equal(d.querySelectorAll('.comparison-column').length,3);
  await click('#comparison-content [data-compare="sony"]');
  assert.equal(d.querySelectorAll('.comparison-column').length,2);
  await click('#toast-undo');
  assert.equal(d.querySelectorAll('.comparison-column').length,3);
  await click('#compare-view [data-compare-clear]');
  assert.equal(JSON.parse(w.localStorage.getItem(compareKey)).length,0);
  await click('#toast-undo');
  assert.equal(d.querySelectorAll('.comparison-column').length,3);
  await route('#home');assert.equal(d.querySelector('#compare-count').textContent,'3');
});
test('removing a saved product restores keyboard focus and undo preserves other selections',async t=>{
  const {w,d,click}=app(t,{hash:'#saved',saved:['airpods','sony']});
  await click('#product-grid [data-save="airpods"]');
  assert.equal(d.activeElement.dataset.save,'sony');
  assert.equal(d.querySelectorAll('#product-grid .product-card').length,1);
  await click('#toast-undo');
  assert.deepEqual(JSON.parse(w.localStorage.getItem(savedKey)).sort(),['airpods','sony']);
});
test('detail return retains search/category/sort/list view and records return context in history',async t=>{
  const {w,d,click,route}=app(t,{hash:'#home?category=digital&q=소니&sort=name'});
  await click('[data-layout="list"]');
  await click('#product-grid .product-name-button');
  assert.equal(decodeURIComponent(w.history.state.productReturn.hash),'#home?category=digital&q=소니&sort=name');
  await click('[data-product-return]');
  assert.equal(d.querySelector('#product-search').value,'소니');
  assert.equal(d.querySelector('#product-grid').dataset.layout,'list');
  assert.equal(d.querySelector('#sort-select').value,'name');
  assert.equal(d.activeElement.dataset.open,'sony');
  await route('#product/does-not-exist');
  assert.match(d.querySelector('#product-title').textContent,/찾을 수 없어요/);
  await route('#product/%E0%A4%A');
  assert.match(d.querySelector('#product-title').textContent,/찾을 수 없어요/);
});
test('blocked storage keeps in-memory selection working and states its lifetime',async t=>{
  const {d,click}=app(t,{storageBlocked:true});
  assert.equal(d.querySelector('#storage-warning').hidden,false);
  await click('#product-grid [data-save="sony"]');
  await click('#product-grid [data-compare="sony"]');
  assert.equal(d.querySelector('#saved-count').textContent,'1');
  assert.equal(d.querySelector('#compare-count').textContent,'1');
});
test('copy fallback, offline notice and broken images remain recoverable',async t=>{
  const {w,d,click}=app(t,{hash:'#product/sony'});
  await click('[data-share]');
  assert.equal(d.querySelector('#share-fallback').hidden,false);
  assert.match(d.querySelector('#share-address').value,/#product\/sony$/);
  const image=d.querySelector('.product-hero-photo');image.dispatchEvent(new w.Event('error'));
  assert.match(image.src,/image-unavailable.svg$/);
  Object.defineProperty(w.navigator,'onLine',{value:false,configurable:true});w.dispatchEvent(new w.Event('offline'));
  assert.equal(d.querySelector('#connection-note').hidden,false);
  Object.defineProperty(w.navigator,'onLine',{value:true});w.dispatchEvent(new w.Event('online'));
  assert.equal(d.querySelector('#connection-note').hidden,true);
});
test('cross-tab clear updates saved and comparison views',async t=>{
  const {w,d,settle}=app(t,{hash:'#saved',saved:['sony'],compare:['sony','airpods']});
  w.localStorage.clear();w.dispatchEvent(new w.StorageEvent('storage',{key:null}));await settle();
  assert.equal(d.querySelector('#saved-count').textContent,'0');
  assert.equal(d.querySelector('#compare-count').textContent,'0');
  assert.equal(d.querySelector('#empty-state').hidden,false);
});
test('user-provided query text stays text, not executable markup',async t=>{
  const {d,search}=app(t);
  await search('<img src=x onerror=alert(1)>');
  assert.equal(d.querySelector('#search-context img'),null);
  assert.ok(d.querySelector('#search-context').textContent.includes('<img'));
});
test('adjacent legacy detail navigation and browser back retain the original filtered list',async t=>{
  const {w,d,click,settle}=app(t,{hash:'#home?category=essentials&sort=name'});
  const first=d.querySelector('#product-grid .product-name-button').dataset.open;
  await click('#product-grid .product-name-button');
  await click('.adjacent-products a:last-child');
  assert.notEqual(w.location.hash,`#product/${first}`);
  assert.equal(w.history.state.productReturn.hash,'#home?category=essentials&sort=name');
  w.history.back();await settle();
  assert.equal(w.location.hash,`#product/${first}`);
  w.history.back();await settle();
  assert.equal(w.location.hash,'#home?category=essentials&sort=name');
  assert.equal(d.querySelector('#sort-select').value,'name');
  assert.equal(d.querySelector('[data-category="essentials"]').getAttribute('aria-pressed'),'true');
});
test('failed app loading presents a retry for the same address and ends the loading announcement',t=>{
  const dom=new JSDOM(html,{url:'https://review.test/#product/sony',runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  dom.window.eval(readFileSync(new URL('../boot.js',import.meta.url),'utf8'));
  const d=dom.window.document;
  d.querySelector('script[data-app]').dispatchEvent(new dom.window.Event('error'));
  assert.equal(d.querySelector('#startup-error').hidden,false);
  assert.equal(d.querySelector('#startup-retry').href,'https://review.test/#product/sony');
  assert.equal(d.querySelector('#product-grid').getAttribute('aria-busy'),'false');
  assert.equal(d.querySelector('.loading-message').hidden,true);
});
