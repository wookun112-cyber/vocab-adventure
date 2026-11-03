# Gemini 4 Argon 개발 인수인계 — 어휘탐험
작성: 2026-10-14 · 목적: Google AI Pro의 Gemini 앱(Argon 4)에서 기존 프로젝트를 분석하고, 안전하게 개발을 이어가기 위한 안내

## 0. 가장 중요한 원칙
- 이것은 **기존 앱을 새 앱으로 재작성하는 프로젝트가 아니다.** 현재 소스·학습 기록·로그인·운영 URL·문제은행을 보존한다.
- 기본 브랜치(main), Vercel 운영 배포, Supabase 운영 DB에 첫 번째 수정 단계에서 직접 변경하지 않는다.
- 수정은 새 브랜치에 만들고 검증한 뒤 Pull Request로 승인한다. 데이터베이스 DDL·데이터 변경은 별도 백업/승인 후 적용한다.
- API 키·로그인 비밀번호·학생 개인정보는 Gemini 대화나 저장소 문서에 옮기지 않는다. 서버 환경 변수는 기존 플랫폼에서 관리한다.
- Google AI Pro 구독으로 Gemini 앱에서 Argon 4를 사용할 수 있다. 하지만 앱 안에서 호출하는 OpenAI API 과금은 기존대로 별도이며, Google AI Studio/Antigravity의 Argon 4 자동 코딩은 Ultra 구독 또는 유료 API 등 별도 조건이 있다.
- Gemini 앱의 GitHub '코드 가져오기'는 **읽기/분석용 스냅샷**이다. Gemini 채팅에서 수정하더라도 저장소에 자동으로 커밋되지는 않는다.

## 1. 실제 저장소 및 확인 상태
- GitHub: `wookun112-cyber/vocab-adventure` (private), 기본 브랜치 `main`.
- 2026-10-14 확인한 최신 버전: `package.json` 및 `version.json` **12.16.24**.
- 기술 구성: JavaScript ES module, Node.js >=20, 정적 PWA 프론트(`index.html`, `app.js`, `app.css`, `manifest.webmanifest`, `service-worker.js`), Vercel serverless API(`api/*.js`), Supabase Auth/PostgreSQL.
- Vercel 프로젝트 `vocab-adventure`는 목록에서 확인. 상세 프로젝트 조회는 인증 범위 오류(403)로 실패했으며 운영 URL·환경 변수·배포 연동을 완전히 검증하지 못했다.
- Supabase 프로젝트: `어휘탐험` (ref `qhqumfgbbsurgmlpyira`, active healthy). 개인정보가 아니라 테이블 메타정보만 조회함.
- 확인한 public 테이블: `profiles`(행 추정 2), `app_state`(1), `user_settings`(1), `curriculum_words`(6,455), `curriculum_validation_audit`(389), `word_progress`, `learning_sessions`, `answer_events`, `tmp_v107_verify`. 테이블 목록의 행 수는 추정치이며, `word_progress` 등 0이라고 해서 학습 기록이 없다는 뜻이 아님. 학습 기록의 중요 부분은 `app_state.state` JSON 등에 있을 수 있음.
- 각 테이블 RLS 활성화 확인. 운영 데이터 자체는 이번 인수인계에서 복제하지 않음.

## 2. 제품 목표 및 최신 설계 정책
- 초등학생 대상 AI 맞춤 한국어 어휘 학습. 사전 정의 암기보다 **문맥·상황·실제 문장 사용**을 우선한다.
- 한 번에 목표 어휘 하나와 문제 하나. 5지선다 객관식과 직접 답하는 주관식의 균형; 1문제에서 두 단어 비교/이중 빈칸/정의 장문 서술 요구는 피한다.
- 일일 기본 목표: 새 단어 **5**, 복습 최대 **10**. 기본 목표 문장 사용 확인 뒤에도 인정 학습시간이 25분에 미달하면 단어를 추가한다. 단순 정답 수만으로 완료시키지 않는다.
- 난이도 실시간 조정 시 힌트·정답 공개·반복 정답 등은 승급의 독립 증거로 쓰지 않는다. 너무 쉬운 미학습 어휘 보완, 복습, 학습 이어하기, 정답·학습 시간 보존을 유지한다.
- 1단계 목표 어휘 제외, 실질 목표 2~9단계. 설명구/전문용어를 잘못된 독립 목표어로 내지 않는다. 합성어 전면 배제는 아님.
- 문제은행 미리 생성·검수 및 로컬 제공을 우선한다. 객관식 로컬 채점; 자유 서술/음성의 의미 채점은 현재 별도 서버 OpenAI API를 사용한다. Gemini 구독이 곧 앱의 API 비용을 없애지는 않는다.
- 틀린 답, 힌트 사용, 부분 정답, 장기 회상, 문장 사용, 학습 시간 및 아이별 세션 기록은 이전 과정에서 삭제·재계산하지 않는다.
- 캐릭터·진화·순위표·PWA 및 가정용 로그인 구조를 유지한다.

