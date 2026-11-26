/* محرك الكارت — مشترك بين صفحة الشاشة (overlay) ولوحة التحكم والنسخة التجريبية */
(function (global) {
  var OPTIONS = {
    themes:  { red: 'أحمر', gold: 'ذهبي', blue: 'أزرق', purple: 'بنفسجي', green: 'أخضر', pink: 'وردي', mono: 'رمادي' },
    styles:  { classic: 'كلاسيك', neon: 'نيون', glass: 'زجاجي', arcade: 'أركيد', bars: 'أشرطة', minimal: 'مينيمال' },
    bgs:     { grad: 'متدرج', grid: 'شبكة', dots: 'نقاط', stripes: 'خطوط', aurora: 'شفق', stars: 'نجوم', glow: 'توهج' },
    effects: { none: 'بدون', coins: 'مطر عملات', confetti: 'قصاصات', sparks: 'شرارات' }
  };
  var ROW_H = 50, GAP = 7;
  var MEDALS = ['🥇', '🥈', '🥉'];
  var STATUS = { stopped: 'متوقف', running: 'شغال', paused: 'موقوف مؤقتاً', ended: 'انتهى' };
  var DEFAULT_WIN = 'مبروك {name} 🎉 كسبت {prize}';

  function fmt(s) { var m = Math.floor(s / 60), r = s % 60; return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0'); }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  // المستوى الحالي حسب عملات المركز الأول: رقم أعلى مستوى وصله (-1 = لسه ما وصلش لأول مستوى)
  function levelOf(levels, coins) {
    var cur = -1;
    levels.forEach(function (r, i) { if (coins >= r.from) cur = i; });
    return cur;
  }

  function mount(root) {
    root.innerHTML =
      '<div class="card" data-theme="red" data-style="classic" data-bg="grad">' +
      '<div class="title"></div><div class="timer">01:00</div>' +
      '<div class="levels"><div class="lvrow"></div><div class="lvbar"><i></i></div></div>' +
      '<div class="list"></div><div class="winner"></div>' +
      '<div class="footer"><span class="st"></span><span class="ct"></span></div>' +
      '<div class="lvlup"></div><div class="fx"></div></div>';
    var card = root.firstChild;
    var q = function (s) { return card.querySelector(s); };
    var list = q('.list'), rows = {}, effect = 'none';
    var lvSig = '', lvChips = [], prevLevel = null, lvTimer = null;

    function makeRow() {
      var el = document.createElement('div'); el.className = 'row';
      el.innerHTML = '<div class="fill"></div><div class="rank"></div><div class="avatar"></div><div class="name"></div><div class="coins"><i></i><span>0</span></div>';
      list.appendChild(el);
      return { el: el, fill: el.children[0], rank: el.children[1], av: el.children[2], name: el.children[3], box: el.children[4], num: el.children[4].lastChild, coins: 0, url: null };
    }
    function paint(r, i, u, leader) {
      r.rank.className = 'rank' + (i >= 3 ? ' num' : '');
      r.rank.textContent = i < 3 ? MEDALS[i] : String(i + 1);
      r.el.classList.toggle('first', i === 0 && !!u);
      r.el.classList.toggle('empty', !u);
      r.name.textContent = u ? u.name : '—';
      var url = u ? (u.avatar || '') : '';
      if (r.url !== url || (!url && u && r.av.textContent !== u.name.trim().charAt(0))) {
        r.url = url; r.av.innerHTML = '';
        var letter = u ? u.name.trim().charAt(0) : '';
        if (url) {
          var img = new Image(); img.referrerPolicy = 'no-referrer';
          img.onerror = function () { r.av.textContent = letter; };
          img.src = url; r.av.appendChild(img);
        } else r.av.textContent = letter;
      }
      var c = u ? u.coins : 0;
      if (c !== r.coins) {
        if (u && c > r.coins) { r.box.classList.remove('bump'); void r.box.offsetWidth; r.box.classList.add('bump'); }
        r.coins = c; r.num.textContent = c.toLocaleString('en-US');
      }
      r.fill.style.width = (u && leader > 0 ? Math.max(6, Math.round(c / leader * 100)) : 0) + '%';
      r.el.style.transform = 'translateY(' + i * (ROW_H + GAP) + 'px)';
    }

    // ----- شريط المستويات (مبني على عملات المركز الأول بس) -----
    function renderLevels(levels, show, coins) {
      var box = q('.levels');
      box.style.display = show && levels.length ? '' : 'none';
      var sig = JSON.stringify(levels);
      if (sig !== lvSig) {
        lvSig = sig; lvChips = [];
        var row = q('.lvrow'); row.innerHTML = '';
        levels.forEach(function (r, i) {
          var next = levels[i + 1], d = document.createElement('div');
          d.className = 'lv';
          var rg = r.from + (next ? '–' + next.from : '+');
          d.innerHTML = '<span class="rg"></span><span class="pz"></span>';
          d.children[0].textContent = rg; d.children[1].textContent = r.text;
          row.appendChild(d); lvChips.push(d);
        });
      }
      var cur = levelOf(levels, coins);
      lvChips.forEach(function (d, i) {
        d.classList.toggle('done', i < cur);
        d.classList.toggle('on', i === cur);
      });
      var p = 0;
      if (levels.length) {
        if (cur < 0) p = coins / levels[0].from;
        else if (levels[cur + 1]) p = (coins - levels[cur].from) / (levels[cur + 1].from - levels[cur].from);
        else p = 1;
      }
      q('.lvbar i').style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%';
      return cur;
    }
    function celebrate(levels, cur) {
      var b = q('.lvlup');
      b.textContent = 'المستوى ' + (cur + 1) + ' 🔥 ' + levels[cur].text;
      b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
      clearTimeout(lvTimer); lvTimer = setTimeout(function () { b.classList.remove('show'); }, 3200);
      burst('confetti', 24);
    }

    function render(s) {
      var st = s.settings;
      card.dataset.theme = st.theme || 'red';
      card.dataset.style = st.style || 'classic';
      card.dataset.bg = st.bg || 'grad';
      effect = st.effect || 'none';
      q('.title').textContent = st.title;
      var t = q('.timer');
      t.innerHTML = fmt(s.remaining) + (s.inOvertime ? '<small>⏱ وقت إضافي</small>' : '');
      t.classList.toggle('over', !!s.inOvertime);
      t.classList.toggle('warn', s.status === 'running' && st.warnSeconds > 0 && s.remaining <= st.warnSeconds);

      var n = st.places;
      list.style.height = (n * ROW_H + (n - 1) * GAP) + 'px';
      var leader = s.top[0] ? s.top[0].coins : 0, want = {};
      for (var i = 0; i < n; i++) {
        var u = s.top[i] || null, key = u ? 'u:' + u.id : 'e:' + i; want[key] = 1;
        if (!rows[key]) rows[key] = makeRow();
        paint(rows[key], i, u, leader);
      }
      Object.keys(rows).forEach(function (k) {
        if (!want[k]) { var r = rows[k]; delete rows[k]; r.el.classList.add('gone'); setTimeout(function () { r.el.remove(); }, 400); }
      });

      var levels = Array.isArray(st.prizes) ? st.prizes : [];
      var cur = renderLevels(levels, st.showPrizes !== false, leader);
      if (prevLevel !== null && cur > prevLevel && s.status === 'running' && st.showPrizes !== false) celebrate(levels, cur);
      prevLevel = cur;

      q('.st').textContent = 'الحالة: ' + STATUS[s.status];
      q('.ct').textContent = 'مشاركين: ' + s.participants;

      // رسالة الفائز: لو الأول وصل لمستوى بتظهر تهنئة بالجايزة
      var w = q('.winner');
      if (s.status === 'ended' && s.top[0]) {
        var win = s.top[0], prize = cur >= 0 && st.showPrizes !== false ? levels[cur].text : '';
        w.textContent = prize
          ? '🏆 ' + (st.winText || DEFAULT_WIN).replace('{name}', win.name).replace('{prize}', prize)
          : '🏆 الفائز: ' + win.name;
        w.classList.add('show');
      } else w.classList.remove('show');
    }

    // ----- التأثيرات -----
    function spawn(el, life) { q('.fx').appendChild(el); setTimeout(function () { el.remove(); }, life); }
    function burst(kind, n) {
      var h = card.offsetHeight + 40, i, el;
      var colors = ['#ffd24a', '#ffffff', getComputedStyle(card).getPropertyValue('--accent').trim() || '#ff3b4e'];
      for (i = 0; i < n; i++) {
        el = document.createElement('i');
        if (kind === 'coins') { el.textContent = '🪙'; el.style.fontSize = rnd(16, 26) + 'px'; }
        if (kind === 'confetti') { el.className = 'cf'; el.style.setProperty('--c', colors[i % 3]); }
        if (kind === 'sparks') {
          el.className = 'sp'; el.style.setProperty('--c', colors[i % 3]);
          var a = rnd(0, 6.28), d = rnd(60, 150);
          el.style.setProperty('--dx', Math.cos(a) * d + 'px'); el.style.setProperty('--dy', Math.sin(a) * d + 'px');
          spawn(el, 900); continue;
        }
        el.style.setProperty('--x', rnd(2, 94) + '%');
        el.style.setProperty('--dx', rnd(-30, 30) + 'px');
        el.style.setProperty('--r', rnd(-360, 360) + 'deg');
        el.style.setProperty('--h', h + 'px');
        el.style.setProperty('--t', rnd(1.1, 2.0) + 's');
        el.style.animationDelay = rnd(0, .35) + 's';
        spawn(el, 2500);
      }
    }
    var lastFx = 0;
    function onGift(g) {
      if (effect === 'none') return;
      var now = Date.now();
      if (now - lastFx < 250 || q('.fx').children.length > 60) return;   // لو هدايا كتير في نفس اللحظة نتجنب زحمة التأثيرات
      lastFx = now;
      burst(effect, Math.min(26, 4 + Math.round((g.coins || 1) / 40)));
    }
    function onExtend(e) {
      var t = q('.timer'), b = document.createElement('div');
      b.className = 'cc-ext'; b.textContent = '+' + e.seconds + ' ث';
      t.appendChild(b); setTimeout(function () { b.remove(); }, 1500);
      t.classList.remove('ext'); void t.offsetWidth; t.classList.add('ext');
    }
    return { el: card, render: render, onGift: onGift, onExtend: onExtend };
  }
  global.CoinCard = { mount: mount, OPTIONS: OPTIONS };
})(window);
