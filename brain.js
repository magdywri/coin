/* عقل تحدي العملات — بيشتغل جوه صفحة الشاشة نفسها (نفس منطق السيرفر القديم بالظبط) */
(function (g) {
  var ALLOWED = {
    theme: ['red', 'gold', 'blue', 'purple', 'green', 'pink', 'mono'],
    style: ['classic', 'neon', 'glass', 'arcade', 'bars', 'minimal'],
    bg: ['grad', 'grid', 'dots', 'stripes', 'aurora', 'stars', 'glow'],
    effect: ['none', 'coins', 'confetti', 'sparks']
  };
  var DEFAULTS = {
    title: 'تحدي العملات', duration: 60, overtime: 30, places: 5, theme: 'red', style: 'classic', bg: 'grad', effect: 'none',
    extendOn: true, extendWindow: 15,
    extendTiers: [{ from: 1, seconds: 10 }, { from: 50, seconds: 20 }, { from: 100, seconds: 30 }],
    warnSeconds: 10, username: '', autoConnect: true, source: 'tikfinity', tikfinityPort: 21213,
    showPrizes: true, winText: 'مبروك {name} 🎉 كسبت {prize}',
    prizes: [{ from: 1, text: '2000 روبوكس' }, { from: 100, text: '3000 روبوكس' }, { from: 200, text: '5000 روبوكس' }],
    giftPrices: {}
  };
  function start(opts) {
    opts = opts || {};
    var relay = g.CCRelay ? g.CCRelay.open() : null;
    var settings = Object.assign({}, DEFAULTS);
    try { Object.assign(settings, JSON.parse(localStorage.getItem('cc_settings') || '{}')); } catch (e) {}
    function saveSettings() { try { localStorage.setItem('cc_settings', JSON.stringify(settings)); } catch (e) {} if (relay) relay.pub('cfg', settings, true); }

    var state = { status: 'stopped', remaining: settings.duration, overtimeUsed: false, inOvertime: false, board: {}, tiktok: { connected: false, message: 'غير متصل' } };
    var handlers = opts.handlers || {};
    var queue = [];
    function emit(t, d) { if (handlers[t]) handlers[t](d); queue.push({ t: t, d: d }); if (queue.length > 60) queue.shift(); }

    function top() {
      return Object.keys(state.board).map(function (k) { return state.board[k]; })
        .sort(function (a, b) { return b.coins - a.coins || a.firstAt - b.firstAt; })
        .slice(0, settings.places).map(function (u) { return { id: u.id, name: u.name, avatar: u.avatar, coins: u.coins }; });
    }
    function publicState() {
      return { settings: settings, status: state.status, remaining: state.remaining, inOvertime: state.inOvertime,
        participants: Object.keys(state.board).length, top: top(), tiktok: state.tiktok, auto: { studioOpen: true, overlays: 1, paused: false } };
    }
    var pubT = null, lastRelay = 0, relayT = null;
    function toRelay(force) {
      if (!relay) return;
      var now = Date.now();
      if (!force && now - lastRelay < 900) { if (!relayT) relayT = setTimeout(function () { relayT = null; toRelay(true); }, 950 - (now - lastRelay)); return; }
      lastRelay = now; relay.pub('st', { t: Date.now(), state: publicState(), events: queue.splice(0) }, true);
    }
    function publish() {
      if (pubT) return;
      pubT = setTimeout(function () { pubT = null; if (handlers.state) handlers.state(publicState()); toRelay(false); }, 60);
    }

    // ---- المؤقت
    setInterval(function () {
      if (state.status !== 'running') return;
      state.remaining -= 1;
      if (state.remaining <= 0) {
        if (settings.overtime > 0 && !state.overtimeUsed) {
          state.overtimeUsed = true; state.inOvertime = true; state.remaining = settings.overtime; emit('overtime', settings.overtime);
        } else { state.remaining = 0; state.status = 'ended'; state.inOvertime = false; }
      }
      publish();
    }, 1000);
    function resetAll() { state.status = 'stopped'; state.remaining = settings.duration; state.overtimeUsed = false; state.inOvertime = false; state.board = {}; }

    function addCoins(user, coins, giftName, o) {
      var force = o && o.force;
      if (!coins || coins <= 0) return;
      if (!force && state.status !== 'running') { emit('gift', { name: user.name || user.id, coins: coins, giftName: giftName || '', ignored: true }); return; }
      var id = String(user.id || user.name);
      var u = state.board[id] || (state.board[id] = { id: id, name: user.name || id, avatar: user.avatar || '', coins: 0, firstAt: Date.now() });
      if (user.name) u.name = user.name;
      if (user.avatar) u.avatar = user.avatar;
      u.coins += coins;
      emit('gift', { name: u.name, coins: coins, giftName: giftName || '' });
      if (settings.extendOn && state.status === 'running' && state.remaining > 0 && state.remaining <= settings.extendWindow) {
        var sec = 0;
        settings.extendTiers.forEach(function (t) { if (coins >= t.from) sec = t.seconds; });
        if (sec > 0) { state.remaining += sec; emit('extend', { seconds: sec, by: u.name, coins: coins }); }
      }
      publish();
    }

    // ---- TikFinity (من المتصفح مباشرة على جهازك)
    function giftValue(d) {
      var c = [d.diamondCount, d.diamond_count, d.giftDiamondCount, d.gift && d.gift.diamondCount, d.gift && d.gift.diamond_count,
        d.giftDetails && d.giftDetails.diamondCount, d.extendedGiftInfo && d.extendedGiftInfo.diamond_count];
      for (var i = 0; i < c.length; i++) { var n = Number(c[i]); if (n > 0) return n; }
      var manual = settings.giftPrices && settings.giftPrices[String(d.giftName || '').toLowerCase()];
      return Number(manual) > 0 ? Number(manual) : 0;
    }
    var streaks = {}, seenMsg = [], seenSet = {};
    function tfMessage(raw) {
      var m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (!m || String(m.event || '').toLowerCase() !== 'gift') return;
      var d = m.data || {};
      var ended = d.repeatEnd === true || d.repeatEnd === 1;
      var mid = d.msgId != null ? String(d.msgId) + '|' + (d.repeatCount || '') + '|' + ended : '';
      if (mid) { if (seenSet[mid]) return; seenSet[mid] = 1; seenMsg.push(mid); if (seenMsg.length > 3000) delete seenSet[seenMsg.shift()]; }
      var per = giftValue(d), rc = Math.max(1, Number(d.repeatCount) || 1), who = d.uniqueId || d.userId || d.nickname, count = rc;
      if (d.giftType === 1 || d.groupId) {
        var key = String(d.groupId || (who + '|' + (d.giftId || d.giftName))), prev = streaks[key], now = Date.now();
        var same = prev && rc >= prev.last && (d.groupId || now - prev.t < 8000);
        count = same ? rc - prev.last : rc;
        if (ended) delete streaks[key]; else streaks[key] = { last: rc, t: now };
      }
      var coins = per * count;
      if (!coins) { if (per === 0) emit('gift', { name: d.nickname || who, coins: 0, giftName: d.giftName || '', zero: true }); return; }
      addCoins({ id: who, name: d.nickname || d.uniqueId, avatar: d.profilePictureUrl }, coins, d.giftName);
    }
    var ws = null, tfT = null, tfPaused = false;
    function setConn(ok, msg) { if (state.tiktok.connected === ok && state.tiktok.message === msg) return; state.tiktok = { connected: ok, message: msg }; publish(); }
    function tfStop() { clearTimeout(tfT); if (ws) { var w = ws; ws = null; try { w.onclose = null; w.onerror = function () {}; w.close(); } catch (e) {} } }
    function tfRetry() { clearTimeout(tfT); tfT = setTimeout(tfStart, 3000); }
    function tfStart() {
      if (tfPaused || ws || opts.noTikfinity) return;
      var w;
      try { w = new WebSocket('ws://localhost:' + (settings.tikfinityPort || 21213) + '/'); } catch (e) { return tfRetry(); }
      ws = w;
      w.onopen = function () { setConn(true, 'متصل بـ TikFinity ✓'); };
      w.onmessage = function (ev) { tfMessage(ev.data); };
      w.onerror = function () {};
      w.onclose = function () { if (ws !== w) return; ws = null; setConn(false, 'في انتظار TikFinity... افتحه وهيتربط لوحده'); tfRetry(); };
    }

    // ---- تجارب
    var FAKE = ['أحمد', 'سارة', 'محمد', 'منى', 'يوسف', 'نور', 'خالد', 'هدى', 'عمر', 'ليلى', 'كريم', 'رنا'];
    var GIFTS = [['Rose', 1], ['TikTok', 1], ['Finger Heart', 5], ['Doughnut', 30], ['Hand Hearts', 100], ['Perfume', 20], ['Galaxy', 1000]];
    function fakeGift() {
      var n = FAKE[Math.floor(Math.random() * FAKE.length)], gg = GIFTS[Math.floor(Math.random() * GIFTS.length)];
      addCoins({ id: 'test_' + n, name: n }, gg[1] * (1 + Math.floor(Math.random() * 5)), gg[0], { force: true });
    }

    // ---- الأوامر (من لوحة التحكم)
    function applySettings(p) {
      if (typeof p.title === 'string') settings.title = p.title.slice(0, 60);
      if (p.duration != null) settings.duration = Math.max(5, Math.min(86400, parseInt(p.duration, 10) || settings.duration));
      if (p.overtime != null) settings.overtime = Math.max(0, Math.min(3600, parseInt(p.overtime, 10) || 0));
      if (typeof p.extendOn === 'boolean') settings.extendOn = p.extendOn;
      if (p.extendWindow != null) settings.extendWindow = Math.max(1, Math.min(300, parseInt(p.extendWindow, 10) || settings.extendWindow));
      if (Array.isArray(p.extendTiers)) {
        var t = p.extendTiers.slice(0, 8).map(function (r) { return { from: Math.max(1, parseInt(r && r.from, 10) || 0), seconds: Math.max(1, Math.min(600, parseInt(r && r.seconds, 10) || 0)) }; })
          .filter(function (r) { return r.from > 0 && r.seconds > 0; }).sort(function (a, b) { return a.from - b.from; });
        if (t.length) settings.extendTiers = t;
      }
      if (p.places != null) settings.places = Math.max(1, Math.min(10, parseInt(p.places, 10) || settings.places));
      if (p.warnSeconds != null) settings.warnSeconds = Math.max(0, Math.min(120, parseInt(p.warnSeconds, 10) || 0));
      ['theme', 'style', 'bg', 'effect'].forEach(function (k) { if (typeof p[k] === 'string' && ALLOWED[k].indexOf(p[k]) >= 0) settings[k] = p[k]; });
      if (typeof p.showPrizes === 'boolean') settings.showPrizes = p.showPrizes;
      if (typeof p.winText === 'string') settings.winText = p.winText.slice(0, 80) || DEFAULTS.winText;
      if (Array.isArray(p.prizes)) {
        settings.prizes = p.prizes.slice(0, 12).map(function (r) { return { from: Math.max(0, parseInt(r && r.from, 10) || 0), text: String((r && r.text) || '').slice(0, 40) }; })
          .filter(function (r) { return r.text; }).sort(function (a, b) { return a.from - b.from; });
      }
      if (p.giftPrices && typeof p.giftPrices === 'object') {
        var gp = {};
        Object.keys(p.giftPrices).slice(0, 200).forEach(function (k) { var n = parseInt(p.giftPrices[k], 10); if (k.trim() && n > 0) gp[k.trim().toLowerCase().slice(0, 60)] = n; });
        settings.giftPrices = gp;
      }
      if (typeof p.autoConnect === 'boolean') settings.autoConnect = p.autoConnect;
      if (p.tikfinityPort != null) {
        var n2 = parseInt(p.tikfinityPort, 10);
        if (n2 > 0 && n2 < 65536 && n2 !== settings.tikfinityPort) { settings.tikfinityPort = n2; tfStop(); tfStart(); }
      }
      saveSettings();
      if (state.status === 'stopped') state.remaining = settings.duration;
    }
    function handleCmd(cmd) {
      cmd = cmd || {};
      switch (cmd.type) {
        case 'sync': toRelay(true); return;
        case 'start':
          if (state.status === 'ended') resetAll();
          if (state.remaining <= 0) state.remaining = settings.duration;
          state.status = 'running'; break;
        case 'pause': if (state.status === 'running') state.status = 'paused'; break;
        case 'reset': resetAll(); break;
        case 'addTime': {
          var s = parseInt(cmd.seconds, 10) || 0;
          state.remaining = Math.max(0, state.remaining + s);
          if (state.status === 'ended' && state.remaining > 0) state.status = 'paused'; break;
        }
        case 'settings': applySettings(cmd.settings || {}); break;
        case 'connect': tfPaused = false; tfStop(); tfStart(); return;
        case 'disconnect': tfPaused = true; tfStop(); setConn(false, 'غير متصل'); return;
        case 'testExtend':
          if (state.status !== 'running') state.status = 'running';
          state.inOvertime = false;
          if (state.remaining > 12 || state.remaining <= 0) state.remaining = 12;
          addCoins({ id: 'test_extend', name: 'اختبار التمديد' }, 60, 'Test', { force: true }); break;
        case 'testGift': fakeGift(); return;
        case 'testBurst': for (var i = 0; i < 10; i++) setTimeout(fakeGift, i * 300); return;
        case 'removeUser': delete state.board[cmd.id]; break;
        case 'addCoins': addCoins({ id: cmd.id, name: cmd.name }, parseInt(cmd.amount, 10) || 0, 'يدوي', { force: true }); return;
      }
      publish();
    }

    var gotCfg = false;
    if (relay) relay.sub('cfg', function (m) {   // أول ما الشاشة تفتح من غير إعدادات محفوظة، ناخد آخر إعدادات من الوسيط
      if (gotCfg) return; gotCfg = true;
      var has = false; try { has = !!localStorage.getItem('cc_settings'); } catch (e) {}
      if (!has && m && typeof m === 'object') { Object.assign(settings, m); if (state.status === 'stopped') state.remaining = settings.duration; publish(); }
    });
    if (relay) relay.sub('cmd', handleCmd);
    setInterval(function () { toRelay(true); }, 4000);   // نبض: لوحة التحكم تعرف إن الشاشة شغالة
    tfStart();
    publish();
    return { handleCmd: handleCmd, publicState: publicState, tfMessage: tfMessage, state: state, settings: settings };
  }
  g.CCBrain = { start: start };
})(window);
