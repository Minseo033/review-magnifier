"""Private local persistence. Only explicitly approved excerpts enter public exports."""
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import os
import sqlite3

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = ROOT / '.local-data/review-magnifier.sqlite3'


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def dumps(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode()).hexdigest()


def utc(value):
    return datetime.fromisoformat(value).astimezone(timezone.utc).isoformat(timespec='seconds')


def connect(path=DEFAULT_DB):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    db = sqlite3.connect(path, timeout=15)
    path.chmod(0o600)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('PRAGMA busy_timeout=15000')
    version = db.execute('PRAGMA user_version').fetchone()[0]
    if version > 1:
        raise ValueError('The database schema is newer than this code.')
    db.executescript((ROOT / 'scripts/schema.sql').read_text())
    with db:
        db.executemany('INSERT OR IGNORE INTO sources VALUES(?,?,?)', [
            ('11st', '11번가', 'retailer'), ('naver-shopping', '네이버 쇼핑 검색', 'product_search'),
            ('naver-blog', '네이버 블로그', 'blog'),
        ])
    return db


@contextmanager
def run(db, kind):
    with db:
        run_id = db.execute('INSERT INTO collection_runs(kind,started_at,status) VALUES(?,?,?)', (kind, now(), 'running')).lastrowid
    try:
        yield run_id
    except BaseException as error:
        db.rollback()
        with db:
            db.execute('UPDATE collection_runs SET status=?,finished_at=?,error=? WHERE id=?', ('failed', now(), type(error).__name__ + ': ' + str(error)[:300], run_id))
        raise
    else:
        with db:
            db.execute("UPDATE collection_runs SET status=CASE WHEN status='running' THEN 'complete' ELSE status END,finished_at=? WHERE id=?", (now(), run_id))


def upsert_listing(db, source, external_id, title, url, observed_at, **fields):
    observed_at = utc(observed_at)
    if not external_id or not title or not url:
        raise ValueError('A listing requires a source ID, title and URL.')
    db.execute('''INSERT INTO listings(source_id,external_id,product_id,title,url,image_url,mall_name,brand,maker,category_json,first_seen_at,last_seen_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id,external_id) DO UPDATE SET
      title=excluded.title,url=excluded.url,image_url=excluded.image_url,mall_name=excluded.mall_name,
      brand=excluded.brand,maker=excluded.maker,category_json=excluded.category_json,last_seen_at=MAX(listings.last_seen_at,excluded.last_seen_at)''',
      (source, str(external_id), fields.get('product_id'), title, url, fields.get('image_url'), fields.get('mall_name'), fields.get('brand'), fields.get('maker'), dumps(fields.get('categories', [])), observed_at, observed_at))
    listing_id = db.execute('SELECT id FROM listings WHERE source_id=? AND external_id=?', (source, str(external_id))).fetchone()[0]
    observation = {key: fields.get(key) for key in ('price', 'review_count', 'rating')}
    db.execute('INSERT OR IGNORE INTO listing_observations(listing_id,observed_at,price,review_count,rating,payload_sha256) VALUES(?,?,?,?,?,?)',
               (listing_id, observed_at, observation['price'], observation['review_count'], observation['rating'], digest(dumps(observation))))
    return listing_id


def upsert_review(db, listing_id, external_id, body, observed_at, author=None, rating=None, date=None, source_url=''):
    observed_at = utc(observed_at)
    if not external_id or not body:
        raise ValueError('A review requires a source ID and a non-empty body.')
    db.execute('''INSERT INTO reviews(listing_id,external_id,author,rating,published_at,source_url,first_seen_at,last_seen_at)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(listing_id,external_id) DO UPDATE SET
      author=CASE WHEN excluded.last_seen_at>=reviews.last_seen_at THEN excluded.author ELSE reviews.author END,
      rating=CASE WHEN excluded.last_seen_at>=reviews.last_seen_at THEN excluded.rating ELSE reviews.rating END,
      published_at=CASE WHEN excluded.last_seen_at>=reviews.last_seen_at THEN excluded.published_at ELSE reviews.published_at END,
      last_seen_at=MAX(reviews.last_seen_at,excluded.last_seen_at)''', (listing_id, str(external_id), author, rating, date, source_url, observed_at, observed_at))
    review_id = db.execute('SELECT id FROM reviews WHERE listing_id=? AND external_id=?', (listing_id, str(external_id))).fetchone()[0]
    db.execute('INSERT OR IGNORE INTO review_versions(review_id,body,body_sha256,captured_at) VALUES(?,?,?,?)', (review_id, body, digest(body), observed_at))
    version_id = db.execute('SELECT id FROM review_versions WHERE review_id=? AND body_sha256=?', (review_id, digest(body))).fetchone()[0]
    # Reimporting an older snapshot must not move the current pointer backwards.
    last_seen = db.execute('SELECT last_seen_at FROM reviews WHERE id=?', (review_id,)).fetchone()[0]
    if observed_at >= last_seen:
        db.execute('UPDATE reviews SET current_version_id=? WHERE id=?', (version_id, review_id))
    return version_id


