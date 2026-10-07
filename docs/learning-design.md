# 어휘탐험 12.0 학습 설계

## 근거와 적용 범위

- Spielvogel & Ehren (2021), doi:10.1044/2021_LSHSS-20-00115: 초4 준실험, 주 8개·90분·단어당 16회 만남. 같은 단어 수/시간의 다른 지도 방법보다 목표 어휘 성과가 좋았다. 최적 분량 비교는 아니다.
- Apthorp et al. (2012), doi:10.1080/19345747.2012.660240, WWC Study 82895: 초등 어휘 프로그램, 주 6~8개, 하루 10~20분. 목표 어휘/관련 글에서 근접 효과가 있었으나 광범위한 어휘력·독해 성과로의 일반화는 제한적이었다.
- Agarwal et al. (2021), doi:10.1007/s10648-021-09595-9: 교실 회상 연습 검토. 초등 한국어의 특정 분량/간격을 입증하는 연구는 아니다.
- 정부자·정혜원 (2023), doi:10.22251/jlcci.2023.23.2.535: 초2~3 파생어 의미 학습에서 문맥·형태 추론 모두 향상, 두 지도법 간 차이는 확인되지 않음.

영어권 교사 지도 연구를 한국어 독립 앱 활동과 동일하게 볼 수 없다. 아래 값은 연구 프로토콜을 참고한 시작 운영 규칙이며, 한국 초등학생 전체의 최적량/표준 점수가 아니다. 단어당 16회 만남과 앱의 하루 16활동은 다른 수치다.

## 하루 분량

- 새 목표어 0~2개, 최근 7일 8개 이내. 자연스러운 독서나 대화에서 접하는 모든 단어를 제한하는 것이 아니다.
- 약 15분, 기본 16활동. 20분 이후 화면에 휴식/마치기 안내, 한 답 이상 기록한 뒤 조기 종료 가능.
- 지연 회상 표본 4개 이상에서 정답률 50% 미만이면 새 단어 0개, 75% 미만이면 1개.
- 예정 복습 12개 이상이면 새 단어 0개, 8개 이상이면 1개. 주간/당일 잔여량과 함께 더 낮은 상한을 적용.
- 서버는 DB 호환성을 위해 20문항을 저장하되 새로운 일일 학습은 처음 16활동만 진행한다.

## 흐름과 기록

예정 복습 최대 6개를 보기 없이 먼저 확인 → 새 단어 쉬운 뜻·예문·비예 → 다른 의미 활동 3개 → 새 단어 회상 → 새 글 적용 → 자신의 문장에 사용. 새 단어가 없으면 익히기 카드를 건너뛴다.

- 하루 기본 학습 뒤에도 계속 공부할 수 있다. 새 단어는 하루 3개이며 이후에는 복습으로 이어진다. 예정 복습이 없으면 앞당긴 연습을 제공하고, 이를 지연 회상 성공이나 복습 간격 증가로 계산하지 않는다. 20~25분은 권장 시간이다.
- 직접 회상, 객관식 알아보기, 새 글 이해, 목표어를 보여준 문장 사용을 구분한다.
- 같은 날의 반복 성공은 회상 간격을 늘리지 않는다. 정답 공개/힌트/실패는 다음 날 복습으로 돌아간다.
- 직접 회상 성공 시 앱 간격은 1·3·7·14·30·60일. 7~29일, 30일 이상 실제 노출 간격으로 유지 확인을 별도 기록한다.
- 장기 확인은 직접 회상 3일 이상, 7일 이상 간격 성공 1회 이상, 적절한 문장 사용 1일 이상인 누적 학습 이력이다. 공인 숙달 판정이 아니다.

## 등급 및 호환성

출제 난이도와 리그 등급을 분리한다. 리그는 최근 30일의 지연 회상 중 최대 24개 표본, 12개 표본·8개 단어·3일 이상일 때 하루 1회 최대 ±0.2 조정. 쉬운 단어만으로 높은 등급을 올리지 않는다. 공인 어휘력·학년 점수로 해석하지 않는다.

기존 미완료 학습은 원래 문항/정답/순서/목표량으로 이어진다. 12.0 학습은 카드 커서, 문제 답, 힌트, 활동 시간까지 체크포인트에 보관한다. DB 마이그레이션은 사용자 학습 JSON을 변경하지 않는다. 캐릭터·진화 보상·100명 리그 구조를 유지한다.

## 목표 어휘 선정 (12.4.1)

‘생활 정보 격차’, ‘생활 정보의 판단 기준’처럼 구성 단어의 뜻을 조합해 이해할 수 있는 설명형 표현은 독립된 목표 어휘로 반복 출제하지 않는다. ‘격차’, ‘기준’, ‘검증’ 같은 핵심 단어를 여러 지문에 적용한다. 이러한 긴 표현은 지문 소재로 사용할 수 있다.

