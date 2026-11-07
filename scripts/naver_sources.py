"""Official Naver search ingestion. Search candidates are never purchase reviews."""
from datetime import datetime
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen
import json
import os
import re
import time

from data_store import ROOT, now, dumps, digest, run, upsert_listing


def plain(value):
    return unescape(re.sub(r'<[^>]*>', '', str(value or ''))).strip()


def canonical_blog(url):
    parsed = urlparse(url)
    if parsed.scheme not in {'http', 'https'} or parsed.hostname not in {'blog.naver.com', 'm.blog.naver.com'}:
        return None
    match = re.fullmatch(r'/([\w-]+)/(\d+)/?', parsed.path)
    if match:
        author, post_id = match.groups()
    elif parsed.path in {'/PostView.naver', '/PostView.nhn'}:
        params = parse_qs(parsed.query)
        author, post_id = params.get('blogId', [''])[0], params.get('logNo', [''])[0]
        if not re.fullmatch(r'[\w-]+', author) or not post_id.isdigit():
            return None
    else:
        return None
    return f'https://blog.naver.com/{author}/{post_id}', f'{author}/{post_id}'


def upsert_document(db, item, observed_at):
    canonical = canonical_blog(item.get('link') or item.get('url') or '')
    if not canonical:
        return None
    url, external_id = canonical
    title = plain(item.get('title')).removesuffix('새 창 열림').strip()
    if not title:
        return None
    date = item.get('postdate') or None
    if date:
        try:
            date = datetime.strptime(date, '%Y%m%d').date().isoformat()
        except ValueError:
            date = None
    author = plain(item.get('bloggername') or item.get('author') or external_id.split('/')[0])
    snippet = plain(item.get('description') or item.get('snippet')).removesuffix('새 창 열림').strip()
    db.execute('''INSERT INTO documents(source_id,external_id,url,title,author,published_at,snippet,first_seen_at,last_seen_at)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id,external_id) DO UPDATE SET
      title=excluded.title,author=excluded.author,published_at=COALESCE(excluded.published_at,documents.published_at),
      snippet=excluded.snippet,last_seen_at=excluded.last_seen_at''', ('naver-blog', external_id, url, title, author, date, snippet, observed_at, observed_at))
    return db.execute("SELECT id FROM documents WHERE source_id='naver-blog' AND external_id=?", (external_id,)).fetchone()[0]


def add_job(db, source, query, subject=None, page_size=100, max_results=1000):
    db.execute('INSERT OR IGNORE INTO collection_jobs(source_id,query,subject_product_id,page_size,max_results,created_at,updated_at) VALUES(?,?,?,?,?,?,?)', (source, query, subject, page_size, max_results, now(), now()))
    return db.execute('SELECT id FROM collection_jobs WHERE source_id=? AND query=? AND sort=?', (source, query, 'sim')).fetchone()[0]


def plan(db, seeds):
    with db:
        for item in seeds:
            query = item['query'].strip()
            if len(query) < 2 or len(query) > 100:
                raise ValueError('Seed queries must have 2–100 characters.')
            for source in item.get('sources', ['naver-shopping', 'naver-blog']):
                if source not in {'naver-shopping', 'naver-blog'}:
                    raise ValueError('Unsupported source: ' + source)
                add_job(db, source, query + (' 후기' if source == 'naver-blog' else ''), item.get('productId'))
    return dict(db.execute('SELECT status,COUNT(*) FROM collection_jobs GROUP BY status').fetchall())


def load_credentials():
    # Read only the two expected keys; never execute a dotenv file or print values.
    allowed = {'NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET', 'NAVER_SEARCH_CLIENT_ID', 'NAVER_SEARCH_CLIENT_SECRET'}
    values = {key: os.getenv(key) for key in allowed if os.getenv(key)}
    for path in (ROOT / '.env', Path.home() / '.config/k-skill/secrets.env'):
        if not path.exists():
            continue
        for line in path.read_text().splitlines():
            match = re.fullmatch(r'\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*', line)
            if match and match[1] in allowed and match[1] not in values:
                values[match[1]] = match[2].strip('"\'')
    client_id = values.get('NAVER_CLIENT_ID') or values.get('NAVER_SEARCH_CLIENT_ID')
    secret = values.get('NAVER_CLIENT_SECRET') or values.get('NAVER_SEARCH_CLIENT_SECRET')
    if not client_id or not secret or client_id == 'replace-me' or secret == 'replace-me':
        raise ValueError('Missing Naver search API credentials. Set NAVER_SEARCH_CLIENT_ID and NAVER_SEARCH_CLIENT_SECRET in the private .env file.')
    return client_id, secret


