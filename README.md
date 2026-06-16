# 네이버 블로그 초안 생성기 🪻

음식 체험단용 블로그 초안을 빠르게 뽑는 도구. 주제만 넣으면 **제목 후보 3개 + 블로그체 본문 + 태그**를 만들어줍니다.
API 키는 Vercel 서버리스 함수(`/api/generate`)에만 보관되고 브라우저에는 노출되지 않습니다.

## 구조

```
blog-draft-generator/
├── api/
│   └── generate.js     # Gemini 호출 (키 숨김)
├── index.html          # 화면 (vanilla HTML/JS)
├── package.json
└── README.md
```

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

| Key | Value |
|-----|-------|
| `GEMINI_API_KEY` | 본인 Gemini API 키 (말씀노트에서 쓰던 그 키 재사용 가능) |

> 키는 https://aistudio.google.com/apikey 에서 발급. 등록 후 **Redeploy** 한 번 해줘야 적용됩니다.

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
