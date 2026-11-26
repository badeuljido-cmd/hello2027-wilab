// 기본 데이터: 닉네임 재료, 기본 문제팩, 룰렛 항목
export const NICK_A = [
  '칼퇴요정','월급루팡','야근용사','점심고민러','탕비실지킴이','회의실잠꾸러기',
  '연차부자','퇴근길질주','복권꿈나무','커피수혈러','보고서장인','회식전문가',
  '눈치백단','슬랙읽씹러','칼같은퇴근러','월요병치료사','점심시간사수대','엑셀마법사'
];
export const NICK_B = [
  '펭귄','호랑이','수달','판다','고양이','강아지','다람쥐','부엉이',
  '여우','코알라','물개','두루미','사슴','너구리','햄스터','고래'
];

export function randomNick(){
  const a = NICK_A[Math.floor(Math.random()*NICK_A.length)];
  const b = NICK_B[Math.floor(Math.random()*NICK_B.length)];
  return `${a} ${b}`;
}

export const DEFAULT_PACK = {
  name: '2026 송년회 기본 문제',
  questions: [
    {cat:'넌센스', q:'세상에서 가장 뜨거운 바다는?', c:['열바다','불바다','용암바다','뜨거운바다'], a:0, note:'“열받아”에서 왔어요.'},
    {cat:'넌센스', q:'오리가 얼면 어떻게 될까?', c:['언덕','빙판','얼음물','눈사람'], a:0, note:'얼 duck(오리) = 언덕.'},
    {cat:'상식', q:'대한민국에서 가장 액면가가 큰 지폐는?', c:['5만 원','1만 원','10만 원','5천 원'], a:0, note:'5만 원권은 2009년부터 발행됐어요.'},
    {cat:'상식', q:'태양계에서 가장 큰 행성은?', c:['목성','토성','해왕성','지구'], a:0, note:'목성은 지구의 약 11배 지름이에요.'},
    {cat:'상식', q:'1광년은 무엇을 재는 단위일까?', c:['거리','시간','밝기','무게'], a:0, note:'빛이 1년 동안 가는 거리, 약 9.46조 km.'},
    {cat:'상식', q:'북반구에서 낮이 가장 긴 날은?', c:['하지','동지','춘분','추분'], a:0, note:'6월 하지 무렵이 낮이 가장 길어요.'},
    {cat:'상식', q:'2026년은 무슨 띠의 해일까?', c:['말띠','용띠','뱀띠','양띠'], a:0, note:'2026년은 병오년, 말의 해예요.'},
    {cat:'상식', q:'커피 원두 중 카페인이 더 많은 쪽은?', c:['로부스타','아라비카','둘이 똑같다','원산지에 따라 다르다'], a:0, note:'로부스타가 아라비카보다 카페인이 약 2배 많아요.'},
    {cat:'상식', q:'올림픽 오륜기 다섯 고리에 없는 색은?', c:['보라','파랑','검정','초록'], a:0, note:'파랑·노랑·검정·초록·빨강 다섯 색이에요.'},
    {cat:'상식', q:'한국의 삼복(三伏)에 속하지 않는 날은?', c:['처서','초복','중복','말복'], a:0, note:'삼복은 초복·중복·말복. 처서는 24절기예요.'},
    {cat:'상식', q:'2024년 노벨 문학상을 받은 한국 작가는?', c:['한강','김영하','박경리','황석영'], a:0, note:'한강 작가가 『소년이 온다』 등으로 수상했어요.'},
    {cat:'상식', q:'지구에서 가장 가까운 별은?', c:['태양','프록시마 켄타우리','시리우스','북극성'], a:0, note:'당연하지만 태양도 별이에요.'},
    {cat:'상식', q:'대한민국 최초의 한글 소설로 알려진 작품은?', c:['홍길동전','춘향전','심청전','구운몽'], a:0, note:'허균이 쓴 것으로 전해져요.'},
    {cat:'상식', q:'김치를 담글 때 주로 쓰는 배추의 영어 이름은?', c:['Napa cabbage','Iceberg lettuce','Kale','Bok choy'], a:0, note:'Napa cabbage 또는 Chinese cabbage라고 해요.'},
    {cat:'상식', q:'대한민국 헌법에서 정한 국민의 의무가 아닌 것은?', c:['저축의 의무','교육의 의무','근로의 의무','납세의 의무'], a:0, note:'저축의 의무는 헌법에 없어요.'},
    {cat:'직장인', q:'보고서에서 “두괄식”이 뜻하는 것은?', c:['결론을 먼저 말한다','근거를 먼저 나열한다','두 번 고쳐 쓴다','두 명이 함께 쓴다'], a:0, note:'핵심부터, 그다음 근거.'},
    {cat:'직장인', q:'“칼퇴”의 뜻으로 가장 가까운 것은?', c:['칼같이 정시에 퇴근한다','칼을 들고 퇴근한다','칼퇴근이라는 이름의 동료','야근 후 새벽 퇴근'], a:0, note:'오늘도 성공하시길.'},
    {cat:'직장인', q:'회사에서 “탕비실”은 무슨 공간일까?', c:['차와 비품을 두는 방','회의하는 방','인쇄하는 방','담배 피는 곳'], a:0, note:'탕(차) + 비(비품) + 실.'},
    {cat:'직장인', q:'“을질”은 보통 어떤 태도를 뜻할까?', c:['갑에게 당한 사람이 되레 억울함을 드러내는 것','을이 갑에게 맞서는 것','업무를 떠넘기는 것','회의에서 침묵하는 것'], a:0, note:'갑질의 반대말로 쓰이지만 뜻은 조금 달라요.'},
    {cat:'직장인', q:'이메일에서 “참조(CC)”는 보통 누구에게 쓰는 걸까?', c:['내용을 공유만 하고 답장은 필요 없는 사람','답장을 반드시 해야 하는 사람','비밀리에 숨겨야 하는 사람','대표이사 한 명'], a:0, note:'숨은 참조는 BCC.'},
    {cat:'직장인', q:'“월요병”을 영어로 옮기면 가장 가까운 표현은?', c:['Monday blues','Monday fever','Blue Monday sale','Monday shift'], a:0, note:'Monday blues, 사전에도 올라 있는 표현이에요.'},
    {cat:'넌센스', q:'소가 웃으면 어떻게 될까?', c:['우하하','음메에','모오오','소리 없다'], a:0, note:'소(우) + 하하.'},
    {cat:'넌센스', q:'세상에서 가장 빠른 개는?', c:['번개','달려라','전광석화','총알개'], a:0, note:'번개가 가장 빠르죠.'},
    {cat:'넌센스', q:'“바나나가 웃으면?”에 가장 잘 어울리는 답은?', c:['빙그레','노란웃음','바나나킥','껍질째'], a:0, note:'빙그레 바나나우유에서 온 말장난이에요.'},
    {cat:'넌센스', q:'가장 무서운 수학 선생님은?', c:['미분 선생님','덧셈 선생님','도형 선생님','약수 선생님'], a:0, note:'“미분해버린다”는 말장난.'},
    {cat:'트렌드', q:'최근 20~30대가 “럭키비키”라고 할 때 뜻은?', c:['운이 좋게 잘 풀린다','운동을 열심히 한다','비키니를 입는다','복권에 당첨됐다'], a:0, note:'긍정적으로 해석하는 말투예요.'},
    {cat:'트렌드', q:'요즘 “오운완”은 무슨 뜻일까?', c:['오늘 운동 완료','오늘 운세 완벽','오전 업무 완료','오늘 원격 근무'], a:0, note:'운동 인증할 때 쓰는 말이에요.'},
    {cat:'트렌드', q:'“스불재”는 무슨 뜻일까?', c:['스스로 불러온 재앙','스타벅스 불매 재개','스마트 불편 재난','스터디 불참 재앙'], a:0, note:'내가 만든 일로 내가 고생할 때.'},
    {cat:'트렌드', q:'“TMI”는 무엇의 줄임말일까?', c:['Too Much Information','To My Idol','Time Machine Inside','Total Money Income'], a:0, note:'굳이 안 해도 될 이야기.'},
    {cat:'트렌드', q:'“갓생”이 뜻하는 것은?', c:['부지런하고 알차게 사는 삶','갓 태어난 인생','갓 만든 생일','갓 잡은 생선'], a:0, note:'갓(God) + 인생.'},
    {cat:'상식', q:'1988년생이 2026년에 한국 나이로 몇 살일까?', c:['39세','38세','37세','40세'], a:0, note:'2026 − 1988 + 1 = 39.'},
    {cat:'상식', q:'초콜릿의 주원료 카카오 열매는 원래 어느 지역이 원산지일까?', c:['중남미','서아프리카','동남아시아','지중해 연안'], a:0, note:'카카오는 중남미 열대 지역에서 시작했어요.'},
    {cat:'상식', q:'지구의 자전 주기는 약 얼마일까?', c:['24시간','12시간','30일','365일'], a:0, note:'정확히는 약 23시간 56분.'},
    {cat:'직장인', q:'“피드백”을 가장 잘하는 방식은?', c:['구체적인 행동과 결과로 말한다','기분을 먼저 평가한다','사람 됨됨이를 이야기한다','단체 채팅방에 올린다'], a:0, note:'행동과 결과에 초점을 맞추는 게 기본.'}
  ]
};

