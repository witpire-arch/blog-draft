# 네이버 블로그 초안 생성기 🪻

음식 체험단용 블로그 초안을 빠르게 뽑는 도구. 주제만 넣으면 **제목 후보 3개 + 블로그체 본문 + 태그**를 만들어줍니다.
API 키는 Vercel 서버리스 함수(`/api/generate`)에만 보관되고 브라우저에는 노출되지 않습니다.

## 구조

```
blog-draft-generator/
├── api/
│   ├── generate.js     # 초안 생성 (Gemini)
│   ├── keywords.js     # 키워드 추천 (Gemini)
│   └── trend.js        # 검색어 트렌드 (네이버 데이터랩)
├── index.html          # 화면 (vanilla HTML/JS, 2탭)
├── package.json
└── README.md
```

**탭 구성**
- **초안 생성**: 주제 → 제목·본문·태그
- **키워드 찾기**: 주제로 키워드 후보 추천 → 골라서 데이터랩 트렌드 그래프 확인

## 배포 방법

### 1) 레포에 올리기
새 레포(예: `witpire-arch/blog-draft`)를 만들거나 기존 레포 하위 폴더로 넣고 푸시:

```bash
git add .
git commit -m "feat: 블로그 초안 생성기"
git push
```

### 2) Vercel 연결
- Vercel 대시보드 → **Add New → Project** → 이 레포 선택 → Deploy
- 프레임워크 프리셋은 **Other**(정적). 빌드 설정 건드릴 것 없음 (zero-config)

### 3) 환경변수 등록 (중요)
Vercel 프로젝트 → **Settings → Environment Variables**:

| Key | Value | 용도 |
|-----|-------|------|
| `GEMINI_API_KEY` | Gemini API 키 (말씀노트 키 재사용 가능) | 초안 생성 + 키워드 추천 |
| `NAVER_CLIENT_ID` | 네이버 개발자센터 Client ID | 데이터랩 트렌드 |
| `NAVER_CLIENT_SECRET` | 네이버 개발자센터 Client Secret | 데이터랩 트렌드 |

> 모두 등록 후 **Redeploy** 한 번 해줘야 적용됩니다.

**Gemini 키:** https://aistudio.google.com/apikey 에서 발급 (`AIza...`)

**네이버 데이터랩 키 발급:**
1. https://developers.naver.com → 로그인 → **Application → 애플리케이션 등록**
2. 앱 이름 입력, **사용 API**에서 **데이터랩(검색어 트렌드)** 선택
3. 환경 추가에서 **WEB 설정** → 서비스 URL에 배포 주소(`https://...vercel.app`) 입력
4. 등록하면 **Client ID / Client Secret**이 나옴 → Vercel 환경변수에 등록

> 데이터랩 트렌드는 **절대 검색량이 아니라** 기간 내 최고점=100 기준의 **상대 트렌드**입니다.
> 절대 월 검색량이 필요하면 블랙키위·키워드마스터를 병행하세요.

### 4) 끝
배포된 주소(`https://blog-draft-xxx.vercel.app`)로 들어가서 주제 넣고 생성하면 됩니다.

## 모델 바꾸기

`api/generate.js` 상단:

```js
const MODEL = "gemini-2.5-flash";   // 기본 (안정 + 저렴)
// "gemini-3.5-flash"   → 품질 ↑, 비용 ↑
// "gemini-2.5-flash-lite" → 비용 ↓
```

## 운영 팁 (체험단용)

1. 이 도구로 주제별 초안 3~5개를 미리 뽑아둔다.
2. 각 글에 **본인이 찍은 사진**과 실제 경험 한두 줄을 더해 5분만 다듬는다. (저품질 회피 핵심)
3. 네이버 블로그 글쓰기 → **발행 → 예약**으로 날짜·시간 지정 (예: 매주 월·목 오전 9시).
4. 매크로 없이 자동 게시 → 꾸준한 활성 블로그 → 체험단 선정 확률 ↑

> ⚠️ 생성된 글을 손 안 대고 그대로 대량 발행하면 네이버가 저품질로 분류할 수 있어요. 항상 본인 색을 한 번 입혀서 올리세요.
