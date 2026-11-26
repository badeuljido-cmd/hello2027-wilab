// 아주 작은 MQTT 3.1.1 클라이언트 (WebSocket, QoS 0 전용)
// 공개 브로커에 붙어 방 단위로 메시지를 주고받는 용도로만 씁니다.

const enc = new TextEncoder();
const dec = new TextDecoder();

function u16(n){ return [(n >> 8) & 255, n & 255]; }

function utf8(str){
  const b = enc.encode(str);
  return [...u16(b.length), ...b];
}

function packet(header, body){
  const len = [];
  let n = body.length;
  do{
    let byte = n & 127;
    n = Math.floor(n / 128);
    if(n > 0) byte |= 128;
    len.push(byte);
  }while(n > 0);
  const out = new Uint8Array(1 + len.length + body.length);
  out[0] = header;
  out.set(len, 1);
  out.set(body, 1 + len.length);
  return out;
}

function remainingLength(buf, offset){
  let value = 0, mult = 1, i = offset, byte;
  do{
    if(i >= buf.length) return {value: -1, bytes: 0};
    byte = buf[i++];
    value += (byte & 127) * mult;
    mult *= 128;
  }while(byte & 128);
  return {value, bytes: i - offset};
}

export class MqttClient {
  constructor(url, opts = {}){
    this.url = url;
    this.clientId = opts.clientId || ('yj' + Math.random().toString(16).slice(2, 10));
    this.onMessage = opts.onMessage || (() => {});
    this.onOpen = opts.onOpen || (() => {});
    this.onClose = opts.onClose || (() => {});
    this.onError = opts.onError || (() => {});
    this.ws = null;
    this.connected = false;
    this.subs = new Set();
    this.queue = [];
    this.rx = new Uint8Array(0);
    this.pingTimer = null;
    this.manualClose = false;
  }

  connect(){
    this.manualClose = false;
    let ws;
    try{
      ws = new WebSocket(this.url, ['mqtt']);
    }catch(e){
      this.onError(e);
      return;
    }
    this.ws = ws;
    ws.binaryType = 'arraybuffer';

    const timer = setTimeout(() => {
      if(!this.connected){ try{ ws.close(); }catch(e){} }
    }, 9000);

    ws.onopen = () => {
      clearTimeout(timer);
      const body = [
        ...utf8('MQTT'), 4, 0x02, ...u16(45),
        ...utf8(this.clientId)
      ];
      ws.send(packet(0x10, body));
    };
    ws.onmessage = (ev) => this._feed(ev.data);
    ws.onclose = (ev) => {
      clearTimeout(timer);
      const was = this.connected;
      this.connected = false;
      this._stopPing();
      if(!this.manualClose) this.onClose({code: ev.code, wasConnected: was, reason: ev.reason});
    };
    ws.onerror = () => { this.onError(new Error('socket error')); };
  }

  subscribe(topic){
    this.subs.add(topic);
    if(this.connected) this._sendSub(topic);
  }

  _sendSub(topic){
    const body = [0x00, 0x01, ...utf8(topic), 0x00];
    this.ws.send(packet(0x82, body));
  }

  publish(topic, text){
    if(!this.connected){
      if(this.queue.length < 80) this.queue.push([topic, text]);
      return false;
    }
    this._sendPub(topic, text);
    return true;
  }

  _sendPub(topic, text){
    const payload = enc.encode(text);
    const body = [...utf8(topic), ...payload];
    this.ws.send(packet(0x30, body));
  }

  _flush(){
    const q = this.queue.splice(0, this.queue.length);
    for(const [t, p] of q) this._sendPub(t, p);
  }

  _startPing(){
    this._stopPing();
    this.pingTimer = setInterval(() => {
      if(this.connected){
        try{ this.ws.send(new Uint8Array([0xC0, 0x00])); }catch(e){}
      }
    }, 25000);
  }

  _stopPing(){
    if(this.pingTimer){ clearInterval(this.pingTimer); this.pingTimer = null; }
  }

  _feed(data){
    let chunk;
    if(typeof data === 'string') chunk = enc.encode(data);
    else chunk = new Uint8Array(data);

    const merged = new Uint8Array(this.rx.length + chunk.length);
    merged.set(this.rx, 0);
    merged.set(chunk, this.rx.length);
    this.rx = merged;

    for(;;){
      if(this.rx.length < 2) break;
      const rl = remainingLength(this.rx, 1);
      if(rl.value < 0) break;
      const total = 1 + rl.bytes + rl.value;
      if(this.rx.length < total) break;
      const pkt = this.rx.subarray(0, total);
      this.rx = this.rx.subarray(total);
      this._handle(pkt, 1 + rl.bytes, total);
    }
  }

  _handle(pkt, start, end){
    const type = pkt[0] >> 4;
    if(type === 2){ // CONNACK
      const ok = pkt[start + 1] === 0;
      if(ok){
        this.connected = true;
        this._startPing();
        for(const t of this.subs) this._sendSub(t);
        this._flush();
        this.onOpen();
      }else{
        this.onError(new Error('connack ' + pkt[start + 1]));
      }
      return;
    }
    if(type === 3){ // PUBLISH
      const qos = (pkt[0] >> 1) & 3;
      const tlen = (pkt[start] << 8) | pkt[start + 1];
      let p = start + 2;
      const topic = dec.decode(pkt.subarray(p, p + tlen));
      p += tlen;
      if(qos > 0) p += 2;
      const payload = dec.decode(pkt.subarray(p, end));
      try{ this.onMessage(topic, payload); }catch(e){}
      return;
    }
    if(type === 13){ // PINGRESP
      return;
    }
  }

  close(){
    this.manualClose = true;
    this._stopPing();
    try{
      if(this.ws && this.ws.readyState === 1) this.ws.send(new Uint8Array([0xE0, 0x00]));
      if(this.ws) this.ws.close();
    }catch(e){}
    this.connected = false;
  }
}