export const DEFAULT_WHEEL = [
  {label:'커피 기프티콘', weight:12, kind:'prize'},
  {label:'치킨 기프티콘', weight:8, kind:'prize'},
  {label:'편의점 상품권', weight:10, kind:'prize'},
  {label:'오늘의 간식 당첨', weight:14, kind:'prize'},
  {label:'노래 한 곡', weight:14, kind:'penalty'},
  {label:'애교 3종 세트', weight:12, kind:'penalty'},
  {label:'내일 커피 심부름', weight:12, kind:'penalty'},
  {label:'한턱 예약', weight:6, kind:'penalty'},
  {label:'다시 돌리기', weight:12, kind:'prize'}
];

export const GRADE_TABLE = [
  {name:'신의 손', range:'7.77 ± 0.01', min:0, max:0.01, pts:50},
  {name:'프로 손감각', range:'± 0.05', min:0.01, max:0.05, pts:30},
  {name:'꽤 정확해요', range:'± 0.15', min:0.05, max:0.15, pts:20},
  {name:'아쉬워요', range:'± 0.30', min:0.15, max:0.30, pts:10},
  {name:'그냥 감', range:'± 0.60', min:0.30, max:0.60, pts:5},
  {name:'내일 다시', range:'그 이상', min:0.60, max:99, pts:0}
];

