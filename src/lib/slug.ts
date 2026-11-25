export function toVietnameseSlug(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-');
}

export function calculateReadingTime(rawMd: string): number {
  let codeLines = 0;
  const codeBlocks = rawMd.match(/```[\s\S]*?```/g) || [];
  codeBlocks.forEach((block) => {
    const lines = block.split('\n').filter((l) => l.trim() !== '' && !l.trim().startsWith('```'));
    codeLines += lines.length;
  });

  const prose = rawMd
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' congthuc ')
    .replace(/\$[^\n$]+?\$/g, ' congthuc ')
    .replace(/[#*`>\-|[\]()]+/g, ' ')
    .trim();

  const words = prose ? prose.split(/\s+/).length : 0;
  return Math.max(1, Math.ceil(words / 200 + codeLines / 15));
}

export function isSafeDisplayUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/')) {
    return !trimmed.startsWith('//');
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
