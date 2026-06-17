// Vercel Serverless Function: /api/generate
// 브라우저에서 호출하면 서버에서 Gemini API를 호출해 블로그 초안을 만들어 돌려줍니다.
// GEMINI_API_KEY 는 Vercel 환경변수로만 보관되고 브라우저에는 절대 노출되지 않습니다.

const MODEL = "gemini-2.5-flash"; // 안정 + 저렴. 품질을 더 원하면 "gemini-3.5-flash"

const TYPE_LABEL = {
  info: "정보글",
  review: "체험단 리뷰",
  daily: "일상",
  place: "맛집·장소",
};
const TONE_LABEL = {
  friendly: "친근한 반말체",
  polite: "정중한 존댓말",
  neutral: "담백한 정보형",
};
const CHAR_TARGET = { short: 800, medium: 1500, long: 2500 };

// 503/429/500(일시적 과부하)이면 잠깐 기다렸다 재시도
async function callWithRetry(url, body, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    last = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (last.ok) return last;
    if (![429, 500, 503].includes(last.status)) return last; // 재시도 불가 오류
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  return last;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST 요청만 허용됩니다." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: "서버에 GEMINI_API_KEY 환경변수가 설정되지 않았습니다." });
  }

  try {
    const {
      topic,
      type = "review",
      tone = "friendly",
      length = "medium",
      productInfo = "",
      keywords = "",
    } = req.body || {};

    if (!topic || !String(topic).trim()) {
      return res.status(400).json({ error: "주제 또는 키워드를 입력해 주세요." });
    }

    const typeLabel = TYPE_LABEL[type] || "정보글";
    const toneLabel = TONE_LABEL[tone] || "친근한 반말체";
    const charTarget = CHAR_TARGET[length] || 1500;

    const sys =
      "당신은 네이버 블로그 상위 노출 경험이 많은 한국어 음식 블로거입니다. " +
      "사람이 직접 쓴 것처럼 자연스럽고 진솔하게 씁니다. 규칙: " +
      "(1) AI 티 나는 상투 표현(예: '오늘은 ~에 대해 알아보겠습니다', '도움이 되셨길 바랍니다')을 쓰지 않는다. " +
      "(2) 맛·식감·향·분위기 등 구체적인 감각 묘사와 실제 경험처럼 느껴지는 디테일을 넣는다. " +
      "(3) 본문을 2~4개의 소제목으로 나눈다. 소제목은 절대 HTML 태그(<h3>, <b> 등)나 마크다운(#, **)을 쓰지 말고, 그냥 한 줄 텍스트로 쓴 뒤 앞뒤에 빈 줄을 둔다. " +
      "(4) 한 문단은 2~3문장으로 짧게 끊어 모바일 가독성을 높인다. " +
      "(5) 검색 키워드를 본문에 자연스럽게 녹인다(키워드 나열 금지). " +
      "(6) 사용자가 직접 사진을 넣을 자리를 본문 중간에 [사진] 형태로 2~3곳 표시한다.";

    const userPrompt =
      `주제/키워드: ${topic}\n` +
      `글 유형: ${typeLabel}\n` +
      `말투: ${toneLabel}\n` +
      `목표 분량: 약 ${charTarget}자\n` +
      (keywords && String(keywords).trim()
        ? `포함할 검색 키워드: ${keywords}\n`
        : "") +
      (type === "review" && String(productInfo).trim()
        ? `가게/메뉴/제품 정보: ${productInfo}\n` +
          "체험단 리뷰이므로 실제 방문·시식 경험처럼 좋았던 점과 솔직하게 아쉬운 점을 함께 담고, 과장 광고 표현은 피하세요.\n"
        : "") +
      "제목 후보 3개는 서로 다른 각도(궁금증 유발형 / 정보 직관형 / 후기 강조형)로 만들어 주세요. " +
      "태그는 8~12개 추천해 주세요.";

    const body = {
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.95,
        maxOutputTokens: 3072,
        thinkingConfig: { thinkingBudget: 0 }, // 2.5 Flash 사고 끄기 (출력 잘림 방지)
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            titles: { type: "array", items: { type: "string" } },
            body: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
          },
          required: ["titles", "body", "tags"],
        },
      },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
    const geminiRes = await callWithRetry(url, body);

    if (!geminiRes.ok) {
      const detail = await geminiRes.text();
      console.error("Gemini error:", geminiRes.status, detail);
      return res
        .status(502)
        .json({ error: "Gemini 응답 오류 (" + geminiRes.status + ")" });
    }

    const data = await geminiRes.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return res
        .status(502)
        .json({ error: "응답을 해석하지 못했어요. 다시 시도해 주세요." });
    }

    return res.status(200).json({
      titles: parsed.titles || [],
      body: parsed.body || "",
      tags: parsed.tags || [],
    });
  } catch (e) {
    console.error(e);
    return res
      .status(500)
      .json({ error: "초안 생성 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요." });
  }
}
