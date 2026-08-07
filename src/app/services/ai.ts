import type { AnalysisType, NoteData } from "../types";

export interface AnalyzeRequest {
  notes: Pick<NoteData, "id" | "text" | "category" | "createdAt">[];
  type: AnalysisType;
  yearMonth: string;
  characterPrompt?: string;
  characterName?: string;
}

export interface AnalyzeResponse {
  content: string;
  type: AnalysisType;
  analyzedAt: string;
  characterName?: string;
}

/* analyzeNotes — 향후 백엔드 API 연동 시 이 함수 내부만 교체 */
export async function analyzeNotes(req: AnalyzeRequest): Promise<AnalyzeResponse> {
  // Future: return await fetch('/api/analyze', { method:'POST', body: JSON.stringify(req) }).then(r=>r.json())
  await new Promise((r) => setTimeout(r, 1700 + Math.random() * 900));
  return {
    content: generateMockContent(req.type, req.notes, req.characterPrompt, req.characterName),
    type: req.type,
    analyzedAt: new Date().toISOString(),
    characterName: req.characterName,
  };
}

function generateMockContent(
  type: AnalysisType,
  notes: Pick<NoteData, "text" | "category">[],
  characterPrompt?: string,
  characterName?: string
): string {
  const count = notes.length;
  const cats = [...new Set(notes.map((n) => n.category))];
  const catStr = cats.join(", ");
  const charPrefix = characterName ? `[${characterName}]\n\n` : "";
  const hasChar = !!(characterPrompt && characterPrompt.trim());

  const COMMON = hasChar
    ? [
        `${charPrefix}${count}개의 고민 조각을 함께 살펴봤어요${cats.length > 1 ? ` (${catStr})` : ""}.\n\n${characterPrompt!.slice(0, 30)}... 그런 시선으로 바라보니, 이 고민들 사이에는 공통된 흐름이 있어요. 아직 해결되지 않은 채로 마음속에 쌓여온 무언가가 반복해서 모습을 드러내고 있네요.\n\n이 연결고리를 발견했다는 것 자체가 이미 의미 있는 일이에요.`,
      ]
    : [
        `${count}개의 고민 조각을 함께 읽었습니다${cats.length > 1 ? ` — ${catStr} 영역에 걸쳐 있네요` : ""}.\n\n각 조각은 서로 다른 순간에 쓰였지만, 그 사이에 공통된 흐름이 느껴집니다. 무언가를 정리하고 싶은 마음, 혹은 아직 결론 내리지 못한 감각이 반복되고 있는 것 같아요.\n\n이 연결고리를 발견하는 것만으로도 이미 자신을 이해하는 한 걸음이 됩니다. 지금 당장 답이 필요한 것이 아니라, 이 질문들을 인식하는 것 자체로 충분한 출발점이 될 수 있어요.`,
        `${count}개의 조각 안에서 반복되는 감각이 보입니다.\n\n표면적으로는 각기 다른 상황처럼 보이지만, 그것들을 적게 만든 어떤 공통된 필요가 있을 수 있어요. 스스로도 정리되지 않은 무언가를 꺼내놓고 싶은 충동 같은 것들이요.\n\n어쩌면 이 고민들은 모두 같은 질문을 향해 있는지도 모릅니다.`,
      ];

  const T_RESP = hasChar
    ? [
        `${charPrefix}${count}개의 고민을 분석했을 때, 공통적으로 보이는 구조가 있어요.\n\n${characterPrompt!.slice(0, 40)}... 라는 맥락에서 보면, 지금 당장 바꿀 수 없는 외부 변수와 이번 주 안에 주도적으로 변화를 만들 수 있는 영역을 구분해보는 것이 먼저예요. 작은 영역에서의 주도권 회복이 전체 흐름에 영향을 줄 수 있습니다.\n\n완벽한 해결책을 기다리기보다, 현재 가능한 선택지 중 하나를 골라 실행해보는 것이 지금 단계에서 가장 합리적인 움직임입니다.`,
      ]
    : [
        `${count}개의 고민 조각을 분석했을 때, 공통적으로 보이는 구조는 "문제 인식은 명확하지만 행동으로의 전환 지점이 막혀있는" 패턴입니다.\n\n지금 당장 바꿀 수 없는 외부 변수와, 이번 주 안에 주도적으로 변화를 만들 수 있는 영역을 구분해보세요. 작은 영역에서의 주도권 회복이 전체 흐름에 영향을 줄 수 있습니다.\n\n완벽한 해결책을 기다리기보다, 현재 가능한 선택지 중 하나를 골라 실행해보는 것이 지금 단계에서 가장 합리적인 움직임입니다.`,
        `${count}개의 조각에서 보이는 핵심 변수는 기대치와 현실 사이의 간극입니다.\n\n이 간극을 줄이는 방법은 두 가지입니다: 현실을 바꾸거나, 기대치를 재조정하거나. 어느 쪽이 더 비용이 적게 드는지 냉정하게 따져보세요.\n\n지금 집중해야 할 한 가지를 골라 그것에 집중하는 것이, 여러 개를 동시에 해결하려는 것보다 훨씬 효율적입니다.`,
      ];

  const F_RESP = hasChar
    ? [
        `${charPrefix}이 고민 조각들을 읽으면서, 그 안에 담긴 무게가 느껴졌어요.\n\n${characterPrompt!.slice(0, 40)}... 그런 마음으로 함께 있어드리고 싶어요. 지금 느끼는 감정들이 뒤섞여 있어도 괜찮습니다. 정리되지 않은 채로 존재해도 됩니다.\n\n자신을 너무 세게 몰아붙이지 않아도 됩니다. 오늘 이 조각들을 꺼내놓은 것, 그것으로 이미 충분한 하루입니다.`,
      ]
    : [
        `이 고민 조각들을 읽으면서, 그 안에 담긴 무게가 느껴졌습니다. 이런 것들을 적는다는 것 자체가 이미 용기 있는 일이에요.\n\n지금 느끼는 감정들이 뒤섞여 있어도 괜찮습니다. 정리되지 않은 채로 존재해도 됩니다. 이 조각들을 별 모양으로 접어 담아둔 것처럼, 지금의 감정도 그 자리에 그대로 두어도 괜찮아요.\n\n자신을 너무 세게 몰아붙이지 않아도 됩니다. 오늘 이 조각들을 꺼내놓은 것, 그것으로 이미 충분한 하루입니다.`,
        `이 고민 조각들에는 조용한 무게가 담겨 있습니다. 애써 견디고 있는 사람의 목소리처럼요.\n\n감정은 언제나 말보다 먼저 도착하고 이유보다 오래 남습니다. 설명하려 하기보다 그냥 느끼도록 두는 것이 때로는 더 필요한 일이기도 해요.\n\n이 조각들을 나중에 다시 꺼내볼 때, 지금의 자신이 얼마나 단단하게 버텨왔는지 보일 거예요.`,
      ];

  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
  if (type === "common") return pick(COMMON);
  if (type === "T") return pick(T_RESP);
  return pick(F_RESP);
}
