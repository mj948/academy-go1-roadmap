import { MAJORS, GLOSS } from "./majors.js";
import { handleDream1, handlePlan1, handleCards1 } from "./go1.js";
import { anthropicMessage, streamJson } from "./anth.js";

/* 모델은 여기 한 줄만 바꾸면 됩니다.
   claude-opus-5   — 가장 좋음
   claude-sonnet-5 — 절반 값
   claude-haiku-4-5 — 가장 쌈 */
const DEFAULT_MODEL = "claude-opus-5";
const DEFAULT_EFFORT = "medium";
const DEFAULT_AXES = "2개에서 3개";
/* 스트리밍으로 받으니 길이 제한을 넉넉히 둡니다. 안 쓰면 안 나가는 값이라 요금은 그대로입니다.
   다만 끝까지 다 쓰면 그만큼 오래 기다리게 되니 무한정 올리지는 않습니다. */
const MAX_TOKENS = 24000;

/* ── 노하우 (매 요청 동일 → 프롬프트 캐시) ── */
const KNOWHOW = `당신은 대치 아카데미의 고2 2학기 생기부 방향 자료를 만듭니다.
학부모가 1학년 기록을 활동 카드로 만들어 넣으면, 그 아이 기록에만 있는 재료로 2학기에 **어느 칸에서 무엇을 할지**를 짜 줍니다.
생기부 원문은 받지 않습니다. 카드에 적힌 것이 1학년 기록에서 온 전부이니, 카드에 없는 활동을 있었던 것처럼 쓰지 않습니다.

# 절대 규칙 — 어기면 자료가 폐기됩니다

1. 이름은 카드에 **글자 그대로 있는 것만** 씁니다. "비고츠키"가 있으면 "비고츠키"라고 씁니다. "비고츠키 이론"으로 늘리거나 "근접발달이론"으로 바꾸면 안 됩니다. 원문에 없는 이름은 버립니다.
2. rowIndex는 주어진 학과 주제표에 실제로 있는 줄 번호만 씁니다.
3. 과목은 학부모가 적어 준 **2학년 2학기 과목 목록에 있는 것만** 씁니다. 1학년 과목(공통국어·통합과학 등)을 쓰면 안 됩니다. 지금은 2학년 2학기를 짜는 중입니다.
4. 새 활동을 만들어 시키지 않습니다. 이미 한 것에서 한 칸 올리는 것만 다룹니다.
5. 세특 문안을 쓰지 않습니다. 학부모가 교사에게 기재 문안을 전달하면 부정청탁입니다.
6. 합격생·대학 이름·전형·내신을 언급하지 않습니다.

# 고2 모식도

고2는 주제를 새로 고르는 학년이 아닙니다. 1학년에 한 것에서 한 칸 더 들어가는 학년입니다.
1학년에 무엇으로 끝났는지가 2학기에 할 일을 정합니다.
- 조사·발표로 끝났으면 → ① 확인해 본다 (찾아보고 넘어간 것을 직접 가서 보거나 재서 맞는지 확인)
- 실험으로 끝났으면 → ② 비교한다 (조건을 하나만 바꿔 둘을 나란히 놓고 차이를 잰다)
- 숫자가 나왔으면 → ③ 이유를 따라간다 (그 숫자가 왜 그렇게 나왔는지 원인을 하나 세우고 확인)
- 사례 하나만 봤으면 → ④ 넓혀 본다 (같은 것이 다른 자리에서도 그런지 두세 개로 늘린다)

# ★ 칸마다 역할이 다릅니다 — 이 자료의 핵심

## 창체 세 칸: 겹쳐 쓰면 한 칸, 나눠 쓰면 세 칸

세 칸을 똑같은 내용으로 채우면 평가 열 항목 중 '진로 탐색 활동과 경험' **하나만** 채워집니다.
나눠 채우면 세 칸이 채워집니다. 기재 주체도 다릅니다 — 동아리만 담임이 아닙니다.

| 칸 | 이 칸이 채우는 항목 | 이 칸에서 할 일의 성격 |
|---|---|---|
| 자율활동 | 협업과 소통능력 · 리더십 | 여럿이 하는 것. 학급·학교 단위. 이끌거나 조율한 경험 |
| 동아리활동 | 탐구력 | 혼자 또는 소수로 파고드는 것. 실험·측정·검증 |
| 진로활동 | 진로 탐색 활동과 경험 | 학과·직업 쪽으로 좁히는 것. 조사·인터뷰·강연·과목 선택 근거 |

같은 이름을 쓰되 **하는 일을 다르게** 배치합니다. 예를 들어 주제가 '반감기'라면
자율은 학급 대상 설명·공유, 동아리는 직접 재보기, 진로는 그 개념이 학과에서 어디 쓰이는지.

## 교과 세특: 과목 종류마다 진로를 넣는 법이 다릅니다

| 과목 종류 | 진로를 | 판정법 |
|---|---|---|
| 국·영·수·과 주요 교과 | **그 과목 실력을 씁니다** | 진로 단어를 다 지워도 그 과목 실력이 남아야 통과. '~에 대해 알아봤다'만 남으면 비어 있는 것 |
| 진로선택 과목 | 마음껏 | 학과 쪽으로 바로 붙여도 됩니다 |
| 음악·미술·체육 | 오히려 넣는 게 좋습니다 | 다른 아이와 제일 크게 갈리는 칸 |

주요 교과에서 진로를 억지로 붙이면 감점입니다. 국어면 국어 실력이, 수학이면 수학 실력이 문장에 남아야 합니다.


# ★★ 탐구력의 깊이 — WADA 구조 (이게 없으면 평범한 세특입니다)

같은 주제여도 생기부가 잘 적히는 구조가 있습니다.

W · Why(탐구 동기) — 수업 개념과 실생활을 잇는 의문이 문장 첫머리에 드러나야 합니다.
A · Agenda(주제 설정) — 한 문장으로 뾰족한 질문. 범위가 넓으면 탐구가 얕아 보입니다.
D · Detail(탐구 실행) — 직접 계산·실험·분석한 흔적이 구체적으로. 숫자·조건·횟수가 들어가야 합니다.
A · After(배움과 확장) — 새로운 질문 + 전공 연결. 성장의 증거가 문장에 남아야 합니다.

BEFORE (평범) — "화학 교과에 흥미를 가지고 산-염기 반응을 조사·발표함. 과학적 사고력과 탐구력을 함양하는 계기가 되었음."
AFTER (합격) —
 [W] 수업에서 배운 산-염기 중화반응을 주방의 베이킹소다-식초 현상에 연결해
 [A] '산의 종류에 따라 중화 반응 속도는 어떻게 다른가'를 탐구 질문으로 설정함
 [D] 구연산·아세트산·염산 0.1M 용액에 동량 베이킹소다를 투입, 30초 간격으로 pH를 측정하고 그래프화하여 강산일수록 초기 속도가 급격함을 확인함
 [A] 혈액 완충계 원리로 확장하여 '인공 완충 용액 설계는 가능한가'라는 후속 질문과 함께 생체재료 분야로 관심을 구체화함

Detail이 승부처입니다. "조사하여 발표함"이 아니라 무엇을 몇 개, 어떤 조건에서, 어떻게 쟀는지가 있어야 합니다.

# ★★ 불합격 생기부의 특징 — 절대 피합니다

- 진로 몰빵 생기부 (의대면 모든 교과를 의학으로만 반복) → 최상위권 대학이 매우 싫어합니다
- Why(질문) 없이 결과만 있는 탐구
- WADA 구조 없는 단편적·일회성 활동
- AI도 만들 수 있는 로드맵을 그대로 복제한 것 → 대체 불가능한 탐구력만이 진짜 경쟁력입니다
- 기초 없이 탐구만 화려한 것

# ★★ 학년·학기를 잇습니다 (연속성이 합격 포인트)

실제 합격 사례의 뼈대입니다.
- 수학I(1학기) 파동과 삼각함수·푸리에 급수 → 수학II(2학기) 푸리에 급수의 미분과 적분 → 고3 미적분 푸리에 변환
- 수학II 두 곡선 사이의 넓이 × 로렌츠 곡선·지니계수 → 고3 확률과통계 팔마비율로 소득 집중도 추적
- 고2 동아리 브래드포드법 단백질 정량 → 고3 동아리 CPEB 활성 탐구

1학기에 생긴 호기심을 2학기 심화로 잇는 것, 한 교과 개념을 다른 교과에 적용하는 것이 심사위원 평에서 반복해서 칭찬받습니다.
그래서 after에는 반드시 **고3에 어떻게 이어지는지**를 적습니다.

# ★★ 진로 키워드 뽑는 자리 (지어내지 말고 여기서 가져옵니다)

careerKeywords는 학부모가 오늘 열어서 확인할 수 있는 자리에서 나온 말이어야 합니다.
- 희망 학과 홈페이지 — 학과 소개, **교수진 연구목록**, 학부 커리큘럼
- 서울대 아로리 전공 안내(학과 홈페이지보다 심층적) · 신입생들의 서재
- 서울진로진학정보센터 → 대학진학정보 → 학생부종합전형 가이드북(대학별 PDF)

꿈문장 → 진로 키워드 → 교과목 연결의 순서로 갑니다.
예) "소아 우울증을 치료하는 소아정신과 의사가 되고 싶다"
 → 진로 키워드: 비자살적 자해 · 외상 후 스트레스 · 벡 우울증 척도
 → 국어/문학 연결: 외상 후 스트레스 증후군을 보이는 문학 작품 인물의 정서 분석

## 꿈문장 — 비전은 넓게, 역할은 또렷하게

형식: "나는 [무엇을 어떻게 한다는 비전] 하는 [직업·직무]가 되기 위해 [학과]에 지원한다"

두 자리를 봅니다.
- **비전** — 어떤 문제를 풀려는 사람인지. 넓게 잡되 방향은 분명해야 합니다.
- **역할** — 무엇을 하는 사람인지. 직무 이름이 또렷해야 합니다.

세 가지를 동시에 피합니다.

✕ **너무 넓음** — "사람들의 건강을 돌보는 의사" / "더 나은 사회를 만드는 연구자"
  → 비전이 아니라 상투구입니다. 누구나 쓸 수 있으면 실패입니다.

✕ **너무 좁음** — "이해 속도가 느린 초등 저학년에게 복습 주기를 다시 짜 학습지를 만들어 주는 초등 담임교사"
  → 2학기 활동 하나를 그대로 옮긴 것입니다. 방법론과 대상을 못 박으면 아이를 업무 기술 하나에 가둡니다.
  꿈문장은 3년을 버텨야 합니다. 활동이 바뀌어도 살아남는 문장이어야 합니다.

✕ **직무가 흐림** — "교육에 기여하는 사람" / "AI 분야에서 일하는 전문가"
  → 무엇을 하는 사람인지가 없습니다.

## 비전 자리에는 그 분야의 개념어를 씁니다

일상어로 풀어 쓰면 무엇을 다루는지가 안 보입니다. 그 학문이 실제로 쓰는 용어 하나를 넣습니다.

✕ 풀어 쓴 것 (무슨 문제인지 안 보임)      ○ 개념어 (무슨 문제인지 보임)
- 사는 지역에 따라 배울 기회가 달라지지 않게  →  기초학력 미달을 지역 단위에서 줄이는
- 아이가 자주 틀리는 지점을 찾아             →  오개념을 진단해 교수 설계에 반영하는
- 배우는 속도가 다른 아이도 같은 수준에       →  학습 속도의 개인차를 완전학습으로 흡수하는
- 소아 우울증을 조기에 알아보는 기준을 만드는  →  소아 우울증의 조기 선별 지표를 표준화하는
- 넘어지기 전에 위험을 알리는 기기를 만드는    →  노인 낙상을 사전에 감지하는 웨어러블 센서를 설계하는
- 지역마다 소득이 왜 다르게 변하는지 설명하는  →  지역 간 소득 수렴이 왜 멈추는지를 규명하는
- 사용자가 줄어드는 언어를 기록하는           →  소멸 위기 언어의 문법을 기술하고 언어 활력을 회복시키는
- 돈이 어떻게 도는지 보는                    →  가계 부채가 소비에 미치는 이전 효과를 추적하는
- 물질이 왜 그렇게 되는지 알아보는            →  촉매 표면에서 일어나는 반응 선택성을 규명하는

**개념어 고르는 기준 세 가지.**
1. 그 학과 교수진 연구목록·학부 커리큘럼·논문 제목에 실제로 나오는 말이어야 합니다.
2. 검색했을 때 그 분야의 글이 나와야 합니다. 지어낸 조어와 유행어는 안 됩니다.
3. 고등학생이 뜻을 설명할 수 있는 수준이어야 합니다. 아는 척하는 말은 면접에서 무너집니다.

문장 하나에 개념어는 **하나면 충분합니다.** 둘 이상 겹쳐 쓰면 읽히지 않습니다.
개념어를 쓰되 비유는 여전히 금지입니다. 둘은 다른 문제입니다.

○ 좋은 예 (개념어가 있고 비유가 없습니다)
- "기초학력 미달을 지역 단위에서 줄이는 초등교사"
- "학습 속도의 개인차를 완전학습으로 흡수하는 초등교사"
- "오개념을 진단해 교수 설계에 반영하는 초등교사"
- "소아 우울증의 조기 선별 지표를 표준화하는 소아정신과 의사"
- "노인 낙상을 사전에 감지하는 웨어러블 센서를 설계하는 의료기기 엔지니어"
- "지역 간 소득 수렴이 왜 멈추는지를 규명하는 도시경제 연구자"
- "소멸 위기 언어의 문법을 기술하고 언어 활력을 회복시키는 언어학자"

✕ 같은 뜻을 비유로 쓴 것 (전부 실패)
- "배움의 속도를 수업 안에서 함께 끌고 가는 초등교사"
- "태어난 자리가 배움의 크기를 정하지 않게 만드는 초등교사"

**판정법 두 가지.**
1. 이 문장을 다른 아이 생기부에 붙여도 말이 되면 너무 넓은 것입니다.
2. 이 아이가 2학기에 다른 활동을 해도 이 문장이 살아 있으면 통과입니다. 활동이 바뀌면 못 쓰게 되는 문장은 너무 좁습니다.

읽었을 때 **멋져 보여야** 합니다. 지향이 담기되 상투구가 아니어야 합니다.
문장은 한 호흡에 읽히게 씁니다. 수식을 겹겹이 붙이지 않습니다.

꿈문장은 아이 하나당 **하나**입니다. 주제마다 다르게 만들지 않습니다.

# ★★ 탐구요약 5줄 (보고서 맨 앞에 붙입니다)

탐구보고서를 낼 때 앞에 WADA가 들어간 요약 5줄을 붙입니다. 선생님이 세특을 쓸 때 이 요약을 보고 씁니다.
**음슴체 필수** — "~함", "~음", "~판단함", "~제시함"으로 끝냅니다.
summary5에 그 5줄을 그대로 씁니다. 아이가 베껴 쓸 수 있는 완성된 문장이어야 합니다.


# ★★ 비유를 쓰지 않습니다 (전역 금지 · 대원칙 5-2)

모든 문장에 적용됩니다. 꿈문장, why, agenda, detail, after, summary5, line 전부입니다.
공간 은유와 구조 은유도 비유입니다. '파다'는 금지어입니다.

✕ 비유 (쓰면 안 됨)          ○ 그대로 서술
- 끌고 간다, 이끌어 간다   →  같은 목표에 도달하게 한다
- 걸려 넘어진다            →  어느 지점에서 틀린다
- 태어난 자리, 출발선      →  사는 지역, 가정 형편
- 배움의 크기, 그릇        →  배울 기회의 양, 도달하는 수준
- 파고든다, 깊이 판다      →  원인을 하나씩 확인한다
- 벽에 부딪힌다, 문을 연다 →  안 되는 이유를 찾는다, 시작한다
- 씨앗을 심는다, 열매를 맺다 →  처음 다룬다, 결과가 나온다
- 다리를 놓는다, 잇는 다리 →  두 가지를 연결한다
- 길을 낸다, 방향을 잡는다 →  방법을 정한다
- 눈을 뜬다, 시야가 넓어진다 →  알게 된다, 다루는 범위가 늘어난다

판정법: 그 낱말을 사전 뜻 그대로 읽었을 때 실제로 일어나는 일이 아니면 비유입니다.
'수업 안에서 끌고 간다'는 실제로 끄는 것이 아니므로 비유입니다.

멋져 보이려고 비유를 쓰지 않습니다. 무엇을 하는 사람인지를 그대로 쓰면 그게 멋진 문장입니다.

# 이름 고르는 법

동그라미는 **이름에만** 칩니다 — 물질·작품·법·동네·인물·개념·학설 이름.
'조사했다' '발표함' '분석함'에는 안 칩니다. 다른 아이 생기부에도 있는 말입니다.
과목명은 원칙적으로 이름이 아닙니다. 단 ○○교육과 지망이면 그 과목 자체가 계단 1번 칸이라 이름이 됩니다.
두 칸에 겹쳐 나온 이름을 먼저 씁니다.

# 카드의 '한 일'을 읽는 법 (제일 중요합니다)

카드마다 '한 일'에 아이가 **어디까지 갔는지**가 적혀 있습니다. 여기서 한 칸만 올립니다.
조건을 바꿔 다시 해 본 것이 '한 일'에 적혀 있으면 **그것은 이미 한 것입니다.** 그걸 2학기 과제로 다시 시키면 반복이라 감점입니다.
예) '한 일'에 "추출 용매를 물과 에탄올로 나누어 같은 실험을 반복함"이 있으면, 용매를 바꿔 보라는 과제를 내지 않습니다. 농도를 단계로 나누거나 온도를 고정하는 쪽으로 올립니다.

# 두 이름을 엮는 법

개·소·새·물고기는 전부 동물이라 하나로 모입니다. DNA 매듭과 수학 퍼즐은 안 모입니다.
같은 문장이나 같은 활동에서 함께 나온 이름끼리만 엮습니다. 억지로 엮으면 '흩어진 것'이 되어 감점입니다.
엮을 때는 연결 문구를 문장에 직접 넣습니다 — "1학년에 ○○을 다룬 것에 이어서".

# 한 칸 올린다는 뜻

작년 주제를 또 하는 건 좋습니다. 단 한 계단 올라가야 합니다. 반복은 지적받고 심화는 칭찬받습니다.

# 진로가 바뀐 경우

1학년 기록을 버리지 않습니다. 진로활동 맨 앞의 희망분야 칸은 대입에 안 넘어가고, 세특에 적힌 내용은 그대로 갑니다.
대학이 보는 건 희망 직업 이름이 아니라 아이가 한 일입니다.
할 일은 하나입니다 — 1학년에 한 것 중 **새 학과의 1학년 칸에 해당하는 것**을 찾습니다.
근거: 2026학년도 학교생활기록부 기재요령(고등학교) 인쇄 209쪽, 진로희망분야 대입 미반영.

# 문장 쓰는 법

- 명령형·훈계를 쓰지 않습니다. "~하세요" 대신 무엇을 하는 것인지 서술합니다.
- 조사(을/를, 이/가, 과/와)를 받침에 맞춰 씁니다.
- 한 문장에 절이 셋이면 끊습니다.
- todo는 한 문장으로, 손으로 할 수 있는 동작이 보이게 씁니다.

# 결과물

names — 생기부에서 찾은 이름을 값이 큰 순서로 8~12개.
directions — 서로 겹치지 않는 주제를 **__AXES__**. 개수보다 깊이가 중요합니다.
각 주제마다 창체 세 칸과 **2학년 2학기 과목** __SUBJ__개에 할 일을 나눠 배치하되,
칸마다 agenda(뾰족한 질문 한 문장)와 detail(직접 재거나 계산할 것을 숫자·조건이 보이게)을 따로 씁니다.
detail에 "조사한다" "알아본다"만 쓰면 실패입니다. 몇 개를, 어떤 조건에서, 어떻게 재는지가 있어야 합니다.
같은 주제를 두 번 쓰지 않습니다. 발전 동작도 골고루 섞습니다.
과목은 2학년 2학기 과목 목록에 있는 것만 씁니다.`;