def migrate_existing(db, root=ROOT):
    catalog = json.loads((root / 'data/catalog.json').read_text())
    annotations = json.loads((root / 'data/review-annotations.json').read_text())['products']
    evidence = json.loads((root / '.cache/catalog/evidence.json').read_text())
    raw = {(review['productId'], review['sourceReviewId']): review for review in json.loads((root / '.cache/catalog/reviews-verbatim.json').read_text())}
    original_products = {product['id']: product for product in evidence}
    with run(db, 'migrate-existing') as run_id, db:
        for position, product in enumerate(catalog['products']):
            key = product['id']
            at = product['collectedAt']
            db.execute('INSERT INTO products VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,brand=excluded.brand,category=excluded.category,updated_at=excluded.updated_at',
                       (key, product['name'], product['brand'], product['category'], at, at))
            listing_id = upsert_listing(db, '11st', product['sourceUrl'].rstrip('/').split('/')[-1], product['sourceTitle'], product['sourceUrl'], at,
                product_id=key, image_url=product['imageSourceUrl'], brand=product['brand'], price=product.get('observedPrice'), review_count=product['sourceReviewCount'], rating=product['sourceRating'])
            profile = {field: value for field, value in product.items() if field not in {'imageData', 'reviews', 'reviewAnalysis'}}
            db.execute('INSERT INTO public_product_profiles VALUES(?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET profile_json=excluded.profile_json,position=excluded.position', (key, listing_id, position, json.dumps(profile, ensure_ascii=False)))
            versions = {}
            for source_review in original_products[key]['originalReviews']:
                review_id = source_review['sourceReviewId']
                source = raw[(key, review_id)]
                assert digest(source['originalText']) == source['textSha256']
                versions[review_id] = upsert_review(db, listing_id, review_id, source['originalText'], at, source['author'], source['sourceRating'], source.get('date'), product['sourceUrl'])
            for order, summary in enumerate(product['reviews']):
                db.execute('INSERT INTO public_summaries VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET review_version_id=excluded.review_version_id,payload_json=excluded.payload_json', (summary['id'], key, versions[summary['sourceReviewId']], order, json.dumps(summary, ensure_ascii=False)))
            for tone, topics in annotations[key]['topics'].items():
                for order, topic in enumerate(topics):
                    db.execute('INSERT INTO review_topics VALUES(?,?,?,?,?,?) ON CONFLICT(product_id,tone,topic_id) DO UPDATE SET label=excluded.label,description=excluded.description,position=excluded.position', (key, tone, topic['id'], topic['label'], topic['description'], order))
            db.execute('DELETE FROM review_mentions WHERE product_id=?', (key,))
            for tag in annotations[key]['reviews']:
                for tone in ('positive', 'negative'):
                    for topic in set(tag[tone]):
                        db.execute('INSERT INTO review_mentions VALUES(?,?,?,?)', (versions[tag['sourceReviewId']], key, tone, topic))
            for order, excerpt in enumerate(product['reviewAnalysis']['originalExcerpts']):
                source = raw[(key, excerpt['sourceReviewId'])]['originalText']
                assert source[excerpt['start']:excerpt['end']] == excerpt['text']
                db.execute('INSERT INTO public_excerpts VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET review_version_id=excluded.review_version_id,payload_json=excluded.payload_json', (excerpt['id'], key, versions[excerpt['sourceReviewId']], order, json.dumps(excerpt, ensure_ascii=False)))
            db.execute('INSERT INTO metadata VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json', ('approved-versions:' + key, dumps(sorted(versions.values()))))
        db.execute('INSERT INTO metadata VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json', ('catalog', json.dumps({key: value for key, value in catalog.items() if key != 'products'}, ensure_ascii=False)))
        db.execute('UPDATE collection_runs SET records=? WHERE id=?', (len(raw), run_id))
    return stats(db)


