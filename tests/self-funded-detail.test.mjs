import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {eligibleReview,reviewsFor,filteredReviews,renderSelfFundedDetail,updateSelfFundedFeed,playSelfFundedVideo} from '../self-funded-detail.js';
const product=JSON.parse(readFileSync(new URL('../data/catalog.viewer.json',import.meta.url))).products.find(p=>p.id==='airpods');
const sourceData=JSON.parse(readFileSync(new URL('../data/self-funded-reviews.json',import.meta.url)));
const sample=sourceData.products.airpods[0];
test('only manually reviewed, explicitly self-funded sources with no found commercial disclosure pass',()=>{
 assert.equal(reviewsFor('airpods').length,3);
 assert.equal(reviewsFor('missing').length,0);
 for(const patch of [{selfPurchase:false},{reviewed:false},{commercialDisclosureFound:true},{commercialDisclosureFound:undefined},{disclosure:'직접 써봤어요'},{disclosureLocation:''},{checkedAt:''},{url:'javascript:alert(1)'},{videoId:'" onload="x'},{format:'shopping'}])assert.equal(eligibleReview({...sample,...patch}),false,JSON.stringify(patch));
 assert.equal(eligibleReview(null),false);
});
test('counts represent distinct sources, and text excerpts never manufacture shopping reviews',()=>{
 assert.equal(filteredReviews('airpods','all').length,3);
 assert.equal(filteredReviews('airpods','video').length,1);
 assert.equal(filteredReviews('airpods','blog').length,2);
 assert.equal(filteredReviews('airpods','text').length,2);
 assert.equal(new Set(reviewsFor('airpods').map(r=>r.url)).size,3);
 assert.equal(filteredReviews('airpods','video','착용감').length,0);
});
test('format and topic filtering has an honest empty state, reset data, and accessible state',t=>{
 const dom=new JSDOM(renderSelfFundedDetail(product,'#home'));t.after(()=>dom.window.close());const d=dom.window.document;
 updateSelfFundedFeed(d,'airpods');assert.equal(d.querySelectorAll('[data-review-source]').length,3);
 assert.ok(!d.body.textContent.includes('185개'));assert.equal(d.querySelector('.original-review'),null);
 updateSelfFundedFeed(d,'airpods','text');assert.equal(d.querySelectorAll('blockquote').length,2);assert.equal(d.querySelector('.rf-video-preview'),null);
 assert.equal(d.querySelector('[data-review-format=text]').getAttribute('aria-pressed'),'true');
 const actual=[...d.querySelectorAll('blockquote')].map(n=>n.textContent.replace(/^“|”$/g,''));assert.deepEqual(actual,sourceData.products.airpods.filter(r=>r.excerpt).map(r=>r.excerpt));
 updateSelfFundedFeed(d,'airpods','video','착용감');assert.ok(d.querySelector('[data-review-reset]'));assert.match(d.querySelector('#rf-live-status').textContent,/0개 후기/);
 updateSelfFundedFeed(d,'airpods');assert.equal(d.querySelectorAll('[data-review-source]').length,3);
});
test('video is click-to-load, no autoplay, original fallback is always available',t=>{
 const dom=new JSDOM(renderSelfFundedDetail(product,'#home'));t.after(()=>dom.window.close());const d=dom.window.document;
 updateSelfFundedFeed(d,'airpods');assert.equal(d.querySelector('iframe'),null);
 playSelfFundedVideo(d,'airpods','untrusted');assert.equal(d.querySelector('iframe'),null);
 playSelfFundedVideo(d,'airpods',sample.id);assert.match(d.querySelector('iframe').src,/^https:\/\/www.youtube-nocookie.com\/embed\/3A1OH446JSE/);assert.ok(!d.querySelector('iframe').src.includes('autoplay'));
 assert.equal(d.querySelector('.rf-card-video .rf-source').href,sample.url);
});