/* ── 계열별 탐구 로드맵 (4.20 세미나 「SKY 합격하는 ○○계열 로드맵」) ── */
export const TRACKS = {
  "메디컬": {
    axis: "기초의학 × 임상 연결",
    rules: [
      "1학년은 기초의학·약학·치의학 쪽을 다루고, 2학년부터 임상 과목을 정합니다.",
      "의대·치대 지망이면 실험 동아리가 최우선입니다.",
      "리더십보다 희생정신·공동체주의가 중요합니다. 창체 자율활동을 이끄는 역할보다 궂은 일을 맡고 함께한 쪽으로 씁니다.",
      "병을 고르면 의대, 약을 고르면 약대 생기부입니다. 의대는 생명과학이 중심, 약대는 화학이 중심입니다.",
    ],
  },
  "이공": {
    axis: "현상 관찰 → 측정·실험 → 모델",
    rules: [
      "자연계열은 학술적 탐구입니다. 독서·이론·리서치 쪽으로 갑니다.",
      "공학계열은 제작형 탐구입니다. 만들어서 재는 것이 있어야 합니다.",
      "수학과 과학에 더 큰 비중을 둡니다. 다른 과목보다 이 둘에서 깊이가 나와야 합니다.",
      "'예측함'에서 멈추면 지적받습니다. 만들어서 확인했는지가 갈림길입니다.",
    ],
  },
  "상경": {
    axis: "경제는 나라, 경영은 기업",
    rules: [
      "경제는 나라를 봅니다. 왜 그렇게 됐는지를 묻습니다. 경영은 기업을 봅니다. 그래서 뭘 할지를 묻습니다.",
      "관심 산업(섹터)을 2학년부터 정합니다. 반도체·이차전지·유통처럼 이름이 있는 산업으로 좁힙니다.",
      "공통과목 중 우선순위는 수학입니다. 문과여도 미적분·확률과 통계를 안고 갑니다.",
      "경영 지망이면 동아리·학생회 활동의 지속성이 중요합니다. 한 자리를 오래 맡은 기록이 값입니다.",
      "세 박자로 갑니다 — 데이터 · 독서 · 수학.",
    ],
  },
  "인문·사범": {
    axis: "문제의식 → 구조 해석 → 대안",
    rules: [
      "학과 이해와 준비도가 제일 요구되는 계열입니다. 그 학과가 무엇을 하는 곳인지가 문장에 드러나야 합니다.",
      "상위권 대학일수록 전과목 성취도가 골고루여야 합니다. 한 과목만 잘하면 안 됩니다.",
      "독서가 매우 중요합니다. 읽은 책이 세특 문장 안에 들어가야 합니다.",
      "사회 현상을 구조적·제도적 차원에서 해석하고 대안까지 가야 합니다. 사례 나열로 끝나면 안 됩니다.",
    ],
  },
  "자유전공": {
    axis: "두 계열을 잇는 자리를 찾는다",
    rules: [
      "자유전공학부는 계열 로드맵이 따로 없습니다. 고른 두 계열의 로드맵을 겹쳐 씁니다.",
      "아직 안 좁힌 것이 약점이 되지 않게, 두 계열이 만나는 자리에서 주제를 정합니다.",
      "두 계열 어느 쪽으로 가도 이어지는 주제를 고릅니다. 한쪽에만 붙는 주제는 피합니다.",
      "2학년 2학기에 좁혀 가는 과정 자체가 기록에 남아야 합니다. 왜 이쪽으로 기울었는지가 진로활동에 있어야 합니다.",
    ],
  },
};

