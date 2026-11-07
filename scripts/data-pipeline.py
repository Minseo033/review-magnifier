"""Local data operations; credentials and full source text are never published."""
import argparse
import json
from pathlib import Path
import sqlite3
import sys

from data_store import DEFAULT_DB, ROOT, backup, connect, dumps, export_catalog, migrate_existing, now, stats
from naver_sources import collect, fetch_blogs, import_pilot, load_credentials, plan, retire_unsupported_jobs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', type=Path, default=DEFAULT_DB)
    commands = parser.add_subparsers(dest='command', required=True)
    for name in ('init', 'migrate', 'stats', 'doctor'):
        commands.add_parser(name)
    export = commands.add_parser('export')
    export.add_argument('--output', type=Path, required=True)
    save = commands.add_parser('backup')
    save.add_argument('--output', type=Path)
    seeds = commands.add_parser('plan-naver')
    seeds.add_argument('--seeds', type=Path, default=ROOT / 'config/naver-seeds.json')
    worker = commands.add_parser('collect-naver')
    worker.add_argument('--max-requests', type=int, default=20)
    worker.add_argument('--delay', type=float, default=1.1)
    worker.add_argument('--retry-failed', action='store_true')
    pilot = commands.add_parser('import-blog-pilot')
    pilot.add_argument('--input', type=Path, default=ROOT / '.cache/naver/pilot-blog.json')
    bodies = commands.add_parser('fetch-blog-pilot')
    bodies.add_argument('--document-id', type=int, nargs='+', required=True)
    bodies.add_argument('--limit', type=int, default=3)
    args = parser.parse_args()
    db = connect(args.db)
    try:
        retire_unsupported_jobs(db)
        if args.command == 'migrate':
            result = migrate_existing(db)
        elif args.command in {'init', 'stats'}:
            result = stats(db)
        elif args.command == 'doctor':
            result = stats(db)
            try:
                load_credentials()
                result['naverApiHubCredentials'] = 'configured'
            except ValueError:
                result['naverApiHubCredentials'] = 'missing'
            result['naverShoppingSearch'] = 'retired-2026-07-31-no-hub-replacement'
            result['publicSiteAccess'] = 'Static Pages snapshot; no direct database access'
        elif args.command == 'export':
            if args.output.suffix != '.json':
                raise ValueError('The public export must be a JSON file.')
            args.output.parent.mkdir(parents=True, exist_ok=True)
            result = export_catalog(db)
            args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
            result = {'output': str(args.output), 'products': len(result['products']), 'reviewsInSample': result['reviewSampleCount'], 'fullSourceTextExported': False}
        elif args.command == 'backup':
            destination = args.output or args.db.parent / 'backups' / (now().replace(':', '-').replace('+', '_') + '.sqlite3')
            backup(db, destination)
            result = {'backup': str(destination)}
        elif args.command == 'plan-naver':
            result = {'jobs': plan(db, json.loads(args.seeds.read_text())['queries'])}
        elif args.command == 'collect-naver':
            result = collect(db, args.db, args.max_requests, args.delay, args.retry_failed)
        elif args.command == 'import-blog-pilot':
            result = {'blogCandidatesImported': import_pilot(db, args.input)}
        elif args.command == 'fetch-blog-pilot':
            result = fetch_blogs(db, args.db, args.limit, args.document_id)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (ValueError, FileNotFoundError, sqlite3.Error, AssertionError) as error:
        db.rollback()
        # Keep collection failures inspectable without putting credentials in logs.
        with db:
            db.execute('INSERT INTO collection_events(kind,recorded_at,detail_json) VALUES(?,?,?)', ('command_failed', now(), dumps({'command': args.command, 'errorType': type(error).__name__, 'message': str(error)[:250]})))
        print(json.dumps({'status': 'failed', 'reason': str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1
    finally:
        db.close()


if __name__ == '__main__':
    raise SystemExit(main())
