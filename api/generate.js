// Vercel Serverless Function: /api/generate
// 네이버 블로그 상위노출용 초안 + 메타데이터를 한 번에 생성합니다.
// 출력: 제목5개 / 메인·관련 키워드 / 소제목 / 본문([사진N] 포함) / 사진가이드 / 추천대상 / 태그20개

export const maxDuration = 60; // Vercel 함수 최대 실행시간(초)

const MODEL = "gemini-2.5-flash";

// 응답 지연 시 25초 후 중단 + 503/429/500이면 재시도
async function callWithRetry(url, body, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      last = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (i < tries - 1) { await new Promise((r) => setTimeout(r, 800 * (i + 1))); continue; }
      throw e;
    }
    clearTimeout(timer);
    if (last.ok) return last;
    if (![429, 500, 503].includes(last.status)) return last;
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  return last;
}

const TYPE_LABEL = {
  info: "정보글",
  review: "체험단 리뷰",
  daily: "일상",
  place: "맛집·장소",
};
const TONE_LABEL = {
  friendly: "친근한 반말체",
  warm: "친근한 존댓말",
  polite: "정중한 존댓말",
  neutral: "담백한 정보형",
};
const CHAR_TARGET = { short: 800, medium: 1500, long: 2500 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST 요청만 허용됩니다." });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "서버에 GEMINI_API_KEY가 설정되지 않았습니다." });
  }

  try {
    const {
      topic,
      type = "review",
      tone = "warm",
      length = "medium",
      productInfo = "",
      reviewNotes = "",
      keywords = "",
    } = req.body || {};

    if (!topic || !String(topic).trim()) {
      return res.status(400).json({ error: "주제 또는 키워드를 입력해 주세요." });
    }

    const typeLabel = TYPE_LABEL[type] || "정보글";
    const toneLabel = TONE_LABEL[tone] || "친근한 존댓말";
    const charTarget = CHAR_TARGET[length] || 1500;
    const isPlace = type === "review" || type === "place";

    const sys =
      "당신은 네이버 블로그 상위노출(SEO) 경험이 풍부한 한국어 음식 블로거입니다. " +
      "검색에 잘 걸리면서도 사람이 직접 쓴 것처럼 진솔한 글을 씁니다. 다음을 반드시 지키세요:\n" +
      "1. AI 티 나는 상투 표현('오늘은 ~에 대해 알아보겠습니다', '도움이 되셨길 바랍니다', 과한 감탄사 남발)을 쓰지 않는다.\n" +
      "2. 맛·식감·향·분위기 등 구체적 감각 묘사와 실제 경험 같은 디테일을 넣는다.\n" +
      "3. 메인 키워드(mainKeyword)를 본문에 4~6회 자연스럽게 넣고, 첫 문단에 반드시 1회 포함한다.\n" +
      "4. 본문은 소제목 3~4개로 나눈다. 소제목은 HTML 태그나 마크다운 없이 한 줄 텍스트로 쓰고, subheadings 배열에도 똑같이 담는다.\n" +
      "5. 한 문단은 2~3문장으로 짧게 끊는다(모바일 가독성).\n" +
      "6. 본문 안에 사진 들어갈 자리를 [사진1] [사진2] ... 형태로 순서대로 4~6곳 표시한다. photoGuide 배열에는 각 번호에 어떤 사진을 찍어 넣을지 caption을 같은 순서로 담는다(예: 외관 전경, 매장 내부, 대표 메뉴).\n" +
      "7. 글 끝부분에 독자의 체류시간을 늘리는 마무리(재방문 의사나 추천 문장)를 넣는다.\n" +
      "8. relatedKeywords에는 본문에 실제로 녹여 쓴 관련 검색어 5~8개를 담는다.\n" +
      "9. tags에는 18~20개의 해시태그용 키워드를 담는다.\n" +
      (isPlace
        ? "10. recommendedFor에 '이런 분들에게 추천' 항목 3~4개를 담는다(예: 데이트 코스 찾는 분).\n"
        : "10. 정보글이면 recommendedFor는 빈 배열로 둔다.\n");

    const userPrompt =
      `주제/키워드: ${topic}\n` +
      `글 유형: ${typeLabel}\n` +
      `말투: ${toneLabel}\n` +
      `목표 분량: 약 ${charTarget}자\n` +
      (keywords && String(keywords).trim() ? `포함할 검색 키워드: ${keywords}\n` : "") +
      (productInfo && String(productInfo).trim()
        ? `가게/메뉴/제품 정보: ${productInfo}\n`
        : "") +
      (reviewNotes && String(reviewNotes).trim()
        ? `실제 방문 후 느낀점(이걸 글에 진짜 경험처럼 자연스럽게 녹여라): ${reviewNotes}\n`
        : "") +
      (type === "review"
        ? "체험단 리뷰이므로 좋았던 점과 솔직하게 아쉬운 점을 함께 담고 과장 광고 표현은 피하세요.\n"
        : "") +
      "제목 후보 5개는 서로 다른 각도(궁금증 유발 / 정보 직관 / 후기 강조 / 지역+메뉴 / 감성)로, " +
      "그중 최소 2개는 20~40자 길이로 만들어 주세요.";

    const body = {
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.95,
        maxOutputTokens: 6144,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            titles: { type: "array", items: { type: "string" } },
            mainKeyword: { type: "string" },
            relatedKeywords: { type: "array", items: { type: "string" } },
            subheadings: { type: "array", items: { type: "string" } },
            body: { type: "string" },
            photoGuide: {
              type: "array",
              items: {
                type: "object",
                properties: { caption: { type: "string" } },
                required: ["caption"],
              },
            },
            recommendedFor: { type: "array", items: { type: "string" } },
            tags: { type: "array", items: { type: "string" } },
          },
          required: ["titles", "mainKeyword", "body", "tags"],
        },
      },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
    const geminiRes = await callWithRetry(url, body);

    if (!geminiRes.ok) {
      const detail = await geminiRes.text();
      console.error("Gemini error:", geminiRes.status, detail);
      return res.status(502).json({ error: "Gemini 응답 오류 (" + geminiRes.status + ")" });
    }

    const data = await geminiRes.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return res.status(502).json({ error: "응답을 해석하지 못했어요. 다시 시도해 주세요." });
    }

    return res.status(200).json({
      titles: parsed.titles || [],
      mainKeyword: parsed.mainKeyword || String(topic).trim(),
      relatedKeywords: parsed.relatedKeywords || [],
      subheadings: parsed.subheadings || [],
      body: parsed.body || "",
      photoGuide: parsed.photoGuide || [],
      recommendedFor: parsed.recommendedFor || [],
      tags: parsed.tags || [],
      type,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "초안 생성 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요." });
  }
}
