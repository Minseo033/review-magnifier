"""Small, explicit public-page/RSS pilots. No account, hidden API or auto-discovery."""
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener
import fcntl
import json
import re
import time
import xml.etree.ElementTree as ET

from data_store import digest, dumps, now, run, upsert_listing, upsert_review
from naver_sources import canonical_blog, plain, upsert_document

COOLDOWN_SECONDS = 6 * 60 * 60
DAILY_REQUEST_LIMIT = 6  # Prototype budget shared by both commands, not a platform quota.


def validate_url(url, kind):
    parsed = urlparse(url)
    expected_host = 'www.11st.co.kr' if kind == 'products' else 'rss.blog.naver.com'
    pattern = r'/products/\d+/?' if kind == 'products' else r'/[A-Za-z0-9_-]+\.xml'
    if (parsed.scheme != 'https' or parsed.netloc != expected_host or
            parsed.query or parsed.fragment or not re.fullmatch(pattern, parsed.path)):
        raise ValueError('Use a canonical HTTPS product URL or Naver blog RSS URL.')
    return url


class PublicRedirects(HTTPRedirectHandler):
    def __init__(self, kind):
        self.kind = kind

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl, self.kind)
        if self.kind == 'products' and urlparse(newurl).path.rstrip('/') != urlparse(req.full_url).path.rstrip('/'):
            raise ValueError('A product redirect changed the source product ID.')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def request_public(url, kind):
    validate_url(url, kind)
    opener = build_opener(PublicRedirects(kind))
    with opener.open(Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'application/rss+xml,text/html;q=0.9'}), timeout=25) as response:
        validate_url(response.url, kind)
        if kind == 'products' and urlparse(response.url).path.rstrip('/') != urlparse(url).path.rstrip('/'):
            raise ValueError('The response belongs to another source product ID.')
        body = response.read(5_000_001)
        if len(body) > 5_000_000:
            raise ValueError('Public response exceeded the 5 MB limit.')
        return body, response.url


def parse_rss(body, keywords):
    if re.search(br'<!\s*(?:DOCTYPE|ENTITY)\b', body, re.I):
        raise ValueError('RSS declarations with entities are unsupported.')
    root = ET.fromstring(body)
    channel = root.find('channel') if root.tag == 'rss' else None
    if channel is None:
        raise ValueError('A supported RSS channel was not found.')
    entries = channel.findall('item')
    if len(entries) > 100:
        raise ValueError('RSS pilot supports at most 100 entries per feed.')
    normalized = [re.sub(r'\s+', '', term).casefold() for term in keywords]
    items = []
    for rank, entry in enumerate(entries, 1):
        title = plain(entry.findtext('title'))
        title_match = re.sub(r'\s+', '', title).casefold()
        matched = [term for term, token in zip(keywords, normalized) if token in title_match]
        canonical = canonical_blog(entry.findtext('link') or '')
        if not matched or not canonical:
            continue
        date = None
        try:
            date = parsedate_to_datetime(entry.findtext('pubDate') or '').strftime('%Y%m%d')
        except (ValueError, TypeError, OverflowError):
            pass
        items.append({'link': canonical[0], 'title': title, 'author': canonical[1].split('/')[0],
                      'postdate': date, 'description': plain(entry.findtext('description'))[:2000],
                      'rssRank': rank, 'matchedTitleKeywords': matched})
    return {'feedItems': len(entries), 'items': items, 'skippedItems': len(entries) - len(items)}


class ProductMeta(HTMLParser):
    def __init__(self):
        super().__init__()
        self.values = {}

    def handle_starttag(self, tag, attrs):
        if tag == 'meta':
            attrs = dict(attrs)
            self.values[attrs.get('property', attrs.get('name', ''))] = attrs.get('content', '')


