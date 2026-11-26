// 게임 5종
import { $, $$, S, store, net, toast, confetti, sfx, addPoints, emit, on, esc, sleep, clamp, registerScreen } from './core.js';
import { GRADE_TABLE } from './data.js';

// ════════════════════════════════════════════════
// 공통: 당첨 인증 오버레이
// ════════════════════════════════════════════════
export function showWin({ tag, title, reels = '', sub = '', pts = 0, hint = '', againLabel = '한 번 더', onAgain }){
  const ov = $('#winOverlay');
  const card = $('#winCard');
  card.innerHTML = `
    <div class="w-tag">${esc(tag)}</div>
    <div class="w-title">${esc(title)}</div>
    ${reels ? `<div class="w-reels">${reels}</div>` : ''}
    <div class="w-sub">${esc(sub)}</div>
    <div class="w-name">${esc(S.me.nick)}</div>
    ${pts ? `<div class="w-pts">+${pts}점</div>` : ''}
    <div class="w-actions">
      ${onAgain ? `<button class="btn" id="winAgain">${esc(againLabel)}</button>` : ''}
      <button class="btn ghost" id="winClose">닫기</button>
    </div>
    <div class="w-hint">${esc(hint || '이 화면 그대로 찍어서 단체방에 인증하세요')}</div>
  `;
  ov.hidden = false;
  $('#winClose').onclick = () => { ov.hidden = true; };
  if(onAgain) $('#winAgain').onclick = () => { ov.hidden = true; onAgain(); };
  if(pts >= 20) confetti(140);
  else confetti(70);
}

// ════════════════════════════════════════════════
// 1. 슬롯
// ════════════════════════════════════════════════
const SLOT_SYMBOLS = ['7', '🍒', '🔔', '⭐', '🍀', '💎'];

function slotPick(){
  // 7은 각 릴당 8% 정도로 살짝 희귀하게
  if(Math.random() < 0.08) return '7';
  const rest = SLOT_SYMBOLS.slice(1);
  return rest[Math.floor(Math.random() * rest.length)];
}

export function initSlot(){
  const reels = $$('#reels .reel');
  const btn = $('#btnSpin');
  const resultEl = $('#slotResult');
  const machine = $('.machine');
  let spinning = false;
  let tries = Number(store('slotTries') || 0);
  let best = Number(store('slotBest') || 0);

  const paintStats = () => {
    $('#slotTries').textContent = `도전 ${tries}회`;
    $('#slotBest').textContent = best ? `최고 ${best}점` : '최고 기록 없음';
  };
  paintStats();
  $('#btnMute').textContent = S.mute ? '🔇' : '🔊';
  $('#btnMute').onclick = () => {
    import('./core.js').then(m => { const muted = m.toggleMute(); $('#btnMute').textContent = muted ? '🔇' : '🔊'; });
  };

  async function spin(){
    if(spinning) return;
    spinning = true;
    btn.disabled = true;
    machine.classList.add('spinning');
    resultEl.textContent = '돌아가는 중...';
    reels.forEach(r => { r.classList.remove('hit', 'stop'); r.classList.add('spin'); });

    const finals = [slotPick(), slotPick(), slotPick()];
    const rollTimer = setInterval(() => {
      reels.forEach(r => {
        if(r.classList.contains('spin')){
          r.querySelector('.sym').textContent = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
        }
      });
      sfx.reel();
    }, 80);

    for(let i = 0; i < 3; i++){
      await sleep(i === 0 ? 750 : 380);
      const r = reels[i];
      r.classList.remove('spin');
      r.classList.add('stop');
      r.querySelector('.sym').textContent = finals[i];
      sfx.stop();
    }
    clearInterval(rollTimer);
    machine.classList.remove('spinning');

    const [a, b, c] = finals;
    const triple = a === b && b === c;
    const jackpot = triple && a === '7';
    const pair = !triple && (a === b || b === c || a === c);

    tries++;
    store('slotTries', tries);

    let pts = 0, title = '', tag = '', sub = '';
    if(jackpot){
      pts = 50; tag = 'JACKPOT'; title = '잭팟!';
      sub = '이건 운이 아니라 실력이라고 우기셔도 됩니다';
      reels.forEach(r => r.classList.add('hit'));
      sfx.jackpot();
    }else if(triple){
      pts = 20; tag = 'TRIPLE'; title = '트리플!';
      sub = `${a} 세 개가 나왔어요`;
      reels.forEach(r => r.classList.add('hit'));
      sfx.win();
    }else if(pair){
      pts = 5; tag = 'DOUBLE'; title = '더블';
      sub = '두 개는 맞았어요. 아깝다';
      sfx.beep();
      confetti(30);
    }else{
      tag = '꽝'; title = '아쉽지만 꽝';
      sub = '다음 판에 행운이 몰려올지도';
      sfx.lose();
    }

    resultEl.textContent = jackpot ? '777 잭팟!' : triple ? `${a}${a}${a} 트리플` : pair ? '두 개 일치 · 더블' : '아쉬워요, 꽝';
    if(pts){
      addPoints(pts, '슬롯');
      best = Math.max(best, pts);
      store('slotBest', best);
    }
    paintStats();

    if(jackpot || triple || pair){
      await sleep(320);
      showWin({ tag, title, reels: finals.join(' '), sub, pts, againLabel: '한 번 더', onAgain: spin });
    }
    btn.disabled = false;
    spinning = false;
  }

  btn.onclick = spin;
}

