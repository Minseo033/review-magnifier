"""Small, repeatable public-page snapshot. No login, pagination or hidden API."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.request import Request, urlopen
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor
import re, json, html, hashlib
from datetime import datetime
from zoneinfo import ZoneInfo

ROOT=Path(__file__).resolve().parent.parent
CACHE=ROOT/'.cache/catalog'
SEEDS=[
 ('airpods','4951964779','Apple','AirPods Pro 2','디지털','이어폰 · USB-C 옵션 포함','digital'),
 ('sony','5792602689','Sony','WH-1000XM5','디지털','무선 노이즈캔슬링 헤드폰','digital'),
 ('keyboard','1376809269','Logitech','K380 블루투스 키보드','디지털','멀티 디바이스 키보드','digital'),
 ('illy','3267598530','illy','Y3.3 캡슐 커피머신','주방','홈카페 · 캡슐 포함 구성','kitchen'),
 ('brita','2335628533','BRITA','마렐라 쿨 2.4L','주방','필터형 정수기 · 기본 구성','kitchen'),
 ('cream','5442600054','La Roche-Posay','시카플라스트 크림 B5','뷰티','멀티 리페어 크림 · 100ml','beauty'),
 ('lego','3836964425','LEGO','아이디어 타자기 21327','취미','레고 아이디어 · 조립 제품','hobby'),
 ('haribo','3674816404','HARIBO','젤리 3+3+3 골라담기','식품','프루티부시 외 혼합 옵션','food'),
 ('downy','2259873615','Downy','미스티크 섬유유연제','생활','1L × 2개 구성','living'),
 ('lantern','4540560289','BALMUDA','더 랜턴 L02B','생활','충전식 LED 랜턴','living'),
 ('toaster','1410088243','BALMUDA','더 토스터 K11B','주방','스팀 토스터 · 구성 옵션 확인','kitchen'),
 ('crocs','2803008147','Crocs','클래식 올터레인 클로그','패션','206340 · 컬러 6종 옵션','fashion'),
]

def clean(value):
 return re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',value))).strip()

class Meta(HTMLParser):
 def __init__(self):super().__init__();self.values={}
 def handle_starttag(self,tag,attrs):
  if tag=='meta':
   a=dict(attrs);self.values[a.get('property',a.get('name',''))]=a.get('content','')

def collect(seed):
 key,pid,brand,name,category,subtitle,cat=seed
 url='https://www.11st.co.kr/products/'+pid
 cache=CACHE/(key+'.html')
 if cache.exists():raw=cache.read_text()
 else:
  raw=urlopen(Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=25).read().decode('utf-8',errors='replace');cache.write_text(raw)
 meta=Meta();meta.feed(raw)
 reviews=[]
 for match in re.finditer(r'<a[^>]+name="review-atf"(?P<attrs>[^>]*)>(?P<body>.*?)</a>',raw,re.S):
  body=match['body'];text=re.search(r'<span class="cont">(.*?)</span>',body,re.S);author=re.search(r'<span class="name">(.*?)</span>',body,re.S)
  rid=re.search(r'data-contmapno="(\d+)"',match['attrs']);rating=re.search(r'판매자 평점 별5개 중</span>\s*(\d)',body,re.S)
  if text:reviews.append({'sourceReviewId':rid[1] if rid else None,'author':clean(author[1]) if author else '작성자 미제공','sourceRating':int(rating[1]) if rating else None,'original':clean(text[1])})
 desc=meta.values.get('description','')
 rating=re.search(r'평점:\s*([\d.]+)',desc);count=re.search(r'리뷰수:\s*([\d,]+)',desc);price=re.search(r'할인모음가:\s*([\d,]+)',desc)
 image_url=html.unescape(meta.values.get('og:image',''))
 if not image_url:raise ValueError('No product photo: '+key)
 image_file=ROOT/'assets/catalog'/f'{key}.jpg'
 if not image_file.exists():
  response=urlopen(Request(image_url,headers={'User-Agent':'Mozilla/5.0','Referer':url}),timeout=30)
  content=response.read();image_file.write_bytes(content)
 else:content=image_file.read_bytes()
 return {'id':key,'brand':brand,'name':name,'subtitle':subtitle,'category':cat,'categoryName':category,'source':'11번가','sourceUrl':url,'sourceTitle':meta.values.get('og:title','').removeprefix('[11번가] '),'sourceRating':float(rating[1]) if rating else None,'sourceReviewCount':int(count[1].replace(',','')) if count else None,'observedPrice':int(price[1].replace(',','')) if price else None,'image':'assets/catalog/'+key+'.webp','imageSourceUrl':image_url,'imageSha256':hashlib.sha256(content).hexdigest(),'reviewSampleCount':len(reviews),'collectedAt':datetime.now(ZoneInfo('Asia/Seoul')).isoformat(timespec='seconds'),'sourceReviewDatesAvailable':False,'originalReviews':reviews}

if __name__=='__main__':
 CACHE.mkdir(parents=True,exist_ok=True);(ROOT/'assets/catalog').mkdir(parents=True,exist_ok=True)
 with ThreadPoolExecutor(max_workers=3) as pool:items=list(pool.map(collect,SEEDS))
 (CACHE/'evidence.json').write_text(json.dumps(items,ensure_ascii=False,indent=2))
 print(json.dumps([{'id':p['id'],'sourceReviews':p['sourceReviewCount'],'collected':p['reviewSampleCount'],'photoBytes':(ROOT/'assets/catalog'/(p['id']+'.jpg')).stat().st_size} for p in items],ensure_ascii=False,indent=2))
