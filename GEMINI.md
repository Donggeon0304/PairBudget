# PairBudget AI 에이전트 지침서

> ⚠️ **이 문서의 상단 규칙은 반드시 모든 작업 전에 확인할 것.**

---

# 🔴 필수 규칙 (항상 준수)

## 1. 빌드 규칙
- **사용자가 빌드를 지시하기 전에 임의로 빌드(`assembleRelease`)하지 않는다.**
- 코드 수정 후 빌드 시 반드시 `versionCode`와 `versionName`을 올린다 (`build.gradle` + `UpdateService.ts` 동시에).
- 빌드 전 필수 검토: ① 미사용 변수/state 제거 ② 참조 일관성 grep 확인 ③ 정상/엣지 케이스 시뮬레이션 ④ import 누락 확인
- 검토 없이 빌드 실행 금지. 빌드 성공은 런타임 정상 동작을 보장하지 않음.

## 2. 개발 배포 (dev) 규칙
- **개발 모드 배포 시 반드시 `scripts/deploy-dev.ps1` 스크립트를 사용할 것.**
  ```powershell
  powershell -ExecutionPolicy Bypass -File D:\SideProjects\PairBudget\scripts\deploy-dev.ps1
  ```
- `npx react-native run-android`을 직접 실행하지 말 것 (스크립트가 모든 절차를 자동화함).
- Metro와 run-android을 동시에 따로 띄우기 금지.
- Babel 설정 변경 시만 수동 Metro `--reset-cache`.

## 3. 릴리즈 배포 (release) 규칙
- 개발 모드(dev)는 USB 케이블로 설치.
- 릴리즈(release)는 USB 설치 안 함. APK를 Google Drive 업로드.
- APK를 바탕화면 등으로 임의 복사 금지. 사용자가 `D:\SideProjects\PairBudget\android\app\build\outputs\apk\release\`에서 직접 가져감.

## 4. 개발 환경 경로
- **프로젝트:** `D:\SideProjects\PairBudget`
- **Android SDK:** `D:\Android\Sdk`
- **ADB:** `D:\Android\Sdk\platform-tools\adb.exe` (PATH에 없음, 풀 경로 사용)
- C드라이브에서 SDK/ADB를 찾지 말 것.

## 5. 패키지 정보
- Debug: `com.pairbudget.dev` (applicationIdSuffix ".dev")
- Release: `com.pairbudget`
- Activity: `com.pairbudget.MainActivity` (suffix 없이 원래 네임스페이스)
- dev 앱 시작: `am start -n com.pairbudget.dev/com.pairbudget.MainActivity`

## 6. ADB 명령 규칙
- adb 명령은 반드시 **한 줄에 세미콜론으로 연결**해서 실행할 것 (데몬 죽음 → reverse 유실 방지).
- `adb reverse` 설정은 데몬 재시작 시 사라짐.
- adb 명령을 따로따로 나눠서 실행 금지.

## 7. 코드 수정 규칙
- PowerShell `Get-Content`/`Set-Content`로 소스코드 수정 절대 금지 (한글 인코딩 깨짐).
- 소스코드 수정은 전용 도구(`replace_file_content`) 또는 Node.js `fs.readFileSync('utf8')` 사용.
- `.ts` 파일 수정 시 같은 디렉터리에 `.js` 파일이 있는지 반드시 확인 (Metro가 .js 우선 로드).
- 파서(`parseMerchantGeneric` 등) 변경 시 반드시 `node test_parser.js`로 로컬 테스트 먼저 실행.
- 테스트 없이 파서 코드 배포 금지.

## 8. NotificationListenerService 관련
- `force-stop`만으로 headless task가 죽었다고 가정 금지 (시스템 서비스라 부활함).
- NotificationListener 재등록이 필요하면 deploy-dev.ps1이 자동으로 처리함.

---

# 📋 트러블슈팅 참고자료

> 아래는 개발 중 발생했던 이슈와 해결 방법 기록입니다. 규칙이 아닌 참고용입니다.

## T1. RefreshControl 스피너 위치 문제
- FlatList가 화면 중간부터 시작 → 스피너도 중간에서 나타남
- **해결:** 상단 요소를 `ListHeaderComponent`로 이동 + `stickyHeaderIndices={[0]}`

## T2. 데이터 없을 때 RefreshControl 동작 불가
- 데이터 0건 시 FlatList 미렌더링 → 새로고침 불가
- **해결:** 항상 FlatList 렌더링 + `ListEmptyComponent` 사용

## T3. 텍스트 말줄임표(ellipsizeMode) 미작동
- `numberOfLines={1}` + `ellipsizeMode="tail"` 설정해도 작동 안함
- **해결:** `flexShrink: 1` 추가

## T4. 안드로이드 키보드 가림 현상
- KeyboardAvoidingView가 안드로이드에서 충돌
- **해결:** `adjustResize`로 위임

## T5. UI/UX 및 통계 데이터 구조 개선
- 월 선택 UI, 카테고리 카드, 파이차트 3D, 바 차트 오버플로우 등 개선 기록

## T6. 안드로이드 실기기 "unable to load script" 에러
- Metro(8081 포트)에 연결 불가
- **해결:** `adb reverse tcp:8081 tcp:8081` + 세미콜론으로 연결

## T7. 안드로이드 실기기 연결 종합 가이드
- ADB 데몬 수명 문제, logcat 백그라운드 유지 해법
- 핵심: adb 명령을 여러 run_command로 쪼개지 말 것. Metro 실행 중 `taskkill node.exe` 금지.

## T8. 윈도우 260자 경로 제한 (MAX_PATH) 및 NDK 빌드 에러
- CMake/NDK 경로 초과 → `FileNotFoundException`
- **해결:** `build.gradle`에 `externalNativeBuild { cmake { buildStagingDirectory "D:/tmp/cxx_build" } }`

## T9. 텍스트 파싱 시 한 글자 조사 일괄 치환 위험
- "다이소" → "다소" 오류 (한 글자 '이' 전역 치환)
- **해결:** 구조적 정규식 사용, 범용 한 글자는 치환 배열에서 제외

## T10. Notifee 로컬 알림 중복/쌓임
- 삼성월렛+문자+카드사 알림 동시 수신 시 3개 알림 쌓임
- **해결:** AsyncStorage 기반 dedup + 고정 id 덮어쓰기

## T11. 알림 파싱 키워드 제거 시 가맹점명 훼손
- `NICE_결제대` → `NICE_대` (가맹점명 내부 '결제' 삭제)
- **해결:** standalone 매칭 정규식 (`(?:^|(?<=\s))키워드(?:$|(?=\s))`)

## T12. 공동통장 중복 등록 방지
- A/B 기기에서 같은 거래 2건 등록
- **해결:** `generateTransactionHash` + Firestore `.where('txHash', '==', hash)` 쿼리

## T13. Firestore snapshot 필드 누락 시 데이터 유실
- 거래 수정 시 memo 사라짐
- **해결:** snapshot 매핑에 `memo: d.memo || undefined` 필수 포함

## T14. Metro가 .ts 대신 .js 파일 우선 로드
- `index.ts` 수정했는데 반영 안됨 → 옆에 `index.js` 존재
- **해결:** `.js` 삭제. `tsconfig.json`에 `noEmit: true`, `metro.config.js`에서 `.ts` 우선순위.
- **2차 사고(2026-06-09):** `BankNotificationParser.js`가 `.ts` 옆에 존재 → 동일 원인 재발.
