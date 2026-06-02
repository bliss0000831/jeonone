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

// 4. Workspace 패키지의 .ts/.tsx 소스를 Metro 가 직접 컴파일 (사전 빌드 step 불필요)
//    Next.js 의 transpilePackages 와 동등 — Metro 는 sourceExts 로 처리.
//    Expo SDK 54 기본값에 .ts/.tsx 이미 포함되어 있어 별도 설정 불필요.

module.exports = config
