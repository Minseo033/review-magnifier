"""No-key collector contracts; these tests use synthetic responses, never the network."""
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request
import json
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from data_store import connect, dumps, upsert_listing, upsert_review
from naver_sources import upsert_document
from public_sources import collect_public, parse_rss, PublicRedirects, validate_url, DAILY_REQUEST_LIMIT


RSS_URL = 'https://rss.blog.naver.com/demo.xml'
PRODUCT_URL = 'https://www.11st.co.kr/products/123'
FEED = '''<rss version="2.0"><channel><title>Demo</title>
<item><title>에어팟 프로 사용 후기</title><link>https://blog.naver.com/demo/456?fromRss=true</link>
<pubDate>Wed, 21 Oct 2026 14:57:13 +0900</pubDate><description><![CDATA[<p>RSS description only</p>]]></description></item>
<item><title>무관한 맛집 글</title><link>https://blog.naver.com/demo/789</link></item>
<item><title>에어팟 판매</title><link>https://blog.naver.com.evil.test/demo/123</link></item>
</channel></rss>'''.encode()
PRODUCT = '''<html><head><meta property="og:title" content="[11번가] Test product">
<meta property="og:image" content="https://cdn.011st.com/product.jpg">
<meta name="description" content="할인모음가: 12,345원, 평점: 4.8, 리뷰수: 200"></head>
<a name="review-atf" data-contmapno="789"><span class="name">test***</span>
<span>판매자 평점 별5개 중</span>5<span class="cont">First &amp; original<br>review.</span></a></html>'''.encode()


