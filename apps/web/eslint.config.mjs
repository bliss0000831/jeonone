// ESLint flat config (ESLint 9+, Next.js 16)
//
// 광장 프로젝트 ESLint 규칙. Next.js core-web-vitals 베이스 +
// 아키텍처 경계 강제 규칙.

import { FlatCompat } from '@eslint/eslintrc'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const compat = new FlatCompat({ baseDirectory: __dirname })

export default [
  ...compat.extends('next/core-web-vitals'),

  // ──────────────────────────────────────────────────────────────────────
  // 아키텍처 경계 — lib/native/ 는 환경 추상화 layer.
  // features / services / components 등 도메인/UI 코드 의존 금지.
  //
  // 의도: native 레이어가 도메인을 모르면, RN 등 다른 환경으로 이전 시
  //       그대로 옮길 수 있음 (도메인 결합 X).
  // ──────────────────────────────────────────────────────────────────────
  {
    files: ['lib/native/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/lib/features/*',
                '@/lib/services/*',
                '@/components/*',
                '@/app/*',
                '@/hooks/*',
              ],
              message:
                'lib/native/* 는 환경 추상화 레이어입니다. features / services / components / app / hooks 를 import 하면 안 됩니다. 호출자가 native 헬퍼를 사용하는 방향으로 의존성을 뒤집으세요.',
            },
            // 상대 경로 import 도 차단 (../features/, ../services/ 등)
            {
              group: ['../features/*', '../services/*', '../../components/*', '../../app/*'],
              message: '경계 위반 — lib/native/* 는 다른 도메인 의존 금지.',
            },
          ],
        },
      ],
    },
  },

  // ──────────────────────────────────────────────────────────────────────
  // lib/features/ 도 components / app / hooks 직접 import 금지.
  // 도메인 로직은 UI 무관해야 함.
  // ──────────────────────────────────────────────────────────────────────
  {
    files: ['lib/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/components/*', '@/app/*'],
              message:
                'lib/features/* 는 도메인 비즈니스 로직 레이어입니다. components / app 을 import 하면 안 됩니다 (UI → features 한 방향만).',
            },
            {
              group: ['../../components/*', '../../app/*'],
              message: '경계 위반 — lib/features/* 는 UI 의존 금지.',
            },
          ],
        },
      ],
    },
  },
]
