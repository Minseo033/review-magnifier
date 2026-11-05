"""Build review-level counts and bounded verbatim excerpts from the saved public snapshot."""
from pathlib import Path
from html.parser import HTMLParser
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / '.cache/catalog'
OUTPUT = ROOT / 'data/review-analysis.json'
ANNOTATIONS = ROOT / 'data/review-annotations.json'


class ReviewText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in {'br', 'p', 'div', 'li'}:
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in {'p', 'div', 'li'}:
            self.parts.append('\n')

    def handle_data(self, text):
        self.parts.append(text)


def snapshot_texts(product):
    """Keep spelling, punctuation and internal whitespace; decode only HTML markup."""
    html = (CACHE / f"{product['id']}.html").read_text()
    result = {}
    for match in re.finditer(r'<a[^>]+name="review-atf"(?P<attrs>[^>]*)>(?P<body>.*?)</a>', html, re.S):
        review_id = re.search(r'data-contmapno="(\d+)"', match['attrs'])
        content = re.search(r'<span class="cont">(.*?)</span>', match['body'], re.S)
        if not review_id or not content:
            continue
        parser = ReviewText()
        parser.feed(content[1])
        result[review_id[1]] = ''.join(parser.parts).strip()
    return result


def validate(result):
    for product in result['products'].values():
        ids = {review['sourceReviewId'] for review in product['reviewEvidence']}
        assert len(ids) == product['reviewSampleCount']
        assert sum(len(review['text'].split()) for review in product['originalExcerpts']) <= 25
        for groups in product['mentionGroups'].values():
            for group in groups:
                assert group['count'] == len(set(group['reviewIds']))
                assert set(group['reviewIds']) <= ids
                assert 0 < group['count'] <= len(ids)


def main():
    annotations = json.loads(ANNOTATIONS.read_text())
    if not (CACHE / 'evidence.json').exists():
        result = json.loads(OUTPUT.read_text())
        for key, product in result['products'].items():
            spec = annotations['products'][key]
            ids = {review['sourceReviewId'] for review in product['reviewEvidence']}
            tags = {review['sourceReviewId']: review for review in spec['reviews']}
            assert len(tags) == len(spec['reviews']) and set(tags) == ids
            excerpts = {review['sourceReviewId']: review['text'] for review in product['originalExcerpts']}
            assert {review['sourceReviewId'] for review in spec['excerpts']} == set(excerpts)
            assert all(' '.join(review['text'].split()) == ' '.join(excerpts[review['sourceReviewId']].split()) for review in spec['excerpts']), 'Changing an excerpt requires its local source snapshot.'
            for tone in ('positive', 'negative'):
                topics = {topic['id'] for topic in spec['topics'][tone]}
                assert all(set(tag[tone]) <= topics for tag in tags.values())
                groups = [{**topic, 'reviewIds': [review_id for review_id, tag in tags.items() if topic['id'] in set(tag[tone])]} for topic in spec['topics'][tone]]
                product['mentionGroups'][tone] = sorted([{**topic, 'count': len(topic['reviewIds'])} for topic in groups if topic['reviewIds']], key=lambda topic: -topic['count'])
            product['unclassifiedReviewCount'] = sum(not tag['positive'] and not tag['negative'] for tag in tags.values())
        validate(result)
        OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        print('Using the saved review-analysis snapshot; no full review cache is required.')
        return

    evidence = json.loads((CACHE / 'evidence.json').read_text())
    result = {'version': 1, 'method': annotations['method'], 'unit': 'unique-review', 'sourceName': '11번가', 'products': {}}
    private_records = []
    for product in evidence:
        spec = annotations['products'][product['id']]
        raw_texts = snapshot_texts(product)
        originals = {review['sourceReviewId']: review for review in product['originalReviews']}
        tags = {review['sourceReviewId']: review for review in spec['reviews']}
        assert len(originals) == len(product['originalReviews']) == len(spec['reviews'])
        assert set(tags) == set(originals), f"Review annotations do not match the snapshot: {product['id']}"
        assert set(originals) <= set(raw_texts)
        metadata = {}
        for review_id, original in originals.items():
            metadata[review_id] = {
                'sourceReviewId': review_id,
                'author': original['author'],
                'sourceRating': original['sourceRating'],
                'date': None,
                'sourceUrl': product['sourceUrl'],
                'textSha256': hashlib.sha256(raw_texts[review_id].encode()).hexdigest(),
            }
            private_records.append({'productId': product['id'], **metadata[review_id], 'originalText': raw_texts[review_id]})

        groups = {}
        for tone in ('positive', 'negative'):
            known_topics = {topic['id'] for topic in spec['topics'][tone]}
            assert all(set(tag[tone]) <= known_topics for tag in tags.values())
            groups[tone] = []
            for topic in spec['topics'][tone]:
                review_ids = [review_id for review_id, tag in tags.items() if topic['id'] in set(tag[tone])]
                if review_ids:
                    groups[tone].append({**topic, 'count': len(review_ids), 'reviewIds': review_ids})
            groups[tone].sort(key=lambda topic: -topic['count'])

        excerpts = []
        for chosen in spec['excerpts']:
            review_id = chosen['sourceReviewId']
            raw = raw_texts[review_id]
            # A whitespace-tolerant selector locates the span; the output is the unchanged span.
            pattern = r'\s+'.join(re.escape(word) for word in chosen['text'].split())
            match = re.search(pattern, raw)
            assert match, f"Excerpt is not an exact source span: {product['id']}:{review_id}"
            text = raw[match.start():match.end()]
            excerpts.append({
                **metadata[review_id], 'id': f"{product['id']}-raw-{review_id}", 'text': text,
                'start': match.start(), 'end': match.end(), 'isExcerpt': match.start() > 0 or match.end() < len(raw),
            })

        result['products'][product['id']] = {
            'reviewSampleCount': len(originals), 'reviewEvidence': list(metadata.values()),
            'originalExcerpts': excerpts, 'mentionGroups': groups,
            'unclassifiedReviewCount': sum(not tag['positive'] and not tag['negative'] for tag in tags.values()),
        }

    validate(result)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    (CACHE / 'reviews-verbatim.json').write_text(json.dumps(private_records, ensure_ascii=False, indent=2) + '\n')
    report = {
        'method': result['method'], 'unit': result['unit'], 'products': len(result['products']),
        'reviews': len(private_records), 'excerpts': sum(len(p['originalExcerpts']) for p in result['products'].values()),
        'exactSourceSpans': True, 'uniqueReviewCountsVerified': True,
        'excerptWordsByProduct': {key: sum(len(r['text'].split()) for r in value['originalExcerpts']) for key, value in result['products'].items()},
    }
    (ROOT / 'reports/catalog').mkdir(parents=True, exist_ok=True)
    (ROOT / 'reports/catalog/review-analysis-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(f"Verified {report['reviews']} source reviews, {report['excerpts']} unchanged excerpts and review-level mention counts.")


if __name__ == '__main__':
    main()