class PublicSourcesTest(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.path = Path(self.directory.name) / 'private.sqlite3'
        self.db = connect(self.path)

    def tearDown(self):
        self.db.close()
        self.directory.cleanup()

    def config(self, kind='blogs'):
        return {kind: [{'url': RSS_URL, 'titleKeywords': ['에어팟']}] if kind == 'blogs' else [{'url': PRODUCT_URL}]}

    def test_rss_is_filtered_canonical_metadata_not_review_body(self):
        with patch('public_sources.request_public', return_value=(FEED, RSS_URL)):
            result = collect_public(self.db, self.path, self.config(), 'blogs')
        snapshot = result['snapshots'][0]
        self.assertEqual((snapshot['feedItems'], snapshot['matchedCandidates'], snapshot['skippedItems']), (3, 1, 2))
        self.assertEqual(snapshot['newBlogCandidates'], 1)
        document = self.db.execute('SELECT * FROM documents').fetchone()
        self.assertEqual(document['url'], 'https://blog.naver.com/demo/456')
        self.assertEqual(document['published_at'], '2026-10-21')
        self.assertEqual(document['snippet'], 'RSS description only')
        self.assertEqual(document['content_status'], 'metadata_only')
        self.assertIsNone(document['current_version_id'])
        for table in ('reviews', 'document_versions', 'public_summaries', 'review_mentions'):
            self.assertEqual(self.db.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0], 0)

    def test_cached_repeat_deduplicates_without_new_network_or_date(self):
        with patch('public_sources.request_public', return_value=(FEED, RSS_URL)) as request:
            first = collect_public(self.db, self.path, self.config(), 'blogs')
            second = collect_public(self.db, self.path, self.config(), 'blogs')
        self.assertEqual(request.call_count, 1)
        self.assertEqual((first['requests'], second['requests']), (1, 0))
        self.assertEqual(second['snapshots'][0]['newBlogCandidates'], 0)
        self.assertTrue(second['snapshots'][0]['fromCache'])
        self.assertEqual(first['snapshots'][0]['fetchedAt'], second['snapshots'][0]['fetchedAt'])
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM documents').fetchone()[0], 1)

    def test_public_review_import_preserves_original_and_revision_history(self):
        with patch('public_sources.request_public', return_value=(PRODUCT, PRODUCT_URL)) as request:
            first = collect_public(self.db, self.path, self.config('products'), 'products')
            second = collect_public(self.db, self.path, self.config('products'), 'products')
        self.assertEqual(request.call_count, 1)
        self.assertEqual(first['snapshots'][0]['newReviews'], 1)
        self.assertEqual(second['snapshots'][0]['newReviews'], 0)
        self.assertEqual(self.db.execute('SELECT body FROM review_versions').fetchone()[0], 'First & original\nreview.')
        self.assertEqual(self.db.execute('SELECT published_at FROM reviews').fetchone()[0], None)
        self.assertEqual(self.db.execute('SELECT product_id FROM listings').fetchone()[0], None)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM listing_observations').fetchone()[0], 1)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM review_versions').fetchone()[0], 1)
        self.assertEqual(first['snapshots'][0]['reportedReviewCount'], 200)
        self.assertEqual(first['snapshots'][0]['reviewsObserved'], 1)

    def test_older_cached_metadata_does_not_replace_newer_metadata_or_body(self):
        with self.db:
            listing = upsert_listing(self.db, '11st', '123', 'New title', PRODUCT_URL, '2026-11-07T08:00:00+00:00')
            version = upsert_review(self.db, listing, '789', 'New body', '2026-11-07T08:00:00+00:00', 'new author', 4)
            doc_id = upsert_document(self.db, {'link': 'https://blog.naver.com/demo/456', 'title': 'New title', 'description': 'new passage'}, '2026-11-07T08:00:00+00:00')
            upsert_listing(self.db, '11st', '123', 'Old title', PRODUCT_URL, '2026-11-07T07:00:00+00:00')
            upsert_review(self.db, listing, '789', 'Old body', '2026-11-07T07:00:00+00:00', 'old author', 1)
            upsert_document(self.db, {'link': 'https://blog.naver.com/demo/456', 'title': 'Old title', 'description': 'old passage'}, '2026-11-07T07:00:00+00:00')
        self.assertEqual(self.db.execute('SELECT title FROM listings').fetchone()[0], 'New title')
        self.assertEqual(tuple(self.db.execute('SELECT title,snippet FROM documents WHERE id=?', (doc_id,)).fetchone()), ('New title', 'new passage'))
        self.assertEqual(tuple(self.db.execute('SELECT current_version_id,author FROM reviews').fetchone()), (version, 'new author'))

    def test_blocked_request_stops_and_cooldown_prevents_retries(self):
        config = {'blogs': self.config()['blogs'] + [{'url': 'https://rss.blog.naver.com/other.xml', 'titleKeywords': ['에어팟']}]}
        with patch('public_sources.request_public', side_effect=HTTPError(RSS_URL, 429, 'blocked', {}, None)) as request:
            result = collect_public(self.db, self.path, config, 'blogs')
            retry = collect_public(self.db, self.path, self.config(), 'blogs')
        self.assertEqual(request.call_count, 1)
        self.assertEqual(result['status'], 'blocked')
        self.assertEqual(retry['status'], 'cooldown')
        self.assertEqual(retry['requests'], 0)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM documents').fetchone()[0], 0)

    def test_invalid_xml_does_not_persist_candidates_and_has_failure_event(self):
        with patch('public_sources.request_public', return_value=(b'<rss><channel><item>', RSS_URL)):
            result = collect_public(self.db, self.path, self.config(), 'blogs')
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM documents').fetchone()[0], 0)
        event = self.db.execute("SELECT detail_json FROM collection_events WHERE kind='public_snapshot_failed'").fetchone()
        self.assertEqual(json.loads(event[0])['runId'], result['id'])

    def test_rss_entities_and_unapproved_destinations_are_rejected(self):
        with self.assertRaises(ValueError):
            parse_rss(b'<!DOCTYPE rss [<!ENTITY x "data">]><rss><channel/></rss>', ['에어팟'])
        for bad in ('http://rss.blog.naver.com/demo.xml', 'https://rss.blog.naver.com.evil.test/demo.xml', 'https://rss.blog.naver.com/demo.xml?x=1'):
            with self.assertRaises(ValueError):
                validate_url(bad, 'blogs')
        with self.assertRaises(ValueError):
            PublicRedirects('blogs').redirect_request(Request(RSS_URL), None, 302, 'redirect', {}, 'https://evil.test/feed.xml')
        with self.assertRaisesRegex(ValueError, 'product ID'):
            PublicRedirects('products').redirect_request(Request(PRODUCT_URL), None, 302, 'redirect', {}, 'https://www.11st.co.kr/products/999')

    def test_request_and_daily_limits_are_enforced_before_network(self):
        config = {'blogs': self.config()['blogs'] + [{'url': 'https://rss.blog.naver.com/other.xml', 'titleKeywords': ['에어팟']}]}
        with patch('public_sources.request_public', return_value=(FEED, RSS_URL)) as request:
            limited = collect_public(self.db, self.path, config, 'blogs', max_requests=1)
        self.assertEqual(request.call_count, 1)
        self.assertEqual(limited['status'], 'request_limited')
        with self.db:
            self.db.execute('UPDATE collection_runs SET requests=?', (DAILY_REQUEST_LIMIT,))
        with patch('public_sources.request_public') as request:
            daily = collect_public(self.db, self.path, {'products': [{'url': PRODUCT_URL}]}, 'products')
        request.assert_not_called()
        self.assertEqual(daily['status'], 'budget_limited')


if __name__ == '__main__':
    unittest.main()