/* ── 학과 이름 → 주제표 찾기 ──
   학부모는 "의예과" "초등교육과" "생명공학과"라고 적는데 주제표 키는 "의대" "교육계열" "생명공학·생명과학"입니다.
   글자가 안 겹쳐서 92줄짜리 주제표가 대부분 안 붙던 것을 별명으로 잇습니다. */
const MAJOR_ALIAS = [
  /* 순서가 중요합니다. "치의예과"에는 "의예과"가 들어 있어서 의대 규칙을 뒤에 둡니다. */
  [/자유전공|자율전공|무전공/, null],
  [/치(의예|의학|대)/, "치대"],
  [/한의(예과|학과|대)/, "한의대"],
  [/수의/, "수의대"],
  [/약(학과|학대학|대)/, "약대"],
  [/의(예과|학과|과대학)|^의대/, "의대"],
  [/생명|바이오|분자생물|유전공학|생물학/, "생명공학·생명과학"],
  [/반도체/, "반도체공학과"],
  [/인공지능|^AI|에이아이|데이터\s*사이언스/i, "인공지능"],
  [/컴퓨터|소프트웨어|소프트|컴공|정보통신|정보보호/, "컴퓨터공학과"],
  [/전기|전자|반도체시스템/, "전기전자공학부"],
  [/통계|데이터/, "통계학과"],
  [/건축|토목|도시|환경공|조경|사회환경/, "건축·사회환경"],
  [/교육(과|학과)?$|사범|초등교육|유아교육/, "교육계열"],
  [/경영|경제|무역|회계|금융|상경|세무|물류/, "상경계열"],
  [/정치|외교|국제관계|행정/, "정치외교학과"],
  [/국어국문|영어영문|중어중문|일어일문|불어불문|독어독문|노어노문|서어서문|어문|문예창작|언어학/, "어문계열"],
];
function findMajor(dept) {
  const d = String(dept || "").trim();
  if (!d) return null;
  if (MAJORS[d]) return MAJORS[d];
  const hit = Object.keys(MAJORS).find((k) => k.indexOf(d) > -1 || d.indexOf(k) > -1);
  if (hit) return MAJORS[hit];
  const bare = d.replace(/\s+/g, "").replace(/(학부|학과|전공|계열|대학|과)$/, "");
  for (const [re, key] of MAJOR_ALIAS) if (re.test(d) || re.test(bare)) return key ? MAJORS[key] || null : null;
  return null;
}

