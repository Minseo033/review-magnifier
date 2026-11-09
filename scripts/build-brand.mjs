import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const catalog=JSON.parse(await readFile(new URL('data/catalog.viewer.json',root),'utf8'));
const icon=await readFile(new URL('assets/brand/review-mark.svg',root));
await sharp(icon).resize(180,180).png().toFile(fileURLToPath(new URL('assets/brand/apple-touch-icon.png',root)));
const poster=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#f5f7f6"/><image x="50" y="50" width="84" height="84" href="data:image/svg+xml;base64,${icon.toString('base64')}"/><g font-family="Apple SD Gothic Neo,Malgun Gothic,sans-serif"><text x="155" y="106" font-size="48" font-weight="700" fill="#24644b">후기돋보기</text><text x="52" y="265" font-size="68" font-weight="700" fill="#202722">제품은 한눈에,</text><text x="52" y="355" font-size="68" font-weight="700" fill="#202722">후기는 자세히.</text><text x="55" y="435" font-size="27" fill="#58665e">요약과 원문, 반복해서 나온 장점과 아쉬움</text><text x="55" y="542" font-size="24" fill="#24644b">제품 ${catalog.products.length}개 · 직접 읽은 후기 표본 ${catalog.reviewSampleCount}개</text></g><rect x="803" y="58" width="325" height="255" rx="24" fill="#fff"/><rect x="743" y="335" width="265" height="240" rx="24" fill="#fff"/></svg>`);
const airpods=await sharp(await readFile(new URL('assets/catalog/airpods.webp',root))).resize(255,205,{fit:'contain',background:'#ffffff'}).png().toBuffer();
const tissue=await sharp(await readFile(new URL('assets/catalog/tissue.webp',root))).resize(220,200,{fit:'contain',background:'#ffffff'}).png().toBuffer();
await sharp(poster).composite([{input:airpods,left:838,top:83},{input:tissue,left:765,top:355}]).png().toFile(fileURLToPath(new URL('assets/brand/share.png',root)));
console.log('브랜드 아이콘과 공유용 이미지 생성 완료.');

await sharp(icon).resize(512,512).png().toFile(fileURLToPath(new URL('assets/brand/review-mark.png',root)));
for(const name of ['review-logo','review-logo-white']){
  await sharp(await readFile(new URL(`assets/brand/${name}.svg`,root))).resize(1510,400).png().toFile(fileURLToPath(new URL(`assets/brand/${name}.png`,root)));
}