def request_page(job, credentials):
    endpoint = 'shop' if job['source_id'] == 'naver-shopping' else 'blog'
    display = min(job['page_size'], job['max_results'] - job['next_start'] + 1)
    url = 'https://openapi.naver.com/v1/search/' + endpoint + '.json?' + urlencode({'query': job['query'], 'display': display, 'start': job['next_start'], 'sort': job['sort']})
    headers = {'X-Naver-Client-Id': credentials[0], 'X-Naver-Client-Secret': credentials[1], 'Accept': 'application/json'}
    with urlopen(Request(url, headers=headers), timeout=25) as response:
        body = response.read(5_000_001)
        if len(body) > 5_000_000:
            raise ValueError('Search response exceeded the size limit.')
    data = json.loads(body)
    if not isinstance(data, dict) or not isinstance(data.get('items'), list):
        raise ValueError('Unexpected Naver API response; stopping without advancing the cursor.')
    return data, body


def persist_page(db, job, data, body, run_id, raw_dir):
    at = now()
    sha = digest(body)
    raw_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    raw_file = raw_dir / (sha + '.json')
    raw_file.write_bytes(body)
    raw_file.chmod(0o600)
    count = 0
    with db:
        for index, item in enumerate(data['items']):
            if job['source_id'] == 'naver-shopping':
                external_id = str(item.get('productId') or '')
                if not external_id or not item.get('title') or not item.get('link'):
                    raise ValueError('Shopping API item is missing its source ID, title or link.')
                price = str(item.get('lprice', ''))
                entity_id = upsert_listing(db, 'naver-shopping', external_id, plain(item['title']), item['link'], at,
                    image_url=item.get('image'), mall_name=plain(item.get('mallName')), brand=plain(item.get('brand')), maker=plain(item.get('maker')),
                    price=int(price) if price.isdigit() and int(price) > 0 else None,
                    categories=[plain(item.get('category' + str(i))) for i in range(1, 5) if item.get('category' + str(i))])
                kind = 'listing'
            else:
                entity_id = upsert_document(db, item, at)
                kind = 'document'
                if entity_id is None:
                    continue  # External-blog results are not silently fetched as Naver blog posts.
            db.execute('INSERT OR IGNORE INTO search_hits(job_id,entity_kind,entity_id,first_rank) VALUES(?,?,?,?)', (job['id'], kind, entity_id, job['next_start'] + index))
            count += 1
        reported_total = data.get('total')
        if not isinstance(reported_total, int) or reported_total < 0:
            raise ValueError('The API did not return a valid total.')
        requested_size = min(job['page_size'], job['max_results'] - job['next_start'] + 1)
        next_start = job['next_start'] + requested_size
        finished = len(data['items']) < requested_size or next_start > min(job['max_results'], reported_total)
        db.execute('INSERT INTO collection_pages VALUES(?,?,?,?,?,?,?,?)', (job['id'], job['next_start'], run_id, at, len(data['items']), reported_total, sha, str(raw_file)))
        db.execute('UPDATE collection_jobs SET next_start=?,status=?,last_error=NULL,updated_at=? WHERE id=?', (next_start, 'complete' if finished else 'pending', at, job['id']))
        db.execute('UPDATE collection_runs SET records=records+? WHERE id=?', (count, run_id))
    return count