def export_catalog(db):
    row = db.execute("SELECT value_json FROM metadata WHERE key='catalog'").fetchone()
    if not row:
        raise ValueError('No approved catalog has been imported.')
    catalog = json.loads(row[0])
    catalog['products'] = []
    for profile in db.execute('SELECT * FROM public_product_profiles ORDER BY position'):
        product = json.loads(profile['profile_json'])
        key = product['id']
        reviews = db.execute('''SELECT r.*,v.body_sha256,v.id AS version_id FROM reviews r JOIN review_versions v ON v.id=r.current_version_id WHERE r.listing_id=? ORDER BY r.id''', (profile['listing_id'],)).fetchall()
        summaries = db.execute('SELECT * FROM public_summaries WHERE product_id=? ORDER BY position', (key,)).fetchall()
        excerpts = db.execute('SELECT * FROM public_excerpts WHERE product_id=? ORDER BY position', (key,)).fetchall()
        current_versions = {review['version_id'] for review in reviews}
        approved = db.execute('SELECT value_json FROM metadata WHERE key=?', ('approved-versions:' + key,)).fetchone()
        if not approved or current_versions != set(json.loads(approved[0])) or len(reviews) != product['reviewSampleCount'] or any(item['review_version_id'] not in current_versions for item in [*summaries, *excerpts]):
            raise ValueError(f'{key}: Source reviews changed; review summaries and counts before publishing.')
        product['reviews'] = [json.loads(item['payload_json']) for item in summaries]
        analysis = {'reviewSampleCount': len(reviews), 'reviewEvidence': [], 'originalExcerpts': [], 'mentionGroups': {}}
        for review in reviews:
            rating = review['rating']
            if rating is not None and float(rating).is_integer():
                rating = int(rating)
            analysis['reviewEvidence'].append({'sourceReviewId': review['external_id'], 'author': review['author'], 'sourceRating': rating, 'date': review['published_at'], 'sourceUrl': review['source_url'], 'textSha256': review['body_sha256']})
        for item in excerpts:
            excerpt = json.loads(item['payload_json'])
            body = db.execute('SELECT body FROM review_versions WHERE id=?', (item['review_version_id'],)).fetchone()[0]
            if body[excerpt['start']:excerpt['end']] != excerpt['text']:
                raise ValueError('An approved excerpt no longer matches its source.')
            analysis['originalExcerpts'].append(excerpt)
        if sum(len(item['text'].split()) for item in analysis['originalExcerpts']) > 25:
            raise ValueError('Excerpt publication budget exceeded.')
        for tone in ('positive', 'negative'):
            groups = []
            for topic in db.execute('SELECT * FROM review_topics WHERE product_id=? AND tone=? ORDER BY position', (key, tone)):
                ids = [row[0] for row in db.execute('''SELECT DISTINCT r.external_id FROM review_mentions m JOIN review_versions v ON v.id=m.review_version_id JOIN reviews r ON r.id=v.review_id AND r.current_version_id=v.id WHERE m.product_id=? AND m.tone=? AND m.topic_id=? ORDER BY r.id''', (key, tone, topic['topic_id']))]
                if ids:
                    groups.append({'id': topic['topic_id'], 'label': topic['label'], 'description': topic['description'], 'count': len(ids), 'reviewIds': ids})
            analysis['mentionGroups'][tone] = sorted(groups, key=lambda group: -group['count'])
        tagged = {row[0] for row in db.execute('SELECT review_version_id FROM review_mentions WHERE product_id=?', (key,))}
        analysis['unclassifiedReviewCount'] = len(current_versions - tagged)
        product['reviewAnalysis'] = analysis
        catalog['products'].append(product)
    catalog['reviewSampleCount'] = sum(product['reviewSampleCount'] for product in catalog['products'])
    catalog['summaryCount'] = sum(len(product['reviews']) for product in catalog['products'])
    catalog['originalExcerptCount'] = sum(len(product['reviewAnalysis']['originalExcerpts']) for product in catalog['products'])
    return catalog


def stats(db):
    tables = ['products', 'listings', 'listing_observations', 'reviews', 'review_versions', 'public_summaries', 'public_excerpts', 'review_mentions', 'documents', 'document_versions', 'collection_jobs', 'collection_pages']
    return {'counts': {table: db.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0] for table in tables},
            'jobs': {row[0]: row[1] for row in db.execute('SELECT status,COUNT(*) FROM collection_jobs GROUP BY status')},
            'sources': [dict(row) for row in db.execute('SELECT source_id,COUNT(*) AS listings FROM listings GROUP BY source_id')],
            'blogContent': [dict(row) for row in db.execute('SELECT content_status,COUNT(*) AS count FROM documents GROUP BY content_status')],
            'integrity': db.execute('PRAGMA quick_check').fetchone()[0], 'foreignKeyErrors': len(db.execute('PRAGMA foreign_key_check').fetchall())}


def backup(db, path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.exists():
        raise ValueError('Backup destination already exists; choose a new name.')
    destination = sqlite3.connect(path)
    try:
        db.backup(destination)
    finally:
        destination.close()
    path.chmod(0o600)
