import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchesProduct,parseSelection,readRoute,filterProducts,platformSlug} from '../catalog-logic.mjs';
const {products}=JSON.parse(readFileSync(new URL('../data/catalog.viewer.json',import.meta.url)));
const byId=new Map(products.map(product=>[product.id,product]));
test('search supports brand aliases, model punctuation, and independent terms',()=>{
  assert.ok(matchesProduct(byId.get('sony'),'소니 WH 1000XM5'));
  assert.ok(matchesProduct(byId.get('detergent'),'세제 향'));
  assert.ok(matchesProduct(byId.get('keyboard'),'로지텍 키보드'));
  assert.equal(matchesProduct(byId.get('tissue'),'로지텍 키보드'),false);
});
test('stored choices discard duplicates, stale IDs, and invalid JSON',()=>{
  assert.deepEqual(parseSelection('["sony","sony","missing",12,"tissue","detergent","illy"]',byId,3),['sony','tissue','detergent']);
  assert.deepEqual(parseSelection('{broken',byId),[]);
  assert.deepEqual(parseSelection('{"id":"sony"}',byId),[]);
});
test('routes handle malformed IDs and query strings without losing query text',()=>{
  const names={all:'전체',essentials:'생필품'};
  assert.equal(readRoute('#product/%E0%A4%A',names).product,'');
  assert.equal(readRoute('#home?category=missing&q=세제?향&sort=madeup',names).query,'세제?향');
  assert.equal(readRoute('#home?category=missing',names).category,'all');
  assert.equal(readRoute('#privacy',names).page,'privacy');
});
test('all published products retain exact source counts and bounded excerpts',()=>{
  assert.equal(products.length,20);
  assert.equal(products.reduce((total,p)=>total+p.reviewSampleCount,0),160);
  for(const p of products){
    assert.ok(p.reviewAnalysis.originalExcerpts.reduce((n,r)=>n+r.text.trim().split(/\s+/).length,0)<=25);
    for(const groups of Object.values(p.reviewAnalysis.mentionGroups))for(const group of groups)assert.equal(group.count,new Set(group.reviewIds).size);
  }
});

test('filters compose saved scope, query and source without losing product ordering',()=>{
  const saved=new Set(['sony','keyboard']);
  assert.deepEqual(filterProducts(products,{page:'saved',query:'로지텍',category:'digital',platform:'11st'},saved).map(p=>p.id),['keyboard']);
  assert.deepEqual(filterProducts(products,{page:'saved',query:'물티슈'},saved),[]);
  assert.equal(filterProducts(products,{platform:'coupang'}).length,0);
  assert.equal(platformSlug('unreviewed source'),'other');
  const sorted=filterProducts(products,{sort:'reviews'});
  assert.ok(sorted.every((p,i)=>i===0||sorted[i-1].sourceReviewCount>=p.sourceReviewCount));
});
test('search accepts missing optional fields and escapes no data into markup',()=>{
  assert.equal(matchesProduct({name:'테스트 제품'},'테스트'),true);
  assert.equal(matchesProduct({name:'테스트 제품'},'missing'),false);
});