def collect(db, db_path, max_requests=20, delay=1.1, retry_failed=False):
    credentials = load_credentials()
    if max_requests < 1 or max_requests > 1000 or delay < 1:
        raise ValueError('Use 1–1000 requests per invocation and a delay of at least 1 second.')
    # A process lock avoids two collectors spending quota on the same cursor.
    import fcntl
    lock_path = Path(str(db_path) + '.collector.lock')
    with lock_path.open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise ValueError('Another collector is using this database.') from error
        if retry_failed:
            with db:
                db.execute("UPDATE collection_jobs SET status='pending',last_error=NULL WHERE status IN ('failed','blocked')")
        with run(db, 'naver-official-search') as run_id:
            for attempt in range(max_requests):
                job = db.execute("SELECT * FROM collection_jobs WHERE status='pending' ORDER BY next_start,id LIMIT 1").fetchone()
                if not job:
                    break
                # Shared quota is not inferable; the local budget is deliberately below Naver's total quota.
                used = db.execute("SELECT COALESCE(SUM(requests),0) FROM collection_runs WHERE kind='naver-official-search' AND substr(started_at,1,10)=?", (now()[:10],)).fetchone()[0]
                if used >= 1000:
                    db.execute("UPDATE collection_runs SET status='budget_limited' WHERE id=?", (run_id,))
                    db.commit()
                    break
                with db:
                    db.execute('UPDATE collection_runs SET requests=requests+1 WHERE id=?', (run_id,))
                try:
                    data, body = request_page(job, credentials)
                    persist_page(db, job, data, body, run_id, Path(db_path).parent / 'raw/naver-search')
                except (HTTPError, URLError, ValueError, TimeoutError) as error:
                    code = error.code if isinstance(error, HTTPError) else None
                    blocked = code in {401, 403, 418, 429}
                    message = f'HTTP {code}' if code else type(error).__name__ + ': ' + str(error)[:150]
                    with db:
                        db.execute('UPDATE collection_jobs SET status=?,last_error=?,updated_at=? WHERE id=?', ('blocked' if blocked else 'failed', message, now(), job['id']))
                        db.execute('UPDATE collection_runs SET status=?,error=? WHERE id=?', ('blocked' if blocked else 'failed', message, run_id))
                    if isinstance(error, HTTPError):
                        error.close()
                    break  # Stop the batch; never rotate proxies or immediately retry a blocked request.
                if attempt + 1 < max_requests:
                    time.sleep(delay)
        return dict(db.execute('SELECT * FROM collection_runs WHERE id=?', (run_id,)).fetchone())


def import_pilot(db, path):
    payload = json.loads(Path(path).read_text())
    with run(db, 'naver-blog-public-pilot') as run_id, db:
        job_id = add_job(db, 'naver-blog', payload['query'], subject='airpods', page_size=10, max_results=10)
        count = 0
        for index, item in enumerate(payload['results']):
            entity_id = upsert_document(db, item, now())
            if entity_id is not None:
                db.execute('INSERT OR IGNORE INTO search_hits(job_id,entity_kind,entity_id,first_rank) VALUES(?,?,?,?)', (job_id, 'document', entity_id, index + 1))
                count += 1
        db.execute("UPDATE collection_jobs SET status='complete',next_start=11,updated_at=? WHERE id=?", (now(), job_id))
        db.execute('UPDATE collection_runs SET records=?,requests=1 WHERE id=?', (count, run_id))
        db.execute('INSERT INTO collection_events(source_id,kind,recorded_at,detail_json) VALUES(?,?,?,?)', ('naver-blog', 'pilot_import', now(), dumps({'query': payload['query'], 'records': count, 'route': 'single-public-search', 'classification': 'unreviewed-candidates'})))
    return count