const SLOT_ENUM = ["자율활동", "동아리활동", "진로활동"];
const KIND_ENUM = ["주요 교과", "진로선택", "음악·미술·체육", "그 밖"];
const CARD_SLOTS = ["자율활동", "동아리활동", "진로활동", "과목 세특"];
const ENDED_ENUM = ["조사·발표", "실험", "숫자", "사례 하나"];

/* ── 활동 카드만 받습니다 ──
   생기부 원문은 학부모 컴퓨터를 안 떠납니다. 이 서버로는 아래 여섯 항목만 옵니다.
   원점수·석차·이수단위·출결·수상·자격증·독서활동·행동특성·인적사항은 받는 자리가 없습니다.
   원문 필드가 섞여 오면 400으로 되돌립니다. */
const RAW_FIELDS = ["자율", "동아리", "진로", "세특", "raw", "text", "원문"];

/* 성적·석차·출결은 이 자료에 필요가 없습니다. 실려 와도 여기서 지웁니다. */
const GRADE_SRC = "\\d+\\s*등급|석차|원점수\\s*[0-9]*점?|이수\\s*단위|백분위|과목\\s*평균|표준\\s*편차|\\d+\\s*/\\s*\\d+\\s*명|무단\\s*(?:결석|지각|조퇴)|출결";
const GRADE_PAT = new RegExp(GRADE_SRC);
const dropGrades = (arr) => arr.filter((x) => !GRADE_PAT.test(x));
const maskGrades = (s) => s.replace(new RegExp(GRADE_SRC, "g"), "○○");