export function clonePack(p){
  return JSON.parse(JSON.stringify(p || DEFAULT_PACK));
}

export function sanitizePack(raw){
  if(!raw || !Array.isArray(raw.questions)) throw new Error('문제 형식이 아니에요');
  const questions = raw.questions.map((q, i) => {
    const choices = Array.isArray(q.c) ? q.c.filter(x => typeof x === 'string' && x.trim()) : [];
    if(typeof q.q !== 'string' || !q.q.trim()) throw new Error(`${i+1}번 문제의 질문이 비어 있어요`);
    if(choices.length < 2) throw new Error(`${i+1}번 문제의 보기가 2개보다 적어요`);
    let a = Number(q.a);
    if(!Number.isInteger(a) || a < 0 || a >= choices.length) a = 0;
    return {
      cat: typeof q.cat === 'string' && q.cat.trim() ? q.cat.trim().slice(0,12) : '기타',
      q: q.q.trim().slice(0,200),
      c: choices.slice(0,4).map(x => x.trim().slice(0,60)),
      a,
      note: typeof q.note === 'string' ? q.note.trim().slice(0,200) : ''
    };
  });
  if(!questions.length) throw new Error('문제가 하나도 없어요');
  return {name: typeof raw.name === 'string' ? raw.name.slice(0,40) : '공유된 문제팩', questions};
}

// ── 압축 URL 인코딩 (deflate-raw + base64url, 미지원 시 평문 base64)
export async function encodePack(pack){
  const json = JSON.stringify(pack);
  const bytes = new TextEncoder().encode(json);
  if(typeof CompressionStream !== 'undefined'){
    try{
      const cs = new CompressionStream('deflate-raw');
      const stream = new Blob([bytes]).stream().pipeThrough(cs);
      const buf = new Uint8Array(await new Response(stream).arrayBuffer());
      return 'd1.' + b64url(buf);
    }catch(e){ /* fall through */ }
  }
  return 'b1.' + b64url(bytes);
}

export async function decodePack(code){
  const [tag, payload] = String(code).split('.');
  const bytes = unb64url(payload);
  if(tag === 'd1'){
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    const buf = new Uint8Array(await new Response(stream).arrayBuffer());
    return JSON.parse(new TextDecoder().decode(buf));
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function b64url(bytes){
  let s = '';
  for(let i=0;i<bytes.length;i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function unb64url(s){
  const b = s.replace(/-/g,'+').replace(/_/g,'/');
  const pad = b + '='.repeat((4 - b.length % 4) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) out[i] = bin.charCodeAt(i);
  return out;
}
