"""Locally recheck approved excerpts against private source HTML; never publishes it."""
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    evidence_path = ROOT / '.cache/catalog/evidence.json'
    if not evidence_path.exists():
        raise SystemExit('Private source snapshots are unavailable. Ordinary builds use the reviewed public manifest; this source verification requires the original local cache.')
    spec = importlib.util.spec_from_file_location('review_text', ROOT / 'scripts/prepare-review-insights.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    evidence = {p['id']: p for p in json.loads(evidence_path.read_text())}
    catalog = json.loads((ROOT / 'data/catalog.viewer.json').read_text())
    checked = 0
    for product in catalog['products']:
        key = product['id']
        original = evidence.get(key)
        if original is None or original['sourceUrl'] != product['sourceUrl']:
            raise ValueError('Source listing mismatch: ' + key)
        texts = module.snapshot_texts(original)
        analysis = product['reviewAnalysis']
        collected = {r['sourceReviewId'] for r in original['originalReviews']}
        if collected != {r['sourceReviewId'] for r in analysis['reviewEvidence']}:
            raise ValueError('Collected review IDs differ: ' + key)
        for review in analysis['reviewEvidence']:
            text = texts[review['sourceReviewId']]
            if hashlib.sha256(text.encode()).hexdigest() != review['textSha256']:
                raise ValueError('Source text changed: ' + key)
            checked += 1
        for excerpt in analysis['originalExcerpts']:
            text = texts[excerpt['sourceReviewId']]
            if not excerpt['text'] or excerpt['text'] not in text:
                raise ValueError('Excerpt is not verbatim: ' + key)
            if 'start' in excerpt and text[excerpt['start']:excerpt['end']] != excerpt['text']:
                raise ValueError('Excerpt offsets differ: ' + key)
    print(json.dumps({'status': 'pass', 'products': len(catalog['products']), 'sourceTexts': checked, 'scope': 'Local cached source URLs, review IDs, text hashes and verbatim excerpts; not purchase or advertising authentication.'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