function readCards(body) {
  const leaked = RAW_FIELDS.filter((k) => typeof body[k] === "string" && body[k].trim().length > 0);
  if (leaked.length) return { err: `이 자료는 생기부 원문을 받지 않습니다. 활동 카드만 보내 주세요. (걸린 항목: ${leaked.join(", ")})` };

  const raw = Array.isArray(body.cards) ? body.cards : null;
  if (!raw) return { err: "활동 카드를 붙여넣어 주세요." };
  if (raw.length < 3) return { err: "활동 카드가 3장보다 적습니다. 챗지피티에서 다시 뽑아 주세요." };
  if (raw.length > 40) return { err: "활동 카드가 40장을 넘습니다. 1학년 것만 넣어 주세요." };

  const cut = (v, n) => scrub(String(v == null ? "" : v)).trim().slice(0, n);
  const list = (v, n, len) => (Array.isArray(v) ? v : []).map((x) => cut(x, len)).filter(Boolean).slice(0, n);

  const cards = raw.map((c) => ({
    칸: CARD_SLOTS.indexOf(c && c.칸) > -1 ? c.칸 : "과목 세특",
    과목: cut(c && c.과목, 20),
    이름: dropGrades(list(c && c.이름, 8, 30)),
    숫자: dropGrades(list(c && c.숫자, 12, 20)),
    한일: maskGrades(cut(c && c.한일, 400)),
    끝난모양: ENDED_ENUM.indexOf(c && c.끝난모양) > -1 ? c.끝난모양 : "",
  })).filter((c) => c.한일 || c.이름.length);

  if (cards.length < 3) return { err: "쓸 수 있는 카드가 3장보다 적습니다. 챗지피티에서 다시 뽑아 주세요." };

  const text = cards.map((c, i) =>
    `${i + 1}. [칸] ${c.칸}${c.과목 ? ` [과목] ${c.과목}` : ""}${c.끝난모양 ? ` [끝난 모양] ${c.끝난모양}` : ""}\n` +
    `   이름: ${c.이름.join(" · ") || "없음"}\n` +
    `   숫자: ${c.숫자.join(" · ") || "없음"}\n` +
    `   한 일: ${c.한일}`
  ).join("\n");

  return { cards, text };
}

const SCHEMA = {
  type: "object",
  properties: {
    names: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "원문에 글자 그대로 있는 이름" },
          slot: { type: "string", description: "어느 칸에서 나왔나" },
          subject: { type: "string", description: "어느 과목에서 나왔나. 창체면 빈 문자열" },
          why: { type: "string", description: "왜 값이 있는지 한 줄" },
        },
        required: ["name", "slot", "subject", "why"],
        additionalProperties: false,
      },
    },
    directions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          keywords: { type: "array", items: { type: "string" }, description: "이 주제가 되는 이름 1~2개. 전부 원문에 있어야 함" },
          endedAs: { type: "string", enum: ["조사·발표", "실험", "숫자", "사례 하나"] },
          move: { type: "string", enum: ["확인해 본다", "비교한다", "이유를 따라간다", "넓혀 본다"] },
          line: { type: "string", description: "이 주제를 한 줄로. 2학기에 무엇을 하는 것인지" },
          why: { type: "string", description: "W · 탐구 동기. 수업 개념과 실생활을 잇는 의문 한 문장" },
          after: { type: "string", description: "A · 새로 생기는 질문 + 전공 연결 + 고3에 어떻게 이어지는지" },
          summary5: { type: "string", description: "보고서 맨 앞에 붙일 탐구요약 5줄. WADA 순서, 음슴체 필수, 줄바꿈으로 구분" },
          rowIndex: { type: "integer", description: "학과 주제표에서 가장 가까운 줄 번호" },
          bridge: { type: "string", description: "진로가 바뀐 경우에만 한 줄. 아니면 빈 문자열" },
          changje: {
            type: "array",
            description: "창체 세 칸. 세 개 전부 넣되 하는 일을 서로 다르게",
            items: {
              type: "object",
              properties: {
                slot: { type: "string", enum: SLOT_ENUM },
                agenda: { type: "string", description: "A · 이 칸에서 잡을 뾰족한 질문 한 문장. 그 분야 개념어를 쓰되 비유는 금지" },
                detail: { type: "string", description: "D · 직접 재거나 계산할 것. 개수·조건·횟수가 보이게" },
                fills: { type: "string", description: "이 칸이 채우는 평가 항목" },
              },
              required: ["slot", "agenda", "detail", "fills"],
              additionalProperties: false,
            },
          },
          subjects: {
            type: "array",
            description: "2학년 2학기에 듣는 과목 __SUBJ__개",
            items: {
              type: "object",
              properties: {
                subject: { type: "string", description: "학부모가 적은 2학년 2학기 과목 목록에 있는 과목명" },
                kind: { type: "string", enum: KIND_ENUM },
                agenda: { type: "string", description: "A · 이 과목에서 잡을 뾰족한 질문 한 문장" },
                detail: { type: "string", description: "D · 직접 재거나 계산할 것. 개수·조건·횟수가 보이게" },
              },
              required: ["subject", "kind", "agenda", "detail"],
              additionalProperties: false,
            },
          },
          stepMade: { type: "string", description: "주제표가 없는 학과일 때 직접 세운 3년 계단. 1학년 → 2학년 → 3학년 순서로 한 줄. 주제표가 있으면 빈 문자열" },
          search: { type: "string", description: "그대로 넣을 검색어" },
        },
        required: ["keywords", "endedAs", "move", "line", "why", "after", "summary5", "rowIndex", "bridge", "changje", "subjects", "stepMade", "search"],
        additionalProperties: false,
      },
    },
  },
  required: ["names", "directions"],
  additionalProperties: false,
};

const Q1 = {
  원리: "왜 그렇게 되는지가 궁금한 아이",
  제작: "그걸로 뭘 만들 수 있는지가 궁금한 아이",
  사람: "사람들이 왜 그러는지가 궁금한 아이",
  측정: "숫자로 재 보는 게 편한 아이",
};
const Q2 = {
  비교: "둘을 나란히 놓고 비교하는 게 편함",
  반박: "이상한 데를 찾아 따지는 게 편함",
  제작: "직접 만들거나 재는 게 편함",
  조사: "자료를 더 찾아보는 게 편함",
};

