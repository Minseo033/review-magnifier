# 후기돋보기

제품 사진과 공개 구매 후기 요약을 바로 살펴보는 팀 프로젝트 프로토타입입니다.

**사이트:** [minseo033.github.io/review-magnifier](https://minseo033.github.io/review-magnifier/)

## 현재 기능

- 7개 제품군의 실제 제품 12개와 후기 요약 36개
- 제품·브랜드·후기 내용 검색, 카테고리와 정렬
- 사진 목록 / 후기 중심 목록 전환
- 브라우저에 저장하는 찜, 최대 3개 제품 비교
- 제품별 장점·확인할 점과 원문 출처
- 데스크톱·모바일 화면

2026년 11월 5일 11번가의 공개 상품 페이지에서 후기 표본 113개를 확인했습니다. 판매처 전체 리뷰 수, 확인한 표본 수, 화면 요약 수는 구분해 표시합니다. 실시간 갱신·여러 플랫폼 통합·실구매 인증·광고 판별은 아직 연결하지 않았습니다.

## 실행 및 수정

Node.js 22 이상과 Python 3을 사용합니다.

```sh
npm ci
npm run build
npm run check
npm run preview
```

로컬 미리보기는 `http://127.0.0.1:4187/`입니다. `index.html`, `catalog.css`, `catalog.js`에서 화면과 동작을 수정합니다. `data/catalog.json`에는 공개 제품 정보와 재구성 요약·원문 출처가 있습니다. 수집 원문 캐시가 없어도 저장된 스냅샷으로 빌드할 수 있습니다.

## GitHub Pages 배포

`main` 브랜치의 `/docs` 폴더를 GitHub Pages의 공개 대상으로 사용합니다.

```sh
npm run build
npm run check
git add index.html catalog.css catalog.js catalog.bundle.js data assets/catalog docs
git commit -m "Update review catalog"
git push
```

`npm run build`는 `docs/`에 배포할 HTML·CSS·JavaScript와 `.nojekyll`, `robots.txt`를 준비합니다. `main`에 푸시하면 GitHub Pages가 자동으로 다시 배포합니다. Pages에는 이 폴더만 게시하며, 사이트는 별도 로그인 없이 열 수 있습니다. 검색엔진 노출을 줄이기 위한 `noindex`를 넣었지만 비공개 접근제어는 아닙니다.

찜은 각 브라우저에 저장됩니다. 팀원끼리 찜 목록이 공유되지는 않습니다. 이전 3D 시안, 원문 전체 캐시, 로컬 보고서와 설치 패키지는 저장소에 포함하지 않습니다.

사진·후기 원문의 권리는 각 권리자에게 있습니다. 제품별 출처와 처리 내용은 [ASSET_CREDITS.md](ASSET_CREDITS.md)를 참고하세요.
