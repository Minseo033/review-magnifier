import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const root=new URL('../',import.meta.url);
const cachedEvidence=new URL('.cache/catalog/evidence.json',root);
const hasEvidence=existsSync(cachedEvidence);
const evidence=hasEvidence?JSON.parse(await readFile(cachedEvidence,'utf8')):[];
const editorial=JSON.parse(await readFile(new URL('data/editorial.json',root),'utf8'));
const products=hasEvidence?[]:JSON.parse(await readFile(new URL('data/catalog.json',root),'utf8')).products;
for (const item of evidence) {
  const {originalReviews,...product}=item;
  const edit=editorial[item.id];
  if(!edit)throw new Error('Missing review editorial: '+item.id);
  const reviews=edit.reviews.map(({index,...text},i)=>{
    const original=originalReviews.find(review=>review.sourceReviewId===text.sourceReviewId);
    if(!original)throw new Error(`Missing evidence ${item.id}:${index}`);
    return {id:`${item.id}-${i+1}`,...text,sourceReviewId:original.sourceReviewId,author:original.author,sourceRating:original.sourceRating,sourceUrl:item.sourceUrl,summaryType:'원문을 읽고 재구성한 요약',date:null,adStatus:'확인 불가'};
  });
  products.push({...product,...edit,reviews});
}
const dataset={version:4,collectedDate:'2026-11-05',sourceCount:1,sourceName:'11번가',referenceSite:'https://www.09now.com/',reviewSampleCount:products.reduce((s,p)=>s+p.reviewSampleCount,0),summaryCount:products.reduce((s,p)=>s+p.reviews.length,0),products};
await writeFile(new URL('data/catalog.json',root),JSON.stringify(dataset,null,2));
for(const product of products){
  // Crop only the old promotional price strip below the BRITA product photo.
  if(product.id==='brita'&&existsSync(new URL('assets/catalog/brita.jpg',root))) {
    const input=new URL('assets/catalog/brita.jpg',root);const meta=await sharp(await readFile(input)).metadata();
    await sharp(await readFile(input)).extract({left:0,top:0,width:meta.width,height:Math.floor(meta.height*.85)}).resize(600,600,{fit:'contain',background:'#ffffff'}).webp({quality:86}).toFile(fileURLToPath(new URL('assets/catalog/brita.webp',root)));
  }
  product.imageData='data:image/webp;base64,'+(await readFile(new URL(product.image,root))).toString('base64');
}
await writeFile(new URL('data/catalog.viewer.json',root),JSON.stringify(dataset));
console.log(`Prepared ${products.length} actual products, ${dataset.reviewSampleCount} collected review samples, ${dataset.summaryCount} attributed summaries.`);
