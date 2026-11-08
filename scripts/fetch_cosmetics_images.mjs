import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);

const COSMETIC_ITEMS = [
  { id: "manyo-cleansing", brand: "마녀공장", name: "퓨어 클렌징 오일", category: "뷰티", url: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&h=600&fit=crop" },
  { id: "cosrx-snail", brand: "코스알엑스", name: "스네일 96 뮤신 에센스", category: "뷰티", url: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600&h=600&fit=crop" },
  { id: "aestura-atobarrier", brand: "에스트라", name: "아토베리어 365 크림", category: "뷰티", url: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&h=600&fit=crop" },
  { id: "mediheal-teatree", brand: "메디힐", name: "티트리 에센셜 마스크", category: "뷰티", url: "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600&h=600&fit=crop" },
  { id: "d-alba-mist", brand: "달바", name: "화이트 트러플 미스트", category: "뷰티", url: "https://images.unsplash.com/photo-1608248597359-5775f0a67e2a?w=600&h=600&fit=crop" },
  { id: "cnp-propolis", brand: "차앤박", name: "프로폴리스 에너지 앰플", category: "뷰티", url: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600&h=600&fit=crop" },
  { id: "isoi-blemish", brand: "아이소이", name: "블레미쉬 케어 잡티 세럼", category: "뷰티", url: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600&h=600&fit=crop" },
  { id: "clio-kill-cover", brand: "클리오", name: "킬커버 더 뉴 파운웨어", category: "뷰티", url: "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600&h=600&fit=crop" },
  { id: "romand-juicy", brand: "롬앤", name: "쥬시 래스팅 틴트", category: "뷰티", url: "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600&h=600&fit=crop" },
  { id: "banila-co-clean", brand: "바닐라코", name: "클린 잇 제로 클렌징 밤", category: "뷰티", url: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&h=600&fit=crop" },
  { id: "innisfree-clay", brand: "이니스프리", name: "화산송이 모공 마스크", category: "뷰티", url: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&h=600&fit=crop" },
  { id: "bioderma-sensibio", brand: "바이오더마", name: "센시비오 H2O 클렌징", category: "뷰티", url: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&h=600&fit=crop" },
  { id: "skin1004-ampoule", brand: "스킨1004", name: "센텔라 앰플 100ml", category: "뷰티", url: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600&h=600&fit=crop" },
  { id: "goodal-vitamin-c", brand: "구달", name: "청귤 비타C 잡티 세럼", category: "뷰티", url: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600&h=600&fit=crop" },
  { id: "abib-gummy", brand: "아비브", name: "껌딱지 마스크 어성초", category: "뷰티", url: "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600&h=600&fit=crop" },
  { id: "urbandecay-setter", brand: "어반디케이", name: "올나이터 세팅 픽서", category: "뷰티", url: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&h=600&fit=crop" },
  { id: "hera-black-cushion", brand: "헤라", name: "NEW 블랙 쿠션", category: "뷰티", url: "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600&h=600&fit=crop" },
  { id: "sulwhasoo-first", brand: "설화수", name: "윤조에센스 6세대", category: "뷰티", url: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600&h=600&fit=crop" },
  { id: "espoir-cushion", brand: "에스쁘아", name: "비벨벳 커버 쿠션", category: "뷰티", url: "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600&h=600&fit=crop" },
  { id: "missha-time-revolution", brand: "미샤", name: "보랏빛 앰플 5X", category: "뷰티", url: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600&h=600&fit=crop" }
];

console.log(`Processing images for ${COSMETIC_ITEMS.length} cosmetics items...`);

for (const item of COSMETIC_ITEMS) {
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
      <rect width="600" height="600" fill="#fcf9f9"/>
      <rect x="40" y="40" width="520" height="520" rx="24" fill="#ffffff" stroke="#f0e6e6" stroke-width="2"/>
      <text x="300" y="240" font-family="sans-serif" font-size="28" font-weight="bold" fill="#b8466b" text-anchor="middle">${item.brand}</text>
      <text x="300" y="300" font-family="sans-serif" font-size="34" font-weight="bold" fill="#241b1e" text-anchor="middle">${item.name}</text>
      <rect x="220" y="380" width="160" height="40" rx="20" fill="#faeaee"/>
      <text x="300" y="406" font-family="sans-serif" font-size="16" font-weight="600" fill="#b8466b" text-anchor="middle">${item.category}</text>
    </svg>`;
    await sharp(Buffer.from(svg))
      .resize(600, 600)
      .webp({ quality: 86 })
      .toFile(destPath);
  }
}

console.log('Cosmetic images processed successfully.');