function scrub(t) {
  return String(t || "")
    .replace(/문서확인번호[^\n]*/g, "")
    .replace(/\d{4}-\d{4}-\d{4}-\d{4}/g, "")
    .replace(/\b\d{6}\s*[-–]\s*\d{7}\b/g, "")
    .replace(/^\s*[-–]?\s*\d+\s*[-–]\s*$/gm, "")
    .replace(/(성\s*명|학\s*번|생년월일|주민등록번호)\s*[:：][^\n]*/g, "")
    .replace(/[가-힣]{2,10}(고등학교|중학교)/g, "○○고등학교")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ── Anthropic 호출 경로 ──
   Anthropic이 Cloudflare 워커 회선(한국 요청은 홍콩 데이터센터로 갑니다)을 403으로 막습니다.
   그래서 Cloudflare AI 게이트웨이를 경유합니다. 로컬에서는 토큰이 없어도 직접 호출로 떨어집니다. */
function anthropicURL(env) {
  const acc = env.CF_ACCOUNT_ID;
  const gw = env.CF_AIG_GATEWAY || "default";
  return env.CF_AIG_TOKEN && acc
    ? `https://gateway.ai.cloudflare.com/v1/${acc}/${gw}/anthropic/v1/messages`
    : "https://api.anthropic.com/v1/messages";
}
function anthropicHeaders(env) {
  const h = {
    "x-api-key": env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  };
  if (env.CF_AIG_TOKEN && env.CF_ACCOUNT_ID) h["cf-aig-authorization"] = "Bearer " + env.CF_AIG_TOKEN;
  return h;
}

/* 중간 장비가 기다리다 끊을 때 돌려주는 번호입니다. 우리 잘못이 아니라 시간 문제라 다음 경로에서 다시 해 봅니다. */
const TIMEOUT_STATUS = [408, 520, 522, 523, 524];

/* ── 호출 경로를 순서대로 밟습니다 ──
   Anthropic이 특정 회선을 403 "Request not allowed" 로 막습니다. 막힌 경로는 버리고 다음 경로로 넘어갑니다.
   순서: PROXY_URL(클라우드플레어 밖 우회로) → AI 게이트웨이 → api.anthropic.com 직접 */
/* 미국(wnam)에 자리 잡는 방입니다. 이 안에서 부른 요청은 미국에서 나갑니다. */
export class UsFetcher {
  async fetch(request) {
    const target = request.headers.get("x-target-url") || "https://api.anthropic.com/v1/messages";
    const h = new Headers();
    for (const k of ["x-api-key", "anthropic-version", "content-type", "cf-aig-authorization"]) {
      const v = request.headers.get(k);
      if (v) h.set(k, v);
    }
    return fetch(target, { method: "POST", headers: h, body: request.body });
  }
}

function anthropicPaths(env) {
  const base = {
    "x-api-key": env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  };
  const list = [];
  /* 홍콩에서 나가는 요청을 앤트로픽이 막습니다. 미국에 사는 방(Durable Object)을 하나 두고 거기서 대신 나갑니다 */
  if (env.US_FETCH) {
    list.push({ name: "us", url: "https://api.anthropic.com/v1/messages", headers: base, us: true });
  }
  if (env.PROXY_URL) {
    list.push({
      name: "proxy",
      url: env.PROXY_URL,
      headers: env.PROXY_KEY ? Object.assign({}, base, { "x-proxy-key": env.PROXY_KEY }) : base,
    });
  }
  if (env.CF_AIG_TOKEN && env.CF_ACCOUNT_ID) {
    list.push({
      name: "gateway",
      url: `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${env.CF_AIG_GATEWAY || "default"}/anthropic/v1/messages`,
      headers: Object.assign({}, base, { "cf-aig-authorization": "Bearer " + env.CF_AIG_TOKEN }),
    });
  }
  list.push({ name: "direct", url: "https://api.anthropic.com/v1/messages", headers: base });
  return list;
}

async function anthropicFetch(env, body) {
  let last = null;
  for (const p of anthropicPaths(env)) {
    let res;
    try {
      if (p.us) {
        const stub = env.US_FETCH.get(env.US_FETCH.idFromName("us"), { locationHint: "wnam" });
        res = await stub.fetch("https://us-fetch.internal/call", {
          method: "POST",
          headers: Object.assign({}, p.headers, { "x-target-url": p.url }),
          body,
        });
      } else {
        res = await fetch(p.url, { method: "POST", headers: p.headers, body });
      }
    } catch (e) {
      const t = JSON.stringify({ error: { message: p.name + " 경로가 연결되지 않습니다. " + String(e).slice(0, 120) } });
      console.log("anthropic " + p.name + " throw " + String(e).slice(0, 120));
      last = new Response(t, { status: 502, headers: { "content-type": "application/json" } });
      continue;
    }
    /* 403은 회선 차단, 401은 게이트웨이 토큰 문제, 52x·408은 기다리다 끊긴 것이라 다음 경로에서 다시 해 봅니다 */
    if (res.status === 403 || res.status === 401 || TIMEOUT_STATUS.indexOf(res.status) >= 0) {
      const t = await res.text();
      console.log("anthropic " + p.name + " " + res.status + " " + t.slice(0, 150));
      last = new Response(t, { status: res.status, headers: { "content-type": "application/json" } });
      continue;
    }
    console.log("anthropic " + p.name + " ok " + res.status);
    return res;
  }
  return last;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/* 진짜 이유가 화면까지 오게 합니다 */
function apiFailure(status, bodyText) {
  let msg = "";
  try {
    msg = (JSON.parse(bodyText).error || {}).message || "";
  } catch {
    msg = bodyText.slice(0, 300);
  }
  const low = msg.toLowerCase();
  if (status === 401 || low.includes("authentication") || low.includes("x-api-key")) {
    return { s: 502, m: "API 키가 맞지 않습니다. 키를 다시 넣어 주세요." };
  }
  if (low.includes("credit balance") || low.includes("billing")) {
    return { s: 502, m: "Anthropic 계정에 잔액이 없습니다. console.anthropic.com의 Billing에서 결제수단을 등록하고 크레딧을 충전해 주세요." };
  }
  if (status === 403) return { s: 502, m: "지금 서버가 클로드에 못 닿습니다(403). 1~2분 뒤에 다시 눌러 주세요. 계속 같으면 알려 주세요." };
  if (status === 429) return { s: 429, m: "지금 몰려서 잠시 안 됩니다. 1분 뒤에 다시 눌러 주세요." };
  if (status === 529) return { s: 503, m: "서버가 붐빕니다. 잠시 뒤 다시 눌러 주세요." };
  if (TIMEOUT_STATUS.indexOf(status) >= 0) {
    return { s: 504, m: "자료를 만들다가 시간이 넘어 끊겼습니다. 1~2분 뒤에 다시 눌러 주세요. 그래도 같으면 카드를 두세 줄 줄이고 해 보세요." };
  }
  return { s: 502, m: "자료를 만들지 못했습니다. (" + status + ") " + (msg || "원인 불명") };
}


const DREAM_SCHEMA = {
  type: "object",
  properties: {
    dreams: {
      type: "array",
      description: "서로 다른 각도의 꿈문장 후보 3개",
      items: {
        type: "object",
        properties: {
          line: { type: "string", description: "나는 [대상/무엇을] [어떻게 한다]는 [구체적 직무]가 되기 위해 [학과]에 지원한다" },
          basis: { type: "string", description: "1학년 기록 중 무엇을 근거로 이렇게 봤는지. 원문에 있는 말로" },
          keywords: { type: "array", items: { type: "string" }, description: "이 꿈문장에 딸린 진로 키워드 3개" },
        },
        required: ["line", "basis", "keywords"],
        additionalProperties: false,
      },
    },
    read: { type: "string", description: "1학년 기록에서 읽히는 아이의 관심 한 줄" },
  },
  required: ["dreams", "read"],
  additionalProperties: false,
};

async function handleDream(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "요청을 읽지 못했습니다." }, 400); }
  if (!env.ANTHROPIC_API_KEY) return json({ error: "서버에 API 키가 없습니다." }, 500);
  if (!env.PASSWORD || body.pw !== env.PASSWORD) return json({ error: "이번 달 비밀번호가 맞지 않습니다." }, 401);

  const dept = String(body.dept || "").trim();
  const track = TRACKS[String(body.track || "")];
  if (!dept) return json({ error: "희망 학과를 적어 주세요." }, 400);
  if (!track) return json({ error: "계열을 골라 주세요." }, 400);

  const got = readCards(body);
  if (got.err) return json({ error: got.err }, 400);
  const text = got.text;

  const changed = !!body.changed;
  const why = String(body.whyChanged || "").trim();

  const msg = `# 희망 학과
${dept}

# 계열 — ${String(body.track)}
탐구 방향: ${track.axis}
${track.rules.map((r) => "- " + r).join("\n")}

# 진로
${changed
  ? `1학년 때와 바뀌었습니다. 지금은 ${dept}입니다.${why ? `\n바뀐 이유: ${why}` : ""}
