// Learn more https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require("expo/metro-config")
const path = require("path")

// Find the project and workspace directories
const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, "../..")

const config = getDefaultConfig(projectRoot)

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot]

// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
]

// 3. Force Metro to resolve (sub)dependencies only from the `nodeModulesPaths`
//    (pnpm symlink 격리 — 호이스팅 안 된 deps 도 정확히 해석)
config.resolver.disableHierarchicalLookup = true

// 4. 빌드 산출물 / 캐시 디렉터리는 절대 감시·해석하지 않음.
//    모노레포 전체(workspaceRoot)를 watch 하므로, apps/web 의 .next 빌드 폴더가
//    생성·삭제될 때 watchman 미설치(Windows) 환경의 FallbackWatcher 가
//    사라진 폴더를 watch 하려다 ENOENT(-4058) 로 크래시함 → 빌드 폴더 제외.
//
//    주의: node_modules 안의 정상 `dist` 폴더까지 막으면 해석이 깨지므로
//    범용 dist/ 는 제외하지 않고, 빌드 산출물 디렉터리만 좁게 지정한다.
const blockPatterns = [
  // Next.js 웹 빌드 산출물 (이번 크래시 원인)
  /[\\/]apps[\\/]web[\\/]\.next[\\/]/,
  /[\\/]apps[\\/]web[\\/]out[\\/]/,
  // 일반 .next / .expo 캐시
  /[\\/]\.next[\\/]/,
  /[\\/]\.expo[\\/]/,
  // 네이티브 빌드 산출물
  /[\\/]android[\\/]build[\\/]/,
  /[\\/]ios[\\/]build[\\/]/,
]

// getDefaultConfig 가 이미 설정한 blockList(있다면)와 병합 — 단일 RegExp 로 결합.
const existing = config.resolver.blockList
const sources = []
if (existing instanceof RegExp) sources.push(existing.source)
else if (Array.isArray(existing)) {
  for (const r of existing) if (r instanceof RegExp) sources.push(r.source)
}
for (const r of blockPatterns) sources.push(r.source)
config.resolver.blockList = new RegExp(sources.join("|"))

// 5. Workspace 패키지의 .ts/.tsx 소스를 Metro 가 직접 컴파일 (사전 빌드 step 불필요)
//    Next.js 의 transpilePackages 와 동등 — Metro 는 sourceExts 로 처리.
//    Expo SDK 54 기본값에 .ts/.tsx 이미 포함되어 있어 별도 설정 불필요.

module.exports = config
