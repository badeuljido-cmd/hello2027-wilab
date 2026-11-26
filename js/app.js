// 앱 시작점
import { $, $$, S, net, store, initMe, setNick, setPack, toast, emit, on, esc, registerScreen, show, currentRoute, modal, closeModal } from './core.js';
import { randomNick, sanitizePack, decodePack } from './data.js';
import { initSlot, initRoulette, initStopwatch, initQuiz, initGuess } from './games.js';
import { initMc } from './mc.js';

initMe();
$('#meName').textContent = S.me.nick;
$('#mePts').textContent = S.pts;
$('#nickName').textContent = S.me.nick;
$('#roomInput').value = S.room;

// ── 화면 등록 ──
['home', 'slot', 'roulette', 'stopwatch', 'quiz', 'guess', 'mc'].forEach(name => {
  registerScreen(name, { el: $('#screen-' + name) });
});
registerScreen('home', {
  el: $('#screen-home'),
  enter(){
    $('#nickName').textContent = S.me.nick;
    $('#mePts').textContent = S.pts;
    $('#roomInput').value = S.room;
    paintLive();
    paintNotice();
  }
});

initSlot();
initRoulette();
initStopwatch();
initQuiz();
initGuess();
initMc();

// ── 닉네임 ──
$('#btnReroll').onclick = () => {
  setNick(randomNick());
  toast(`이름을 바꿨어요 · ${S.me.nick}`);
  net.send('hello', { packRev: 0 });
};
$('#btnCustomNick').onclick = () => {
  modal(`
    <h3>이름 정하기</h3>
    <p class="mini">최대 18자. 회사에서 불릴 만한 이름이면 더 좋아요.</p>
    <div class="field"><input class="input" id="nickInput" maxlength="18" value="${esc(S.me.nick)}"></div>
    <div class="m-actions"><button class="btn ghost" data-close>취소</button><button class="btn" id="nickSave">저장</button></div>
  `, {
    onMount(card){
      const input = card.querySelector('#nickInput');
      setTimeout(() => input.select(), 100);
      const save = () => {
        const v = input.value.trim();
        if(!v){ toast('이름을 넣어주세요'); return; }
        setNick(v);
        closeModal();
        toast('이름을 저장했어요');
        net.send('hello', { packRev: 0 });
      };
      card.querySelector('#nickSave').onclick = save;
      input.addEventListener('keydown', e => { if(e.key === 'Enter') save(); });
    }
  });
};
$('#mePill').onclick = () => $('#btnCustomNick').click();

// ── 방 입장 ──
$('#btnJoinRoom').onclick = () => joinRoom();
$('#roomInput').addEventListener('keydown', e => { if(e.key === 'Enter') joinRoom(); });

function joinRoom(){
  const raw = $('#roomInput').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if(!raw){ toast('방 코드를 넣어주세요'); return; }
  S.room = raw;
  store('room', raw);
  $('#mcRoomChip').textContent = raw;
  net.switchRoom(raw);
  net.send('hello', { packRev: 0 });
  toast(`${raw} 방에 들어왔어요`);
  paintLive();
}

// ── 실시간 상태 ──
function pillClass(state){
  const el = $('#livePill');
  el.classList.remove('on', 'warn');
  if(state === 'online') el.classList.add('on');
  else if(state === 'connecting') el.classList.add('warn');
}

function paintLive(){
  const st = S.live;
  const el = $('#liveText');
  const pill = $('#livePill');
  pill.classList.remove('on', 'warn');
  if(st.online){
    const n = st.state && st.state.players ? st.state.players.length : 0;
    el.textContent = n ? `실시간 · ${n}명` : '실시간 ON';
    pill.classList.add('on');
  }else if(net.status === 'connecting'){
    el.textContent = '연결 중…';
    pill.classList.add('warn');
  }else{
    el.textContent = '개인 플레이';
  }
  $('#joinHint').textContent = st.online
    ? `${S.room} 방에 연결됐어요. 사회자가 라운드를 열면 폰에 바로 떠요.`
    : '사회자가 알려준 방 코드를 넣으면 실시간 게임에 함께 들어가요. 연결이 안 되면 아래 게임만 즐겨도 돼요.';
}

function paintNotice(){
  const n = $('#homeNotice');
  if(S.pack.name && S.pack.name !== '2026 송년회 기본 문제'){
    n.hidden = false;
    n.innerHTML = `공유받은 문제팩 <b>${esc(S.pack.name)}</b> · ${S.pack.questions.length}문제를 쓰고 있어요.`;
  }else{
    n.hidden = true;
  }
}

on('net', () => { paintLive(); });
on('mcstate', () => { paintLive(); });
on('nick', () => { $('#meName').textContent = S.me.nick; $('#nickName').textContent = S.me.nick; });
on('pack', () => paintNotice());

// ── 수신 처리 ──
net.onMessage(msg => {
  if(msg.from === S.me.id) return;

  if(msg.t === 'state'){
    if(msg.rev && S.live.rev && Number(msg.rev) < Number(S.live.rev)) return;
    S.live.rev = Number(msg.rev) || S.live.rev;
    S.live.state = msg;
    S.live.online = true;

    // 내 점수는 사회자 집계를 따른다
    const mine = (msg.players || []).find(p => p.id === S.me.id);
    if(mine && Number.isFinite(mine.pts)){
      S.pts = mine.pts;
      $('#mePts').textContent = S.pts;
    }
    // 사회자가 고친 룰렛 항목 반영
    if(Array.isArray(msg.wheel) && msg.wheel.length >= 2){
      const changed = JSON.stringify(msg.wheel) !== JSON.stringify(S.wheel);
      if(changed){
        S.wheel = msg.wheel;
        store('wheel', msg.wheel);
        emit('wheel', msg.wheel);
      }
    }
    // 새 문제팩이 있으면 요청
    if(msg.packRev && Number(msg.packRev) !== Number(S.lastPackRev)){
      net.send('packreq', {});
    }
    emit('mcstate', msg);
    paintLive();
    return;
  }

  if(msg.t === 'pack'){
    const forMe = msg.broadcast || !msg.to || msg.to === S.me.id;
    if(!forMe) return;
    try{
      const pack = sanitizePack(msg.pack);
      S.lastPackRev = Number(msg.packRev) || S.lastPackRev;
      setPack(pack, { persist: true });
      toast(`사회자 문제팩을 받았어요 · ${pack.questions.length}문제`);
      paintNotice();
    }catch(e){}
    return;
  }
});

// ── 연결 시작 ──
net.start(S.room);
on('net', (st) => {
  if(st.status === 'online'){
    S.live.online = true;
    net.send('hello', { packRev: S.lastPackRev });
  }else if(st.status === 'offline'){
    S.live.online = false;
  }
  paintLive();
});

// 참가자 하트비트 (사회자 명단 유지)
setInterval(() => {
  if(net.status === 'online') net.send('hello', { packRev: S.lastPackRev });
}, 25000);

// ── URL 문제팩 ──
(async function readPackFromUrl(){
  const code = new URLSearchParams(location.search).get('pack');
  if(!code) return;
  try{
    const raw = await decodePack(code);
    const pack = sanitizePack(raw);
    setPack(pack, { persist: true });
    toast(`공유된 문제팩을 열었어요 · ${pack.questions.length}문제`, 3000);
    paintNotice();
    const url = new URL(location.href);
    url.searchParams.delete('pack');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }catch(e){
    toast('문제팩 링크를 읽지 못했어요', 3000);
  }
})();

// 첫 화면
show(currentRoute());
