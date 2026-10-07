// Shared, deterministic learning rules. These are app estimates, not a standardized test.
export const LEARNING_MODEL='12.0.0';
// These transparent, descriptive phrases belong in passages, not in the
// independently counted target vocabulary. This is an editorial list, not a
// ban on compounds, idioms or established technical concepts.
export const CONTEXT_ONLY_EXPRESSIONS=[
 '자외선 차단','생활 정보 격차','정보 격차','지역 격차','지역 발전 격차','빈부 격차','소득 격차',
 '생활 정보의 판단 기준','개인 정보 보관 기간','개인 정보의 보관 기간','정보 제공 범위',
 '정보의 객관성','정보의 최신성','정보의 타당성','정보의 위계','정보 검증','정보 선별','정보 전달','개인 정보 유출',
 '생활 폐기물 배출 기준','생활비 지출 항목','재난 정보 확인 경로','비교 기준','해결 방안','발표 자료','관찰 기록','관계 회복',
 '생활 안전 수칙','생활 속 위험 요인','독서 목적','독서의 목적','독서 태도','독서 기록','예약 확인','보관 방법','보관 상태',
 '식품 보관 온도','사실과 의견의 구별','비판적 읽기 전략','자료 수집 계획','주민 의견 수렴'
];
export const QUESTION_POLICY='vocabulary-context-12.5';
export const GENERAL_REASONING_WORDS=["가로", "값", "같다", "계산", "골고루", "길다", "길이", "높이", "다르다", "다섯", "더", "더하다", "덜", "동그라미", "동그랗다", "둘", "따로", "똑같다", "많다", "맞다", "모두", "문제", "반", "부분", "비교", "비슷하다", "빼다", "세다", "세로", "세모", "셋", "순서", "숫자", "시간", "실수", "쌍", "알맞다", "앞뒤", "여럿", "열", "영", "일부", "작다", "잘못", "저울", "적다", "정답", "정하다", "종류", "줄다", "짝", "짧다", "차례", "차이", "크다", "풀다", "하나", "거리", "겹", "겹치다", "계산하다", "고르게", "곧다", "골라내다", "공통", "규칙성", "넓다", "눈금", "늘어나다", "단위", "대략", "대칭", "막대", "만약", "면", "모서리", "몫", "묶음", "반복", "배", "번갈아", "볼록하다", "부족하다", "부피", "예외", "오목하다", "입체", "정확한", "줄마다", "줄어들다", "줄", "횟수", "가능성", "가정", "간격", "감소하다", "공통점", "구분하다", "구체", "규칙적", "그러므로", "기준", "기준점", "나란하다", "논리", "단계", "맞닿다", "모순", "반대", "반례", "배분하다", "배열", "분배", "분석", "분석하다", "분할", "불규칙", "비교하다", "비스듬하다", "비율", "순위", "이상", "이하", "일반화", "일정하다", "제외", "조건", "종합", "종합하다", "증가하다", "차이점", "초과", "최댓값", "최솟값", "추론하다", "추상", "추측", "타당하다", "판단", "판단하다", "평균", "포함", "회전", "기울기", "논리적", "대응", "부호", "밑", "집합", "균등", "변수", "변환", "분산", "빈도", "상관관계", "인과관계", "전제", "추정", "필요조건", "반증", "분포", "비중", "유추", "증명", "귀납", "대칭성", "독립성", "모형화", "변화율", "불변성", "비약", "순서도", "알고리즘", "연역", "유추하다", "인과", "차원", "최적화", "추상화", "표준화", "합리성", "교란", "기저율", "민감도", "발산", "선형성", "수렴", "정교화하다", "정량적", "정성적", "충분조건", "편차", "정규화", "자명하다", "추상화하다", "나누다", "넓이", "네모", "둘레", "나머지", "바깥쪽", "어림", "어림하기", "직선", "차액", "첫째", "측정", "평행", "표", "풀이", "합", "합계", "확인하다", "괄호", "미만", "비례", "오차", "통계", "표본", "확률", "닮음", "대입", "미지수", "조합", "접점", "역", "대우", "동치", "기준선", "중점", "비선형", "잔차", "불변량", "수렴성", "볼록성"];
export const SPECIALIST_TARGETS=["자리올림", "가로막대그래프", "가로줄", "각", "각도", "각도기", "곱", "곱셈", "곱셈식", "곱셈표", "곱하는 수", "규칙을 세우다", "그래프", "꺾은선", "꼭짓점", "나누는 수", "나눗셈", "나눗셈식", "다각형", "덧셈", "덧셈식", "도형", "들이", "리터", "마름모", "문제 풀이", "미터", "반올림", "버림", "변", "변의 길이", "분모", "분수", "분자", "뺄셈", "뺄셈식", "사각형", "삼각형", "선분", "세로막대그래프", "세로줄", "센티미터", "수 배열", "수직", "자료 해석", "자료표", "자리값", "자릿수", "자연수", "정사각형", "직각", "직각삼각형", "직사각형", "짝수", "차", "표현 방법", "홀수", "홀수와 짝수", "가능한 경우", "가분수", "각기둥", "각뿔", "검산", "경우 나누기", "경우의 수", "계산식", "공배수", "공약수", "구", "기약분수", "내림", "넓이 공식", "넓이 단위", "단위분수", "대각선", "대략값", "대분수", "대응표", "대칭축", "등호", "띠그래프", "문제 해결", "문제 해결력", "반지름", "받아내림", "받아올림", "배수", "백분율", "분수 막대", "분수의 크기", "비례배분", "비율표", "비의 성질", "선대칭도형", "소수", "소수의 곱셈", "소수의 나눗셈", "소수점", "소수점 이하", "소인수", "소인수분해", "수의 대소", "수직선", "십진법", "약분", "약수", "약수와 배수", "약수의 개수", "어림값", "역산", "연산", "연산 순서", "올림", "원그래프", "원기둥", "원뿔", "원의 넓이", "원의 둘레", "원주", "원주율", "이자율", "입체도형", "자료의 편향", "점대칭도형", "제곱미터", "제곱센티미터", "좌표", "좌표평면", "중앙값", "지름", "진분수", "최대공약수", "최소공배수", "통분", "평균값", "평면", "평면도형", "표본 조사", "할인율", "합동", "합성수", "각의 이등분선", "거듭제곱", "겉넓이", "결합법칙", "경우의 분류", "계산 순서", "계산의 원리", "공집합", "공통인수", "교환법칙", "규칙의 표현", "근", "근삿값", "기준량", "내각", "내심", "내접", "다면체", "단항식의 계수", "닮음비", "대응각", "대응변", "도수", "도형의 구성", "도형의 성질", "동류항", "동위각", "등식", "등식의 변형", "등식의 성질", "맞꼭지각", "문자 사용", "문자식", "미지수의 값", "반비례", "방정식", "배수 관계", "보각", "부등식의 성질", "부분집합", "분배법칙", "분수선", "비교의 기준", "비례식", "사다리꼴", "사분면", "사잇값", "상수", "서로소", "세제곱", "수의 부호", "수직선의 원점", "순서쌍", "순환마디", "순환소수", "식의 값", "약수의 합", "양수", "엇각", "여각", "역산 방법", "역수", "외각", "외심", "외접", "유리수", "유리수의 덧셈", "유한소수", "음수", "일차방정식", "일차방정식의 해", "일차부등식", "일차식", "전개도", "절댓값", "절댓값 기호", "정비례", "정수", "정수의 덧셈", "정수의 뺄셈", "제곱", "제곱수", "좌표축", "중심선", "지수", "컴퍼스", "평행사변형", "합리적 판단", "항", "항등식", "회전체", "경우 분류", "계급값", "계수", "근사 계산", "근호", "논리적 추론", "누적도수", "다항식", "다항식의 차수", "단항식", "대응 관계", "대응 규칙", "대칭이동", "대표값", "도수분포표", "도형의 닮음", "무게중심", "무리수", "무리수의 소수 표현", "무한소수", "반비례 관계", "변수의 범위", "부등식", "부등식의 해", "부등호", "부채꼴", "분배법칙의 역", "분수의 역수", "비례 관계식", "비례 배치", "비율의 해석", "사건의 확률", "사고의 유연성", "산점도", "산포", "삼각형의 합동", "상대도수", "상수항", "수량 관계", "수직이등분선", "수학적 근거", "수학적 표현", "실수의 대소 관계", "연립방정식", "연립부등식", "연립일차방정식", "원주각", "이차방정식의 근", "이차항", "일차함수", "일차함수의 절편", "일차항", "자료의 경향", "작도", "절편", "제곱근", "조건 해석", "좌표 해석", "좌표의 대응", "중심각", "최빈값", "추론 과정", "측정 단위의 일관성", "판단 유보", "평행선의 성질", "평행선의 엇각", "평행이동", "표면적", "표본공간", "표본의 크기", "풀이 과정 검토", "함수", "함수값", "함수의 감소", "함수의 증가", "합동 조건", "해집합", "호", "확률 실험", "확률의 비교", "회전이동", "히스토그램", "경우의 수의 곱셈 원리", "계산의 효율", "근과 계수의 관계", "근사화", "근의 공식", "근의 판별", "내분", "대표값 비교", "도형 변환", "반올림 오차", "분수식", "비례상수", "사인", "산포도", "삼각비", "수학적 모델", "수학적 의사소통", "식의 변형", "역비례", "완전제곱식", "외분", "원의 접선", "이차방정식", "이차함수", "이차함수의 꼭짓점", "인수분해", "일차함수의 그래프", "일차함수의 기울기", "자료의 분포", "정다면체", "추세선", "축의 대칭", "축의 방정식", "코사인", "판별식", "평균 변화율", "포물선", "포물선의 축", "풀이의 타당성", "피타고라스 정리", "피타고라스 정리의 역", "함수의 대응", "가중 평균", "공간적 추론", "공비", "공집합 기호", "공차", "귀납적 추론", "극값 조건", "극한값", "근사 오차", "근의 개수", "근의 중복도", "기댓값", "기하평균", "나머지 정리", "논리곱", "논리합", "누적 비율", "다항식의 나눗셈", "대수적 표현", "대우 명제", "대우 증명", "독립 변수", "독립 사건", "두 점 사이의 거리", "등비수열의 합", "등비중항", "등차수열의 합", "등차중항", "매개변수", "명제", "명제의 부정", "명제의 역", "명제의 진릿값", "무한집합", "미분 가능성", "반례 구성", "벡터의 성분", "변동 계수", "변수의 허용 범위", "사분위 범위", "사분위수", "산술평균", "산포 비교", "상관관계와 인과관계", "상대 오차", "상수 함수", "성급한 일반화", "수열의 일반항", "수학적 귀결", "수학적 모델의 한계", "수학적 추상화", "순열", "역명제", "역함수", "연역적 추론", "오차 범위", "오차 한계", "원의 방정식", "유리화", "유한집합", "이차함수의 최댓값", "이차함수의 최솟값", "인과 추론", "인수 정리", "자료 간 상관성", "자료의 대표성", "자료의 변동성", "전제 조건", "절대 오차", "정규 분포", "정의역", "제약 조건", "조건부 명제", "종속 변수", "종속 사건", "중점 공식", "증감률", "집합의 교집합", "집합의 여집합", "집합의 원소", "집합의 원소 수", "집합의 차집합", "집합의 포함 관계", "집합의 합집합", "최적화 문제", "최적화 해", "추정값", "치역", "통계적 해석", "팩토리얼", "표본 공간", "표본 크기", "표본 편향", "표준 점수", "표준편차", "피보나치 수열", "필요조건과 충분조건", "필요충분조건", "함숫값", "합성함수", "허근", "확률 모형", "확률 분포", "확률적 예측", "가설 검정", "계산 자원의 제약", "공리", "공역", "공통 원인", "교란 변수", "교란 요인", "귀류법", "극한", "근사해", "급수", "기댓값의 선형성", "기하적 변환", "내적", "논리적 비판", "대수의 법칙", "도함수", "도형 변환의 합성", "등비수열", "로그", "명제의 동치 변형", "명제의 참값", "명제함수", "무리함수", "미분", "미분 계수", "복소수", "부정적분", "분포의 비대칭성", "사인 법칙", "산점도의 추세", "상관계수", "수열의 극한", "수열의 단조성", "수열의 점화식", "수학적 귀납법", "수학적 귀류법", "수학적 반례", "식의 동치", "신뢰 구간", "역함수의 그래프", "예측 구간", "오차의 누적", "유리함수", "자료 분포의 모양", "자료의 이질성", "자료의 중심 경향", "적분", "점근선", "점화식", "접선", "접선의 기울기", "정의역 제한", "정적분", "조건부 독립", "조건부 확률", "중근", "중복 순열", "중심극한정리", "최적해", "추론의 비약", "추세 외삽", "추정 오차", "추정의 편향", "코사인 법칙", "통계량의 편향", "통계적 불확실성", "통계적 추정", "표본의 대표성", "표본의 선택 편향", "표준 오차", "함수의 단조 구간", "함수의 단조성", "함수의 대칭성", "함수의 변곡점", "합성함수의 정의역", "행렬", "허수", "확률 변수", "효과 크기", "개념의 조작화", "고유값", "고유벡터", "공리계", "공분산", "극값", "극단값의 영향", "급수의 수렴", "급수의 수렴 여부", "논리적 귀결 관계", "논리적 동치", "로그함수", "명제의 동치", "모형 과적합", "모형 적합도", "모형의 과적합", "목적 함수", "무한급수", "민감도 분석", "베이즈 정리", "벡터의 내적", "변수의 종속성", "볼록함수", "부정적분 상수", "선형 변환", "역행렬", "오목함수", "유의 수준", "이항 분포", "조건의 충분성", "조건의 필요성", "중간값 정리", "집합론", "최댓값 정리", "추정값의 안정성", "통계적 대표성", "통계적 유의성의 한계", "표본 선택 편향", "표본 오차와 비표본 오차", "필요충분성", "함수의 극값 조건", "행렬식", "확률 모형의 가정", "확률의 조건화", "확률적 독립성", "회귀 계수", "사동 표현", "피동 표현", "사동", "피동", "관형절", "명사절", "부사절", "안긴문장", "안은문장", "복합 문장", "서술격 조사", "보조 용언", "사잇소리 현상", "설의법", "대구법", "도치법", "절대 온도", "기압골", "열의 평형", "염화나트륨", "질량 보존 법칙", "보일 법칙", "샤를 법칙", "기체 상태 방정식", "뉴턴 운동 법칙", "옴의 법칙", "멘델의 법칙", "아보가드로 법칙", "도플러 효과", "플랑크 상수", "가속도", "각가속도", "각속도", "각운동량", "간섭 무늬", "감각 수용체", "감쇠 진동", "감염 위험도", "강우", "강제 진동", "개체군 밀도", "개체군 성장", "개체군의 유전적 부동", "개체군의 회복력", "결정화", "결합 에너지", "결합 조직", "경쟁 배제", "계통 분류", "계통 오차", "계통수", "계통적 오차", "고분자", "고유 진동수", "공명", "공명 주파수", "공유 결합", "공유 전자쌍", "공진", "공진 주파수", "공진화", "공통 조상", "과학 모형의 적용 한계", "과학 모형의 활용", "과학 윤리", "과학적 모델", "과학적 불확실성", "과학적 설명", "과학적 추론", "관다발", "관성 모멘트", "관찰자 효과", "관측 자료의 시간 해상도", "광섬유", "광전 효과", "광합성 속도", "구경꾼 이온", "구심 가속도", "구심력", "군집", "군집 천이", "굴절률", "굽힘 모멘트", "균류", "극상 군집", "극성", "극성 결합", "극성 분자", "근육 조직", "기계 학습", "기능적 다양성", "기단", "기상 재해", "기압 차", "기전력", "기체 분자 운동론", "기후 민감도", "기후 완화", "기후 탄력성", "기후 피드백", "기후 회복력", "기후변화", "나노미터", "난류", "내부 에너지", "내분비계", "내성균", "논리 회로", "단백질 접힘", "단백질 합성", "단색광", "단열 변화", "달의 위상", "담수화", "당량점", "대기 경계층", "대기 전력", "대기 질 지수", "대기권", "대류 열전달", "대륙붕", "대륙성 기후", "대립 형질", "대립유전자", "대사 산물", "대사율", "대수층", "데이터 편향", "도시 열섬", "돌연변이", "동적 평형", "등속 운동", "등온 변화", "렌즈의 초점 거리", "로지스틱 성장", "리보솜", "림프", "마디", "막전위", "먹이 그물", "면역 기억", "면역계", "모세관 현상", "모형의 예측력", "모형의 적용 한계", "모형의 적합성", "모형의 타당성", "모형의 한계", "몰", "몰 농도", "몰 부피", "몰 질량", "몰수", "물리적 성질", "물질 수송체", "물질 수율", "물질 수지", "물질 순환", "물질 체류 시간", "물질대사", "물질의 보존", "물질의 순도", "물질의 순환 경로", "물질의 이동 경로", "미세 플라스틱", "미세먼지 농도", "반감기", "반복 가능성", "반응 경로", "반응 선택성", "반응 속도", "반응 속도식", "반응 수득률", "반응 수율", "반응 엔탈피", "반응 열", "반응 조건", "반응 조건의 영향", "반응 지수", "반응 차수", "반응 환경", "반응식", "반응열", "반증 가능성", "발생 과정", "발생 유전자", "발화점", "방사능", "방사선량", "방사성 동위 원소", "배란", "배아", "백색광", "변수 통제", "변위", "변형률", "별의 밝기", "병목 효과", "병원체 농도", "병원체의 전파", "복사 열전달", "복사 평형", "복사열", "복원 생태학", "부도체", "부분 압력", "부영양화", "분별 증류", "분압 법칙", "분자 간 상호 작용", "분자 간 인력", "분자 간 힘", "분자 구조", "분자 극성", "분자 배열", "분자 운동", "분자 진동", "분자간 상호작용", "분자량", "분자의 배열", "불확정성 원리", "비교 집단", "비극성 결합", "비극성 분자", "비열", "빙하 후퇴", "빛의 간섭", "빛의 속력", "빛의 편광", "빛의 회절", "산 해리", "산 해리 상수", "산성도", "산성비", "산소 요구량", "산화", "산화 반응", "산화 환원", "산화 환원 반응식", "산화 환원 적정", "산화 환원 전위", "산화물", "산화수", "산화제", "삼투", "삼투 현상", "삼투압", "삼투압 차", "상대 연령", "상동 기관", "상전이", "상태 방정식", "상피 조직", "생명 윤리", "생명공학", "생명공학 기술", "생물 계절 변화", "생물 군집의 변화", "생물 다양성 지수", "생물 분포", "생물 지리", "생물 지표", "생물 지표종", "생물 진화", "생물다양성 보전", "생물막", "생물의 구성", "생물의 방어", "생물의 항상성", "생물학적 다양성", "생물학적 분류", "생물학적 성", "생물학적 시계", "생물학적 적응도", "생산자 생물량", "생성형 인공지능", "생식 세포", "생식 전략", "생식세포", "생식적 격리", "생장점", "생체 물질", "생체 시계", "생체 정보", "생체막", "생태 복원", "생태 복원력", "생태 회랑", "생태계 교란", "생태계 교란 요인", "생태계 복원", "생태계 서비스", "생태계 에너지 효율", "생태계 저항력", "생태계 저항성", "생태계 회복", "생태계 회복 속도", "생태계의 안정성", "생태계의 에너지 효율", "생태계의 저항성", "생태계의 회복력", "생태적 교란", "생태적 발자국", "생태적 복원", "생태적 상호 의존", "생태적 안정성", "생태적 연결", "생태적 연결성", "생태적 임계점", "생태적 저항성", "생태적 지위", "생태적 지위 분화", "생태적 지표", "생태적 천이", "생태적 회복력", "서식지 단편화", "서식지의 질", "선택 압력", "선택압", "선팽창", "성운", "세포 골격", "세포 내 공생", "세포 내 수송", "세포 배양", "세포 분열", "세포 분화", "세포 소기관", "세포 자멸", "세포 호흡", "세포막", "세포막의 선택 투과성", "세포의 기능", "세포질", "소기관", "소비 전력", "소성 변형", "소수성", "소화액", "수소 결합", "수정란", "수직 전달", "수평 유전자 전달", "수평 전달", "순이온 반응식", "순환 자원", "승화열", "시냅스", "신경 가소성", "신경 전달", "신경 전달 물질", "신경 전달 속도", "신경 조직", "신경 회로", "신경계의 조절", "신체 조절", "신호 전달 경로", "실내 공기질", "실험 결과의 해석", "실험 변인 통제", "실험 재현", "실험의 한계", "아보가드로 상수", "알베도", "암석권", "암흑물질", "압축률", "양성 되먹임", "양성자", "양이온", "양자화", "에너지 보존", "에너지 손실률", "에너지 수지", "에너지 전달 과정", "에너지 전환 효율", "에너지 전환의 손실", "에너지 준위", "에너지 효율", "에너지 효율성", "에너지 흐름", "에너지의 저장 형태", "엔트로피", "역학적 에너지", "역학적 일", "역학적 평형", "연구 윤리", "연소 생성물", "열기관", "열대야", "열량 보존", "열섬 현상", "열성", "열에너지", "열역학 제1법칙", "열역학 제2법칙", "열역학적 안정성", "열역학적 평형", "열용량", "열응력", "열의 출입", "열저항", "열적 팽창 계수", "열적 평형", "열적 평형 상태", "열전달 저항", "열전도율", "열팽창 계수", "열확산", "열효율", "염기 서열", "염기 서열 분석", "염기 해리 상수", "염색체", "염색체 수", "영률", "영양 단계", "오차 전파", "오차율", "오차의 원인", "온도 구배", "완충 용액", "완충 작용", "외래 생물", "용액의 농도", "용액의 희석", "용해 평형", "용해도 곡선", "우주 배경 복사", "우주 팽창", "운동 마찰력", "운동량", "운동의 변화", "원생생물", "원소 기호", "원소 주기성", "원소 주기율표", "원심력", "원운동 주기", "원자 모형", "원자 번호", "원자가 전자", "원자량", "원자핵", "원핵생물", "위상차", "유도 기전력", "유도 전류", "유전 상담", "유전 암호", "유전 정보", "유전 정보의 전달", "유전 형질", "유전자 발현", "유전자 발현 조절", "유전자 발현량", "유전자 발현의 조절 단계", "유전자 부동", "유전자 빈도", "유전자 재조합", "유전자 조절", "유전자 편집", "유전자 풀", "유전자 흐름", "유전자형", "유전적 다양성", "유전적 변이", "유전적 병목", "유전적 부동", "유전적 차이", "유전적 표류", "유효 숫자", "유효 충돌", "유효숫자", "음성 되먹임", "음이온", "응력", "응집력", "이동 거리", "이상 기체", "이온", "이온 결합", "이온화", "이온화 에너지", "이온화도", "이차 전령", "인과 모형", "일률", "일주기 리듬", "임계각", "입자 간 인력", "입자 충돌 빈도", "입자 충돌 이론", "자극 수용", "자극과 반응", "자기 선속", "자기장의 변화", "자료 구조", "자료 해석의 불확실성", "자료의 오차 원인", "자연 선택", "자연 순환", "자연선택", "자원 효율성", "자유 낙하 운동", "자율 신경계", "작용·반작용", "잠열", "재결정", "적색 편이", "적외선", "적응 방산", "적정", "전극", "전극 반응", "전극 전위", "전기 도금", "전기 분해 장치", "전기 쌍극자", "전기 에너지 전환", "전기 음성도", "전기 음성도 차", "전기 저항", "전기 저항률", "전기력", "전기력선", "전기장", "전기장 세기", "전기적 상호 작용", "전기적 중성", "전기화학 전지", "전단력", "전도성 고분자", "전력", "전력량", "전류의 세기", "전반사", "전사", "전선", "전압 강하", "전자", "전자 배치", "전자 전이", "전자기 유도", "전자기력", "전자기파", "전자껍질", "전자쌍 반발", "전지 전압", "전하", "전하 분포", "전하량", "전해질", "전해질 용액", "절대 연령", "정상파", "종 균등도", "종 다양성", "종 풍부도", "종간 경쟁", "종분화", "줄기세포", "중력 가속도", "중성자", "중화", "중화 적정", "중화점", "증발산", "증산량", "지구 복사 균형", "지구 시스템", "지구 에너지 수지", "지구 환경의 변화", "지시약", "지질 구조", "지질 시대", "지질 연대", "지질 연대 측정", "지질 작용", "지층 대비", "지하수 함양", "진동 주기", "진동수", "진핵생물", "진화적 안정 전략", "질량 중심", "질병 감시", "질소 순환", "집단 면역", "짝산", "짝염기", "창시자 효과", "체적 팽창", "촉매의 선택성", "촉매의 활성", "최적 온도", "추천 알고리즘", "충격량", "충돌 횟수", "측정 도구의 눈금", "측정 분해능", "측정 불확도", "측정 장치의 분해능", "측정 재현성", "측정의 검출 한계", "측정의 반복성", "측정의 불확도", "측정의 재현성", "측정의 정밀성", "친수성", "침입종", "침전 반응", "크로마토그래피", "탄성 한계", "탄소 격리", "탄소 고정", "탄소 배출", "탄소 순환", "탄소 저장", "탄소 저장고", "탄소 집약도", "탄소 흡수", "탄소 흡수원", "토양 산도", "토양 완충 능력", "퇴적 환경", "파동 간섭", "파동 함수", "파동의 간섭", "파동의 속력", "파동의 에너지 전달", "파동의 위상", "파동의 위상차", "파동의 중첩", "파동의 진동수", "파동의 파장", "파면", "판 구조론", "편광", "편광판", "평균 속도", "평균 운동 에너지", "평형 상수", "평형 상태", "평형 이동", "폭염 일수", "표현형", "하천 유량", "한계 반응물", "항상성 유지", "항상성 조절", "항상성의 유지", "항생제 감수성", "항생제 내성", "항원", "항원 항체 반응", "해구", "해령", "해수 순환", "해양 산성화", "해양 순환", "해양성 기후", "핵분열", "핵융합", "행성 경계", "혈당 조절", "혈당 항상성", "혈액형", "혈장", "호르몬 조절", "호르몬의 작용", "호흡량", "화학 결합", "화학 반응식의 계수", "화학 반응의 양적 관계", "화학 평형", "화학 평형 상수", "화학 평형 이동", "화학식량", "화학적 변화의 증거", "화학적 성질", "화합물", "확산 속도", "환경 노출", "환경 노출도", "환경 변화의 지표", "환경 수용력", "환경 스트레스", "환경 스트레스 요인", "환경 용량", "환경 지표", "환원 반응", "환원제", "활동 전위", "활성 부위", "활성화 에너지", "회로의 개방", "회로의 단락", "회절", "회절 무늬", "회절격자", "효소 활성", "후성 유전", "후성유전", "후성적 변화", "흔적 기관", "흡착", "힘의 모멘트", "힘의 합성", "꾸미는 말", "이어 주는 말", "이어주는 말", "임자말", "풀이말", "명사", "동사", "형용사", "부사", "관형사", "대명사", "수사", "조사", "어미", "주어", "서술어", "목적어", "보어", "관형어", "부사어", "독립어", "문장 성분", "보조사", "격조사", "접속 조사", "접속조사", "문장의 짜임", "어절", "음운", "음소"];
export const GENERAL_SCIENCE_WORDS=["가변성", "가역성", "간섭", "간헐적", "개체", "격리", "경향성", "규명하다", "기인하다", "내성", "매개체", "농도", "밀도", "발생", "변이", "번역", "부식", "부식성", "불가역성", "불연속", "비가시적", "비가역성", "상호작용", "생리적", "생체", "설계", "실증적", "연속성", "예측하다", "암호화", "복호화", "정량화", "정량화하다", "정밀도", "정확도", "진화", "추출하다", "탐색하다", "환원", "흡수", "촉매", "임계점", "탄소 중립", "염증", "잠복기", "재현성", "재현 가능성", "정보량", "적응도", "포자", "우성", "췌장", "태아", "조류", "생물다양성", "생물 다양성", "면역", "신진대사", "항생제", "항생물질", "호르몬", "유전자", "진앙", "파장", "주파수", "폐활량"];
const generalScienceKeys=new Set(GENERAL_SCIENCE_WORDS.map(w=>w.replace(/\s+/gu,'')));
const generalReasoningKeys=new Set(GENERAL_REASONING_WORDS.map(w=>w.replace(/\s+/gu,'')));
const specialistKeys=new Set(SPECIALIST_TARGETS.map(w=>w.replace(/\s+/gu,'')));
const contextOnlyKeys=new Set(CONTEXT_ONLY_EXPRESSIONS.map(w=>w.replace(/\s+/gu,'')));
export function isLearningTarget(word,domain='',band=0){const text=String(word||'').normalize('NFKC').trim(),key=text.replace(/\s+/gu,'');return !!text&&!contextOnlyKeys.has(key)&&!specialistKeys.has(key)&&(!/수학/.test(domain)||generalReasoningKeys.has(key))&&(!(domain==='과학'&&Number(band)>=6)||generalScienceKeys.has(key))}
export const LEARNING_TYPES=['mc_context','mc_usage','subjective_context','subjective_dialogue','mc_relation','mc_structure','mc_reading','subjective_use'];
export const LEARNING_LABELS={mc_context:'문맥 선택',mc_usage:'쓰임 구별',subjective_context:'스스로 떠올리기',subjective_dialogue:'대화 속 회상',mc_relation:'의미 연결',mc_structure:'단어 구성',mc_reading:'새 글 이해',subjective_use:'내 문장 만들기'};
export const STAGE_LABELS={check:'지난 단어 확인',bridge:'의미 연결',recall:'간격을 둔 회상',transfer:'새 문맥에 적용',use:'직접 사용',diagnostic:'시작 수준 확인'};
export const STRUCTURE_NOTES={재사용:'재-는 다시라는 뜻이에요. 재사용은 이미 쓴 것을 다시 쓰는 것이에요.',재활용:'재-는 다시라는 뜻이에요. 재활용은 버리는 것을 다시 쓸 수 있게 만드는 것이에요.',불가능:'불-은 그렇지 않다는 뜻이에요. 불가능은 할 수 없다는 뜻이에요.',불필요:'불-은 그렇지 않다는 뜻이에요. 불필요는 필요하지 않다는 뜻이에요.',비공개:'비-는 그렇지 않다는 뜻이에요. 비공개는 모두에게 드러내지 않는 것이에요.',비공식:'비-는 그렇지 않다는 뜻이에요. 비공식은 공식적인 절차나 형식을 따르지 않는다는 뜻이에요.',맨손:'맨-은 아무것도 걸치거나 쥐지 않은 상태를 나타내요. 맨손은 아무것도 쥐지 않은 손이에요.',풋사과:'풋-은 아직 덜 익었다는 뜻이에요. 풋사과는 아직 덜 익은 사과예요.'};
export function learningDay(date=new Date()){return new Date(date.getTime()+9*3600000).toISOString().slice(0,10)}
export function daysBetween(a,b){if(!a||!b)return 0;const n=(Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000;return Number.isFinite(n)?Math.max(0,Math.floor(n)):0}
export function dateAfter(day,n){return new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10)}
export function studyBudget(learner,day=learningDay()){
 const studied=Object.entries(learner.words||{}).filter(([w,s])=>isLearningTarget(w)&&(s.seen>0||s.introducedAt)).map(([,s])=>s);
 const due=studied.filter(s=>!s.nextReviewAt||s.nextReviewAt<=day).length;
 const taught=studied.filter(s=>s.introducedAt&&daysBetween(s.introducedAt,day)<7);
 const todayCount=taught.filter(s=>s.introducedAt===day).length;
 const newCount=Math.max(0,3-todayCount);
 return {policy:'daily-3-20-25-flex',due,newCount,weeklyNew:taught.length,weeklyLimit:21,dailyLimit:3,target:20,minutes:20,maxMinutes:25,pauseMinutes:25,limit:20};
}
export function buildLearningPlan(newWords,reviewWords,total=20,mode='daily',getState=()=>({})){
 const plans=[],usage=new Map(),fresh=new Set(newWords.map(w=>w.w)),all=[...reviewWords,...newWords],cardAssigned=new Set();
 if(!all.length)return plans;
 const core=Math.min(20,total);
 let slot=0,last='';
 const pick=pool=>{
  const list=(pool.length?pool:all).slice().sort((a,b)=>(usage.get(a.w)||0)-(usage.get(b.w)||0));
  return list.find(w=>w.w!==last)||list[0];
 };
 const add=(w,type,stage)=>{
  if(!w||plans.length>=total)return;
  const st=getState(w.w)||{},needsCard=mode==='daily'&&fresh.has(w.w)&&!cardAssigned.has(w.w);
  if(needsCard)cardAssigned.add(w.w);
  plans.push({id:String(plans.length),type,w,stage,needsCard,practiceOnly:mode!=='level'&&!fresh.has(w.w)&&!!st.nextReviewAt&&st.nextReviewAt>learningDay(),structureNote:STRUCTURE_NOTES[w.w]||'',answerSlot:type.startsWith('mc_')?slot++%5:0,supportLevel:st.supportLevel||0,successStreak:st.streak||0,firstLearning:!st.seen&&!st.introducedAt});
  usage.set(w.w,(usage.get(w.w)||0)+1);last=w.w;
 };
 if(mode==='level'){
  for(let i=0;i<total;i++)add(pick(all),['mc_context','subjective_context','mc_usage','subjective_dialogue'][i%4],'diagnostic');
  return plans;
 }
 // Uncued review precedes every teaching card and meaning prompt.
 for(const w of reviewWords.slice(0,6))add(w,plans.length%2?'subjective_dialogue':'subjective_context','check');
 const bridgePool=reviewWords.length?reviewWords:newWords;
 for(let i=0;i<3&&plans.length<core-4;i++){
  const w=pick(bridgePool);add(w,STRUCTURE_NOTES[w.w]&&i%2===0?'mc_structure':i%2?'mc_usage':'mc_relation','bridge');
 }
 let freshIndex=0,recognitionLeft=6,recallLeft=Math.max(0,7-Math.min(6,reviewWords.length));
 while(plans.length<core-4){
  const w=freshIndex<newWords.length?newWords[freshIndex++]:pick(all);
  const recognition=recognitionLeft>0&&(recallLeft===0||plans.length%2===0);
  add(w,recognition?(recognitionLeft%2?'mc_usage':'mc_context'):(recallLeft%2?'subjective_dialogue':'subjective_context'),'recall');
  if(recognition)recognitionLeft--;else recallLeft--;
 }
 const applicationPool=newWords.length?newWords:all;
 for(let i=0;i<2;i++)add(pick(applicationPool),i%2?'subjective_context':'mc_reading','transfer');
 for(let i=0;i<2;i++)add(pick(applicationPool),'subjective_use','use');
 while(plans.length<total)add(pick(all),plans.length%2?'mc_usage':'subjective_context','bridge');
 return plans;
}
export function masteryConfirmed(st){return (st.independentRecallDays||[]).length>=3&&(st.retention7?.success||0)>=1&&(st.useDays||[]).length>=1}
export function recordLearningEvidence(learner,st,q,rec,day=learningDay()){
 const shown=!!q.showTarget,firstAttempt=!rec.practiceOnly,full=rec.credit>=1&&!rec.hintUsed&&!rec.revealed;
 const lag=daysBetween(st.lastExposureAt||st.lastFeedbackDate||st.introducedAt,day);
 const kind=q.type==='subjective_use'?'use':q.type==='mc_reading'?'transfer':q.type.startsWith('mc_')?'recognition':'recall';
 const success=full&&(kind==='recall'?rec.targetRecall:true);
 const unpromptedRecall=kind==='recall'&&!shown&&firstAttempt;
 const evidence={date:day,word:q.w.w,kind,success,lagDays:lag,band:q.w.band||3,independent:full&&!shown,firstAttempt};
 // Full sentences show the target and are never evidence of spontaneous recall.
 if(kind==='use'&&success){st.useDays=[...new Set([...(st.useDays||[]),day])];st.useSuccess=(st.useSuccess||0)+1}
 if(unpromptedRecall&&success)st.independentRecallDays=[...new Set([...(st.independentRecallDays||[]),day])];
 if(unpromptedRecall&&lag>=7){const key=lag>=30?'retention30':'retention7';st[key]={attempts:(st[key]?.attempts||0)+1,success:(st[key]?.success||0)+(success?1:0)}}
 learner.learningEvidence=[...(learner.learningEvidence||[]),evidence].slice(-400);
 st.researchMastered=masteryConfirmed(st);
 st.lastExposureAt=day;
 return {...evidence,unpromptedRecall};
}
export function researchSchedule(st,evidence,rec,day=learningDay()){
 if(rec.practiceOnly&&rec.credit>=1&&!rec.hintUsed&&!rec.revealed)return;
 let interval=1;
 if(evidence.unpromptedRecall&&evidence.success){
  if(st.lastIndependentRecallAt===day)return;
  const intervals=[1,3,7,14,30,60],stage=Math.min(5,st.recallStage||0);
  interval=intervals[stage];st.recallStage=Math.min(5,stage+1);st.lastIndependentRecallAt=day;
 }else if(rec.credit<1||rec.hintUsed||rec.revealed){st.recallStage=0}
 else{
  // Recognition and prompted use do not advance the direct-recall schedule.
  if(st.nextReviewAt&&st.nextReviewAt>day&&st.nextReviewAt<dateAfter(day,interval))return;
 }
 st.lastReviewAt=day;st.nextReviewAt=dateAfter(day,interval);
}
export function updateLearningLevels(learner,results,day=learningDay()){
 const previousLeague=Number(learner.leagueLevel??learner.difficulty)||2;
 const eligible=(learner.learningEvidence||[]).filter(x=>isLearningTarget(x.word)&&x.kind==='recall'&&x.firstAttempt&&x.lagDays>=1&&daysBetween(x.date,day)<=30);
 const current=eligible.filter(x=>x.date===day);
 if(current.length>=4&&learner.lastTeachingAdjustment!==day){
  const ratio=current.filter(x=>x.success).length/current.length;
  const delta=ratio>=.85?.15:ratio<.5?-.2:0;
  learner.difficulty=Math.max(1,Math.min(9,Math.round((learner.difficulty+delta)*100)/100));learner.lastTeachingAdjustment=day;
 }
 // Use the latest observation per word/day, across multiple days; never a rolling six-answer boost.
 const samples=[...new Map(eligible.map(x=>[x.date+'|'+x.word,x])).values()].slice(-24);
 if(samples.length>=12&&new Set(samples.map(x=>x.word)).size>=8&&new Set(samples.map(x=>x.date)).size>=3&&learner.lastLeagueAdjustment!==day){
  const ratio=samples.filter(x=>x.success).length/samples.length;
  const delta=ratio>=.85?.2:ratio<.45?-.2:0;
  const meanBand=samples.reduce((n,x)=>n+x.band,0)/samples.length;
  // Easy items cannot certify a harder tier; raising requires items around the current tier.
  const allowed=delta>0&&meanBand<previousLeague-.5?0:delta;
  learner.leagueLevel=Math.max(1,Math.min(9,Math.round((previousLeague+allowed)*10)/10));
  learner.lastLeagueAdjustment=day;learner.abilityEvidence={date:day,samples:samples.length,words:new Set(samples.map(x=>x.word)).size,days:new Set(samples.map(x=>x.date)).size,recallRate:ratio};
 }else if(learner.leagueLevel==null)learner.leagueLevel=previousLeague;
}
export function summarizeEvidence(learner){
 const entries=(learner.learningEvidence||[]).filter(x=>isLearningTarget(x.word));
 const stat=filter=>{const xs=entries.filter(filter);return {attempts:xs.length,success:xs.filter(x=>x.success).length,percent:xs.length?Math.round(xs.filter(x=>x.success).length/xs.length*100):null}};
 return {recognition:stat(x=>x.kind==='recognition'&&x.firstAttempt),recall:stat(x=>x.kind==='recall'&&x.firstAttempt&&x.lagDays>=1),use:stat(x=>x.kind==='use'),transfer:stat(x=>x.kind==='transfer'&&x.firstAttempt),retention7:stat(x=>x.kind==='recall'&&x.firstAttempt&&x.lagDays>=7&&x.lagDays<30),retention30:stat(x=>x.kind==='recall'&&x.firstAttempt&&x.lagDays>=30),mastered:Object.entries(learner.words||{}).filter(([w,s])=>isLearningTarget(w)&&masteryConfirmed(s)).length};
}
