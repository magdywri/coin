/* الربط بين لوحة التحكم وشاشة اللايف عن طريق وسيط مجاني على النت (MQTT) — من غير أي برنامج على الجهاز */
(function (g) {
  var BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://mqtt.eclipseprojects.io/mqtt', 'wss://test.mosquitto.org:8081/'];
  var INFO = { lib: typeof mqtt !== 'undefined', url: '', status: 'connecting', err: '', tries: 0 };
  function getRoom() {
    var q = new URLSearchParams(location.search).get('room'), r = q;
    var pm = location.pathname.match(/\/o\/([A-Za-z0-9]+)/);
    if (!r && pm) r = pm[1];
    if (!r && /^#[A-Za-z0-9]{6,}$/.test(location.hash)) r = location.hash.slice(1);
    try {
      if (!r) r = localStorage.getItem('cc_room');
      if (!r) { r = Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6); }
      localStorage.setItem('cc_room', r);
    } catch (e) { if (!r) r = 'local' + Math.random().toString(36).slice(2, 8); }
    return r;
  }
  var room = getRoom();

  function open() {
    if (g.__RELAY_FAKE) return g.__RELAY_FAKE(room);
    var subs = {}, ci = 0, client = null, status = 'connecting', statusCb = function () {};
    var pending = [];
    function top(s) { return 'ccsite-v1/' + room + '/' + s; }
    function setStatus(s) { status = s; INFO.status = s; statusCb(s); }
    function start() {
      if (typeof mqtt === 'undefined') { INFO.lib = false; INFO.err = 'مكتبة mqtt ما اتحمّلتش (jsdelivr مقفول؟)'; return setStatus('error'); }
      var url = BROKERS[ci % BROKERS.length], gaveUp = false; INFO.url = url; INFO.tries++; INFO.lib = true;
      client = mqtt.connect(url, { clean: true, reconnectPeriod: 3000, connectTimeout: 9000, clientId: 'cc_' + Math.random().toString(36).slice(2, 10) });
      var t = setTimeout(function () { if (status !== 'ok') { gaveUp = true; try { client.end(true); } catch (e) {} ci++; start(); } }, 10000);
      client.on('connect', function () {
        clearTimeout(t); if (gaveUp) return; setStatus('ok');
        Object.keys(subs).forEach(function (k) { client.subscribe(top(k), { qos: 0 }); });
        pending.splice(0).forEach(function (p) { client.publish(top(p[0]), p[1], { retain: p[2] }); });
      });
      client.on('error', function (e) { INFO.err = String(e && e.message || e).slice(0, 80); });
      client.on('close', function () { if (status === 'ok') setStatus('connecting'); });
      client.on('message', function (tp, payload) {
        var k = tp.slice(top('').length), f = subs[k]; if (!f) return;
        var o; try { o = JSON.parse(payload.toString()); } catch (e) { return; }
        f(o);
      });
    }
    start();
    return {
      room: room,
      onStatus: function (cb) { statusCb = cb; cb(status); },
      sub: function (k, f) { subs[k] = f; if (client && client.connected) client.subscribe(top(k), { qos: 0 }); },
      pub: function (k, obj, retain) {
        var s = JSON.stringify(obj);
        if (client && client.connected) client.publish(top(k), s, { retain: !!retain });
        else if (retain || (k === 'cmd' && obj.type !== 'sync')) pending.push([k, s, !!retain]);
      }
    };
  }
  g.CCRelay = { open: open, room: room, info: INFO };
  // شريط حالة صغير: في لوحة التحكم دايماً، وفي الشاشة لو الرابط فيه debug=1
  function badge() {
    var dbg = new URLSearchParams(location.search).get('debug');
    if (!document.getElementById('pv') && !dbg) return;
    var b = document.createElement('div');
    b.style.cssText = 'position:fixed;z-index:98;left:8px;bottom:8px;max-width:92vw;background:rgba(0,0,0,.75);color:#9fe;border:1px solid #356;border-radius:8px;padding:5px 10px;font:12px monospace;direction:ltr;pointer-events:none';
    document.body.appendChild(b);
    setInterval(function () {
      b.textContent = 'relay: ' + INFO.status + ' | lib:' + (typeof mqtt !== 'undefined' ? 'ok' : 'NO') + ' | ' + INFO.url.replace('wss://', '') + ' | try#' + INFO.tries + (INFO.err ? ' | ' + INFO.err : '');
      b.style.color = INFO.status === 'ok' ? '#7f7' : '#fc6';
    }, 1000);
  }
  if (document.body) badge(); else document.addEventListener('DOMContentLoaded', badge);

  // مكان socket.io: لوحة التحكم ومعاينة الشاشة بتستخدم نفس الكود القديم بس عن طريق الوسيط
  g.io = function () {
    var r = open(), h = {}, last = null, lastAt = 0, got = false;
    var api = {
      on: function (e, f) { h[e] = f; },
      emit: function (e, d) { if (e === 'cmd') r.pub('cmd', d); }
    };
    r.sub('st', function (m) {
      if (m.state) { banner(m.t ? Date.now() - m.t > 9000 : false); last = m.state; lastAt = Date.now(); got = true; if (h.state) h.state(m.state); }
      (m.events || []).forEach(function (ev) { if (h[ev.t]) h[ev.t](ev.d); });
    });
    r.onStatus(function (s) { if (s === 'ok') { r.pub('cmd', { type: 'sync' }); if (h.connect) h.connect(); } });
    var n = 0, bn = null;
    function banner(show) {
      if (!document.getElementById('pv')) return;      // بس في لوحة التحكم
      if (show && !bn) {
        bn = document.createElement('div');
        bn.style.cssText = 'position:fixed;z-index:99;left:50%;top:70px;transform:translateX(-50%);background:#3a2a05;color:#ffd24a;border:1px solid #8a6a12;padding:10px 18px;border-radius:12px;font:700 14px Cairo,Segoe UI,Tahoma;direction:rtl;box-shadow:0 8px 30px rgba(0,0,0,.6)';
        bn.textContent = '⚠ مفيش شاشة شغالة لسه. انسخ الرابط اللي فوق وافتحه في تاب جديد (أو حطه في تيك توك استوديو)، واتركه مفتوح.';
        document.body.appendChild(bn);
      } else if (!show && bn) { bn.remove(); bn = null; }
    }
    setTimeout(function () { if (!got) banner(true); }, 4000);
    setInterval(function () { if (got && last && lastAt && Date.now() - lastAt > 9000) banner(true); }, 3000);
    setInterval(function () {            // لحد ما الحالة الجديدة توصل، الوقت بيكمّل نزول عندنا
      if (!got && (n++ % 4 === 0)) r.pub('cmd', { type: 'sync' });
      if (last && last.status === 'running' && h.state) {
        var s = JSON.parse(JSON.stringify(last)), el = Math.floor((Date.now() - lastAt) / 1000);
        s.remaining = Math.max(0, s.remaining - el); h.state(s);
      }
    }, 1000);
    return api;
  };
})(window);
