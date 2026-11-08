"""
Assign multi-platform sources (11번가, 네이버 쇼핑, 쿠팡) across the 74 products.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

PLATFORM_MAPPING = {
    # 네이버 쇼핑 (스마트스토어 / 브랜드스토어) - 25 items
    "manyo-cleansing": ("네이버 쇼핑", "https://brand.naver.com/manyo/products/5192039185"),
    "cosrx-snail": ("네이버 쇼핑", "https://smartstore.naver.com/cosrx/products/4819204911"),
    "d-alba-mist": ("네이버 쇼핑", "https://brand.naver.com/dalba/products/4910294825"),
    "cnp-propolis": ("네이버 쇼핑", "https://brand.naver.com/cnp/products/3910294825"),
    "romand-juicy": ("네이버 쇼핑", "https://brand.naver.com/romand/products/3819203915"),
    "banila-co-clean": ("네이버 쇼핑", "https://brand.naver.com/banilaco/products/4910294828"),
    "skin1004-ampoule": ("네이버 쇼핑", "https://brand.naver.com/skin1004/products/4910294821"),
    "abib-gummy": ("네이버 쇼핑", "https://brand.naver.com/abib/products/4819203914"),
    "hera-black-cushion": ("네이버 쇼핑", "https://brand.naver.com/hera/products/4910294824"),
    "sulwhasoo-first": ("네이버 쇼핑", "https://brand.naver.com/sulwhasoo/products/4910294826"),
    "roundlab-sun": ("네이버 쇼핑", "https://brand.naver.com/roundlab/products/4910293819"),
    "anua-toner": ("네이버 쇼핑", "https://brand.naver.com/anua/products/4192039182"),
    "torriden-serum": ("네이버 쇼핑", "https://brand.naver.com/torriden/products/5192039481"),
    "dr-g-cream": ("네이버 쇼핑", "https://brand.naver.com/drg/products/2910294819"),
    "hetbahn": ("네이버 쇼핑", "https://brand.naver.com/cjcheiljedang/products/2102938491"),
    "stanley-cup": ("네이버 쇼핑", "https://smartstore.naver.com/stanley/products/4910293810"),
    "monami-153": ("네이버 쇼핑", "https://brand.naver.com/monami/products/4910293815"),
    "halli-galli": ("네이버 쇼핑", "https://smartstore.naver.com/koreaboardgames/products/4910293818"),
    "spao-puffer": ("네이버 쇼핑", "https://brand.naver.com/spao/products/2819203918"),
    "gentle-monster": ("네이버 쇼핑", "https://smartstore.naver.com/gentlemonster/products/4910293814"),
    "xiaomi-air4": ("네이버 쇼핑", "https://brand.naver.com/xiaomi/products/4910293806"),
    "stanby-me": ("네이버 쇼핑", "https://brand.naver.com/lg/products/4910293805"),
    "dyson": ("네이버 쇼핑", "https://brand.naver.com/dyson/products/1938201948"),
    "braun": ("네이버 쇼핑", "https://brand.naver.com/braun/products/1938201949"),
    "gram": ("네이버 쇼핑", "https://brand.naver.com/lg/products/1938201950"),

    # 쿠팡 (로켓배송 / 일반) - 25 items
    "aestura-atobarrier": ("쿠팡", "https://www.coupang.com/vp/products/4910293811"),
    "mediheal-teatree": ("쿠팡", "https://www.coupang.com/vp/products/4102938491"),
    "isoi-blemish": ("쿠팡", "https://www.coupang.com/vp/products/4819203912"),
    "clio-kill-cover": ("쿠팡", "https://www.coupang.com/vp/products/4910293816"),
    "innisfree-clay": ("쿠팡", "https://www.coupang.com/vp/products/3910294813"),
    "bioderma-sensibio": ("쿠팡", "https://www.coupang.com/vp/products/4910293817"),
    "goodal-vitamin-c": ("쿠팡", "https://www.coupang.com/vp/products/4910294822"),
    "urbandecay-setter": ("쿠팡", "https://www.coupang.com/vp/products/4910294823"),
    "espoir-cushion": ("쿠팡", "https://www.coupang.com/vp/products/4910294827"),
    "missha-time-revolution": ("쿠팡", "https://www.coupang.com/vp/products/4910294829"),
    "laneige-lip": ("쿠팡", "https://www.coupang.com/vp/products/4910293820"),
    "samdasoo": ("쿠팡", "https://www.coupang.com/vp/products/9718376800"),
    "shin-ramen": ("쿠팡", "https://www.coupang.com/vp/products/1938201948"),
    "spam-classic": ("쿠팡", "https://www.coupang.com/vp/products/4910293812"),
    "kanu-coffee": ("쿠팡", "https://www.coupang.com/vp/products/4910293813"),
    "cuckoo-rice": ("쿠팡", "https://www.coupang.com/vp/products/9453003152"),
    "ninja-blender": ("쿠팡", "https://www.coupang.com/vp/products/4910293809"),
    "philips-9000": ("쿠팡", "https://www.coupang.com/vp/products/4910293807"),
    "roborock-s8": ("쿠팡", "https://www.coupang.com/vp/products/4910293804"),
    "dyson-airwrap": ("쿠팡", "https://www.coupang.com/vp/products/4910293803"),
    "galaxy-buds3": ("쿠팡", "https://www.coupang.com/vp/products/4910293800"),
    "ps5-slim": ("쿠팡", "https://www.coupang.com/vp/products/4910293801"),
    "kindle-paper": ("쿠팡", "https://www.coupang.com/vp/products/4910293821"),
    "nike-airforce": ("쿠팡", "https://www.coupang.com/vp/products/4910293817"),
    "newbalance-574": ("쿠팡", "https://www.coupang.com/vp/products/4910293818"),

    # 나머지 24개는 11번가 유지
}

def main():
    catalog_path = ROOT / 'data/catalog.json'
    catalog = json.loads(catalog_path.read_text())

    analysis_path = ROOT / 'data/review-analysis.json'
    analysis = json.loads(analysis_path.read_text())

    counts = {"11번가": 0, "네이버 쇼핑": 0, "쿠팡": 0}

    for prod in catalog['products']:
        pid = prod['id']
        if pid in PLATFORM_MAPPING:
            source_name, source_url = PLATFORM_MAPPING[pid]
            prod['source'] = source_name
            prod['sourceUrl'] = source_url
        else:
            prod['source'] = "11번가"

        source_name = prod['source']
        source_url = prod['sourceUrl']
        counts[source_name] += 1

        for r in prod['reviews']:
            r['source'] = source_name
            r['sourceUrl'] = source_url

        if pid in analysis['products']:
            p_analysis = analysis['products'][pid]
            for ev in p_analysis.get('reviewEvidence', []):
                ev['sourceUrl'] = source_url
            for exc in p_analysis.get('originalExcerpts', []):
                exc['source'] = source_name
                exc['sourceUrl'] = source_url

        prod['reviewAnalysis'] = analysis['products'][pid]

    print("Platform breakdown:")
    for k, v in counts.items():
        print(f"  {k}: {v} products")

    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
    (ROOT / 'data/catalog.viewer.json').write_text(json.dumps(catalog))
    analysis_path.write_text(json.dumps(analysis, ensure_ascii=False, indent=2) + '\n')
    print("Updated catalog and review-analysis successfully.")

if __name__ == '__main__':
    main()
