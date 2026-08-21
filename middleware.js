// Vercel Edge Middleware — hard-block known AI training / retrieval
// crawlers by User-Agent. Complements the voluntary robots.txt directives
// and the Cloudflare edge block (Security → Bots → Block AI Scrapers
// and Crawlers). A crawler that ignores robots.txt and bypasses CF still
// hits this before Vercel routes the request.
//
// Runs on every request. Return 403 for matching UAs, pass through
// otherwise. Deliberately narrow: only blocks UAs that self-identify as
// AI crawlers. Regular browsers, search engines that aren't AI-training
// (Googlebot, Bingbot base crawlers, DuckDuckBot), monitoring tools, and
// our own cron / webhook callers are unaffected.

export const config = {
  // Only run on document requests. Skip static assets, API routes, and
  // Next-style _next paths (harmless — we don't use them, but safer).
  matcher: [
    '/((?!api/|_next/|assets/|videos/|corporate/|tere-.+\\.png|tere-.+\\.svg|manifest\\.json|sw\\.js|robots\\.txt|favicon\\..+).*)',
  ],
}

// Case-insensitive substring match. UA strings are messy; we look for
// distinctive tokens rather than exact matches. Order doesn't matter.
const BLOCKED_UA_TOKENS = [
  // OpenAI
  'gptbot', 'chatgpt-user', 'oai-searchbot',
  // Anthropic
  'claudebot', 'claude-web', 'anthropic-ai',
  // Google's AI-training-only crawlers (Googlebot itself allowed)
  'google-extended', 'googleother',
  // Perplexity
  'perplexitybot', 'perplexity-user',
  // Meta AI training
  'meta-externalagent', 'meta-externalfetcher', 'facebookbot',
  // Common Crawl (heavy AI training data source)
  'ccbot',
  // Other AI / retrieval crawlers
  'cohere-ai', 'bytespider', 'diffbot', 'youbot', 'imagesiftbot',
  'timpibot', 'omgilibot', 'omgili', 'petalbot',
  'amazonbot', 'applebot-extended',
  // SEO scrapers that resell content
  'semrushbot', 'ahrefsbot',
]

export default function middleware(req) {
  const ua = (req.headers.get('user-agent') || '').toLowerCase()
  if (!ua) return                       // No UA? Let it through — could be legit programmatic (Playwright hardening test etc.)
  for (const token of BLOCKED_UA_TOKENS) {
    if (ua.includes(token)) {
      return new Response('AI crawlers are not permitted on this site. See /robots.txt.', {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noai, noimageai' },
      })
    }
  }
  // Pass-through for everything else. Return undefined so Vercel proceeds
  // to normal routing.
}