## 3. 코드를 이해할 때 첫 순서
1. `README.md` 상단 및 최신 버전 절(12.16.24/23/22), `version.json`, `package.json`.
2. `docs/learning-design.md`는 유용하나 **옛 버전 정책이 같은 문서 안에 섞여 있다.** 최신 실행 코드 및 `README.md` 최신 버전을 우선하고 모순을 표시한다.
3. 진입점 `index.html`, `app.js`; UI `app.css`; PWA `service-worker.js`.
4. 백엔드 `api/questions.js`, `api/prepare-worker.js`, `api/grade.js`, `api/vocab.js`.
5. 학습/출제/검수 `lib/learning-model.js`, `lib/local-delivery.js`, `lib/prepared-plan.js`, `lib/authored-policy.js`, `lib/question-bank.js`, `lib/study-history.js`.
6. DB 절차는 `database/` 및 `database/migrations/`; **모든 SQL 파일을 순서 없이 재실행하지 말 것**.
7. 검증 `scripts/verify-all.mjs` 및 기능별 `scripts/verify-*.mjs`.

## 4. Gemini가 첫 단계에서 해야 할 일
- 현재 main 브랜치를 **읽기 전용**으로 분석해 실제 아키텍처와 기능·의존 관계를 정리한다.
- 발견한 기능이나 버그를 **확인/추정/미확인**으로 구분하고 추측으로 고치지 않는다.
- 기본 검증 명령: `npm ci` 이후 `node scripts/verify-all.mjs`. 실행할 환경이 없으면 '미실행'으로 정확하게 표시.
- 학습 기록 보존·기기 간 동기화·임시 저장·문제은행 선택·학습시간 계산·AI 비용 발생 경로를 우선 검토.
- 첫 PR은 **작은 비파괴적 수정**으로 시작. 인증, 테이블 삭제, API 키 변경, 학습 데이터 재설정, Vercel 운영 배포는 금지.
- OpenAI API → Gemini API의 런타임 교체는 별도 과금/정확도 검증 프로젝트로 제안만 하고 자동 변경하지 않는다.

## 5. Google AI Pro 사용자의 구체적인 실행
1. `https://gemini.google.com/` 에 로그인하고 **Gemini 4 Argon**을 선택.
2. 파일 추가 → 코드 가져오기 → GitHub 저장소 `https://github.com/wookun112-cyber/vocab-adventure` 또는 이 인수인계용 브랜치 URL 입력.
3. 비공개 저장소이므로 GitHub 계정 연결/접근 승인. 인수인계 브랜치 URL을 사용하면 본 문서도 함께 포함됨.
4. 아래 '시작 프롬프트'를 전달해 분석부터 시킨다. **채팅의 GitHub 저장소 사본은 실시간 동기화되지 않음**.
5. 변경이 확정되면 Gemini에 '수정된 파일의 완전한 내용 또는 적용 가능한 패치'를 요청하고, 별도 로컬 Git/GitHub 작업 환경에서 새 브랜치에 반영해 테스트와 코드 리뷰 후 병합한다. AI Studio Build로 GitHub 양방향 동기화를 사용할 수도 있지만 이 경우 Pro 구독만으로 Argon 4 사용이 보장되지는 않는다.

## 6. 시작 프롬프트
> 당신은 기존 **어휘탐험** 앱의 인수인계를 받은 소프트웨어 엔지니어입니다. 첨부한 GitHub 코드와 `docs/GEMINI_ARGON4_HANDOFF_2026-10-14.md`를 먼저 검토해 주세요. 이 앱을 재작성하거나 새 프로젝트로 만들지 말고, 현행 기능/DB/아이별 기록/로그인/배포 주소를 유지하세요. `README.md`의 최신 버전 12.16.24와 실제 실행 코드를 우선하여 (1) 구성 파일 맵, (2) AI API 비용 경로, (3) 학습 이력 손실 위험, (4) 테스트 우선순위, (5) 작은 첫 수정 계획을 작성하세요. 직접 실행하지 않은 테스트를 성공했다고 말하지 마세요. 데이터 수정, 인증 변경, 배포는 승인 전 금지입니다.

## 7. 다른 앱 이전 진행 상태
- AI 영어 학습 앱: Supabase `ENGLISH` 프로젝트 발견(조회 당시 inactive); 실제 소스·데이터를 연결한 것인지 미확인. **영어 앱 코드가 이 저장소에 있다고 가정하면 안 됨**.
- 별너머 탐험대: 기존 `chatgpt.site` 운영 이력이 있으나 이번 연결 GitHub에 소스 없음. Sites에서 원본 소스/데이터를 확보해야 함.
- HOUSELAB: 아파트·평형 DB 설계/수집 요구가 존재하지만 이번 연결 GitHub에서 소스 확인되지 않음. 프로젝트 호스팅·저장소 확인부터 필요.

## 8. 이전 완료 판정
[ ] Gemini가 기존 private GitHub 저장소 및 문서를 분석함
[ ] 원본 소스/의존성·운영 구성 백업함
[ ] Supabase 운영 DB 백업 확보함
[ ] 기능별 검증 스크립트 실행 및 결과 보관
[ ] 진행 중 학습/로그인/아이별 기록이 이전 전후 일치함
[ ] 수정 내용 PR 리뷰 후 배포했으며 새 배포에서 정상 작동함

> 작성 시점에 **이전 완료가 아니라 문서·코드 접근 준비 단계**임.
