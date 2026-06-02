/**
 * Expo config — app.json 베이스 + env 주입.
 *
 * 변경 사유: @mj-studio/react-native-naver-map config plugin 의 client_id 가
 *   빌드 타임에 env 로 들어가야 하므로 app.json 대신 동적 config 사용.
 */
const base = require("./app.json")

module.exports = ({ config }) => {
  const expo = { ...config, ...base.expo }

  // Naver Maps plugin 의 client_id 를 환경변수에서 주입 (EAS env 에 등록되어 있음)
  const naverClientId = process.env.EXPO_PUBLIC_NAVER_MAP_CLIENT_ID || ""

  // 기존 app.json plugins 에서 naver-map plugin 의 client_id placeholder 를 실제 값으로 교체
  expo.plugins = (expo.plugins || []).map((p) => {
    if (Array.isArray(p) && p[0] === "@mj-studio/react-native-naver-map") {
      const opts = { ...(p[1] || {}) }
      if (typeof opts.client_id === "string" && opts.client_id.startsWith("$")) {
        opts.client_id = naverClientId
      }
      return [p[0], opts]
    }
    return p
  })

  return expo
}
