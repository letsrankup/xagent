// XAgent — health check. The front-end uses this to show "AI Online".
export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const provider = process.env.OPENAI_API_KEY
    ? "openai"
    : process.env.GEMINI_API_KEY
      ? "gemini"
      : "free";
  res.status(200).json({
    status: "ok",
    service: "xagent-api",
    provider,
    time: new Date().toISOString(),
  });
}
