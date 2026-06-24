// Vercel Serverless Function: /api/optimize
// SEO 점검에서 부족한 항목을 본문에 자연스럽게 보완합니다.
// 메인키워드 횟수 보강, 첫 문단에 메인키워드 삽입 등. [사진N]·소제목·길이는 유지.

export const maxDuration = 60; // Vercel 함수 최대 실행시간(초)

const MODEL = "gemini-2.5-flash";

// 응답 지연 시 25초 후 중단 + 503/500이면 재시도(429 제외)
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
    if (![500, 503].includes(last.status)) return last;
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
    const { body: draft, mainKeyword = "", relatedKeywords = [], issues = [] } = req.body || {};
    if (!draft || !String(draft).trim()) {
      return res.status(400).json({ error: "보완할 본문이 없습니다." });
    }

    const sys =
      "당신은 네이버 블로그 SEO 윤문 전문가입니다. 주어진 본문을 자연스러움을 유지한 채 검색 최적화 관점에서 보완합니다. 규칙:\n" +
      "1. 메인키워드를 본문 전체에 자연스럽게 3~6회 포함한다. 어색하면 조사·문장 흐름을 바꿔 녹이고, 절대 부자연스럽게 나열(키워드 스터핑)하지 않는다.\n" +
      "2. 첫 문단(첫 2~3문장) 안에 메인키워드를 1회 자연스럽게 넣는다.\n" +
      "3. [사진1] [사진2] 같은 사진 마커와 소제목 줄은 위치·내용 그대로 유지한다.\n" +
      "4. 관련 키워드, 전체 길이, 글의 톤과 정보는 그대로 유지한다.\n" +
      "5. 사람이 직접 쓴 것처럼 자연스럽게. AI 티 나는 표현을 넣지 않는다.\n" +
      "결과는 보완한 본문 전체만 JSON으로 반환한다.";

    const userPrompt =
      (mainKeyword ? `메인키워드: ${mainKeyword}\n` : "") +
      (relatedKeywords.length ? `관련 키워드(유지): ${relatedKeywords.join(", ")}\n` : "") +
      (issues.length ? `특히 다음을 보완하세요:\n- ${issues.join("\n- ")}\n` : "") +
      "\n[본문]\n" + String(draft);

    const body = {
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.9,
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
      const msg =
        r.status === 429
          ? "지금 사용량이 많아요. 1분 뒤 다시 시도해 주세요. (무료 사용 한도 초과)"
          : "Gemini 응답 오류 (" + r.status + ")";
      return res.status(r.status === 429 ? 429 : 502).json({ error: msg });
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
    return res.status(500).json({ error: "보완 중 오류가 발생했어요." });
  }
}
