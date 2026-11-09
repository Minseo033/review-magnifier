import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {preparePublicCatalog} from './publication-policy.mjs';

const root=new URL('../',import.meta.url);
const catalog=JSON.parse(await readFile(new URL('data/catalog.json',root),'utf8'));
const manifest=JSON.parse(await readFile(new URL('data/publication-manifest.json',root),'utf8'));
const dataset=preparePublicCatalog(catalog,manifest);
for(const product of dataset.products){
  if(!/^assets\/catalog\/[a-z0-9-]+\.webp$/.test(product.image))throw new Error(`Invalid product image: ${product.id}`);
  const image=await readFile(new URL(product.image,root));
  if(createHash('sha256').update(image).digest('hex')!==manifest.approved.find(entry=>entry.id===product.id).imageSha256)throw new Error(`Image changed; review required: ${product.id}`);
}
await writeFile(new URL('data/catalog.viewer.json',root),JSON.stringify(dataset));
console.log(`Prepared ${dataset.products.length} reviewed products and ${dataset.reviewSampleCount} source samples. ${catalog.products.length-dataset.products.length} candidates withheld pending source review.`);
