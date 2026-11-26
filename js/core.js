// 공통 코어: 저장소, 실시간 연결, UI 헬퍼
import { MqttClient } from './mqtt.js';
import { randomNick, clonePack, DEFAULT_PACK, DEFAULT_WHEEL, sanitizePack } from './data.js';

const LS = 'yj26.';
const params = new URLSearchParams(location.search);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export const won = (n) => Math.round(n).toLocaleString('ko-KR');
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function store(key, value){
  if(value === undefined){
    try{ const raw = localStorage.getItem(LS + key); return raw === null ? null : JSON.parse(raw); }
    catch(e){ return null; }
  }
  try{ localStorage.setItem(LS + key, JSON.stringify(value)); return true; }
  catch(e){ return false; }
}

export function uid(){
  const k = 'uid';
  let id = store(k);
  if(!id){
    id = 'u' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
    store(k, id);
  }
  return id;
}

function tabId(){
  const device = uid();
  let t = '';
  try{
    t = sessionStorage.getItem('yj26tab') || '';
    if(!t){ t = Math.random().toString(36).slice(2, 7); sessionStorage.setItem('yj26tab', t); }
  }catch(e){ t = Math.random().toString(36).slice(2, 7); }
  return device + '-' + t;
}

export const S = {
  me: { id: '', nick: '' },
  room: '',
  pack: clonePack(DEFAULT_PACK),
  wheel: JSON.parse(JSON.stringify(DEFAULT_WHEEL)),
  mute: !!store('mute'),
  live: { online: false, broker: '', state: null, rev: 0, peers: [] },
  pts: 0,
  mc: { unlocked: false, pin: '2026' },
  lastPackRev: 0
};

S.me.id = tabId();

export const bus = new EventTarget();
export function emit(type, detail){ bus.dispatchEvent(new CustomEvent(type, {detail})); }
export function on(type, fn){ bus.addEventListener(type, e => fn(e.detail)); }

// ── 닉네임 / 설정 로드 ──
export function initMe(){
  const saved = store('nick');
  S.me.nick = saved || randomNick();
  if(!saved) store('nick', S.me.nick);
  S.room = (params.get('room') || store('room') || 'YE2026').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'YE2026';
  const p = store('pack');
  if(p){ try{ S.pack = sanitizePack(p); }catch(e){ S.pack = clonePack(DEFAULT_PACK); } }
  const w = store('wheel');
  if(Array.isArray(w) && w.length >= 2) S.wheel = w;
  S.mc.pin = String(store('pin') || '2026');
}

export function setNick(nick){
  S.me.nick = nick.slice(0, 18);
  store('nick', S.me.nick);
  $('#meName').textContent = S.me.nick;
  const nn = $('#nickName');
  if(nn) nn.textContent = S.me.nick;
  emit('nick', S.me.nick);
}

export function setPack(pack, { persist = true } = {}){
  S.pack = pack;
  if(persist) store('pack', pack);
  emit('pack', pack);
}

export function setWheel(items, { persist = true } = {}){
  S.wheel = items;
  if(persist) store('wheel', items);
  emit('wheel', items);
}

export function addPoints(n, why = ''){
  if(!n) return;
  S.pts += n;
  const el = $('#mePts');
  if(el) el.textContent = S.pts;
  store('pts', S.pts);
  emit('pts', {n, why});
  if(n > 0) toast(`+${n}점${why ? ' · ' + why : ''}`);
  net.send('pts', { add: n, why });
}

// ── 실시간 연결 ──
const BROKERS = [
  { url: 'wss://broker.emqx.io:8084/mqtt', name: 'EMQX' },
  { url: 'wss://broker.hivemq.com:8884/mqtt', name: 'HiveMQ' },
  { url: 'wss://test.mosquitto.org:8081/', name: 'Mosquitto' }
];

