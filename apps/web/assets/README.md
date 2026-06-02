# Capacitor Assets — 마스터 이미지

이 디렉터리는 `@capacitor/assets` 가 모든 앱 아이콘 / splash 를 자동 생성하는 데 사용한다.

## 필요한 파일

| 파일 | 사이즈 | 용도 |
|---|---|---|
| `icon-only.png` | 1024×1024 | 일반 아이콘 (정사각형, 배경 포함) |
| `icon-foreground.png` | 1024×1024 | adaptive 아이콘 foreground (투명 배경) |
| `icon-background.png` | 1024×1024 | adaptive 아이콘 background (선택, 단색) |
| `splash.png` | 2732×2732 | splash 이미지 (가운데 로고, 흰 / 어두운 양쪽 패딩 충분) |
| `splash-dark.png` | 2732×2732 | dark mode splash (선택) |

## 현재 상태

- `icon-only.png` ← `public/logo.png` 임시 카피 (1984×2130)
- `icon-foreground.png` ← 동일
- 나머지 파일 미생성

## 디자이너 작업 후 자동 생성

마스터 파일 1024×1024 / 2732×2732 로 교체 후:

```bash
pnpm cap:assets
```

이 한 번의 명령으로:
- Android: `mipmap-*/ic_launcher.png` 등 5개 사이즈 × 3종 (square / round / foreground) = 15개
- Android: `drawable*/splash.png` 11개 (portrait / landscape × 5단계)
- iOS: `Assets.xcassets/AppIcon.appiconset/*` 18개 사이즈
- iOS: `Assets.xcassets/Splash.imageset/*` 3장

자동 일괄 교체. 사이즈 / dpi 신경 안 써도 됨.

## 디자인 가이드

### 아이콘
- 1024×1024 PNG
- 모서리 라운드 X (시스템이 알아서 마스킹)
- adaptive 인 경우 foreground 는 가운데 60% 안에 안전 영역 (시스템이 자르거나 회전할 수도)
- 배경 컬러는 colors.xml 의 `splashBackground` (#FFFFFF) 와 일치 권장

### Splash
- 2732×2732 PNG (iPad Pro 11" 기준)
- 가운데 로고는 1000×1000 정도 (사방 800px 여백)
- 다양한 화면 비율에 잘리므로 가운데 안전 영역 유지

## 참고

- https://capacitorjs.com/docs/guides/splash-screens-and-icons
- https://github.com/ionic-team/capacitor-assets
