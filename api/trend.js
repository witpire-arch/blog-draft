// Vercel Serverless Function: /api/trend
// 네이버 데이터랩 통합검색어 트렌드 API를 호출해 최근 6개월 상대 트렌드(0~100)를 돌려줍니다.
// 절대 검색량이 아니라 "기간 내 최고점=100" 기준의 상대값입니다.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST 요청만 허용됩니다." });
  }
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) {
    return res
      .status(500)
      .json({ error: "서버에 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET이 설정되지 않았습니다." });
  }

  try {
    const { keywords } = req.body || {};
    const list = (keywords || [])
      .map((k) => String(k).trim())
      .filter(Boolean)
      .slice(0, 5);
    if (!list.length) {
      return res.status(400).json({ error: "키워드를 1개 이상 입력해 주세요." });
    }

    const now = new Date();
    const endDate = now.toISOString().slice(0, 10);
    const startObj = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1)
    );
    const startDate = startObj.toISOString().slice(0, 10);

    const body = {
      startDate,
      endDate,
      timeUnit: "month",
      keywordGroups: list.map((k) => ({ groupName: k, keywords: [k] })),
    };

    const r = await fetch("https://openapi.naver.com/v1/datalab/search", {
      method: "POST",
      headers: {
        "X-Naver-Client-Id": id,
        "X-Naver-Client-Secret": secret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const t = await r.text();
      console.error("DataLab error:", r.status, t);
      const msg =
        r.status === 401
          ? "네이버 인증 실패 — Client ID/Secret을 확인하세요."
          : "데이터랩 응답 오류 (" + r.status + ")";
      return res.status(502).json({ error: msg });
    }

    const data = await r.json();
    return res.status(200).json({
      startDate,
      endDate,
      results: data.results || [],
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "트렌드 조회 중 오류가 발생했어요." });
  }
}
