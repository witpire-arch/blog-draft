// Vercel Serverless Function: /api/keywords
// 주제를 받아 네이버 블로그 SEO에 쓸 키워드 후보를 추천합니다 (Gemini).

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST 요청만 허용됩니다." });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "서버에 GEMINI_API_KEY가 설정되지 않았습니다." });
  }

  try {
    const { topic, region = "" } = req.body || {};
    if (!topic || !String(topic).trim()) {
      return res.status(400).json({ error: "주제를 입력해 주세요." });
    }

    const sys =
      "당신은 네이버 블로그 SEO 키워드 전문가입니다. 음식 블로그용으로 검색 유입이 잘 나올 만한 " +
      "키워드 후보 10개를 추천합니다. 메인 키워드, 롱테일(2~3 단어 조합), 지역 결합, 계절/트렌드 결합을 " +
      "골고루 섞으세요. 각 키워드는 실제 사람들이 네이버에 칠 법한 자연스러운 검색어여야 하고, " +
      "type은 '메인' '롱테일' '지역' '트렌드' 중 하나로 분류하세요.";

    const userPrompt =
      `주제: ${topic}\n` +
      (region && String(region).trim()
        ? `지역: ${region} (지역 결합 키워드를 2~3개 포함)\n`
        : "") +
      "reason은 한 줄로 짧게.";

    const body = {
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 1536,
        thinkingConfig: { thinkingBudget: 0 }, // 2.5 Flash 사고 끄기 (출력 잘림 방지)
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            keywords: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  keyword: { type: "string" },
                  type: { type: "string" },
                  reason: { type: "string" },
                },
                required: ["keyword", "type"],
              },
            },
          },
          required: ["keywords"],
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
    return res.status(200).json({ keywords: parsed.keywords || [] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "키워드 추천 중 오류가 발생했어요." });
  }
}