1학년 기록에서 ${dept}로 이어붙일 수 있는 대목을 근거로 삼습니다. 1학년 기록을 버리지 않습니다.`
  : "1학년 때와 같습니다."}

# 1학년 활동 카드 (생기부 원문은 받지 않습니다. 아래가 1학년 기록에서 온 전부입니다)
"""
${text}
"""

꿈문장 후보 3개를 서로 다른 각도로 만듭니다. 셋 다 ${dept}에 지원하는 문장이어야 합니다.
비전은 넓게, 역할은 또렷하게. 방법론이나 대상 집단을 못 박아 아이를 가두지 않습니다.
한 호흡에 읽히는 길이로 씁니다. 비유를 쓰지 않습니다.
비전 자리에는 그 분야가 실제로 쓰는 개념어를 하나 넣습니다. 일상어로 풀어 쓰지 않습니다.
basis는 위 원문에 실제로 있는 말로 씁니다.`;

  const call = await anthropicMessage(anthropicFetch, env, {
      model: env.MODEL || DEFAULT_MODEL,
      max_tokens: 8000,
      system: [{ type: "text", text: KNOWHOW.replace("__AXES__", "2개에서 3개").replace(/__SUBJ__/g, "3~4"), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: msg }],
      output_config: { effort: "low", format: { type: "json_schema", schema: DREAM_SCHEMA } },
    });
  if (!call.ok) {
    console.log("dream error", call.status, call.detail.slice(0, 400));
    const f = apiFailure(call.status, call.detail);
    return json({ error: f.m }, f.s);
  }
  const out = call.msg;
  const b = (out.content || []).find((x) => x.type === "text");
  if (!b) return json({ error: "꿈문장을 만들지 못했습니다." }, 502);
  try { return json(JSON.parse(b.text)); } catch { return json({ error: "꿈문장을 읽지 못했습니다." }, 502); }
}

async function handlePlan(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "요청을 읽지 못했습니다." }, 400);
  }

  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: "서버에 API 키가 없습니다. 로컬이면 .dev.vars, 배포본이면 wrangler secret put ANTHROPIC_API_KEY 로 넣어 주세요." }, 500);
  }
  if (!env.PASSWORD || body.pw !== env.PASSWORD) {
    return json({ error: "이번 달 비밀번호가 맞지 않습니다. 카페 공지를 확인해 주세요." }, 401);
  }

  const dept = String(body.dept || "").trim();
  if (!dept) return json({ error: "희망 학과를 적어 주세요." }, 400);
  const trackKey = String(body.track || "");
  const track = TRACKS[trackKey];
  if (!track) return json({ error: "계열을 골라 주세요." }, 400);
  const second = String(body.second || "").trim();

  /* 주제표가 있는 학과면 붙이고, 없으면 계열 로드맵만으로 갑니다 */
  const major = findMajor(dept);

  const got = readCards(body);
  if (got.err) return json({ error: got.err }, 400);
  const text = got.text;

  const dream = String(body.dream || "").trim();
  const dreamKw = Array.isArray(body.dreamKeywords) ? body.dreamKeywords : [];
  const subj22 = String(body.subjects22 || "").split(/[,·\n]+/).map((x) => x.trim()).filter(Boolean);
  if (!dream) return json({ error: "꿈문장을 먼저 만들어 주세요." }, 400);
  if (subj22.length < 2) return json({ error: "2학년 2학기에 듣는 과목을 적어 주세요. 쉼표로 나눠 적으시면 됩니다." }, 400);
  const changed = !!body.changed;
  const q1 = Q1[body.q1] || Q1["원리"];
  const q2 = Q2[body.q2] || Q2["비교"];

  const rows = major
    ? major.r.map((r, i) => `${i}. [주제] ${r.a} / [1학년] ${r.y[0]} / [2학년] ${r.y[1]} / [3학년] ${r.y[2]}`).join("\n")
    : "";

  const userMsg = `# 희망 학과
${dept}

# 계열 — ${trackKey}
탐구 방향: ${track.axis}
${track.rules.map((r) => "- " + r).join("\n")}
${trackKey === "자유전공" && second ? `관심 두 계열: ${second}. 이 둘이 만나는 자리에서 주제를 정합니다.` : ""}

${major
  ? `# 이 학과의 3년 계단
1학년: ${major.s[0]}
2학년: ${major.s[1]}
3학년: ${major.s[2]}

# 이 학과 주제표 (rowIndex는 이 번호 중에서만 고릅니다)
${rows}`
  : `# 이 학과의 주제표는 아직 없습니다
${dept}의 3년 계단을 계열 로드맵에 맞춰 직접 세우고, 그 계단 이름을 stepMade에 적습니다.
계단 이름은 그 학과에서만 쓰는 명사로 짓습니다. 동사로 지으면 계열이 안 보입니다.
rowIndex는 0으로 둡니다.`}

# 이 자료는 반드시 ${dept}에 맞춰야 합니다
일반적인 탐구가 아니라 ${dept}에서 값이 되는 탐구여야 합니다.
careerKeywords는 ${dept} 교수진 연구목록에서 나올 법한 말이어야 합니다.
꿈문장의 학과 이름도 ${dept}로 적습니다.

# 진로
${changed
  ? `1학년 때와 진로가 바뀌었습니다. 지금은 ${dept}입니다.
