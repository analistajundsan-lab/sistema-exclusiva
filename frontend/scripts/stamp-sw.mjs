// Estampa um identificador unico de build no CACHE_NAME do Service Worker.
//
// Roda como passo "postbuild" (npm executa automaticamente apos "build"), ou
// seja: DEPOIS do `vite build`, reescrevendo apenas o dist/sw.js. O arquivo
// fonte (public/sw.js) permanece com a versao base (ex.: v13) e nao muda a
// cada build local — sem diff sujo no repo.
//
// Por que isso resolve o incidente: o SW so expurga o Cache Storage antigo
// quando o byte do sw.js muda (o navegador compara byte a byte). Estampando um
// id unico por deploy, todo deploy forca install+activate novos e derruba o
// app-shell/assets velhos — sem depender de bump manual do CACHE_NAME.
//
// Identificador: usa o SHA do commit quando disponivel (Vercel expoe
// VERCEL_GIT_COMMIT_SHA no build) — deterministico por deploy — e cai para um
// timestamp em builds locais/CI sem git metadata.
//
// Node puro (fs/path), sem bash-isms: funciona igual no Windows e no Linux do
// build da Vercel (`cd frontend && npm run build`).

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const frontendDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const swPath = path.join(frontendDir, 'dist', 'sw.js')

if (!existsSync(swPath)) {
  console.error(`[stamp-sw] dist/sw.js nao encontrado em ${swPath} — rode apos o vite build.`)
  process.exit(1)
}

const sha = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '').slice(0, 8)
const stamp = sha || new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)

const original = readFileSync(swPath, 'utf8')
const pattern = /const CACHE_NAME = "([^"]+)";/
const match = original.match(pattern)

if (!match) {
  console.error('[stamp-sw] linha `const CACHE_NAME = "...";` nao encontrada no dist/sw.js.')
  process.exit(1)
}

const stamped = `${match[1]}-${stamp}`
writeFileSync(swPath, original.replace(pattern, `const CACHE_NAME = "${stamped}";`), 'utf8')
console.log(`[stamp-sw] CACHE_NAME estampado: ${stamped}`)
