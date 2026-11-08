import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);

// Product definitions to generate
const NEW_ITEMS = [
  { id: "galaxy-s24", brand: "삼성전자", name: "Galaxy S24", category: "디지털", url: "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=600&h=600&fit=crop" },
  { id: "iphone-16", brand: "Apple", name: "iPhone 16", category: "디지털", url: "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=600&h=600&fit=crop" },
  { id: "ipad-air", brand: "Apple", name: "iPad Air 11", category: "디지털", url: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=600&h=600&fit=crop" },
  { id: "buds3-pro", brand: "삼성전자", name: "Galaxy Buds3 Pro", category: "디지털", url: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600&h=600&fit=crop" },
  { id: "macbook-air", brand: "Apple", name: "MacBook Air 13", category: "디지털", url: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600&h=600&fit=crop" },
  { id: "apple-watch", brand: "Apple", name: "Apple Watch SE", category: "디지털", url: "https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=600&h=600&fit=crop" },
  { id: "ps5-slim", brand: "Sony", name: "PlayStation 5", category: "디지털", url: "https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=600&h=600&fit=crop" },
  { id: "switch-oled", brand: "Nintendo", name: "스위치 OLED", category: "디지털", url: "https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?w=600&h=600&fit=crop" },
  { id: "dyson-airwrap", brand: "Dyson", name: "에어랩 멀티 스타일러", category: "생활", url: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&h=600&fit=crop" },
  { id: "roborock-s8", brand: "Roborock", name: "로보락 S8 Pro Ultra", category: "생활", url: "https://images.unsplash.com/photo-1518640467707-6811f4a6ab73?w=600&h=600&fit=crop" },
  { id: "stanbyme", brand: "LG전자", name: "스탠바이미 27인치", category: "생활", url: "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=600&h=600&fit=crop" },
  { id: "xiaomi-purifier", brand: "샤오미", name: "스마트 공기청정기 4", category: "생활", url: "https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=600&h=600&fit=crop" },
  { id: "philips-shaver", brand: "Philips", name: "SkinIQ 9000", category: "생활", url: "https://images.unsplash.com/photo-1621607512214-68297480165e?w=600&h=600&fit=crop" },
  { id: "nespresso", brand: "Nespresso", name: "버츄오 팝", category: "주방", url: "https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=600&h=600&fit=crop" },
  { id: "cuckoo-rice", brand: "쿠쿠", name: "6인용 올스텐 IH밥솥", category: "주방", url: "https://images.unsplash.com/photo-1544233726-9f1d2b27be8b?w=600&h=600&fit=crop" },
  { id: "stanley-cup", brand: "Stanley", name: "퀜처 H2.0 텀블러", category: "주방", url: "https://images.unsplash.com/photo-1544816155-12df9643f363?w=600&h=600&fit=crop" },
  { id: "ninja-blender", brand: "Ninja", name: "초고속 블렌더", category: "주방", url: "https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=600&h=600&fit=crop" },
  { id: "shin-ramen", brand: "농심", name: "신라면 멀티팩", category: "식품", url: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600&h=600&fit=crop" },
  { id: "samdasoo", brand: "제주삼다수", name: "무라벨 2L 생수", category: "식품", url: "https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=600&h=600&fit=crop" },
  { id: "hetbahn", brand: "CJ제일제당", name: "햇반 백미 210g", category: "식품", url: "https://images.unsplash.com/photo-1516684732162-798a0062be99?w=600&h=600&fit=crop" },
  { id: "spam-classic", brand: "CJ제일제당", name: "스팸 클래식 200g", category: "식품", url: "https://images.unsplash.com/photo-1544025162-d76694265947?w=600&h=600&fit=crop" },
  { id: "maxim-kanu", brand: "동서식품", name: "카누 다크로스트", category: "식품", url: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&h=600&fit=crop" },
  { id: "dr-g-cream", brand: "닥터지", name: "레드 블레미쉬 크림", category: "뷰티", url: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&h=600&fit=crop" },
  { id: "laneige-lip", brand: "라네즈", name: "립 슬리핑 마스크", category: "뷰티", url: "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600&h=600&fit=crop" },
  { id: "roundlab-sun", brand: "라운드랩", name: "자작나무 수분 선크림", category: "뷰티", url: "https://images.unsplash.com/photo-1526947425960-945c6e72858f?w=600&h=600&fit=crop" },
  { id: "anua-toner", brand: "아누아", name: "어성초 77 진정 토너", category: "뷰티", url: "https://images.unsplash.com/photo-1608248597359-5775f0a67e2a?w=600&h=600&fit=crop" },
  { id: "torriden-serum", brand: "토리든", name: "다이브인 히알루론산 세럼", category: "뷰티", url: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600&h=600&fit=crop" },
  { id: "nike-airforce", brand: "Nike", name: "에어 포스 1 올화이트", category: "패션", url: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600&h=600&fit=crop" },
  { id: "newbalance-574", brand: "뉴발란스", name: "574 레거시 네이비", category: "패션", url: "https://images.unsplash.com/photo-1539185441755-769473a23570?w=600&h=600&fit=crop" },
  { id: "spao-puffer", brand: "스파오", name: "베이직 푸퍼 숏패딩", category: "패션", url: "https://images.unsplash.com/photo-1544923246-77307dd654cb?w=600&h=600&fit=crop" },
  { id: "gentle-monster", brand: "GENTLE MONSTER", name: "릴리트 01 선글라스", category: "패션", url: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=600&h=600&fit=crop" },
  { id: "monami-153", brand: "모나미", name: "153 블랙앤화이트", category: "취미", url: "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=600&h=600&fit=crop" },
  { id: "halli-galli", brand: "아미고", name: "할리갈리 보드게임", category: "취미", url: "https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=600&h=600&fit=crop" },
  { id: "kindle-paper", brand: "Amazon", name: "킨들 페이퍼화이트", category: "취미", url: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&h=600&fit=crop" }
];

console.log(`Processing images for ${NEW_ITEMS.length} new items...`);

for (const item of NEW_ITEMS) {
  const destPath = fileURLToPath(new URL(`assets/catalog/${item.id}.webp`, root));
  if (existsSync(destPath)) {
    try {
      const meta = await sharp(destPath).metadata();
      if (meta.width === 600 && meta.height === 600) {
        console.log(`Already exists: ${item.id}`);
        continue;
      }
    } catch {
      // re-process
    }
  }

  console.log(`Generating image for ${item.id} (${item.brand} ${item.name})...`);
  try {
    const res = await fetch(item.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await sharp(buf)
      .resize(600, 600, { fit: 'contain', background: '#ffffff' })
      .webp({ quality: 86 })
      .toFile(destPath);
    console.log(`Saved ${destPath}`);
  } catch (err) {
    console.warn(`Fetch failed for ${item.id}: ${err.message}. Creating styled fallback image.`);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
      <rect width="600" height="600" fill="#f8faf9"/>
      <rect x="40" y="40" width="520" height="520" rx="24" fill="#ffffff" stroke="#e6ece8" stroke-width="2"/>
      <text x="300" y="240" font-family="sans-serif" font-size="28" font-weight="bold" fill="#24644b" text-anchor="middle">${item.brand}</text>
      <text x="300" y="300" font-family="sans-serif" font-size="34" font-weight="bold" fill="#1b241e" text-anchor="middle">${item.name}</text>
      <rect x="220" y="380" width="160" height="40" rx="20" fill="#eaf4ee"/>
      <text x="300" y="406" font-family="sans-serif" font-size="16" font-weight="600" fill="#24644b" text-anchor="middle">${item.category}</text>
    </svg>`;
    await sharp(Buffer.from(svg))
      .resize(600, 600)
      .webp({ quality: 86 })
      .toFile(destPath);
  }
}

console.log('All images ready.');
