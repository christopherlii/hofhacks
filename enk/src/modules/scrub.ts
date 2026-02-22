function scrubSensitiveData(text: string): string {
  let scrubbed = text.replace(/\b(\d[ -]?){13,19}\b/g, '[CARD REDACTED]');
  scrubbed = scrubbed.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN REDACTED]');
  scrubbed = scrubbed.replace(/(password|passwd|pwd|passcode)\s*[:=]?\s*\S+/gi, '$1: [REDACTED]');
  scrubbed = scrubbed.replace(/\b(sk-[a-zA-Z0-9_-]{20,})\b/g, '[API KEY REDACTED]');
  scrubbed = scrubbed.replace(/(secret|token|key)\s*[:=]?\s*\S+/gi, '$1: [REDACTED]');
  return scrubbed;
}

function textSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0;
  const na = a.replace(/\s+/g, ' ').trim();
  const nb = b.replace(/\s+/g, ' ').trim();
  if (na === nb) return 1;

  const shorter = na.length < nb.length ? na : nb;
  const longer = na.length < nb.length ? nb : na;
  if (longer.length === 0) return 1;

  let matches = 0;
  let searchStart = 0;
  for (let i = 0; i < shorter.length; i++) {
    const idx = longer.indexOf(shorter[i], searchStart);
    if (idx !== -1) {
      matches++;
      searchStart = idx + 1;
    }
  }
  return matches / longer.length;
}

export { scrubSensitiveData, textSimilarity };
