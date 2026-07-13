# PairBudget - Firebase 설정 가이드

## 1단계: Firebase 프로젝트 생성

1. [Firebase Console](https://console.firebase.google.com) 접속
2. **"프로젝트 추가"** 클릭
3. 프로젝트 이름: `PairBudget` 입력
4. Google Analytics는 선택사항 (사용 안 해도 됨)
5. **"프로젝트 만들기"** 클릭

## 2단계: Android 앱 등록

1. Firebase Console → 프로젝트 설정 → **"앱 추가"** → Android 아이콘 클릭
2. Android 패키지 이름: `com.pairbudget`
3. 앱 닉네임: `PairBudget`
4. SHA-1 디버그 키 (Google 로그인에 필요):
   ```bash
   cd android
   ./gradlew signingReport
   ```
   출력에서 `SHA1` 값 복사하여 입력
5. **`google-services.json`** 파일 다운로드
6. 다운로드한 파일을 아래 경로에 배치:
   ```
   android/app/google-services.json
   ```

## 3단계: Firebase 서비스 활성화

### Authentication
1. Firebase Console → **Authentication** → 시작하기
2. **로그인 방법** 탭:
   - Email/Password: **사용 설정**
   - Google: **사용 설정** (지원 이메일 입력)

### Cloud Firestore
1. Firebase Console → **Firestore Database** → 데이터베이스 만들기
2. 위치: `asia-northeast3` (서울) 선택
3. 보안 규칙: **테스트 모드로 시작** (나중에 수정)

## 4단계: Firestore 보안 규칙

Firebase Console → Firestore → **규칙** 탭에서 아래 내용으로 교체:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isHouseholdMember(householdId) {
      return isAuthenticated() &&
        request.auth.uid in get(/databases/$(database)/documents/households/$(householdId)).data.members;
    }

    match /users/{userId} {
      allow read: if isAuthenticated();
      allow write: if isAuthenticated() && request.auth.uid == userId;
    }

    match /households/{householdId} {
      allow read: if isHouseholdMember(householdId);
      allow create: if isAuthenticated() &&
                       request.resource.data.members is list &&
                       request.auth.uid in request.resource.data.members;
      allow update: if isHouseholdMember(householdId);
      allow delete: if false;

      match /transactions/{transactionId} {
        allow read: if isHouseholdMember(householdId);
        allow create: if isHouseholdMember(householdId);
        allow update: if isHouseholdMember(householdId);
        allow delete: if isHouseholdMember(householdId);
      }

      match /categories/{categoryId} {
        allow read: if isHouseholdMember(householdId);
        allow write: if isHouseholdMember(householdId);
      }

      match /monthlySummaries/{yearMonth} {
        allow read: if isHouseholdMember(householdId);
        allow write: if isHouseholdMember(householdId);
      }
    }
  }
}
```

## 5단계: 앱 실행

```bash
# Android 에뮬레이터 또는 기기 연결 후
npx react-native run-android
```

## 6단계: 알림 권한 설정 (실제 기기)

1. 앱 설치 후 → 설정 → 알림 접근 허용
2. Android 설정 → 특별한 앱 접근 → 알림 접근 → PairBudget **허용**

---

> **참고**: `google-services.json` 파일이 없으면 앱이 빌드되지 않습니다.
> Firebase Console에서 반드시 다운로드하여 `android/app/` 폴더에 넣어주세요.
