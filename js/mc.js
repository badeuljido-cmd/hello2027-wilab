// 사회자(MC) 모드
import { $, $$, S, store, net, toast, modal, closeModal, esc, clamp, on, emit, registerScreen, addPoints } from './core.js';
import { encodePack, decodePack, DEFAULT_WHEEL, DEFAULT_PACK, sanitizePack } from './data.js';

const QUIZ_TIME = 15;
const GUESS_TIME = 25;

const M = {
  unlocked: false,
  players: new Map(),      // id -> {id, nick, pts, lastSeen, joined}
  phase: 'idle',
  rev: 0,
  quiz: null,              // {qid,index,total,q,choices,note,answer,deadline,startedAt,byPlayer,counts}
  quizIndex: 0,
  guess: null,             // {rid,mode,deadline,entries,result}
  guessMode: 'third',
  packRev: 1,
  wheelRev: 1,
  timer: null,
  heartbeat: null,
  tick: null
};

let uiReady = false;

function packRev(){ return M.packRev; }

export function initMc(){
  $('#mcQrUrl').textContent = location.origin + location.pathname;
  $('#mcQr').src = 'img/qr.png';
  $('#mcRoomChip').textContent = S.room;

  // PIN
  $('#btnPin').onclick = tryUnlock;
  $('#pinInput').addEventListener('keydown', e => { if(e.key === 'Enter') tryUnlock(); });
  $('#btnChangePin').onclick = () => {
    const v = $('#newPin').value.trim();
    if(!/^\d{4}$/.test(v)){ toast('숫자 4자리로 정해주세요'); return; }
    S.mc.pin = v; store('pin', v); $('#newPin').value = '';
    toast('PIN을 바꿨어요');
  };

  registerScreen('mc', {
    enter(){
      if(M.unlocked){ mountDash(); }
      else {
        $('#pinGate').hidden = false;
        $('#mcDash').hidden = true;
        setTimeout(() => $('#pinInput').focus(), 150);
      }
    },
    leave(){}
  });

  on('net', () => { if(M.unlocked) paintConn(); });
  on('wheel', () => { if(M.unlocked) renderWheelEditor(); });
  on('pack', () => { if(M.unlocked) renderPackList(); });

  net.onMessage(handleMessage);
}

function tryUnlock(){
  const v = $('#pinInput').value.trim();
  if(v === String(S.mc.pin)){
    M.unlocked = true;
    store('mcUnlocked', true);
    $('#pinErr').textContent = '';
    $('#pinInput').value = '';
    mountDash();
  }else{
    $('#pinErr').textContent = 'PIN이 맞지 않아요. 기본값은 2026입니다.';
    $('#pinInput').value = '';
  }
}

document.addEventListener('click', (e) => {
  const ov = document.getElementById('qrFull');
  if(!ov || ov.hidden) return;
  if(e.target.closest('#btnBigQr')) return;
  ov.hidden = true;
});
document.addEventListener('keydown', (e) => {
  const ov = document.getElementById('qrFull');
  if(ov && !ov.hidden && (e.key === 'Escape' || e.key === ' ')){ ov.hidden = true; }
});

function mountDash(){
  checkQrHost();
  $('#pinGate').hidden = true;
  $('#mcDash').hidden = false;
  if(!uiReady){
    uiReady = true;
    wireDash();
    renderPackList();
    renderWheelEditor();
  }
  paintConn();
  paintState();
  startHeartbeat();
}

function checkQrHost(){
  const target = 'https://badeuljido-cmd.github.io/year-end-party-2026/';
  const now = location.origin + location.pathname;
  const old = document.getElementById('qrHostWarn');
  if(old) old.remove();
  if(now.replace(/\/$/, '') === target.replace(/\/$/, '')) return;
  const p = document.createElement('p');
  p.id = 'qrHostWarn';
  p.className = 'mini';
  p.style.color = '#ffcf7a';
  p.textContent = '지금 주소(' + now + ')가 QR 이미지의 주소와 달라요. 이 화면의 QR은 기본 배포 주소용입니다.';
  $('#mcQr').parentElement.after(p);
}