def parse_product(body):
    page = body.decode('utf-8')
    meta = ProductMeta()
    meta.feed(page)
    title = meta.values.get('og:title', '')
    image = meta.values.get('og:image', '')
    if not title.startswith('[11번가] ') or urlparse(image).scheme != 'https':
        raise ValueError('A supported public 11st product page was not found.')
    description = meta.values.get('description', '')
    def number(pattern, transform):
        match = re.search(pattern, description)
        return transform(match[1].replace(',', '')) if match else None
    reviews, skipped = [], 0
    for match in re.finditer(r'<a\b(?P<attrs>[^>]*\bname="review-atf"[^>]*)>(?P<body>.*?)</a>', page, re.S):
        attrs, content = match['attrs'], match['body']
        rid = re.search(r'data-contmapno="(\d+)"', attrs)
        text = re.search(r'<span class="cont">(.*?)</span>', content, re.S)
        author = re.search(r'<span class="name">(.*?)</span>', content, re.S)
        rating = re.search(r'판매자 평점 별5개 중</span>\s*(\d)', content, re.S)
        if not rid or not text or not plain(text[1]):
            skipped += 1
            continue
        # Same HTML/whitespace normalization as the original import; no paraphrasing.
        clean = lambda value: re.sub(r'\s+', ' ', unescape(re.sub(r'<[^>]+>', ' ', value))).strip()
        reviews.append({'id': rid[1], 'body': clean(text[1]), 'author': clean(author[1]) if author else None,
                        'rating': int(rating[1]) if rating else None})
    return {'title': title.removeprefix('[11번가] '), 'image': image,
            'price': number(r'할인모음가:\s*([\d,]+)', int),
            'rating': number(r'평점:\s*([\d.]+)', float),
            'reviewCount': number(r'리뷰수:\s*([\d,]+)', int),
            'reviews': reviews, 'skippedReviewCards': skipped}


def persist_snapshot(db, kind, body, target, at):
    if kind == 'blogs':
        parsed = parse_rss(body, target['titleKeywords'])
        before = db.execute('SELECT COUNT(*) FROM documents').fetchone()[0]
        ids = [upsert_document(db, item, at) for item in parsed['items']]
        return {'feedItems': parsed['feedItems'], 'matchedCandidates': len(ids),
                'skippedItems': parsed['skippedItems'], 'documentIds': ids,
                'titleKeywords': target['titleKeywords'],
                'matches': [{'documentId': doc_id, 'rssRank': item['rssRank'], 'matchedTitleKeywords': item['matchedTitleKeywords']}
                            for doc_id, item in zip(ids, parsed['items'])],
                'newBlogCandidates': db.execute('SELECT COUNT(*) FROM documents').fetchone()[0] - before,
                'classification': 'unreviewed-title-matches', 'contentScope': 'rss-metadata-and-description'}
    parsed = parse_product(body)
    external_id = urlparse(target['url']).path.rstrip('/').split('/')[-1]
    previous = db.execute("SELECT * FROM listings WHERE source_id='11st' AND external_id=?", (external_id,)).fetchone()
    counts = [db.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0] for table in ('reviews', 'review_versions')]
    fields = {key: previous[key] for key in ('product_id', 'brand', 'maker', 'mall_name')} if previous else {}
    if previous:
        fields['categories'] = json.loads(previous['category_json'])
    listing_id = upsert_listing(db, '11st', external_id, parsed['title'], target['url'], at,
                                image_url=parsed['image'], price=parsed['price'], review_count=parsed['reviewCount'], rating=parsed['rating'], **fields)
    for review in parsed['reviews']:
        upsert_review(db, listing_id, review['id'], review['body'], at, review['author'], review['rating'], source_url=target['url'])
    new_reviews = db.execute('SELECT COUNT(*) FROM reviews').fetchone()[0] - counts[0]
    new_versions = db.execute('SELECT COUNT(*) FROM review_versions').fetchone()[0] - counts[1]
    return {'listingId': listing_id, 'newListings': int(previous is None), 'reviewsObserved': len(parsed['reviews']),
            'newReviews': new_reviews, 'changedReviews': new_versions - new_reviews,
            'reportedReviewCount': parsed['reviewCount'], 'skippedReviewCards': parsed['skippedReviewCards'],
            'contentScope': 'reviews-visible-in-initial-public-html', 'reviewDatesAvailable': False}


