export function structureIssues(seed,word){
 const issues=[];
 if(seed.contexts?.length!==9||seed.nearby?.length!==4||seed.choices?.length!==5)return ['wrong_counts'];
 if(new Set([word,...seed.nearby]).size!==5||new Set(seed.choices).size!==5)issues.push('duplicate_options');
 if(new Set(seed.contexts.map(s=>s.replace(/[\s\p{P}\p{S}]/gu,''))).size!==9)issues.push('duplicate_contexts');
 for(const [i,c]of seed.contexts.entries()){
  const marker=c.match(/\{([^{}]+)\}/)?.[1]||'';
  const stem=word.replace(/(?:하다|되다)$/,'').replace(/다$/,'');
  const derived=marker.startsWith(word)&&/^(?:하|해|했|한|할|함|합|되|된|될|됨|돼|됐|인|일|임|입|이었|였|으로|로|이다|이므로|이라)/.test(marker.slice(word.length));
  if(!marker||/[_＿\s]/u.test(marker)||!(marker===word||derived||word.endsWith('다')&&(marker.startsWith(stem)||stem.endsWith('시키')&&marker.startsWith(stem.slice(0,-1)))))issues.push(`${i+1}번의 {표시}에는 반드시 목표어 ‘${word}’ 또는 그 활용형만 넣으세요. 현재 표시는 ‘${marker}’입니다.`);
  if(c.length<30||c.length>260||(c.match(/\{[^{}]+\}/g)||[]).length!==1)issues.push(`${i+1}번은 30~260자의 두 문장 지문이어야 하며 목표어를 {목표어}로 정확히 한 번 표시해야 합니다. 길이=${c.length}, 표시 수=${(c.match(/\{[^{}]+\}/g)||[]).length}. 빈칸 기호나 뜻 설명, 보기는 넣지 마세요.`);
  if(/[①②③④⑤]/.test(c))issues.push('option_in_context');
  if(/(?:뜻|정의|문장|보기|예문)\s*[:：]/.test(c))issues.push(`${i+1}번은 지문만 남기고 뜻·정의·문장 등의 항목 표기와 정의 설명을 삭제하세요.`);
  if(/빈칸|알맞은 말을|밑줄 친 말/.test(c))issues.push(`${i+1}번에 포함된 문제 지시문을 삭제하고 사건을 설명하는 지문만 작성하세요.`);
 }
 return issues;
}
