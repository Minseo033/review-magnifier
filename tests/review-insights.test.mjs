import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Import the browser ES module without changing the application's package type.
const moduleText=await readFile(new URL('../review-insights.js',import.meta.url),'utf8');
const {TOPIC_SCOPES,renderReviewSummary,renderMentionGroups,renderMentionSection,renderOriginalReviews}=await import(`data:text/javascript;base64,${Buffer.from(moduleText).toString('base64')}`);
const catalog=JSON.parse(await readFile(new URL('../data/catalog.viewer.json',import.meta.url),'utf8'));
const clone=()=>structuredClone(catalog.products.find(product=>product.id==='airpods'));
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const decode=value=>value.replace(/&(amp|lt|gt|quot|#39);/g,(_,key)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[key]));
const quotes=html=>[...html.matchAll(/<blockquote>([\s\S]*?)<\/blockquote>/g)].map(match=>decode(match[1]));

test('explicit experience map covers exactly the catalog topic IDs',()=>{
  const ids=new Set(catalog.products.flatMap(p=>Object.values(p.reviewAnalysis.mentionGroups).flatMap(topics=>topics.map(topic=>topic.id))));
  assert.deepEqual(Object.keys(TOPIC_SCOPES).sort(),[...ids].sort());
  assert.ok(Object.values(TOPIC_SCOPES).every(scope=>scope==='use'||scope==='purchase'));
  for(const id of ['value','shipping','shipping-fee','option','care','box','price','service','giftMissing','gifts','goods','expiry','repeat','preference'])assert.equal(TOPIC_SCOPES[id],'purchase',id);
  for(const id of ['sound','usb','comfort','noise','wash','taste','absorb','fresh','scent','assembly','capacity'])assert.equal(TOPIC_SCOPES[id],'use',id);
});

test('every rendered topic carries its explicit experience label, independently of tone',()=>{
  for(const product of catalog.products){
    const html=renderMentionGroups(product);
    for(const [tone,topics] of Object.entries(product.reviewAnalysis.mentionGroups))for(const topic of topics){
      const block=html.split(`data-mention="${tone}:${topic.id}"`)[1].split('</details>')[0];
      assert.ok(block.includes(`data-experience="${TOPIC_SCOPES[topic.id]}"`),`${product.id}:${tone}:${topic.id}`);
    }
  }
});

test('new and inherited-property topic IDs are not silently classified',()=>{
  for(const id of ['unreviewed-topic','toString','__proto__']){
    const p=clone();p.reviewAnalysis.mentionGroups.positive[0].id=id;
    const html=renderMentionGroups(p);
    assert.match(html,/data-experience="unknown">경험 구분 미확인/);
  }
});

test('all inline evidence quotes exactly match the current source review ID, never summaries',()=>{
  for(const product of catalog.products){
    const html=renderMentionGroups(product);
    const excerpts=new Map(product.reviewAnalysis.originalExcerpts.map(excerpt=>[excerpt.sourceReviewId,excerpt]));
    for(const match of html.matchAll(/<li data-review-id="([^"]*)">([\s\S]*?)<\/li>/g)){
      const id=decode(match[1]),body=match[2],excerpt=excerpts.get(id);
      assert.deepEqual(quotes(body),excerpt?[excerpt.text]:[],`${product.id}:${id}`);
      if(!excerpt)assert.match(body,/원문 텍스트는 현재 자료에 포함되지 않았어요/);
      assert.match(body,/<a href="https:\/\/www\.11st\.co\.kr\/products\//);
    }
    assert.match(html,/발췌는 같은 후기의 일부예요/);
    assert.match(html,/이 주제에 관한 문장이 발췌에 없을 수/);
  }
});

test('unrelated excerpts, descriptions and review summaries are never fabricated into quotes',()=>{
  const p=clone();p.reviewAnalysis.originalExcerpts=[{sourceReviewId:'not-a-mentioned-id',author:'kbw3**',text:'UNRELATED_QUOTE',sourceUrl:'https://example.com/review'}];
  p.reviewAnalysis.reviewEvidence[0].text='NOT_AN_EXCERPT';
  p.reviewAnalysis.mentionGroups.positive[0].description='DESCRIPTION_NOT_A_QUOTE';
  p.reviews[0].summary='SUMMARY_NOT_A_QUOTE';
  const html=renderMentionGroups(p);
  assert.deepEqual(quotes(html),[]);
  assert.ok(!html.includes('UNRELATED_QUOTE'));
  assert.ok(!html.includes('NOT_AN_EXCERPT'));
  assert.match(html,/원문 텍스트는 현재 자료에 포함되지 않았어요/);
  assert.deepEqual(quotes(renderReviewSummary(p)),[]);
});

test('missing or blank excerpt remains an explicit source-only entry',()=>{
  const p=clone();p.reviewAnalysis.originalExcerpts=p.reviewAnalysis.originalExcerpts.map(excerpt=>({...excerpt,text:'   '}));
  const html=renderMentionGroups(p);
  assert.deepEqual(quotes(html),[]);
  assert.match(html,/출처에서 확인해 주세요/);
  assert.match(html,/11번가 원문/);
  p.reviewAnalysis.reviewEvidence=[];
  assert.doesNotThrow(()=>renderMentionGroups(p));
  assert.match(renderMentionGroups(p),/작성자 미제공/);
});

test('summary is expanded, factual and based on maximum mention count, not product lead',()=>{
  for(const p of catalog.products){
    const html=renderReviewSummary(p);
    const topics=Object.values(p.reviewAnalysis.mentionGroups).flat();
    const max=Math.max(...topics.map(t=>t.count));
    assert.match(html,/<details class="summary-topics" open>/);
    assert.ok(html.includes(`가장 많이 언급됐어요 · ${max}개 후기`),p.id);
    assert.ok(!html.includes(escape(p.lead)),p.id);
    assert.match(html,/전체 후기나 의견 비율을 대표하지 않아요/);
  }
});

test('representative excerpts have manually verified topic and exact source ID, including misleading shared-ID cases',()=>{
  const expected={airpods:['usb','523081898'],sony:['sound','511124873'],keyboard:['quiet','387754300'],illy:['noise','499392950'],brita:['capacity','455863227'],cream:['texture','520464087'],lego:['assembly','479040760'],haribo:['sour','475552097'],downy:['lasting','491733818'],lantern:['light','496269797'],toaster:['value','453449584'],crocs:['comfort','514605269'],tissue:['soft','537490625'],'paper-towel':['quantity','513426729'],'wet-wipes':['wipe','503822469'],detergent:['wash','548963739'],shampoo:['scent','522879595'],toothpaste:['fresh','548950568'],'storage-bag':['repeat','529937327'],'dish-soap':['price','446707971'],'galaxy-s24':['design','910283011'],'iphone-16':['color','920384021'],'ipad-air':['quality','930495031'],'buds3-pro':['sound','940506041'],'macbook-air':['quiet','950617051'],'apple-watch':['comfort','960728061'],'ps5-slim':['quality','970839071'],'switch-oled':['quality','980940081'],'dyson-airwrap':['quality','991051091'],'roborock-s8':['cleaning','901162101'],stanbyme:['portable','911273111'],'xiaomi-purifier':['quiet','921384121'],'philips-shaver':['comfort','931495131'],nespresso:['taste','941506141'],'cuckoo-rice':['sturdy','951617151'],'stanley-cup':['lasting','961728161'],'ninja-blender':['quality','971839171'],'shin-ramen':['taste','981940181'],samdasoo:['fresh','992051191'],hetbahn:['taste','902162201'],'spam-classic':['taste','912273211'],'maxim-kanu':['easy','922384221'],'dr-g-cream':['texture','932495231'],'laneige-lip':['moisture','942506241'],'roundlab-sun':['texture','952617251'],'anua-toner':['quality','962728261'],'torriden-serum':['moisture','972839271'],'nike-airforce':['design','982940281'],'newbalance-574':['comfort','993051291'],'spao-puffer':['weight','903162301'],'gentle-monster':['design','913273311'],'monami-153':['quality','923384321'],'halli-galli':['easy','933495331'],'kindle-paper':['quality','943506341']};
  assert.deepEqual(Object.keys(expected).sort(),catalog.products.map(p=>p.id).sort());
  for(const p of catalog.products){
    const [topicId,reviewId]=expected[p.id],html=renderReviewSummary(p);
    assert.ok(html.includes(`data-review-id="${reviewId}" data-topic-id="${topicId}"`),p.id);
    assert.deepEqual(quotes(html),[p.reviewAnalysis.originalExcerpts.find(e=>e.sourceReviewId===reviewId).text]);
    assert.ok(Object.values(p.reviewAnalysis.mentionGroups).flat().some(t=>t.id===topicId&&t.reviewIds.includes(reviewId)));
  }
  assert.match(renderReviewSummary(catalog.products.find(p=>p.id==='toaster')),/토스터기치곤 가격대가 비싸서/);
  assert.match(renderReviewSummary(catalog.products.find(p=>p.id==='paper-towel')),/넉넉한 양 오래 쓸 수 있겠어요/);
});

test('representative does not substitute a different excerpt from the same topic or an unrelated new product',()=>{
  const p=clone();p.reviewAnalysis.originalExcerpts=p.reviewAnalysis.originalExcerpts.filter(e=>e.sourceReviewId!=='523081898');
  p.reviewAnalysis.mentionGroups.positive.find(t=>t.id==='usb').reviewIds.push('523553297');
  assert.deepEqual(quotes(renderReviewSummary(p)),[]);
  assert.match(renderReviewSummary(p),/연결할 원문 발췌는 포함되지 않았어요/);
  const unknown=clone();unknown.id='unknown-product';assert.deepEqual(quotes(renderReviewSummary(unknown)),[]);
});

test('all renderers escape text and attributes and reject executable source URLs',()=>{
  const p=clone(),attack='<img src=x onerror="alert(1)"> & \'payload\'';
  p.reviews[0].topic=attack;p.reviews[0].summary=attack;p.reviews[0].sourceUrl='javascript:alert(1)';
  for(const e of p.reviewAnalysis.originalExcerpts){e.text=attack;e.author=attack;e.sourceRating=attack;e.sourceUrl='javascript:alert(1)';}
  for(const e of p.reviewAnalysis.reviewEvidence){e.author=attack;e.sourceUrl='data:text/html,evil';}
  const topic=p.reviewAnalysis.mentionGroups.positive[0];topic.label=attack;topic.description=attack;
  for(const render of [renderReviewSummary,renderMentionGroups,renderMentionSection,renderOriginalReviews]){
    const html=render(p);
    assert.ok(html.includes(escape(attack)),render.name);
    assert.ok(!html.includes('<img'),render.name);
    assert.ok(!html.includes('href="javascript:'),render.name);
    assert.ok(!html.includes('href="data:'),render.name);
    assert.match(html,/출처 링크 미제공/);
    for(const quote of quotes(html))assert.equal(quote,attack);
  }
  topic.id='x" onmouseover="bad';topic.reviewIds=['x" onmouseover="bad'];
  assert.match(renderMentionGroups(p),/data-mention="positive:x&quot; onmouseover=&quot;bad"/);
  assert.ok(!renderMentionGroups(p).includes(' onmouseover="bad'));
});

test('minimum filtering and empty data remain safe and do not invent opinions',()=>{
  const p=clone();const html=renderMentionGroups(p,3);
  assert.ok(!html.includes('data-mention="positive:usb"'));
  assert.ok(html.includes('data-mention="positive:value"'));
  assert.match(html,/3개 이상에서 언급된 아쉬움은 없어요/);
  p.reviewAnalysis.mentionGroups={positive:[],negative:[]};p.reviewAnalysis.originalExcerpts=[];p.reviews=[];
  assert.match(renderReviewSummary(p),/집계된 주제가 없어요/);
  assert.deepEqual(quotes(renderReviewSummary(p)),[]);
  assert.match(renderMentionGroups(p),/표본에 없는 경험까지 없다는 뜻은 아니에요/);
});

test('original excerpt section identifies the subset and never asserts advertising authenticity',()=>{
  for(const p of catalog.products){
    const html=renderOriginalReviews(p);
    assert.match(html,/>원문 발췌 <span>/);
    assert.ok(!html.includes('일반 후기'));
    assert.ok(html.includes(`수집한 ${p.reviewAnalysis.reviewSampleCount}개 후기 중 ${p.reviewAnalysis.originalExcerpts.length}개`));
    assert.match(html,/광고·협찬 여부를 확인할 정보가 없어 미확인/);
    assert.match(html,/광고가 아니라는 뜻은 아니에요/);
    assert.deepEqual(quotes(html),p.reviewAnalysis.originalExcerpts.map(e=>e.text));
  }
});