function startHeartbeat(){
  if(M.heartbeat) return;
  M.heartbeat = setInterval(() => {
    prunePlayers();
    if(M.phase === 'quiz-q' && Date.now() > (M.quiz?.deadline || 0)) revealQuiz();
    if(M.phase === 'guess-open' && Date.now() > (M.guess?.deadline || 0)) endGuess();
    broadcast();
    paintState();
  }, 1600);
}

function prunePlayers(){
  const now = Date.now();
  for(const [id, p] of M.players){
    if(now - p.lastSeen > 12 * 60 * 1000) M.players.delete(id);
  }
}

function touchPlayer(id, nick){
  if(!id) return null;
  let p = M.players.get(id);
  if(!p){
    p = { id, nick: nick || '이름 없음', pts: 0, lastSeen: Date.now(), joined: Date.now() };
    M.players.set(id, p);
    emit('players', M.players.size);
  }
  if(nick) p.nick = nick;
  p.lastSeen = Date.now();
  return p;
}

function statePayload(){
  return {
    t: 'state',
    rev: ++M.rev,
    room: S.room,
    host: S.me.nick,
    phase: M.phase,
    packRev: packRev(),
    packName: S.pack.name,
    packCount: S.pack.questions.length,
    wheel: S.wheel,
    quiz: M.quiz ? {
      qid: M.quiz.qid, index: M.quiz.index, total: M.quiz.total,
      q: M.quiz.q, choices: M.quiz.choices, note: M.quiz.note,
      answer: M.phase === 'quiz-answer' ? M.quiz.answer : null,
      deadline: M.quiz.deadline, startedAt: M.quiz.startedAt,
      stats: M.phase === 'quiz-answer' ? {
        counts: M.quiz.counts,
        byPlayer: Object.fromEntries([...M.quiz.byPlayer].map(([id, v]) => [id, { choice: v.choice, ms: v.ms }]))
      } : null
    } : null,
    guess: M.guess ? {
      rid: M.guess.rid, mode: M.guess.mode, deadline: M.guess.deadline,
      result: M.guess.result || null
    } : null,
    players: [...M.players.values()].map(p => ({ id: p.id, nick: p.nick, pts: p.pts }))
  };
}

function broadcast(){
  const payload = statePayload();
  net.send('state', payload);
  S.live.state = { ...payload };
}

// ── 수신 ──
function handleMessage(msg){
  if(!M.unlocked) return;
  if(msg.from === S.me.id) return;

  if(msg.t === 'hello'){
    const p = touchPlayer(msg.from, msg.nick);
    if(p && msg.packRev !== undefined && Number(msg.packRev) !== packRev()){
      // 새 참가자에게 현재 문제팩 전송
      net.send('pack', { to: msg.from, pack: S.pack, packRev: packRev() });
    }
    broadcast();
    paintState();
    return;
  }
  if(msg.t === 'packreq'){
    if(msg.to && msg.to !== S.me.id) return;
    net.send('pack', { to: msg.from, pack: S.pack, packRev: packRev() });
    return;
  }
  if(msg.t === 'pts'){
    const p = touchPlayer(msg.from, msg.nick);
    if(p && Number.isFinite(msg.add)) p.pts += Number(msg.add);
    return;
  }
  if(msg.t === 'ans'){
    if(M.phase !== 'quiz-q' || !M.quiz) return;
    if(String(msg.qid) !== String(M.quiz.qid)) return;
    if(M.quiz.byPlayer.has(msg.from)) return;
    const idx = Number(msg.choice);
    if(!Number.isInteger(idx) || idx < 0 || idx >= M.quiz.choices.length) return;
    touchPlayer(msg.from, msg.nick);
    M.quiz.byPlayer.set(msg.from, { choice: idx, ms: Number(msg.ms) || 0, nick: msg.nick });
    M.quiz.counts[idx]++;
    paintQuizBars();
    return;
  }
  if(msg.t === 'guess'){
    if(M.phase !== 'guess-open' || !M.guess) return;
    if(String(msg.rid) !== String(M.guess.rid)) return;
    if(M.guess.entries.has(msg.from)) return;
    const v = Number(msg.value);
    if(!Number.isFinite(v)) return;
    touchPlayer(msg.from, msg.nick);
    M.guess.entries.set(msg.from, { value: clamp(Math.round(v), 0, 100), nick: msg.nick });
    paintGuessView();
    return;
  }
}

