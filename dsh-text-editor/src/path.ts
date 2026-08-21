/**
 * 路径小工具：basename 与「扩展名 → Monaco language id」映射。
 */
export function basename(path: string): string {
  const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return at === -1 ? path : path.slice(at + 1)
}

/** 常见扩展名 → Monaco language id。 */
const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json', yml: 'yaml', yaml: 'yaml', md: 'markdown', markdown: 'markdown',
  css: 'css', scss: 'scss', less: 'less', html: 'html', htm: 'html',
  py: 'python', sh: 'shell', bash: 'shell', zsh: 'shell',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', java: 'java',
  go: 'go', rs: 'rust', rb: 'ruby', php: 'php', sql: 'sql',
  xml: 'xml', svg: 'xml', toml: 'ini', ini: 'ini', conf: 'ini',
  diff: 'diff', patch: 'diff', txt: 'plaintext', log: 'plaintext',
}

/** 根据路径推断 Monaco language id（无扩展名回落 plaintext）。 */
export function languageFor(path: string): string {
  const base = (path.split('/').pop() ?? path).split('\\').pop() ?? ''
  const lower = base.toLowerCase()
  if (lower === 'dockerfile' || lower === 'makefile') return lower
  const dot = lower.lastIndexOf('.')
  if (dot === -1) return 'plaintext'
  return EXT_LANG[lower.slice(dot + 1)] ?? 'plaintext'
}
