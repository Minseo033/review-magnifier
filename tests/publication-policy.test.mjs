import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {contentDigest,preparePublicCatalog} from '../scripts/publication-policy.mjs';
const source=JSON.parse(readFileSync(new URL('../data/catalog.json',import.meta.url)));
const manifest=JSON.parse(readFileSync(new URL('../data/publication-manifest.json',import.meta.url)));

test('public output contains reviewed sources only and recomputes all totals',()=>{
  const output=preparePublicCatalog(source,manifest);
  assert.equal(source.products.length,74);
  assert.equal(output.products.length,20);
  assert.equal(output.reviewSampleCount,160);
  assert.equal(output.summaryCount,58);
  assert.equal(output.originalExcerptCount,58);
  assert.equal(output.sourceName,'11번가');
  assert.ok(!output.products.some(p=>manifest.pending.some(entry=>entry.id===p.id)));
  assert.notEqual(output.products[0],source.products[0]);
});
test('changed source, summary, count or excerpt fails closed without reapproval',()=>{
  for(const mutate of [p=>p.sourceUrl='https://example.com/other',p=>p.reviews[0].summary='changed',p=>p.reviewSampleCount++,p=>p.reviewAnalysis.originalExcerpts[0].text='invented']){
    const catalog=structuredClone(source);mutate(catalog.products[0]);
    assert.throws(()=>preparePublicCatalog(catalog,manifest),/Publication review required/);
  }
});
test('duplicate IDs, missing reviewed product and malformed approved evidence are rejected',()=>{
  const duplicate=structuredClone(source);duplicate.products.push(duplicate.products[0]);
  assert.throws(()=>preparePublicCatalog(duplicate,manifest),/Duplicate product/);
  assert.throws(()=>preparePublicCatalog({...source,products:source.products.slice(1)},manifest),/Publication review required/);
  const catalog=structuredClone(source),approval=structuredClone(manifest);
  catalog.products[0].reviewAnalysis.mentionGroups.positive[0].reviewIds.push('unknown');
  approval.approved[0].contentSha256=contentDigest(catalog.products[0]);
  assert.throws(()=>preparePublicCatalog(catalog,approval),/Invalid topic evidence/);
});
test('candidate collection never silently publishes new products',()=>{
  const catalog=structuredClone(source);
  catalog.products.push({...structuredClone(catalog.products[0]),id:'new-unreviewed-product'});
  assert.equal(preparePublicCatalog(catalog,manifest).products.length,20);
});