// ── 대시보드 연결 ──
function wireDash(){
  $('#btnCopyLink').onclick = async () => {
    const url = location.origin + location.pathname + '?room=' + encodeURIComponent(S.room);
    try{ await navigator.clipboard.writeText(url); toast('입장 링크를 복사했어요'); }
    catch(e){ modal(`<h3>이 링크를 복사하세요</h3><div class="field"><input class="input" value="${esc(url)}" readonly></div><div class="m-actions"><button class="btn" data-close>닫기</button></div>`); }
  };

  $('#btnBigQr').onclick = () => {
    const ov = $('#qrFull');
    $('#qrFullImg').src = 'img/qr-large.png';
    $('#qrFullUrl').textContent = location.origin + location.pathname;
    ov.hidden = false;
  };

  $('#btnRoomChange').onclick = () => {
    modal(`<h3>방 코드 바꾸기</h3><p class="mini">참가자도 같은 코드를 넣어야 들어와요. QR은 기본 방(YE2026)으로 열려요.</p>
      <div class="field"><input class="input" id="roomNew" maxlength="8" value="${esc(S.room)}"></div>
      <div class="m-actions"><button class="btn ghost" data-close>취소</button><button class="btn" id="roomSave">적용</button></div>`, {
      onMount(card){
        card.querySelector('#roomSave').onclick = () => {
          const v = card.querySelector('#roomNew').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
          if(!v){ toast('코드를 넣어주세요'); return; }
          S.room = v; store('room', v);
          $('#mcRoomChip').textContent = v;
          net.switchRoom(v);
          broadcast();
          closeModal();
          toast(`${v} 방으로 바꿨어요`);
        };
      }
    });
  };

  $('#btnSharePack').onclick = async () => {
    const code = await encodePack(S.pack);
    const url = location.origin + location.pathname + '?pack=' + code;
    try{ await navigator.clipboard.writeText(url); toast('문제팩 링크를 복사했어요 (' + url.length + '자)'); }
    catch(e){
      modal(`<h3>문제팩 링크</h3><p class="mini">복사가 막혀 있어요. 아래 주소를 길게 눌러 복사하세요.</p><div class="field"><input class="input" value="${esc(url)}" readonly></div><div class="m-actions"><button class="btn" data-close>닫기</button></div>`);
    }
  };

  // 퀴즈
  $('#btnStartQuiz').onclick = startQuiz;
  $('#btnRevealQuiz').onclick = revealQuiz;
  $('#btnNextQuiz').onclick = () => {
    M.quizIndex = (M.quizIndex + 1) % S.pack.questions.length;
    paintQuizPreview();
  };

  // 눈치
  $$('[data-gm]').forEach(b => {
    b.onclick = () => {
      M.guessMode = b.dataset.gm;
      $$('[data-gm]').forEach(x => x.classList.toggle('active', x === b));
    };
  });
  $('#btnStartGuess').onclick = startGuess;
  $('#btnEndGuess').onclick = endGuess;

  // 리더보드
  $('#btnResetScores').onclick = () => {
    if(!confirm('모든 참가자 점수를 0으로 되돌릴까요?')) return;
    for(const p of M.players.values()) p.pts = 0;
    paintState();
    broadcast();
    toast('점수를 초기화했어요');
  };

  // 문제팩
  $('#btnAddQ').onclick = () => editQuestion(null);
  $('#btnExportQ').onclick = exportJson;
  $('#btnImportQ').onclick = () => $('#fileQ').click();
  $('#fileQ').onchange = importJson;

  // 룰렛
  $('#btnAddWheel').onclick = () => {
    const items = [...S.wheel, { label: '새 항목', weight: 10, kind: 'prize' }];
    applyWheel(items);
  };
  $('#btnWheelReset').onclick = () => {
    if(!confirm('룰렛 항목을 기본값으로 돌릴까요?')) return;
    applyWheel(JSON.parse(JSON.stringify(DEFAULT_WHEEL)));
  };
}