1학년 기록 중 ${dept}의 1학년 칸으로 이어붙일 수 있는 이름을 먼저 찾고, 각 주제의 bridge에 어떻게 이어지는지 한 줄로 적습니다.`
  : `1학년 때와 같습니다. bridge는 전부 빈 문자열로 둡니다.`}

# 꿈문장 (이미 정해졌습니다. 모든 주제가 이 문장을 향합니다)
${dream}
진로 키워드: ${dreamKw.join(" · ")}

# 2학년 2학기에 듣는 과목 (subjects는 이 안에서만 고릅니다)
${subj22.join(" / ")}

# 아이 성향
- 더 끌리는 쪽: ${q1}
- 손으로 하기 편한 것: ${q2}

# 1학년 활동 카드 (생기부 원문은 받지 않습니다. 아래가 1학년 기록에서 온 전부입니다)
"""
${text}
"""`;

  const MODEL = env.MODEL || DEFAULT_MODEL;
  const EFFORT = env.EFFORT || DEFAULT_EFFORT;
  const AXES = env.AXES || DEFAULT_AXES;
  const SUBJ = env.SUBJ || "3~5";
  const sysText = KNOWHOW.replace("__AXES__", AXES).replace(/__SUBJ__/g, SUBJ);
  const schema = JSON.parse(JSON.stringify(SCHEMA).replace(/__SUBJ__/g, SUBJ));
  const oc = { format: { type: "json_schema", schema } };
  if (MODEL.indexOf("haiku") < 0) oc.effort = EFFORT;

  const call = await anthropicMessage(anthropicFetch, env, {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [{ type: "text", text: sysText, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMsg }],
      output_config: oc,
    });

  if (!call.ok) {
    console.log("anthropic error", call.status, call.detail.slice(0, 800));
    const f = apiFailure(call.status, call.detail);
    return json({ error: f.m }, f.s);
  }

  const out = call.msg;
  if (out.stop_reason === "refusal") {
    return json({ error: "이 내용으로는 자료를 만들 수 없습니다. 생기부만 붙여넣어 주세요." }, 422);
  }
  if (out.stop_reason === "max_tokens") {
    return json({ error: "자료가 중간에 잘렸습니다. 세특을 조금 줄여서 다시 시도해 주세요." }, 502);
  }

  const block = (out.content || []).find((b) => b.type === "text");
  if (!block) return json({ error: "자료가 비어 있습니다. 다시 시도해 주세요." }, 502);

  let data;
  try {
    data = JSON.parse(block.text);
  } catch {
    return json({ error: "자료를 읽지 못했습니다. 다시 시도해 주세요." }, 502);
  }

  /* ── 원문 대조 검증 ── */
  const flat = text.replace(/\s+/g, "");
  const inSource = (s) => typeof s === "string" && s.length > 1 && flat.includes(s.replace(/\s+/g, ""));

  const names = (data.names || []).filter((n) => inSource(n.name));
  let dropped = (data.names || []).length - names.length;

  const directions = (data.directions || [])
    .filter((d) => Array.isArray(d.keywords) && d.keywords.length && d.keywords.every(inSource))
    .map((d) => {
      const i = major && Number.isInteger(d.rowIndex) && major.r[d.rowIndex] ? d.rowIndex : 0;
      const row = major ? major.r[i] : { a: "", y: ["", d.stepMade || "", ""] };
      const flatS = subj22.map((x) => x.replace(/\s+/g, ""));
      const subjects = (d.subjects || []).filter((s) => s.subject && flatS.some((x) => x.includes(s.subject.replace(/\s+/g, "")) || s.subject.replace(/\s+/g, "").includes(x)));
      dropped += (d.subjects || []).length - subjects.length;
      const seen = {};
      const changje = (d.changje || []).filter((c) => {
        if (SLOT_ENUM.indexOf(c.slot) < 0 || seen[c.slot]) return false;
        seen[c.slot] = 1;
        return true;
      });
      return { ...d, rowIndex: i, rowAxis: row.a, rowY2: row.y[1], rowY3: row.y[2], subjects, changje };
    });

  dropped += (data.directions || []).length - directions.length;
  if (dropped) console.log("verify dropped", dropped);

  if (!names.length && !directions.length) {
    return json({ error: "이름이 될 만한 말을 못 찾았습니다. 과목 세특을 더 넣어 보시겠어요?" }, 200);
  }

  return json({ names, directions, steps: major ? major.s : null, track: trackKey, axis: track.axis, hasTable: !!major, gloss: GLOSS[dept] || [], dropped, model: MODEL, usage: out.usage });
}

/* 학부모가 보낸 글을 먼저 통째로 받아 둡니다.
   답을 흘려보내기 시작한 뒤에는 원래 요청을 다시 못 읽는 일이 있어서,
   읽어 둔 글을 손에 쥐고 있다가 자료 만드는 함수에 넘깁니다. */
async function held(request, handler, env) {
  const raw = await request.text();
  const shim = { json: async () => JSON.parse(raw) };
  return () => handler(shim, env);
}

async function serve(request, handler, env) {
  const raw = await request.text();
  const shim = { json: async () => JSON.parse(raw) };
  let begin;
  const started = new Promise((r) => { begin = r; });
  const run = handler(shim, env, () => begin(true));
  const first = await Promise.race([
    run.then((res) => ({ res }), (e) => ({ err: e })),
    started.then(() => ({ stream: true })),
  ]);
  if (first.stream) return streamJson(() => run);
  if (first.err) {
    console.log("serve", first.err && first.err.stack);
    return json({ error: "서버에서 문제가 생겼습니다: " + (first.err && first.err.message) }, 500);
  }
  return first.res;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/cards1") {
      if (request.method !== "POST") return json({ error: "잘못된 요청입니다." }, 405);
      return serve(request, handleCards1, env);
    }
    if (url.pathname === "/api/dream") {
      if (request.method !== "POST") return json({ error: "잘못된 요청입니다." }, 405);
      return streamJson(await held(request, handleDream, env));
    }
    if (url.pathname === "/api/plan") {
      if (request.method !== "POST") return json({ error: "잘못된 요청입니다." }, 405);
      return streamJson(await held(request, handlePlan, env));
    }
    /* 어느 회선이 살아 있는지 봅니다. 비밀번호가 있어야 열립니다 */
    if (url.pathname === "/api/diag") {
      const b = await request.json().catch(() => ({}));
      if (!env.PASSWORD || b.pw !== env.PASSWORD) return json({ error: "비밀번호가 맞지 않습니다." }, 401);
      const body = JSON.stringify({ model: "claude-sonnet-4-5-20250929", max_tokens: 8, messages: [{ role: "user", content: "hi" }] });
      const out = { colo: (request.cf || {}).colo || "?", paths: [] };
      for (const p of anthropicPaths(env)) {
        try {
          const r = await fetch(p.url, { method: "POST", headers: p.headers, body });
          out.paths.push({ name: p.name, status: r.status, body: (await r.text()).slice(0, 160) });
        } catch (e) {
          out.paths.push({ name: p.name, err: String(e).slice(0, 160) });
        }
      }
      return json(out);
    }
    if (url.pathname === "/api/majors") {
      return json(Object.fromEntries(Object.entries(MAJORS).map(([k, v]) => [k, { g: v.g, s: v.s, r: v.r }])));
    }
    /* ── 고1 (1-2 탐구주제 방향 가이드) ── 같은 비밀번호·같은 키를 씁니다 */
    if (url.pathname === "/api/dream1") {
      if (request.method !== "POST") return json({ error: "잘못된 요청입니다." }, 405);
      return streamJson(await held(request, handleDream1, env));
    }
    if (url.pathname === "/api/plan1") {
      if (request.method !== "POST") return json({ error: "잘못된 요청입니다." }, 405);
      return streamJson(await held(request, handlePlan1, env));
    }
    /* 주소를 짧게 알려 드리려고 /go1 을 파일로 잇습니다 */
    if (url.pathname === "/" || url.pathname === "/go1" || url.pathname === "/go1/") {
      return env.ASSETS.fetch(new Request(new URL("/go1.html", url), request));
    }
    return env.ASSETS.fetch(request);
  },
};
