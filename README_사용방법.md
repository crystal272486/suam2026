# 수암초 6학년 1반 작품 허브

업로드된 CSV 자료 14건을 확인해 만든 **노션 자동 연동형 반응형 웹페이지**입니다.

## 주요 기능

- PC·휴대폰 화면 자동 대응
- 전체 및 조별 필터
- 게임 이름·팀 이름·장르 검색
- 작품 카드와 상세 팝업
- 노션 최신 자료 자동 조회
- 노션 연결 전에는 업로드된 CSV 자료로 미리보기
- 노션 API 토큰은 브라우저가 아닌 서버에만 저장

---

## 1. 바로 미리보기

`public/index.html`을 더블클릭하면 현재 CSV 기준으로 바로 확인할 수 있습니다.

이 상태는 **CSV 미리보기 모드**입니다.  
노션 자동 연동은 아래 설정 후 서버로 실행해야 합니다.

---

## 2. 노션 연결 만들기

1. Notion 개발자 페이지에서 새 연결 또는 개인 액세스 토큰을 만듭니다.
2. 읽기 권한이 포함되도록 설정합니다.
3. 발급된 토큰을 복사합니다.
4. 노션 원본 데이터베이스 페이지로 이동합니다.
5. 우측 상단 `···` → `연결 추가(Add connections)`를 선택합니다.
6. 방금 만든 연결을 선택합니다.

공개 게시만으로는 API 접근 권한이 생기지 않습니다.  
원본 데이터베이스에 연결을 별도로 추가해야 합니다.

---

## 3. 환경설정 파일 만들기

`.env.example`을 복사하여 파일명을 `.env`로 바꿉니다.

```env
NOTION_TOKEN=ntn_실제_토큰
NOTION_DATABASE_ID=73db70c5165f835e9b8a01cb69d432f2
NOTION_DATA_SOURCE_ID=
CACHE_SECONDS=60
PORT=3000
```

- `NOTION_TOKEN`: 노션에서 발급받은 비밀 토큰
- `NOTION_DATABASE_ID`: 현재 노션 주소에서 확인한 데이터베이스 ID
- `NOTION_DATA_SOURCE_ID`: 자동 탐색이 실패할 때만 직접 입력
- `CACHE_SECONDS`: 노션 재조회 간격
- `PORT`: 웹서버 포트

`.env` 파일은 외부에 공유하거나 공개 저장소에 올리면 안 됩니다.

---

## 4. 실행 방법

Node.js 18 이상이 필요합니다.

```bash
npm install
npm start
```

브라우저 주소:

```text
http://localhost:3000
```

Windows에서는 `start.bat`을 더블클릭해도 됩니다.

---

## 5. 노션 수정 내용 반영

1. 노션 데이터베이스 내용을 수정합니다.
2. 웹페이지에서 `최신 자료 새로고침`을 누릅니다.
3. 노션 최신 자료가 웹페이지에 반영됩니다.

기본 캐시는 60초입니다.

---

## 6. 현재 CSV 확인 결과

- 총 응답: 14건
- 확인된 조: 1~11조, 13~15조
- 12조 응답은 CSV에 없음
- 현재 CSV에는 `학년`, `반` 열이 없어 웹페이지에서 `6학년`, `1반`으로 기본 처리
- 여러 반을 함께 운영하려면 노션에 `학년`, `반` 열을 추가하면 확장 가능

---

## 7. 서버 업로드 시 주의

`public` 폴더만 일반 웹호스팅에 올리면 CSV 미리보기만 가능합니다.

노션 자동 연동을 사용하려면 다음이 필요합니다.

- Node.js 서버에서 `server.js` 실행
- 서버 환경변수에 `NOTION_TOKEN`, `NOTION_DATABASE_ID` 등록
- 필요 시 `NOTION_DATA_SOURCE_ID` 등록

---

## 8. 파일 구조

```text
suam_notion_hub/
├─ server.js
├─ package.json
├─ .env.example
├─ start.bat
├─ README_사용방법.md
├─ data/
│  ├─ sample.json
│  └─ 원본_노션내보내기.csv
└─ public/
   ├─ index.html
   ├─ styles.css
   ├─ app.js
   └─ sample-data.js
```