function paintConn(){
  const el = $('#mcConn');
  if(!el) return;
  const online = S.live.online || net.status === 'online';
  const down = net.status === 'offline' && Date.now() - (net.startedAt || 0) > 9000;
  el.classList.toggle('on', online);
  const count = M.players.size;
  el.innerHTML = `<i></i>` + (online
    ? `실시간 연결됨 · ${S.live.broker || 'broker'} · 참가자 ${count}명`
    : down
      ? '실시간 연결 안 됨 · 참가자는 개인전, 문제는 문제팩 링크로 공유하세요'
      : `브로커 연결 중... · 참가자 ${count}명`);
}

function paintState(){
  paintConn();
  $('#mcPlayerCount').textContent = `${M.players.size}명`;
  paintPlayers();
  paintLeaderboard();
  paintQuizPreview();
  paintGuessView();
  $('#mcQuizState').textContent = M.phase === 'quiz-q' ? '진행 중' : M.phase === 'quiz-answer' ? '정답 공개' : '대기';
  $('#mcQuizState').classList.toggle('live', M.phase === 'quiz-q');
  $('#mcGuessState').textContent = M.phase === 'guess-open' ? '접수 중' : M.phase === 'guess-result' ? '결과' : '대기';
  $('#mcGuessState').classList.toggle('live', M.phase === 'guess-open');
  $('#btnStartQuiz').disabled = M.phase === 'quiz-q';
  $('#btnRevealQuiz').disabled = M.phase !== 'quiz-q';
  $('#btnNextQuiz').disabled = M.phase === 'quiz-q';
  $('#btnStartGuess').disabled = M.phase === 'guess-open';
  $('#btnEndGuess').disabled = M.phase !== 'guess-open';
  $('#mcPackCount').textContent = `${S.pack.questions.length}문제`;
  $('#mcWheelCount').textContent = `${S.wheel.length}개`;

  if(M.phase === 'quiz-q' && M.quiz){
    const left = Math.max(0, (M.quiz.deadline - Date.now()) / 1000);
    $('#mcTimer').textContent = `${left.toFixed(0)}초 남음 · ${M.quiz.byPlayer.size}명 제출`;
  }else $('#mcTimer').textContent = '';

  if(M.phase === 'guess-open' && M.guess){
    const left = Math.max(0, (M.guess.deadline - Date.now()) / 1000);
    $('#mcGuessTimer').textContent = `${left.toFixed(0)}초 남음 · ${M.guess.entries.size}명 제출`;
  }else $('#mcGuessTimer').textContent = '';
}

function paintPlayers(){
  const box = $('#mcPlayers');
  if(!M.players.size){
    box.innerHTML = '<p class="mini">아직 아무도 없어요. QR을 보여주세요.</p>';
    return;
  }
  const list = [...M.players.values()].sort((a, b) => b.joined - a.joined);
  box.innerHTML = list.map((p, i) => `<div class="player"><span class="p-idx">${list.length - i}</span><span>${esc(p.nick)}</span><span class="p-pts">${p.pts}</span></div>`).join('');
}

function paintLeaderboard(){
  const el = $('#mcLeaderboard');
  if(!M.players.size){ el.innerHTML = '<li class="mini">참가자가 들어오면 순위가 쌓여요.</li>'; return; }
  const list = [...M.players.values()].sort((a, b) => b.pts - a.pts);
  el.innerHTML = list.map((p, i) => `<li class="${i === 0 && p.pts > 0 ? 'top1' : ''}">
    <span class="rank">${i + 1}</span><span class="nick">${esc(p.nick)}</span><span class="pts">${p.pts}</span></li>`).join('');
}

