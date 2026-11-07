"""Verify the public build, source boundaries and project-specific size budget."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
import gzip
import hashlib
import json
import struct
import subprocess
import zipfile

ROOT=Path(__file__).resolve().parent.parent
SITE=ROOT/'docs'


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta,self.links,self.scripts={},[],[]
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='meta':self.meta[attrs.get('property',attrs.get('name',attrs.get('http-equiv','')))]=attrs.get('content','')
        if tag=='link':self.links.append(attrs)
        if tag=='script':self.scripts.append(attrs)


def main():
    catalog=json.loads((ROOT/'data/catalog.json').read_text())
    viewer=json.loads((ROOT/'data/catalog.viewer.json').read_text())
    config=json.loads((ROOT/'config/site.json').read_text())
    html=(SITE/'index.html').read_text();page=Page();page.feed(html)
    assert page.meta['og:url']==config['url']
    assert page.meta['og:title'].startswith(config['name'])
    assert page.meta['twitter:card']=='summary_large_image'
    assert any(link.get('rel')=='canonical' and link['href']==config['url'] for link in page.links)
    assert "script-src 'self'" in page.meta['Content-Security-Policy']
    assert 'noindex' in page.meta['robots'] if config['indexing']=='preview' else 'noindex' not in page.meta['robots']
    assert 'Disallow: /' in (SITE/'robots.txt').read_text() if config['indexing']=='preview' else 'Allow: /' in (SITE/'robots.txt').read_text()
    assert 'startup-error' in html and 'privacy-view' in html and '<noscript><section' in html
    assert config['contactEmail'] and 'mailto:'+config['contactEmail'] in html
    assert len(page.scripts)==2 and page.scripts[0]['src'].startswith('boot.js?v=')
    for name in ('boot.js','catalog.bundle.js','catalog.css'):
        body=(SITE/name).read_bytes()
        assert body==(ROOT/name).read_bytes()
        assert name+'?v='+hashlib.sha256(body).hexdigest()[:12] in html
    script=(SITE/'catalog.bundle.js').read_bytes()
    assert len(script)<300_000, 'JavaScript exceeded the 300 KB reviewed catalog budget.'
    assert b'data:image/webp;base64' not in script
    assert len(viewer['products'])==len(catalog['products'])
    assert sum(p['reviewSampleCount'] for p in viewer['products'])==catalog['reviewSampleCount']
    for product in viewer['products']:
        assert 'imageData' not in product and not product['image'].startswith('data:')
        assert urlparse(product['sourceUrl']).hostname=='www.11st.co.kr'
        assert (SITE/product['image']).is_file()
        assert (SITE/product['image']).read_bytes()==(ROOT/product['image']).read_bytes()
        assert sum(len(item['text'].split()) for item in product['reviewAnalysis']['originalExcerpts'])<=25
    for name,size in (('share.png',(1200,630)),('apple-touch-icon.png',(180,180))):
        content=(SITE/'assets/brand'/name).read_bytes()
        assert content.startswith(b'\x89PNG\r\n\x1a\n') and struct.unpack('>II',content[16:24])==size
    private=[str(file.relative_to(SITE)) for file in SITE.rglob('*') if file.is_file() and (file.suffix in {'.sqlite3','.json','.env','.py'} or file.name.startswith('.env') or '.cache' in file.parts or '.local-data' in file.parts)]
    assert not private, 'Private data entered the public output: '+str(private)
    for name in ('후기돋보기_개선본.html','후기돋보기_리뷰중심.html'):
        portable=(ROOT/name).read_text()
        assert 'data:image/webp;base64,' in portable and '<script defer' not in portable
    with zipfile.ZipFile(ROOT/'후기돋보기_수정본.zip') as archive:
        assert not any('/reports/' in name or '/.local-data/' in name or '/.cache/' in name or name.endswith('/.env') for name in archive.namelist())
    try:
        baseline=subprocess.check_output(['git','show','6e32cfc:catalog.bundle.js'],cwd=ROOT,stderr=subprocess.DEVNULL)
    except (subprocess.CalledProcessError,FileNotFoundError):
        baseline=None  # A source archive or shallow checkout still gets all absolute release checks.
    report={'status':'pass','publicProducts':len(catalog['products']),'publicReviewSamples':catalog['reviewSampleCount'],'summaries':catalog['summaryCount'],'excerpts':catalog['originalExcerptCount'],
            'javascriptBytesBefore':len(baseline) if baseline else None,'javascriptBytesAfter':len(script),'javascriptReductionPercent':round((1-len(script)/len(baseline))*100,1) if baseline else None,'javascriptGzipBytes':len(gzip.compress(script)),
            'photoLoading':'Separate same-origin static assets; featured photos eager, discovery photos lazy',
            'versionedAssets':True,'sourceBoundaries':'No private DB, raw reviews, caches or reports in hosted output/archive',
            'indexing':config['indexing'],'shareMetadata':'Static site metadata and 1200x630 image; product hash previews remain site-wide',
            'checksNotClaimed':['Lighthouse','axe','real-user performance','legal compliance certification','production backend readiness']}
    destination=ROOT/'reports/launch-audit/release-verification.json';destination.parent.mkdir(parents=True,exist_ok=True);destination.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__=='__main__':main()