def collect_public(db, db_path, config, kind, max_requests=3, delay=1.1):
    if kind not in {'blogs', 'products'} or not 1 <= max_requests <= 3 or delay < 1:
        raise ValueError('Choose blogs/products, 1–3 requests, and a delay of at least 1 second.')
    targets = config.get(kind, [])
    if not isinstance(targets, list) or not 1 <= len(targets) <= 3:
        raise ValueError('Choose 1–3 explicit targets for this public pilot.')
    for target in targets:
        if not isinstance(target, dict) or not isinstance(target.get('url'), str):
            raise ValueError('Each public target requires a URL.')
        validate_url(target['url'], kind)
        terms = target.get('titleKeywords', [])
        if kind == 'blogs' and (not isinstance(terms, list) or not 1 <= len(terms) <= 10 or
                any(not isinstance(term, str) or not 2 <= len(term.strip()) <= 100 for term in terms)):
            raise ValueError('RSS targets require 1–10 nonempty title keywords (2–100 characters).')
    results = []
    source = 'naver-blog' if kind == 'blogs' else '11st'
    raw_dir = Path(db_path).parent / 'raw/public-pages'
    raw_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    with Path(str(db_path) + '.collector.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise ValueError('Another collector is using this database.') from error
        with run(db, 'public-' + kind) as run_id:
            requests = 0
            for target in targets:
                url = target['url']
                cache_key = 'public-snapshot:' + digest(url)
                row = db.execute('SELECT value_json FROM metadata WHERE key=?', (cache_key,)).fetchone()
                cache = json.loads(row[0]) if row else None
                recent = cache and (datetime.now(timezone.utc) - datetime.fromisoformat(cache['attemptedAt'])).total_seconds() < COOLDOWN_SECONDS
                from_cache = bool(recent and cache.get('rawPath') and Path(cache['rawPath']).is_file())
                if recent and not from_cache:
                    results.append({'url': url, 'status': 'cooldown', 'reason': 'Previous attempt is within the 6-hour cooldown.'})
                    continue
                if not from_cache:
                    if requests >= max_requests:
                        with db:
                            db.execute("UPDATE collection_runs SET status='request_limited' WHERE id=?", (run_id,))
                        break
                    used = db.execute("SELECT COALESCE(SUM(requests),0) FROM collection_runs WHERE kind IN ('public-products','public-blogs') AND substr(started_at,1,10)=?", (now()[:10],)).fetchone()[0]
                    if used >= DAILY_REQUEST_LIMIT:
                        with db:
                            db.execute("UPDATE collection_runs SET status='budget_limited' WHERE id=?", (run_id,))
                        break
                    if requests:
                        time.sleep(delay)
                    cache = {'attemptedAt': now()}
                    with db:
                        db.execute('INSERT INTO metadata VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json', (cache_key, dumps(cache)))
                        db.execute('UPDATE collection_runs SET requests=requests+1 WHERE id=?', (run_id,))
                    requests += 1
                try:
                    if from_cache:
                        body = Path(cache['rawPath']).read_bytes()
                        if digest(body) != cache['sha256']:
                            raise ValueError('Cached response hash mismatch; stopping without refetching.')
                    else:
                        body, final_url = request_public(url, kind)
                        cache.update(fetchedAt=now(), finalUrl=final_url, sha256=digest(body))
                        raw_file = raw_dir / (cache['sha256'] + ('.xml' if kind == 'blogs' else '.html'))
                        raw_file.write_bytes(body)
                        raw_file.chmod(0o600)
                        cache['rawPath'] = str(raw_file)
                    with db:
                        result = persist_snapshot(db, kind, body, target, cache['fetchedAt'])
                        result.update(url=url, fetchedAt=cache['fetchedAt'], fromCache=from_cache, status='complete')
                        db.execute('INSERT INTO metadata VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json', (cache_key, dumps(cache)))
                        db.execute('INSERT INTO collection_events(source_id,kind,recorded_at,detail_json) VALUES(?,?,?,?)', (source, 'public_snapshot', now(), dumps({**result, 'runId': run_id, 'responseSha256': cache['sha256'], 'rawPath': cache['rawPath']})))
                        records = result.get('reviewsObserved', result.get('matchedCandidates', 0))
                        db.execute('UPDATE collection_runs SET records=records+? WHERE id=?', (records, run_id))
                    results.append(result)
                except (HTTPError, URLError, ValueError, TimeoutError, UnicodeError, ET.ParseError, OSError) as error:
                    db.rollback()
                    code = error.code if isinstance(error, HTTPError) else None
                    status = 'blocked' if code in {401, 403, 418, 429} else 'failed'
                    message = f'HTTP {code}' if code else type(error).__name__ + ': ' + str(error)[:180]
                    with db:
                        db.execute('UPDATE collection_runs SET status=?,error=? WHERE id=?', (status, message, run_id))
                        db.execute('INSERT INTO collection_events(source_id,kind,recorded_at,detail_json) VALUES(?,?,?,?)', (source, 'public_snapshot_failed', now(), dumps({'url': url, 'runId': run_id, 'status': status, 'error': message})))
                    if isinstance(error, HTTPError):
                        error.close()
                    results.append({'url': url, 'status': status, 'error': message})
                    break  # A blocked or invalid page never triggers retries or alternate access routes.
            if results and all(item['status'] == 'cooldown' for item in results):
                with db:
                    db.execute("UPDATE collection_runs SET status='cooldown' WHERE id=? AND status='running'", (run_id,))
        return {**dict(db.execute('SELECT * FROM collection_runs WHERE id=?', (run_id,)).fetchone()), 'snapshots': results}