class BlogBody(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.depth, self.active_depth, self.skip = [], 0, None, 0
        self.found = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'div':
            self.depth += 1
        if self.active_depth is None and not self.found and ('se-main-container' in attrs.get('class', '').split() or attrs.get('id') == 'postViewArea'):
            self.active_depth, self.found = self.depth, True
        if self.active_depth is not None:
            if tag in {'script', 'style', 'noscript'}:
                self.skip += 1
            if tag in {'br', 'p', 'div', 'li'} and not self.skip:
                self.parts.append('\n')

    def handle_endtag(self, tag):
        if self.active_depth is not None:
            if tag in {'script', 'style', 'noscript'} and self.skip:
                self.skip -= 1
            if tag in {'p', 'div', 'li'} and not self.skip:
                self.parts.append('\n')
            if tag == 'div' and self.depth == self.active_depth:
                self.active_depth = None
        if tag == 'div':
            self.depth = max(0, self.depth - 1)

    def handle_data(self, text):
        if self.active_depth is not None and not self.skip:
            self.parts.append(text)

    def body(self):
        return re.sub(r'\n[ \t]*\n(?:[ \t]*\n)+', '\n\n', ''.join(self.parts)).strip()


def fetch_blogs(db, db_path, limit=3, document_ids=()):
    if limit < 1 or limit > 5:
        raise ValueError('Public-blog verification is limited to 1–5 posts per invocation.')
    if not document_ids:
        raise ValueError('Choose the document IDs to verify before fetching blog bodies.')
    placeholders = ','.join('?' for _ in document_ids)
    rows = db.execute(f"SELECT * FROM documents WHERE source_id='naver-blog' AND content_status IN ('metadata_only','fetch_failed') AND id IN ({placeholders}) ORDER BY id LIMIT ?", (*document_ids, limit)).fetchall()
    with run(db, 'naver-blog-public-body-pilot') as run_id:
        for index, document in enumerate(rows):
            mobile = document['url'].replace('https://blog.naver.com/', 'https://m.blog.naver.com/')
            try:
                with db:
                    db.execute('UPDATE collection_runs SET requests=requests+1 WHERE id=?', (run_id,))
                with urlopen(Request(mobile, headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html'}), timeout=25) as response:
                    content = response.read(3_000_001)
                    if len(content) > 3_000_000 or urlparse(response.url).hostname != 'm.blog.naver.com':
                        raise ValueError('Unexpected blog response size or destination.')
                parser = BlogBody()
                parser.feed(content.decode('utf-8'))
                body = parser.body()
                if not parser.found or len(body) < 100:
                    raise ValueError('A complete supported blog content area was not found.')
                disclosures = []
                for phrase in ['제품을 제공받', '제품을 지원받', '소정의 원고료', '수수료를 지급', '협찬', '유료광고']:
                    for match in re.finditer(phrase, body):
                        disclosures.append({'phrase': phrase, 'start': match.start(), 'end': match.end()})
                at = now()
                raw_dir = Path(db_path).parent / 'raw/naver-blog'
                raw_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
                raw_file = raw_dir / (digest(content) + '.html')
                raw_file.write_bytes(content)
                raw_file.chmod(0o600)
                with db:
                    db.execute('INSERT OR IGNORE INTO document_versions(document_id,body,body_sha256,captured_at,disclosure_status,disclosure_evidence_json) VALUES(?,?,?,?,?,?)', (document['id'], body, digest(body), at, 'disclosure_phrase_found' if disclosures else 'unknown', dumps(disclosures)))
                    version_id = db.execute('SELECT id FROM document_versions WHERE document_id=? AND body_sha256=?', (document['id'], digest(body))).fetchone()[0]
                    db.execute("UPDATE documents SET content_status='body_collected',current_version_id=?,last_seen_at=? WHERE id=?", (version_id, at, document['id']))
                    db.execute('UPDATE collection_runs SET records=records+1 WHERE id=?', (run_id,))
            except (HTTPError, URLError, ValueError, TimeoutError, UnicodeError) as error:
                code = error.code if isinstance(error, HTTPError) else None
                message = f'HTTP {code}' if code else type(error).__name__ + ': ' + str(error)[:180]
                with db:
                    db.execute("UPDATE documents SET content_status='fetch_failed' WHERE id=?", (document['id'],))
                    db.execute("UPDATE collection_runs SET status='failed',error=? WHERE id=?", (message, run_id))
                if isinstance(error, HTTPError):
                    error.close()
                break
            if index + 1 < len(rows):
                time.sleep(1.1)
    return dict(db.execute('SELECT * FROM collection_runs WHERE id=?', (run_id,)).fetchone())