class Net {
  constructor(){
    this.client = null;
    this.bc = null;
    this.topic = '';
    this.seen = new Map();
    this.seq = 0;
    this.status = 'idle';
    this.broker = '';
    this.handlers = new Set();
    this.attempt = 0;
    this.reconnectTimer = null;
    this.startedAt = Date.now();
    this.useBC = params.get('nobc') !== '1';
    const custom = params.get('broker');
    this.brokers = custom ? [{ url: custom, name: '직접 연결' }] : BROKERS;
  }

  onMessage(fn){ this.handlers.add(fn); }

  start(room){
    this.stop();
    this.room = room;
    this.topic = `yj26p-4d8c/${room}`;
    if(this.useBC){
      try{
        this.bc = new BroadcastChannel('yj26-' + room);
        this.bc.onmessage = (e) => this._deliver(e.data, 'bc');
      }catch(e){ this.bc = null; }
    }
    this._setStatus('connecting');
    this._connect(0);
  }

  stop(){
    if(this.reconnectTimer){ clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if(this.client){ try{ this.client.close(); }catch(e){} this.client = null; }
    if(this.bc){ try{ this.bc.close(); }catch(e){} this.bc = null; }
  }

  switchRoom(room){
    if(room === this.room) return;
    store('room', room);
    this.start(room);
  }

  _connect(index){
    if(index >= this.brokers.length){
      this._setStatus('offline');
      this._scheduleReconnect();
      return;
    }
    const b = this.brokers[index];
    this.broker = b.name;
    this._setStatus('connecting', b.name);

    const client = new MqttClient(b.url, {
      clientId: 'yj26_' + Math.random().toString(16).slice(2, 10),
      onOpen: () => {
        this.client = client;
        client.subscribe(this.topic);
        this.attempt = 0;
        this._setStatus('online', b.name);
      },
      onMessage: (topic, payload) => {
        if(topic !== this.topic) return;
        let msg;
        try{ msg = JSON.parse(payload); }catch(e){ return; }
        this._deliver(msg, 'mqtt');
      },
      onClose: () => {
        if(this.client === client) this.client = null;
        this._setStatus('offline', b.name);
        this._connect(index + 1);
      },
      onError: () => {}
    });
    client.connect();
  }

  _scheduleReconnect(){
    if(this.reconnectTimer) return;
    this.attempt = Math.min(this.attempt + 1, 5);
    const delay = Math.min(15000, 1200 * Math.pow(1.7, this.attempt));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._connect(0);
    }, delay);
  }

  _setStatus(status, broker = this.broker){
    this.status = status;
    this.broker = broker || '';
    emit('net', { status, broker: this.broker });
  }

  _deliver(msg, via){
    if(!msg || typeof msg !== 'object' || !msg.mid) return;
    if(this.seen.has(msg.mid)) return;
    this.seen.set(msg.mid, Date.now());
    if(this.seen.size > 600){
      const cutoff = Date.now() - 120000;
      for(const [k, v] of this.seen){ if(v < cutoff) this.seen.delete(k); }
    }
    if(via) msg._via = via;
    for(const fn of this.handlers){ try{ fn(msg); }catch(e){ console.error(e); } }
  }

  send(type, data = {}){
    const msg = { mid: `${S.me.id}-${Date.now().toString(36)}-${++this.seq}`, from: S.me.id, nick: S.me.nick, t: type, ts: Date.now(), ...data };
    this.seen.set(msg.mid, Date.now());
    if(this.bc){ try{ this.bc.postMessage(msg); }catch(e){} }
    if(this.client && this.client.connected) this.client.publish(this.topic, JSON.stringify(msg));
    return msg;
  }
}

export const net = new Net();
export const isMcHost = () => !!store('mcUnlocked');