// ════════════════════════════════════════════════
// 2. 룰렛
// ════════════════════════════════════════════════
const WHEEL_COLORS = ['#2b2436', '#463a2a', '#332a3f', '#5a4726', '#2a3340', '#4a2c3a', '#3d3524', '#2e2a45'];
const WHEEL_COLORS_ALT = ['#3b3150', '#7a5f2a', '#443a5c', '#8a6c30', '#36445c', '#6c3a4e', '#5c5030', '#463f66'];

export function initRoulette(){
  const cv = $('#wheel');
  const ctx = cv.getContext('2d');
  let angle = -Math.PI / 2;
  let spinning = false;
  let wheel = S.wheel;

  function segments(){
    const items = S.wheel.length ? S.wheel : [{ label: '항목 없음', weight: 1 }];
    const total = items.reduce((s, i) => s + Math.max(0.01, Number(i.weight) || 0), 0);
    let acc = 0;
    return items.map((it, idx) => {
      const w = Math.max(0.01, Number(it.weight) || 0);
      const span = (w / total) * Math.PI * 2;
      const seg = { ...it, idx, start: acc, span, mid: acc + span / 2 };
      acc += span;
      return seg;
    });
  }

  function draw(){
    const W = cv.width, R = W / 2;
    ctx.clearRect(0, 0, W, W);
    const segs = segments();

    // 테두리 링
    ctx.beginPath();
    ctx.arc(R, R, R - 4, 0, Math.PI * 2);
    const ring = ctx.createLinearGradient(0, 0, W, W);
    ring.addColorStop(0, '#f9ecc4'); ring.addColorStop(.35, '#b8912f'); ring.addColorStop(.7, '#f9ecc4'); ring.addColorStop(1, '#8b6a20');
    ctx.strokeStyle = ring; ctx.lineWidth = 10; ctx.stroke();

    for(const s of segs){
      const a0 = angle + s.start, a1 = angle + s.start + s.span;
      ctx.beginPath();
      ctx.moveTo(R, R);
      ctx.arc(R, R, R - 22, a0, a1);
      ctx.closePath();
      ctx.fillStyle = WHEEL_COLORS[s.idx % WHEEL_COLORS.length];
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.lineWidth = 2; ctx.stroke();

      // 라벨
      const mid = angle + s.mid;
      ctx.save();
      ctx.translate(R, R);
      ctx.rotate(mid);
      const flip = Math.cos(mid) < 0;
      if(flip) ctx.rotate(Math.PI);
      ctx.textAlign = flip ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      const label = String(s.label || '').slice(0, 12);
      ctx.font = `700 ${label.length > 8 ? 22 : 26}px ${getComputedStyle(document.body).fontFamily}`;
      ctx.fillStyle = s.kind === 'penalty' ? '#ffd0dd' : '#fbefce';
      ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 6;
      ctx.fillText(label, flip ? -(R - 52) : (R - 52), 0);
      ctx.restore();

      // 금색 구분 장식
      ctx.beginPath();
      ctx.moveTo(R, R);
      ctx.lineTo(R + Math.cos(a0) * (R - 22), R + Math.sin(a0) * (R - 22));
      ctx.strokeStyle = 'rgba(232,200,119,.12)'; ctx.lineWidth = 1; ctx.stroke();
    }

    // 가운데 원
    ctx.beginPath(); ctx.arc(R, R, R * 0.17, 0, Math.PI * 2);
    ctx.fillStyle = '#0d0c14'; ctx.fill();
    ctx.strokeStyle = 'rgba(232,200,119,.4)'; ctx.lineWidth = 2; ctx.stroke();
  }
  function drawFix(){
    draw();
  }

  function currentSeg(){
    const segs = segments();
    const pointer = -Math.PI / 2;
    let rel = ((pointer - angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    for(const s of segs){
      if(rel >= s.start && rel < s.start + s.span) return s;
    }
    return segs[segs.length - 1];
  }

  function renderMeta(){
    const total = S.wheel.reduce((s, i) => s + (Number(i.weight) || 0), 0) || 1;
    $('#wheelMeta').textContent = `${S.wheel.length}개 항목 · 회전판은 사회자 설정과 같아요`;
    $('#wheelList').innerHTML = S.wheel.map((it, i) => `
      <div class="wheel-item ${it.kind === 'penalty' ? 'penalty' : 'prize'}">
        <span class="sw" style="background:${WHEEL_COLORS_ALT[i % WHEEL_COLORS_ALT.length]}"></span>
        <span class="w-name">${esc(it.label)}</span>
        <span class="w-pct">${Math.round((Number(it.weight) || 0) / total * 100)}%</span>
      </div>`).join('');
  }

  async function spin(){
    if(spinning) return;
    spinning = true;
    const hub = $('#btnSpinWheel');
    hub.disabled = true;
    $('#wheelResult').textContent = '두구두구...';

    const segs = segments();
    // 가중치 추첨
    const total = segs.reduce((s, x) => s + x.span, 0);
    let r = Math.random() * total, chosen = segs[0];
    for(const s of segs){ r -= s.span; if(r <= 0){ chosen = s; break; } }

    const pointer = -Math.PI / 2;
    const targetMod = ((pointer - chosen.mid) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const curMod = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    let delta = targetMod - curMod;
    if(delta < Math.PI * 0.6) delta += Math.PI * 2;
    const turns = 4 + Math.floor(Math.random() * 3);
    const from = angle;
    const to = angle + delta + turns * Math.PI * 2;
    const dur = 4600;
    const t0 = performance.now();
    const segCount = segs.length;
    let lastSeg = -1, tickAcc = 0;

    await new Promise(resolve => {
      function frame(t){
        const p = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3.1);
        angle = from + (to - from) * e;
        drawFix();
        tickAcc += (to - from) * (e - (1 - Math.pow(1 - Math.max(0, p - 0.02), 3.1)));
        const segIdx = Math.floor(((((-Math.PI / 2 - angle) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * segCount);
        if(segIdx !== lastSeg){ lastSeg = segIdx; sfx.tick(); }
        if(p < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });

    angle = ((to % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    drawFix();
    const got = currentSeg();
    $('#wheelResult').textContent = got.kind === 'penalty' ? `벌칙 · ${got.label}` : `당첨 · ${got.label}`;
    if(got.kind === 'penalty'){
      sfx.win();
      showWin({ tag: 'PENALTY', title: got.label, sub: '오늘의 벌칙 당첨자입니다', pts: 0, againLabel: '한 번 더', onAgain: spin, hint: '벌칙은 웃으면서 받아주세요' });
    }else{
      sfx.jackpot();
      showWin({ tag: 'LUCKY', title: got.label, sub: '축하합니다, 오늘의 행운 주인공', pts: 0, againLabel: '한 번 더', onAgain: spin });
    }
    hub.disabled = false;
    spinning = false;
  }

  on('wheel', () => { renderMeta(); drawFix(); });
  registerScreen('roulette', {
    enter(){ renderMeta(); drawFix(); }
  });
  // 화면이 열려 있지 않아도 초기 1회 그림
  setTimeout(() => { try{ renderMeta(); drawFix(); }catch(e){} }, 60);
  $('#btnSpinWheel').onclick = spin;
}

// ════════════════════════════════════════════════
// 3. 블라인드 스톱워치
// ════════════════════════════════════════════════
export function initStopwatch(){
  const digits = $('#stopDigits');
  const stateEl = $('#stopState');
  const btn = $('#btnStopStart');
  const fill = $('#stopFill');
  const TARGET = 7.77;
  const BLIND_AT = 3500;
  let running = false;
  let startedAt = 0;
  let raf = null;
  let tries = Number(store('stopTries') || 0);
  let bestDiff = store('stopBest');
  let lastTick = 0;

  const paintStats = () => {
    $('#stopTries').textContent = `${tries}회`;
    $('#stopBest').textContent = bestDiff == null ? '기록 없음' : `±${Number(bestDiff).toFixed(2)}초`;
  };

  $('#gradeTable').innerHTML = GRADE_TABLE.map(g => `
    <div class="grade-row"><span class="g-name">${esc(g.name)}</span><span class="g-range">${esc(g.range)} · ${g.pts}점</span></div>
  `).join('');

  function frame(){
    const el = (performance.now() - startedAt) / 1000;
    if(el * 1000 < BLIND_AT){
      digits.textContent = el.toFixed(2);
      digits.classList.remove('blind');
      if(el - lastTick > 0.1){
        lastTick = el;
        sfx.tick();
      }
    }else{
      digits.textContent = '?.??';
      digits.classList.add('blind');
    }
    fill.style.width = Math.min(100, (el / 10) * 100) + '%';
    if(running) raf = requestAnimationFrame(frame);
  }

  function start(){
    running = true;
    startedAt = performance.now();
    lastTick = 0;
    digits.textContent = '0.00';
    digits.classList.remove('blind');
    stateEl.textContent = '3.5초 뒤 숫자가 사라져요';
    btn.textContent = '멈추기';
    btn.classList.remove('gold');
    sfx.beep();
    frame();
  }

  function stop(){
    running = false;
    cancelAnimationFrame(raf);
    const el = (performance.now() - startedAt) / 1000;
    const diff = Math.abs(el - TARGET);
    tries++;
    store('stopTries', tries);
    if(bestDiff == null || diff < Number(bestDiff)){ bestDiff = diff; store('stopBest', diff); }
    paintStats();

    digits.textContent = el.toFixed(2);
    digits.classList.remove('blind');
    const grade = GRADE_TABLE.find(g => diff <= g.max) || GRADE_TABLE[GRADE_TABLE.length - 1];
    stateEl.textContent = `7.77까지 ${diff.toFixed(2)}초 차이`;

    if(grade.pts){
      addPoints(grade.pts, '스톱워치');
      sfx.win();
      showWin({
        tag: 'STOP ' + el.toFixed(2),
        title: grade.name,
        sub: `7.77초에서 ${diff.toFixed(2)}초 벗어났어요`,
        pts: grade.pts,
        againLabel: '다시 도전',
        onAgain: reset
      });
    }else{
      sfx.lose();
      toast(`7.77초에서 ${diff.toFixed(2)}초 차이 · ${grade.name}`);
    }
    btn.textContent = '다시 도전';
    btn.classList.add('gold');
  }

  function reset(){
    running = false;
    cancelAnimationFrame(raf);
    digits.textContent = '0.00';
    digits.classList.remove('blind');
    stateEl.textContent = '준비됐으면 시작';
    btn.textContent = '시작';
    btn.classList.add('gold');
    fill.style.width = '0%';
  }

  btn.onclick = () => { if(running) stop(); else if(btn.textContent === '다시 도전'){ reset(); start(); } else start(); };
  paintStats();
  registerScreen('stopwatch', { enter(){ paintStats(); } });
}

// ════════════════════════════════════════════════
// 4. 퀴즈
// ════════════════════════════════════════════════
const QUIZ_TIME = 15;

export function initQuiz(){
  const box = $('#quizBox');
  const qIndex = $('#qIndex');
  const qTimer = $('#qTimer');
  const qBar = $('#qBar');
  const qText = $('#qText');
  const qChoices = $('#qChoices');
  const qFoot = $('#qFoot');
  const scoreEl = $('#quizScore');
  const rightEl = $('#quizRight');
  const bestEl = $('#quizBest');

  let mode = 'solo';
  let deck = [];
  let qi = 0;
  let score = 0;
  let rightCount = 0;
  let answered = false;
  let timerId = null;
  let deadline = 0;
  let liveQid = null;
  let liveAnswered = false;
  let rafId = null;

  $('#quizBest').textContent = store('quizBest') || 0;

  function shuffle(arr){
    const a = arr.slice();
    for(let i = a.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function paintPackInfo(){
    $('#packInfo').textContent = `${S.pack.questions.length}문제 · ${S.pack.name || '기본팩'}`;
  }

  function buildDeck(){
    deck = shuffle(S.pack.questions).slice(0, Math.min(10, S.pack.questions.length));
    qi = 0; score = 0; rightCount = 0;
    scoreEl.textContent = '0'; rightEl.textContent = '0';
  }

  function stopTimer(){
    if(timerId){ clearInterval(timerId); timerId = null; }
    if(rafId){ cancelAnimationFrame(rafId); rafId = null; }
  }

  function renderQuestion(q){
    qText.textContent = q.q;
    qChoices.innerHTML = q.c.map((c, i) => `<button class="q-choice" data-i="${i}"><span class="num">${'ABCD'[i]}</span><span>${esc(c)}</span></button>`).join('');
    qChoices.querySelectorAll('.q-choice').forEach(btn => {
      btn.onclick = () => answer(Number(btn.dataset.i));
    });
  }

  function tickTimer(limitMs){
    stopTimer();
    const total = limitMs;
    timerId = setInterval(() => {
      const left = deadline - Date.now();
      const ratio = clamp(left / total, 0, 1);
      qBar.style.width = (ratio * 100) + '%';
      qTimer.textContent = `${Math.max(0, left / 1000).toFixed(0)}초`;
      if(left <= 0){
        stopTimer();
        qBar.style.width = '0%';
        qTimer.textContent = '0초';
        if(mode === 'solo') revealSolo(-1);
      }
    }, 100);
  }

  function answer(i){
    if(answered) return;
    answered = true;
    if(mode === 'solo') revealSolo(i);
    else {
      liveAnswered = true;
      net.send('ans', { qid: liveQid, choice: i, ms: QUIZ_TIME * 1000 - Math.max(0, deadline - Date.now()) });
      qChoices.querySelectorAll('.q-choice').forEach((btn, idx) => {
        btn.disabled = true;
        if(idx === i) btn.classList.add('right');
      });
      qFoot.innerHTML = '제출 완료. 사회자가 정답을 공개할 때까지 기다려 주세요.';
      sfx.beep();
    }
  }

  function revealSolo(i){
    stopTimer();
    const q = deck[qi];
    const correct = q.a;
    const ok = i === correct;
    qChoices.querySelectorAll('.q-choice').forEach((btn, idx) => {
      btn.disabled = true;
      if(idx === correct) btn.classList.add('right');
      else if(idx === i) btn.classList.add('wrong');
      else btn.classList.add('dim');
    });
    if(ok){
      score += 10; rightCount++;
      scoreEl.textContent = score;
      rightEl.textContent = rightCount;
      sfx.win();
    }else{
      sfx.lose();
    }
    qFoot.innerHTML = (i === -1 ? '<b>시간 초과</b> · ' : ok ? '<b>정답</b> · ' : '<b>아쉬워요</b> · ') + `정답은 ${'ABCD'[correct]}번. ${esc(q.note || '')}`;
    const isLast = qi >= deck.length - 1;
    qFoot.innerHTML += `<div style="margin-top:12px"><button class="btn small gold" id="btnNextQ">${isLast ? '결과 보기' : '다음 문제'}</button></div>`;
    $('#btnNextQ').onclick = () => {
      if(isLast) finish();
      else { qi++; renderSolo(); }
    };
    if(ok) confetti(26);
  }

  function renderSolo(){
    answered = false;
    const q = deck[qi];
    qIndex.textContent = `${qi + 1} / ${deck.length} · ${q.cat || ''}`;
    renderQuestion(q);
    qFoot.textContent = '';
    deadline = Date.now() + QUIZ_TIME * 1000;
    tickTimer(QUIZ_TIME * 1000);
    qBar.style.width = '100%';
  }

  function finish(){
    stopTimer();
    const best = Math.max(Number(store('quizBest') || 0), score);
    store('quizBest', best);
    bestEl.textContent = best;
    qIndex.textContent = '결과';
    qText.textContent = `${deck.length}문제 중 ${rightCount}개 정답`;
    qChoices.innerHTML = '';
    qTimer.textContent = '';
    qBar.style.width = '0%';
    qFoot.innerHTML = `점수 <b>${score}점</b> · 최고 기록 <b>${best}점</b>
      <div style="margin-top:12px"><button class="btn small gold" id="btnAgain">한 번 더</button></div>`;
    $('#btnAgain').onclick = startSolo;
    if(score >= 80) confetti(120);
  }

  function startSolo(){
    buildDeck();
    renderSolo();
  }

  // ── 라이브 모드 ──
  function renderLive(){
    stopTimer();
    const st = S.live.state;
    if(!st || !st.quiz || !st.quiz.qid){
      qIndex.textContent = '실시간 대기';
      qText.textContent = '사회자가 문제를 띄울 때까지 기다려 주세요.';
      qChoices.innerHTML = '';
      qTimer.textContent = '';
      qBar.style.width = '0%';
      qFoot.innerHTML = S.live.online ? '연결됐어요. 곧 시작합니다.' : '실시간 연결을 준비하고 있어요. 연결이 안 되면 사회자가 문제팩 링크를 공유합니다.';
      box.classList.add('waiting');
      return;
    }
    const meLive = (st.players || []).find(p => p.id === S.me.id);
    if(meLive) scoreEl.textContent = meLive.pts;
    const qz = st.quiz;
    if(qz.qid !== liveQid){
      liveQid = qz.qid;
      liveAnswered = false;
      answered = false;
      qIndex.textContent = `${(qz.index ?? 0) + 1} / ${qz.total || '?'} · 실시간`;
      qText.textContent = qz.q;
      renderQuestion({ q: qz.q, c: qz.choices, a: -1 });
      qFoot.textContent = '';
      deadline = qz.deadline || (Date.now() + QUIZ_TIME * 1000);
      tickTimer(Math.max(1000, deadline - (qz.startedAt || Date.now())));
      if(st.phase === 'quiz-answer'){
        revealLive();
      }
    }
    if(st.phase === 'quiz-answer') revealLive();
  }

  function revealLive(){
    stopTimer();
    const st = S.live.state;
    if(!st || !st.quiz) return;
    const qz = st.quiz;
    const correct = qz.answer;
    qChoices.querySelectorAll('.q-choice').forEach((btn, idx) => {
      btn.disabled = true;
      if(idx === correct) btn.classList.add('right');
      else btn.classList.add('dim');
    });
    const mine = (st.quiz.stats && st.quiz.stats.byPlayer) ? st.quiz.stats.byPlayer[S.me.id] : null;
    const right = mine && mine.choice === correct;
    if(mine && !right){
      const myBtn = qChoices.querySelectorAll('.q-choice')[mine.choice];
      if(myBtn){ myBtn.classList.remove('dim'); myBtn.classList.add('wrong'); }
    }
    if(right) confetti(30);
    qFoot.innerHTML = (right ? '<b>정답</b>' : '<b>이번엔 아쉬워요</b>') + ` · 정답은 ${'ABCD'[correct]}번. ${esc(qz.note || '')}`;
    qTimer.textContent = '';
    qBar.style.width = '0%';
  }

  // 모드 전환
  function setMode(m){
    mode = m;
    $$('#quizModeSwitch .seg').forEach(x => x.classList.toggle('active', x.dataset.mode === m));
    answered = false;
    liveQid = null;
    stopTimer();
    if(m === 'solo') startSolo();
    else renderLive();
  }
  $$('#quizModeSwitch .seg').forEach(b => {
    b.onclick = () => setMode(b.dataset.mode);
  });
  on('openlive', (game) => { if(game === 'quiz') setMode('live'); });

  $('#btnQuizRestart').onclick = () => { if(mode === 'solo') startSolo(); else renderLive(); };
  $('#btnQuizShuffle').onclick = () => { if(mode === 'solo') startSolo(); else toast('실시간 모드는 사회자가 순서를 정해요'); };

  on('pack', () => { paintPackInfo(); });
  on('mcstate', () => {
    if(mode !== 'live') return;
    const st = S.live.state;
    if(st && st.phase && st.phase.startsWith('quiz')) renderLive();
    else renderLive();
  });
  on('net', () => { if(mode === 'live') renderLive(); });

  registerScreen('quiz', {
    enter(){
      paintPackInfo();
      const st = S.live.state;
      const liveNow = st && st.phase && String(st.phase).startsWith('quiz');
      if(liveNow) setMode('live');
      else if(mode === 'live') renderLive();
      else if(!deck.length) startSolo();
    }
  });
  paintPackInfo();
}

// ════════════════════════════════════════════════
// 5. 눈치 게임
// ════════════════════════════════════════════════
const BOTS = ['감각형 수달', '계산형 부엉이', '무념무상 판다', '승부사 여우', '눈치왕 너구리'];

export function initGuess(){
  let gmode = 'third';
  let busy = false;
  let liveRound = null;
  let liveMode = null;
  let liveSubmitted = false;
  let liveDeadline = 0;
  let clockId = null;

  const desc = {
    third: '0부터 100 사이 숫자를 하나 골라요. 모두의 평균에 2/3를 곱한 값에 가장 가까운 사람이 이겨요. 남들이 몇을 낼지까지 생각해야 해요.',
    unique: '1부터 100 사이 숫자를 골라요. 아무도 고르지 않은 숫자 중 가장 작은 수를 낸 사람이 이겨요. 겹치면 바로 탈락.'
  };
  const rules = {
    third: `<p class="mini">정답은 <b>평균 × 2/3</b>. 모두 100을 내면 66, 모두 그걸 예상하면 44... 이렇게 계속 내려가요. 보통 사람은 33 근처를 찍고, 그걸 아는 사람은 22 근처를 찍어요.</p>`,
    unique: `<p class="mini">1~100 중 겹치지 않은 숫자 중 <b>가장 작은 수</b>가 승리. 작은 수로 몰리니까 10~30 사이에서 남들이 안 고를 것 같은 틈을 노려보세요.</p>`
  };

  function setMode(m){
    gmode = m;
    $$('#guessMode .seg').forEach(x => x.classList.toggle('active', x.dataset.gmode === m));
    $('#gDesc').textContent = desc[m];
    $('#guessRuleBody').innerHTML = rules[m];
    $('#gResult').innerHTML = '';
    $('#gInput').placeholder = m === 'third' ? '0 ~ 100' : '1 ~ 100';
    $('#gRound').textContent = '혼자 연습 · AI 5명';
    $('#gClock').textContent = '';
    const quick = m === 'third' ? [11, 22, 33, 44] : [7, 13, 21, 34];
    $('#gQuick').innerHTML = quick.map(v => `<button data-v="${v}">${v}</button>`).join('');
    $$('#gQuick button').forEach(b => { b.onclick = () => { $('#gInput').value = b.dataset.v; }; });
  }

  function computeThird(values){
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const target = avg * 2 / 3;
    let best = Infinity, winners = [];
    values.forEach(v => {
      const d = Math.abs(v - target);
      if(d < best - 1e-9){ best = d; winners = [v]; }
      else if(Math.abs(d - best) < 1e-9) winners.push(v);
    });
    return { avg, target, winners };
  }

  function computeUnique(values){
    const count = new Map();
    values.forEach(v => count.set(v, (count.get(v) || 0) + 1));
    const unique = values.filter(v => count.get(v) === 1);
    const winner = unique.length ? Math.min(...unique) : null;
    return { count, winner };
  }

  function renderResult(entries, resultHtml){
    const rows = entries.map(e => `
      <tr class="${e.me ? 'me' : ''} ${e.win ? 'win' : ''}">
        <td>${esc(e.name)}${e.win ? ' 🏆' : ''}</td>
        <td>${e.value}</td>
        <td>${e.note || ''}</td>
      </tr>`).join('');
    $('#gResult').innerHTML = resultHtml + `
      <table><thead><tr><th>참가자</th><th>숫자</th><th>비고</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function playSolo(){
    if(busy) return;
    const raw = Number($('#gInput').value);
    const lo = gmode === 'third' ? 0 : 1;
    if(!Number.isFinite(raw) || raw < lo || raw > 100){
      toast(`숫자는 ${lo}부터 100까지만 넣어주세요`);
      return;
    }
    const mine = Math.round(raw);
    busy = true;
    sfx.beep();

    const bots = BOTS.map(name => {
      let v;
      if(gmode === 'third'){
        const base = 33 + (Math.random() - 0.5) * 30;
        v = clamp(Math.round(base + (Math.random() < 0.2 ? -12 : 0)), 0, 100);
      }else{
        v = clamp(1 + Math.floor(Math.pow(Math.random(), 1.5) * 100), 1, 100);
      }
      return { name, value: v, me: false };
    });

    const entries = [{ name: S.me.nick, value: mine, me: true }, ...bots];
    const values = entries.map(e => e.value);

    if(gmode === 'third'){
      const { avg, target, winners } = computeThird(values);
      entries.forEach(e => { e.win = winners.includes(e.value); e.note = e.win ? '적중' : ''; });
      entries.sort((a, b) => Math.abs(a.value - target) - Math.abs(b.value - target));
      const iWin = entries.some(e => e.me && e.win);
      if(iWin){ addPoints(30, '눈치'); sfx.win(); confetti(80); }
      else sfx.lose();
      renderResult(entries, `
        <p class="big">${iWin ? '이번 판은 내가 이겼어요 🏆' : '아깝게 놓쳤어요'}</p>
        <p>평균 <b>${avg.toFixed(1)}</b> · 목표값 <b>${target.toFixed(1)}</b> · 내 숫자 <b>${mine}</b> (${Math.abs(mine - target).toFixed(1)} 차이)</p>`);
    }else{
      const { count, winner } = computeUnique(values);
      entries.forEach(e => {
        const dup = count.get(e.value) > 1;
        e.win = winner !== null && e.value === winner;
        e.note = dup ? '겹침' : e.win ? '최소 고유수' : '고유';
      });
      entries.sort((a, b) => a.value - b.value);
      const iWin = winner !== null && mine === winner;
      if(iWin){ addPoints(30, '눈치'); sfx.win(); confetti(80); }
      else sfx.lose();
      renderResult(entries, `
        <p class="big">${iWin ? '겹치지 않는 숫자, 내가 가져갔어요 🏆' : winner === null ? '전원 겹쳤어요. 무승부' : `승자는 ${winner}번`}</p>
        <p>${winner === null ? '아무도 고유한 숫자를 내지 못했어요. 한 번 더!' : `고유한 숫자 중 가장 작은 값이 <b>${winner}</b>이었어요.`}</p>`);
    }
    busy = false;
  }

  // ── 라이브 ──
  function liveTick(){
    if(!clockId && liveDeadline){
      clockId = setInterval(() => {
        const left = liveDeadline - Date.now();
        $('#gClock').textContent = left > 0 ? `${Math.ceil(left / 1000)}초` : '마감';
        if(left <= 0){
          clearInterval(clockId); clockId = null;
          liveSubmitted = true;
          $('#btnGuess').disabled = true;
        }
      }, 200);
    }
  }

  function renderLive(){
    const st = S.live.state;
    const g = st && st.guess;
    if(!g || !g.rid){
      $('#gRound').textContent = '실시간 대기';
      $('#gDesc').textContent = '사회자가 라운드를 열면 여기에 문제가 떠요.';
      $('#gClock').textContent = '';
      $('#gInput').disabled = true;
      $('#btnGuess').disabled = true;
      $('#gResult').innerHTML = S.live.online ? '연결됐어요. 사회자가 시작하면 알려드릴게요.' : '실시간 연결을 준비 중이에요.';
      return;
    }
    if(g.rid !== liveRound){
      liveRound = g.rid;
      liveMode = g.mode;
      liveSubmitted = false;
      liveDeadline = g.deadline || 0;
      $('#gInput').disabled = false;
      $('#btnGuess').disabled = false;
      $('#gInput').value = '';
      $('#gResult').innerHTML = '';
      $('#gDesc').textContent = desc[g.mode] ;
      $('#gRound').textContent = `실시간 라운드 · ${g.mode === 'third' ? '평균의 2/3' : '겹치지 않는 숫자'}`;
      liveTick();
    }
    if(st.phase === 'guess-result' && g.result){
      clearInterval(clockId); clockId = null;
      $('#btnGuess').disabled = true;
      $('#gInput').disabled = true;
      const r = g.result;
      const entries = (r.entries || []).map(e => ({ ...e, me: e.id === S.me.id }));
      const myEntry = entries.find(e => e.me);
      if(g.mode === 'third'){
        const iWin = myEntry && myEntry.win;
        renderResult(entries, `<p class="big">${iWin ? '내가 이겼어요 🏆' : '이번 판 결과'}</p>
          <p>평균 <b>${Number(r.avg).toFixed(1)}</b> · 목표값 <b>${Number(r.target).toFixed(1)}</b>${myEntry ? ` · 내 숫자 <b>${myEntry.value}</b>` : ''}</p>`);
      }else{
        renderResult(entries, `<p class="big">${r.winner == null ? '전원 겹침, 무승부' : `승자 ${r.winner}번`}</p>`);
      }
      if(myEntry && myEntry.win) confetti(90);
    }
  }

  function submitLive(){
    const st = S.live.state;
    if(!st || !st.guess || !st.guess.rid){ toast('지금은 실시간 라운드가 없어요'); return; }
    if(liveSubmitted) return;
    const lo = liveMode === 'third' ? 0 : 1;
    const v = Math.round(Number($('#gInput').value));
    if(!Number.isFinite(v) || v < lo || v > 100){ toast(`${lo}부터 100 사이로 넣어주세요`); return; }
    liveSubmitted = true;
    net.send('guess', { rid: st.guess.rid, mode: liveMode, value: v });
    $('#btnGuess').disabled = true;
    $('#gResult').innerHTML = `제출 완료 · 내 숫자 <b>${v}</b><br>사회자가 결과를 집계할 때까지 기다려 주세요.`;
    sfx.beep();
  }

  $$('#guessMode .seg').forEach(b => { b.onclick = () => setMode(b.dataset.gmode); });
  $('#btnGuess').onclick = () => { if(liveRound && S.live.state && S.live.state.guess) submitLive(); else playSolo(); };
  $('#gInput').addEventListener('keydown', e => { if(e.key === 'Enter') $('#btnGuess').click(); });

  on('mcstate', () => { if(liveRound !== null || (S.live.state && S.live.state.guess)) renderLive(); });
  on('openlive', (g) => { if(g === 'guess') renderLive(); });
  on('net', () => { if(S.live.state) renderLive(); });

  registerScreen('guess', {
    enter(){
      if(!$('#guessRuleBody').innerHTML) setMode(gmode);
      if(S.live.state && S.live.state.guess) renderLive();
      else setMode(gmode);
    }
  });
  setMode('third');
}
