// Vercel Serverless Function: /api/refine
// 생성된 본문에서 'AI 티'를 제거합니다: 반복 표현 제거, 감탄사 감소, 경험담 추가, 말투 자연화.
// [사진N] 마커와 소제목 줄은 그대로 유지합니다.

const MODEL = "gemini-2.5-flash";

async function callWithRetry(url, body, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    last = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (last.ok) return last;
    if (![429, 500, 503].includes(last.status)) return last;
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
    return res.status(500).json({ error: "서버에 GEMINI_API_KEY가 설정되지 않았습니다." });
  }

  try {
    const { body: draft, tone = "warm" } = req.body || {};
    if (!draft || !String(draft).trim()) {
      return res.status(400).json({ error: "다듬을 본문이 없습니다." });
    }

    const sys =
      "당신은 사람 냄새 나는 글로 다듬는 한국어 블로그 윤문 전문가입니다. 주어진 블로그 본문을 " +
      "AI 티가 안 나게 자연스럽게 고쳐 씁니다. 규칙:\n" +
      "1. 반복되는 표현·문장 구조를 다양하게 바꾼다.\n" +
      "2. 과한 감탄사(와!, 정말!, 너무너무 등)를 줄인다.\n" +
      "3. 실제 사람이 겪은 듯한 사소한 경험담·디테일을 한두 군데 추가한다.\n" +
      "4. 말투를 입말에 가깝게 자연스럽게 다듬는다.\n" +
      "5. [사진1] [사진2] 같은 사진 마커와 소제목 줄은 위치·내용 그대로 유지한다.\n" +
      "6. 전체 길이와 핵심 정보, 검색 키워드는 유지한다.\n" +
      "결과는 다듬은 본문 전체만 JSON으로 반환한다.";

    const userPrompt = "다음 본문을 다듬어 주세요:\n\n" + String(draft);

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
          properties: { body: { type: "string" } },
          required: ["body"],
        },
      },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
    const r = await callWithRetry(url, body);

    if (!r.ok) {
      const t = await r.text();
      console.error("Gemini error:", r.status, t);
      return res.status(502).json({ error: "Gemini 응답 오류 (" + r.status + ")" });
    }

    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return res.status(502).json({ error: "응답을 해석하지 못했어요. 다시 시도해 주세요." });
    }
    return res.status(200).json({ body: parsed.body || String(draft) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "다듬기 중 오류가 발생했어요." });
  }
}