// ── 사운드 ──
let audioCtx = null;
function ac(){
  if(!audioCtx){
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return null;
    audioCtx = new AC();
  }
  if(audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function tone(freq, dur = 0.12, type = 'sine', gain = 0.06, delay = 0){
  if(S.mute) return;
  const ctx = ac();
  if(!ctx) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export const sfx = {
  click(){ tone(520, 0.06, 'square', 0.03); },
  tick(){ tone(880, 0.03, 'square', 0.02); },
  reel(){ tone(320 + Math.random() * 80, 0.04, 'triangle', 0.03); },
  stop(){ tone(180, 0.09, 'sine', 0.05); },
  win(){ [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.07, i * 0.09)); },
  jackpot(){ [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.22, 'triangle', 0.08, i * 0.1)); },
  lose(){ tone(200, 0.18, 'sawtooth', 0.04); tone(150, 0.24, 'sawtooth', 0.04, 0.12); },
  beep(){ tone(660, 0.1, 'sine', 0.05); },
  buzz(){ if(navigator.vibrate) navigator.vibrate(18); }
};

export function toggleMute(){
  S.mute = !S.mute;
  store('mute', S.mute);
  const b = $('#btnMute');
  if(b) b.textContent = S.mute ? '🔇' : '🔊';
  if(!S.mute) sfx.beep();
  return S.mute;
}

// ── 토스트 / 모달 ──
let toastTimer = null;
export function toast(msg, ms = 2200){
  const t = $('#toast');
  if(!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

export function modal(html, { onMount } = {}){
  const m = $('#modal');
  const card = $('#modalCard');
  card.innerHTML = html;
  m.hidden = false;
  if(onMount) onMount(card);
  return card;
}
export function closeModal(){ $('#modal').hidden = true; }
document.addEventListener('click', (e) => {
  if(e.target.id === 'modal') closeModal();
  const close = e.target.closest('[data-close]');
  if(close) closeModal();
});

// ── 파티클 ──
const fx = () => $('#fx');
let particles = [];
let rafId = null;
export function confetti(count = 90, opts = {}){
  const canvas = fx();
  if(!canvas) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const colors = opts.colors || ['#e8c877', '#f9ecc4', '#ff5d8f', '#5ff0c4', '#9b8bff', '#ffffff'];
  for(let i = 0; i < count; i++){
    particles.push({
      x: opts.x ?? w / 2 + (Math.random() - 0.5) * w * 0.5,
      y: opts.y ?? h * 0.35,
      vx: (Math.random() - 0.5) * 9,
      vy: -Math.random() * 11 - 3,
      size: 4 + Math.random() * 7,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      life: 1
    });
  }
  if(!rafId) loop(ctx);
}

function loop(ctx){
  rafId = requestAnimationFrame(() => loop(ctx));
  const w = window.innerWidth, h = window.innerHeight;
  ctx.clearRect(0, 0, w, h);
  for(const p of particles){
    p.vy += 0.32;
    p.vx *= 0.995;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    p.life -= 0.006;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    ctx.restore();
  }
  particles = particles.filter(p => p.life > 0 && p.y < h + 60);
  if(!particles.length){
    cancelAnimationFrame(rafId);
    rafId = null;
    ctx.clearRect(0, 0, w, h);
  }
}

// ── 화면 전환 ──
const screens = {};
export function registerScreen(name, obj){ screens[name] = Object.assign(screens[name] || {}, obj); }

export function go(route){
  const clean = route.replace(/^#\/?/, '') || 'home';
  location.hash = '#/' + clean;
  show(clean);
}

export function show(name){
  const target = screens[name] ? name : 'home';
  for(const [key, sc] of Object.entries(screens)){
    const on = key === target;
    if(sc.el) sc.el.hidden = !on;
    if(on && sc.enter) sc.enter();
    if(!on && sc.leave) sc.leave();
  }
  document.body.classList.toggle('mc-mode', target === 'mc');
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  emit('screen', target);
}

export function currentRoute(){ return (location.hash.replace(/^#\/?/, '') || 'home'); }

window.addEventListener('hashchange', () => show(currentRoute()));
