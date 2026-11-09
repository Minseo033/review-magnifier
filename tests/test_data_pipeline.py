"""Persistence and collector contracts. All network responses here are synthetic fixtures."""
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.error import HTTPError
from unittest.mock import patch
import json
import sqlite3
import sys
import unittest
from contextlib import closing

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from data_store import ROOT, backup, connect, dumps, export_catalog, migrate_existing, stats, upsert_listing, upsert_review
from naver_sources import BlogBody, add_job, canonical_blog, collect, persist_page, plan, upsert_document, request_page, retire_unsupported_jobs, load_credentials


class DataPipelineTest(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.path = Path(self.directory.name) / 'private.sqlite3'
        self.db = connect(self.path)

    def tearDown(self):
        self.db.close()
        self.directory.cleanup()

    def listing(self):
        with self.db:
            return upsert_listing(self.db, '11st', '1', 'Test product', 'https://example.test/product/1', '2026-11-05T15:00:00+09:00')

    def seed_run(self, source='naver-shopping', query='test product', size=2):
        with self.db:
            job_id = add_job(self.db, source, query, page_size=size, max_results=4)
            run_id = self.db.execute("INSERT INTO collection_runs(kind,started_at,status) VALUES('test','2026-11-07T00:00:00+00:00','running')").lastrowid
        return job_id, run_id

    @staticmethod
    def item(product_id):
        return {'productId': product_id, 'title': '<b>test</b> product', 'link': 'https://example.test/' + str(product_id), 'lprice': '1000', 'mallName': 'Test store'}

    def test_duplicate_import_and_public_export(self):
        if not (ROOT / '.cache/catalog/reviews-verbatim.json').exists():
            self.skipTest('Local full-text source cache is unavailable on this checkout.')
        migrate_existing(self.db)
        first = stats(self.db)['counts']
        migrate_existing(self.db)
        self.assertEqual(first, stats(self.db)['counts'])
        expected = json.loads((ROOT / 'data/catalog.viewer.json').read_text())
        exported = export_catalog(self.db)
        self.assertEqual(expected, exported)
        self.assertEqual(first['reviews'], expected['reviewSampleCount'])
        self.assertNotIn('originalText', dumps(exported))
        private_body = self.db.execute('SELECT body FROM review_versions ORDER BY length(body) DESC LIMIT 1').fetchone()[0]
        self.assertNotIn(private_body, dumps(exported))
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_revision_history_and_old_reimport(self):
        listing = self.listing()
        with self.db:
            old = upsert_review(self.db, listing, 'one', 'Original\ntext', '2026-11-05T15:00:00+09:00', 'old', 5)
            duplicate = upsert_review(self.db, listing, 'one', 'Original\ntext', '2026-11-05T15:00:00+09:00', 'old', 5)
            newest = upsert_review(self.db, listing, 'one', 'Updated text', '2026-11-07T06:00:00+00:00', 'new', 3)
            upsert_review(self.db, listing, 'one', 'Original\ntext', '2026-11-05T15:00:00+09:00', 'old', 5)
        self.assertEqual(old, duplicate)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM reviews').fetchone()[0], 1)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM review_versions').fetchone()[0], 2)
        review = self.db.execute('SELECT * FROM reviews').fetchone()
        self.assertEqual((review['current_version_id'], review['author'], review['rating']), (newest, 'new', 3))

    def test_approval_links_existing_candidate_and_excludes_unreviewed_reviews(self):
        if not (ROOT / '.cache/catalog/reviews-verbatim.json').exists():
            self.skipTest('Local full-text source cache is unavailable on this checkout.')
        expected = json.loads((ROOT / 'data/catalog.viewer.json').read_text())
        product = expected['products'][-1]
        with self.db:
            candidate = upsert_listing(self.db, '11st', product['sourceUrl'].split('/')[-1], product['sourceTitle'], product['sourceUrl'], '2026-11-01T00:00:00+00:00')
        self.assertIsNone(self.db.execute('SELECT product_id FROM listings WHERE id=?', (candidate,)).fetchone()[0])
        migrate_existing(self.db)
        self.assertEqual(self.db.execute('SELECT product_id FROM listings WHERE id=?', (candidate,)).fetchone()[0], product['id'])
        with self.db:
            private = upsert_listing(self.db, '11st', 'unreviewed', 'Unreviewed candidate', 'https://example.test/private', '2026-11-07T00:00:00+00:00')
            upsert_review(self.db, private, 'private-review', 'Unreviewed full review text', '2026-11-07T00:00:00+00:00')
        self.assertEqual(export_catalog(self.db), expected)

    def test_changed_review_blocks_stale_publication(self):
        if not (ROOT / '.cache/catalog/reviews-verbatim.json').exists():
            self.skipTest('Local full-text source cache is unavailable on this checkout.')
        migrate_existing(self.db)
        review = self.db.execute('SELECT * FROM reviews LIMIT 1').fetchone()
        with self.db:
            upsert_review(self.db, review['listing_id'], review['external_id'], 'Changed source body', '2026-11-07T00:00:00+00:00', 'author', 5)
        with self.assertRaisesRegex(ValueError, 'changed'):
            export_catalog(self.db)

    def test_atomic_page_ingest_and_resume_cursor(self):
        job_id, run_id = self.seed_run()
        job = self.db.execute('SELECT * FROM collection_jobs WHERE id=?', (job_id,)).fetchone()
        page = {'items': [self.item('1'), self.item('2')], 'total': 3}
        persist_page(self.db, job, page, dumps(page).encode(), run_id, Path(self.directory.name) / 'raw')
        self.assertEqual(tuple(self.db.execute('SELECT next_start,status FROM collection_jobs').fetchone()), (3, 'pending'))
        second = {'items': [self.item('1')], 'total': 3}
        job = self.db.execute('SELECT * FROM collection_jobs').fetchone()
        persist_page(self.db, job, second, dumps(second).encode(), run_id, Path(self.directory.name) / 'raw')
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM listings').fetchone()[0], 2)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM search_hits').fetchone()[0], 2)
        self.assertEqual(self.db.execute('SELECT status FROM collection_jobs').fetchone()[0], 'complete')
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM reviews').fetchone()[0], 0)

    def test_bad_page_rolls_back_records_and_cursor(self):
        job_id, run_id = self.seed_run()
        job = self.db.execute('SELECT * FROM collection_jobs WHERE id=?', (job_id,)).fetchone()
        bad_page = {'items': [self.item('1'), {'title': 'missing source id'}], 'total': 20}
        with self.assertRaises(ValueError):
            persist_page(self.db, job, bad_page, dumps(bad_page).encode(), run_id, Path(self.directory.name) / 'raw')
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM listings').fetchone()[0], 0)
        self.assertEqual(self.db.execute('SELECT next_start FROM collection_jobs').fetchone()[0], 1)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM collection_pages').fetchone()[0], 0)

    def test_blocked_request_stops_batch_without_cursor_advance(self):
        self.seed_run(source='naver-blog')
        with patch('naver_sources.load_credentials', return_value=('fixture-id', 'fixture-secret')), patch('naver_sources.request_page', side_effect=HTTPError('https://example.test', 429, 'blocked', {}, None)) as request:
            result = collect(self.db, self.path, max_requests=5)
        self.assertEqual(request.call_count, 1)
        self.assertEqual(result['status'], 'blocked')
        self.assertEqual(tuple(self.db.execute('SELECT next_start,status FROM collection_jobs').fetchone()), (1, 'blocked'))
        self.assertNotIn('fixture-secret', dumps(result))

    def test_blog_urls_deduplicate_and_do_not_become_reviews(self):
        with self.db:
            first = upsert_document(self.db, {'link': 'https://blog.naver.com/demo/123', 'title': 'demo', 'description': 'search passage'}, '2026-11-07T00:00:00+00:00')
            second = upsert_document(self.db, {'link': 'https://m.blog.naver.com/PostView.naver?blogId=demo&logNo=123', 'title': 'demo'}, '2026-11-07T00:00:00+00:00')
        self.assertEqual(first, second)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM documents').fetchone()[0], 1)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM reviews').fetchone()[0], 0)
        self.assertIsNone(canonical_blog('https://blog.naver.com.evil.test/demo/123'))

    def test_blog_parser_excludes_chrome_and_scripts(self):
        parser = BlogBody()
        parser.feed('<div>menu</div><div class="se-main-container"><div><p>A<br>B</p></div><div><p>C &amp; D</p><script>secret</script></div></div><div>footer</div>')
        body = parser.body()
        self.assertTrue(all(text in body for text in ['A', 'B', 'C & D']))
        self.assertFalse(any(text in body for text in ['menu', 'footer', 'secret']))

    def test_plan_idempotence_and_pending_product_links(self):
        seeds = [{'query': 'some product'}]
        plan(self.db, seeds)
        plan(self.db, seeds)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM collection_jobs').fetchone()[0], 1)
        self.assertTrue(all(row[0] is None for row in self.db.execute('SELECT subject_product_id FROM collection_jobs')))

    def test_retired_shopping_is_blocked_without_a_network_request(self):
        job_id, _ = self.seed_run(source='naver-shopping')
        self.assertEqual(retire_unsupported_jobs(self.db), 1)
        job = self.db.execute('SELECT * FROM collection_jobs WHERE id=?', (job_id,)).fetchone()
        self.assertEqual(job['status'], 'blocked')
        self.assertIn('2026-07-31', job['last_error'])
        with patch('naver_sources.urlopen') as request:
            with self.assertRaisesRegex(ValueError, 'no API HUB replacement'):
                request_page(job, ('fixture-id', 'fixture-secret'))
        request.assert_not_called()
        with self.assertRaisesRegex(ValueError, 'no API HUB replacement'):
            plan(self.db, [{'query': 'some product', 'sources': ['naver-shopping']}])

    def test_hub_blog_uses_new_host_path_and_headers(self):
        job_id, _ = self.seed_run(source='naver-blog')
        job = self.db.execute('SELECT * FROM collection_jobs WHERE id=?', (job_id,)).fetchone()
        with patch('naver_sources.urlopen') as opened:
            opened.return_value.__enter__.return_value.read.return_value = b'{"items":[],"total":0}'
            data, _ = request_page(job, ('fixture-id', 'fixture-secret'))
        request = opened.call_args.args[0]
        self.assertTrue(request.full_url.startswith('https://naverapihub.apigw.ntruss.com/search/v1/blog?'))
        self.assertIn('format=json', request.full_url)
        headers = {key.lower(): value for key, value in request.header_items()}
        self.assertEqual(headers['x-ncp-apigw-api-key-id'], 'fixture-id')
        self.assertEqual(headers['x-ncp-apigw-api-key'], 'fixture-secret')
        self.assertNotIn('x-naver-client-id', headers)
        self.assertEqual(data['items'], [])

    def test_legacy_credentials_are_not_silently_used_for_hub(self):
        from unittest.mock import patch
        import os
        directory = Path(self.directory.name)
        (directory / '.env').write_text('NAVER_SEARCH_CLIENT_ID=old-id\nNAVER_SEARCH_CLIENT_SECRET=old-secret\n')
        with patch('naver_sources.ROOT', directory), patch('naver_sources.Path.home', return_value=directory), patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, 'Legacy Developers keys cannot be reused'):
                load_credentials()
            (directory / '.env').write_text('NAVER_API_HUB_CLIENT_ID=hub-id\nNAVER_API_HUB_CLIENT_SECRET=hub-secret\n')
            self.assertEqual(load_credentials(), ('hub-id', 'hub-secret'))

    def test_backup_is_consistent_and_not_overwritten(self):
        self.listing()
        destination = Path(self.directory.name) / 'backup.sqlite3'
        backup(self.db, destination)
        with closing(sqlite3.connect(destination)) as copied:
            self.assertEqual(copied.execute('PRAGMA quick_check').fetchone()[0], 'ok')
            self.assertEqual(copied.execute('SELECT COUNT(*) FROM listings').fetchone()[0], 1)
        with self.assertRaises(ValueError):
            backup(self.db, destination)


if __name__ == '__main__':
    unittest.main()
