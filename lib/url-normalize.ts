export function extractFirstUrl(input: string): string {
  const normalized = input.replace(/&amp;/gi, "&").trim();
  const match = normalized.match(/https?:\/\/[^\s<>"']+/i);

  if (!match) {
    return "";
  }

  return normalizeMusicUrl(stripTrailingPunctuation(match[0]));
}

function normalizeMusicUrl(url: string) {
  return url.replace(/\/#\/song\?/i, "/song?");
}

function stripTrailingPunctuation(url: string) {
  let result = url.trim();

  while (/[\s.,!?;:"')\]}>\u3001\u3002\uff0c\uff01\uff1f\uff1b\uff1a\uff09\u3011\u300b]+$/.test(result)) {
    result = result.slice(0, -1).trim();
  }

  return result;
}