12.4.1에서는 40개 표현을 명시적으로 제외했다. 12.12.1부터는 전체 목록 감사와 공통 구절 차단 규칙으로 확대한다. ‘시행착오’, ‘먹이 사슬’, ‘탄소 중립’ 같은 독립 개념과 관용 표현은 유지한다. 제외된 항목의 기존 학습 기록과 진행 중 학습은 보존하며, 새 단어·복습·레벨 확인 및 서버의 다음 문제 준비부터 적용한다.

## 12.5 어휘 중심 재구성

독립 목표는 일상·독해에 전이되는 어휘다. 등비중항, 소인수분해, 사동 표현 등 전문 개념·계산·문법 분류 명칭은 지문 소재로만 쓰고 새 단어·복습 대상에서 제외한다. 일반적인 뜻과 쓰임이 있는 나누다, 확인하다, 수렴, 편차 등은 유지한다. 합성어 전체를 제외하지 않으며 기존 투명한 설명구는 계속 지문에만 사용한다.

20활동은 객관식 10개와 직접 답하는 활동 10개로 구성한다. 선행 복습에서 단어를 먼저 보여 주지 않으며, 새 단어 소개와 회상 사이에는 다른 활동을 둔다. 뜻 구별, 문맥 회상, 대화, 새 글 이해와 자기 문장 만들기를 평가한다. 하루 새 단어 3개, 권장 20–25분, 추가 학습 제한 없음은 유지한다.

역사·과학 사실은 지문 안에 제공한다. 인물 이름, 연도, 공식, 계산 결과나 전문 명칭을 맞히는 질문은 어휘 문제로 인정하지 않는다. 생성과 독립 검수 모두 vocabularyFocus를 요구하며, 난이도는 어휘 추상성·단서 직접성·가까운 의미의 구별·문맥의 복잡성으로 조절한다. 새 문항은 이 정책으로 미리 검수한 묶음만 사용한다.

진행 중 학습의 원래 답안·순서·학습 기록은 보존한다. 아직 답하지 않은 제외 대상은 오답·점수·보상 없이 넘어가고, 해당 결과는 새 어휘 점수 집계에 넣지 않는다. 저장된 원시 기록을 삭제하거나 난이도를 일괄 재설정하지 않는다.

독립 검수가 반복해서 개념 이름 퀴즈로 판정한 세포는 지문 소재로만 사용한다. 사용하지 않은 문제 묶음에서 해당 미검수 자리는 이미 배운 일반 어휘로 대체할 수 있다. 검수를 통과한 다른 문항과 원래 학습 기록은 유지하고 대체 문항도 생성·독립 검수를 거친다.


## 12.6 learning sequence

Daily settings remain three new meanings, twenty activities, a recommended 20–25 minutes and optional further review. These are product settings, not experimentally established optimal quantities.

Up to six uncued probes of previously studied words precede teaching. Each new word then receives an easy meaning, a natural example, and a non-example. Its first activity shows the target and asks for the appropriate situation. Subsequent meaning/reading activities and at least one original sentence per new word use different events. With six review probes the packet has ten choice tasks, six recall tasks and four sentence-use tasks. When fewer review words exist, shown-word sentence use replaces missing recall tasks. New words have no same-day hidden-word tests.

Direct recall from a later day and a new context is tracked separately from recognition and shown-word use. Same-day recall cannot add independent recall days or advance the retention schedule. Seven-day retention and original use remain necessary for confirmed mastery. Natural alternative cloze answers may show context understanding without target recall.

Avoid abstract label slots such as “___의 관점에서”, which allow unrelated plausible names. Teach 분배 first; 소득 분배 is an extension in passages rather than an independently tested target. Do not globally exclude compounds or useful concepts. Passage difficulty follows estimated vocabulary ability; it is not a normed school-grade score.

Evidence informing design: Coyne et al. (2007), DOI 10.2307/30035543; Coyne et al. (2009), DOI 10.1086/598840; Goossens et al. (2014), DOI 10.1016/j.jarmac.2014.05.003; Goossens et al. (2016), DOI 10.1002/acp.3245. Explicit meaning instruction and varied deeper processing support word knowledge; retrieval effects vary across classroom designs. None establishes this exact Korean app sequence or dose as optimal.

## 12.12.1 설명형 표현 전체 제외

현재 사용 가능 목록의 1,511개 구절을 지문용으로 전환했다. 띄어쓰기와 붙여쓰기 형태를 모두 제외한다. 새 여러 단어 목표는 명시적으로 검토한 독립 개념·관용 표현만 허용한다. 시행착오 같은 독립 어휘는 유지한다. 단어 생성 API, 새 단어 선정, 복습, 수준 확인, 문제은행과 문제 검수에서 같은 기준을 사용한다. 기존 미완료 학습은 제외 문항을 오답·점수·보상 없이 건너뛰며 기존 답안과 진행 순서를 보존한다. 단어장·학습 단어 수·리포트도 동일한 독립 어휘 기준으로 표시한다. 저장된 이전 기록은 삭제하지 않는다.