function paintQuizPreview(){
  const q = S.pack.questions[M.quizIndex % S.pack.questions.length];
  const box = $('#mcQPreview');
  if(M.phase === 'quiz-q' && M.quiz){
    box.innerHTML = `<b>${esc(M.quiz.q)}</b><span class="opts">${M.quiz.choices.map((c, i) => `${'ABCD'[i]}. ${esc(c)}`).join(' · ')}</span>`;
  }else if(M.phase === 'quiz-answer' && M.quiz){
    box.innerHTML = `<b>${esc(M.quiz.q)}</b><span class="opts">정답 ${'ABCD'[M.quiz.answer]}. ${esc(M.quiz.choices[M.quiz.answer])} · ${esc(M.quiz.note || '')}</span>`;
  }else if(q){
    box.innerHTML = `<b>${esc(q.q)}</b><span class="opts">${q.c.map((c, i) => `${'ABCD'[i]}. ${esc(c)}`).join(' · ')}<br>정답 ${'ABCD'[q.a]}</span>`;
  }else{
    box.textContent = '문제가 없어요. 문제 추가를 눌러주세요.';
  }
  paintQuizBars();
}

function paintQuizBars(){
  const el = $('#mcAnswerBars');
  if(!M.quiz){ el.innerHTML = ''; return; }
  const counts = M.quiz.counts || [0, 0, 0, 0];
  const total = counts.reduce((s, n) => s + n, 0) || 1;
  el.innerHTML = counts.map((n, i) => `
    <div class="ab ${M.phase === 'quiz-answer' && i === M.quiz.answer ? 'right' : ''}">
      <div class="bar"><i style="width:${(n / total) * 100}%"></i></div><span class="n">${n}명</span>
    </div>`).join('');
}

// ── 퀴즈 진행 ──
function startQuiz(){
  if(!S.pack.questions.length){ toast('문제가 없어요'); return; }
  const idx = M.quizIndex % S.pack.questions.length;
  const q = S.pack.questions[idx];
  const now = Date.now();
  M.quiz = {
    qid: 'q' + now,
    index: idx,
    total: S.pack.questions.length,
    q: q.q,
    choices: q.c,
    note: q.note,
    answer: q.a,
    deadline: now + QUIZ_TIME * 1000,
    startedAt: now,
    byPlayer: new Map(),
    counts: new Array(q.c.length).fill(0)
  };
  M.phase = 'quiz-q';
  paintState();
  broadcast();
  sfxBeep();
}

function revealQuiz(){
  if(M.phase !== 'quiz-q' || !M.quiz) return;
  M.phase = 'quiz-answer';
  for(const [id, v] of M.quiz.byPlayer){
    const p = touchPlayer(id, v.nick);
    if(p && v.choice === M.quiz.answer){ p.pts += 10; }
  }
  paintState();
  broadcast();
  sfxWin();
}

// ── 눈치 게임 진행 ──
function startGuess(){
  const now = Date.now();
  M.guess = { rid: 'g' + now, mode: M.guessMode, deadline: now + GUESS_TIME * 1000, entries: new Map(), result: null };
  M.phase = 'guess-open';
  paintState();
  broadcast();
  sfxBeep();
}

function endGuess(){
  if(M.phase !== 'guess-open' || !M.guess) return;
  const entries = [...M.guess.entries.entries()].map(([id, v]) => ({ id, nick: v.nick, value: v.value }));
  const values = entries.map(e => e.value);
  let result = { entries, mode: M.guess.mode };

  if(!entries.length){
    result = { ...result, empty: true };
  }else if(M.guess.mode === 'third'){
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const target = avg * 2 / 3;
    let best = Infinity;
    entries.forEach(e => {
      e.diff = Math.abs(e.value - target);
      if(e.diff < best - 1e-9) best = e.diff;
    });
    entries.forEach(e => { e.win = Math.abs(e.diff - best) < 1e-9; });
    result = { ...result, avg, target, winners: entries.filter(e => e.win).map(e => e.nick) };
  }else{
    const count = new Map();
    values.forEach(v => count.set(v, (count.get(v) || 0) + 1));
    const unique = values.filter(v => count.get(v) === 1);
    const winner = unique.length ? Math.min(...unique) : null;
    entries.forEach(e => {
      e.win = winner !== null && e.value === winner;
      e.note = count.get(e.value) > 1 ? '겹침' : e.win ? '최소 고유수' : '고유';
    });
    result = { ...result, winner };
  }

  entries.sort((a, b) => (a.win === b.win ? a.value - b.value : a.win ? -1 : 1));
  entries.forEach(e => { if(e.win){ const p = touchPlayer(e.id, e.nick); if(p) p.pts += 30; } });

  M.guess.result = result;
  M.phase = 'guess-result';
  paintState();
  broadcast();
  sfxWin();
}

function paintGuessView(){
  const el = $('#mcGuessView');
  if(!M.guess){ el.innerHTML = '라운드를 열면 참가자 폰에 숫자 입력창이 열려요.'; return; }
  const g = M.guess;
  if(M.phase === 'guess-open'){
    el.innerHTML = `${g.mode === 'third' ? '평균의 2/3' : '겹치지 않는 숫자'} · <b>${g.entries.size}명</b> 제출<br>` +
      [...g.entries.values()].map(e => `${esc(e.nick)} <b>${e.value}</b>`).join(' · ');
    return;
  }
  if(!g.result){ el.innerHTML = ''; return; }
  const r = g.result;
  if(r.empty){ el.innerHTML = '제출자가 없어요.'; return; }
  if(g.mode === 'third'){
    el.innerHTML = `평균 <b>${r.avg.toFixed(1)}</b> · 목표 <b>${r.target.toFixed(1)}</b><br>
      우승 ${r.winners.length ? `<b>${r.winners.map(esc).join(', ')}</b>` : '없음'}<br>` +
      r.entries.map(e => `${esc(e.nick)} ${e.value}${e.win ? ' 🏆' : ''}`).join(' · ');
  }else{
    el.innerHTML = `승자 <b>${r.winner == null ? '없음(전원 겹침)' : r.winner}</b><br>` +
      r.entries.map(e => `${esc(e.nick)} ${e.value}${e.win ? ' 🏆' : ''}`).join(' · ');
  }
}

// ── 문제팩 편집 ──
function renderPackList(){
  const el = $('#mcPackList');
  if(!el) return;
  el.innerHTML = S.pack.questions.map((q, i) => `
    <div class="pq" data-i="${i}">
      <span class="cat">${esc(q.cat || '기타')}</span>
      <span class="t">${esc(q.q)}</span>
      <button class="x" data-edit="${i}" title="수정">✎</button>
      <button class="x" data-del="${i}" title="삭제">✕</button>
    </div>`).join('');
  el.querySelectorAll('.pq').forEach(row => {
    row.onclick = (e) => {
      if(e.target.dataset.del !== undefined) return;
      M.quizIndex = Number(row.dataset.i);
      paintQuizPreview();
      toast(`이 문제를 다음 라운드로 준비했어요`);
    };
  });
  el.querySelectorAll('[data-edit]').forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); editQuestion(Number(btn.dataset.edit)); };
  });
  el.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const i = Number(btn.dataset.del);
      if(!confirm('이 문제를 지울까요?')) return;
      const qs = S.pack.questions.filter((_, idx) => idx !== i);
      if(!qs.length){ toast('문제는 최소 1개 있어야 해요'); return; }
      setPackAndBump({ ...S.pack, questions: qs });
    };
  });
  $('#mcPackCount').textContent = `${S.pack.questions.length}문제`;
}

function setPackAndBump(pack){
  S.pack = pack;
  store('pack', pack);
  M.packRev++;
  emit('pack', pack);
  renderPackList();
  paintQuizPreview();
  broadcast();
  // 접속 중인 참가자에게 새 팩 전송
  net.send('pack', { pack, packRev: M.packRev, broadcast: true });
}

function editQuestion(index){
  const q = index == null ? { cat: '회사', q: '', c: ['', '', '', ''], a: 0, note: '' } : S.pack.questions[index];
  modal(`
    <h3>${index == null ? '문제 추가' : '문제 수정'}</h3>
    <p class="mini">보기는 최소 2개. 정답 번호를 골라주세요.</p>
    <div class="field"><label>분류</label><input class="input" id="eqCat" maxlength="12" value="${esc(q.cat || '')}" placeholder="회사 · 넌센스 · 상식"></div>
    <div class="field"><label>질문</label><input class="input" id="eqQ" maxlength="200" value="${esc(q.q)}" placeholder="예) 우리 회사 탕비실 커피머신 브랜드는?"></div>
    <div class="field"><label>보기 (정답에 체크)</label>
      <div id="eqChoices">
        ${[0,1,2,3].map(i => `<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
          <input type="radio" name="eqA" value="${i}" ${i === (q.a || 0) ? 'checked' : ''}>
          <input class="input" data-c="${i}" maxlength="60" value="${esc(q.c[i] || '')}" placeholder="보기 ${'ABCD'[i]}">
        </div>`).join('')}
      </div>
    </div>
    <div class="field"><label>해설 (선택)</label><input class="input" id="eqNote" maxlength="200" value="${esc(q.note || '')}"></div>
    <div class="m-actions">
      <button class="btn ghost" data-close>취소</button>
      <button class="btn" id="eqSave">저장</button>
    </div>
  `, {
    onMount(card){
      card.querySelector('#eqSave').onclick = () => {
        const cat = card.querySelector('#eqCat').value.trim() || '기타';
        const text = card.querySelector('#eqQ').value.trim();
        const choices = [...card.querySelectorAll('[data-c]')].map(i => i.value.trim()).filter(Boolean);
        const note = card.querySelector('#eqNote').value.trim();
        const a = Number(card.querySelector('input[name=eqA]:checked')?.value || 0);
        if(!text){ toast('질문을 넣어주세요'); return; }
        if(choices.length < 2){ toast('보기를 2개 이상 넣어주세요'); return; }
        const item = { cat, q: text, c: choices.slice(0, 4), a: Math.min(a, choices.length - 1), note };
        const qs = [...S.pack.questions];
        if(index == null) qs.push(item); else qs[index] = item;
        setPackAndBump({ ...S.pack, questions: qs });
        closeModal();
        toast(index == null ? '문제를 추가했어요' : '문제를 고쳤어요');
      };
    }
  });
}

function exportJson(){
  const blob = new Blob([JSON.stringify(S.pack, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `송년회_문제팩_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  toast('문제팩 JSON을 내려받았어요');
}

async function importJson(e){
  const file = e.target.files[0];
  e.target.value = '';
  if(!file) return;
  try{
    const text = await file.text();
    const pack = sanitizePack(JSON.parse(text));
    setPackAndBump(pack);
    toast(`${pack.questions.length}문제를 불러왔어요`);
  }catch(err){
    toast('불러오지 못했어요 · ' + err.message, 3200);
  }
}

// ── 룰렛 편집 ──
function renderWheelEditor(){
  const el = $('#mcWheelEdit');
  if(!el) return;
  el.innerHTML = S.wheel.map((it, i) => `
    <div class="we" data-i="${i}">
      <input data-name maxlength="16" value="${esc(it.label)}">
      <input class="w" data-weight type="number" min="1" max="99" value="${Number(it.weight) || 1}">
      <button data-del title="삭제">✕</button>
    </div>`).join('');
  el.querySelectorAll('.we').forEach(row => {
    const i = Number(row.dataset.i);
    const name = row.querySelector('[data-name]');
    const weight = row.querySelector('[data-weight]');
    const commit = () => {
      const items = S.wheel.map((it, idx) => idx === i ? { ...it, label: name.value.trim() || it.label, weight: clamp(Number(weight.value) || 1, 1, 99) } : it);
      applyWheel(items, false);
    };
    name.onchange = commit;
    weight.onchange = commit;
    row.querySelector('[data-del]').onclick = () => {
      if(S.wheel.length <= 2){ toast('항목은 2개 이상 필요해요'); return; }
      applyWheel(S.wheel.filter((_, idx) => idx !== i));
    };
  });
  $('#mcWheelCount').textContent = `${S.wheel.length}개`;
}

function applyWheel(items, rerender = true){
  S.wheel = items;
  store('wheel', items);
  M.wheelRev++;
  emit('wheel', items);
  if(rerender) renderWheelEditor();
  broadcast();
}

function sfxBeep(){ import('./core.js').then(m => m.sfx.beep()); }
function sfxWin(){ import('./core.js').then(m => m.sfx.win()); }
