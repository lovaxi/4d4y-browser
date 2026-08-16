window.__ModuleLoader__.load({
  id: '4d4y-browser',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
    let React = require('react');

    // Version policy: start at 0.1 and step slowly (0.1 -> 0.2 -> ...); the
    // build is 1.0 only when the feature set is complete. Keep in sync with
    // lib/index.js and package.json so diagnostics identify the running build.
    const VERSION = '0.6';
    const NOAVATAR = 'https://img02.4d4y.com/forum/uc_server/images/noavatar_middle.gif';

    // ---------------- shared store: open flag survives panel unmount ----------------
    const store = {
      open: false,
      subs: new Set(),
      snapshot() { return { open: this.open } },
      emit() { for (const fn of this.subs) { try { fn() } catch (e) { /* ignore */ } } },
      subscribe(fn) { this.subs.add(fn); return () => { this.subs.delete(fn) } },
      setOpen(v) { if (this.open !== v) { this.open = !!v; this.emit() } },
      toggle() { this.setOpen(!this.open) },
    };

    function viewKey(v) {      return v.kind + ':' + (v.fid || v.tid || '') + ':' + (v.page || 1);
    }

    function browse(params) {
      let q = 'kind=' + encodeURIComponent(params.kind);
      if (params.fid) q += '&fid=' + encodeURIComponent(String(params.fid));
      if (params.tid) q += '&tid=' + encodeURIComponent(String(params.tid));
      if (params.page) q += '&page=' + encodeURIComponent(String(params.page));
      return fetch('/4d4y/browse?' + q).then((r) => r.json());
    }

    function openExternal(url) {
      try {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.click();
      } catch (err) { /* ignore */ }
    }

    function getStatus() {
      return fetch('/4d4y/status').then((r) => r.json());
    }

    function postLogin(username, password) {
      const body = new URLSearchParams();
      body.set('username', username);
      body.set('password', password);
      return fetch('/4d4y/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }).then((r) => r.json());
    }

    function postLogout() {
      return fetch('/4d4y/logout', { method: 'POST' }).then((r) => r.json());
    }

    function fetchBlacklist() {
      return fetch('/4d4y/blacklist').then((r) => r.json());
    }

    function loadBlackPref() {
      try { return localStorage.getItem('d4y_blackfilter') === '1'; } catch (e) { return false; }
    }

    function saveBlackPref(v) {
      try { localStorage.setItem('d4y_blackfilter', v ? '1' : '0'); } catch (e) { /* ignore */ }
    }

    // Group consecutive images inside one post into horizontal flex rows so a
    // floor with several pictures shows them side by side instead of stacked.
    function relayoutImages(container) {
      if (!container) return;
      const makeRow = (before) => {
        const row = document.createElement('div');
        row.className = 'd4y-imgrow';
        container.insertBefore(row, before);
        return row;
      };
      const isImageNode = (node) => {
        if (node.nodeType !== 1) return false;
        if (node.tagName === 'IMG') return true;
        if (node.tagName === 'A') {
          // zoom-wrapped <a><img></a> with no other content
          const kids = node.children || [];
          return kids.length === 1 && kids[0].tagName === 'IMG' && !(node.textContent || '').trim();
        }
        return false;
      };
      const nodes = Array.from(container.childNodes);
      let row = null;
      for (const node of nodes) {
        if (isImageNode(node)) {
          if (!row) row = makeRow(node);
          row.appendChild(node);
          continue;
        }
        if (node.nodeType === 1 && (node.tagName === 'BR' || node.style.display === 'none')) {
          if (node.tagName === 'BR' && row) node.parentNode.removeChild(node);
          continue; // <br> between pictures or hidden attachment menus
        }
        if (node.nodeType === 3 && !node.nodeValue.trim()) {
          if (row) node.parentNode.removeChild(node);
          continue; // whitespace between pictures
        }
        row = null; // any other content ends the current image row
      }
    }

    // ---------------- styles ----------------
    const css = (
      '.d4y-root{--d4y-bg:var(--dsw-alias-bg-base,#171a20);--d4y-panel:var(--dsw-alias-bg-layer-1,#20242c);--d4y-border:var(--dsw-alias-border-l1,#333a45);--d4y-text:var(--dsw-alias-label-primary,#e6e9ef);--d4y-dim:var(--dsw-alias-label-secondary,#9aa3b2);--d4y-accent:var(--dsw-alias-brand-primary,#5aa8ff);--d4y-accent2:var(--dsw-alias-state-warn-primary,#ffb45c);--d4y-error:var(--dsw-alias-state-error-primary,#ff8f8f);--d4y-layer2:var(--dsw-alias-bg-layer-2,#2a2f3a);font-size:16px;color:var(--d4y-text)}' +
      '.d4y-toolbar{display:flex;gap:6px;align-items:center;padding:10px 14px;background:var(--d4y-panel);border-bottom:1px solid var(--d4y-border);flex:none}' +
      '.d4y-btn{background:var(--d4y-layer2);color:var(--d4y-text);border:1px solid var(--d4y-border);border-radius:6px;padding:5px 11px;font-size:15px;line-height:1.4;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}' +
      '.d4y-btn:hover:not(:disabled){background:var(--dsw-alias-bg-overlay,#343b49);border-color:var(--dsw-alias-border-l2,#465061)}' +
      '.d4y-btn:disabled{opacity:.4;cursor:default}' +
      '.d4y-black-on{background:color-mix(in srgb, var(--d4y-accent) 16%, transparent);border-color:var(--d4y-accent);color:var(--d4y-accent);font-weight:700}' +
      '.d4y-crumb{flex:1;min-width:0;margin:0 4px;color:var(--d4y-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.d4y-body{flex:1;overflow:auto;background:var(--d4y-bg);padding:14px 18px}' +
      '.d4y-loading{color:var(--d4y-dim);padding:18px 0;text-align:center}' +
      '.d4y-error{color:var(--d4y-error);background:rgba(255,80,80,.08);border:1px solid rgba(255,80,80,.35);border-radius:8px;padding:10px 12px;margin-bottom:10px}' +
      '.d4y-empty{color:var(--d4y-dim);padding:16px 0;text-align:center}' +
      '.d4y-black-note{color:var(--d4y-accent2);background:rgba(255,180,92,.08);border:1px solid rgba(255,180,92,.3);border-radius:8px;padding:8px 12px;margin-bottom:10px}' +
      '.d4y-cat{margin-bottom:16px}' +
      '.d4y-cat-title{font-size:17px;font-weight:700;color:var(--d4y-accent2);margin:0 0 8px;padding-left:8px;border-left:3px solid var(--d4y-accent2)}' +
      '.d4y-forum-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}' +
      '.d4y-forum-card{background:var(--d4y-panel);border:1px solid var(--d4y-border);border-radius:10px;padding:10px 12px;cursor:pointer;transition:border-color .12s}' +
      '.d4y-forum-card:hover{border-color:var(--d4y-accent)}' +
      '.d4y-forum-name{font-weight:700;color:var(--d4y-text);margin-bottom:3px}' +
      '.d4y-forum-desc{color:var(--d4y-dim);font-size:14px;margin-bottom:6px;line-height:1.5}' +
      '.d4y-forum-meta{color:var(--d4y-accent);font-size:14px;margin-bottom:4px}' +
      '.d4y-forum-last{border-top:1px dashed var(--d4y-border);padding-top:6px;font-size:14px}' +
      '.d4y-last-t{display:block;color:var(--d4y-text);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}' +
      '.d4y-last-a{color:var(--d4y-dim)}' +
      '.d4y-page-title{font-size:18px;font-weight:700;margin-bottom:10px;line-height:1.5}' +
      '.d4y-title-row{display:flex;align-items:center;gap:10px;margin-bottom:10px}' +
      '.d4y-title-row .d4y-page-title{margin-bottom:0;flex:1;min-width:0}' +
      '.d4y-forum-link{color:var(--d4y-accent);cursor:pointer;font-weight:600;margin-right:8px}' +
      '.d4y-forum-link:hover{text-decoration:underline}' +
      '.d4y-subs{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px}' +
      '.d4y-subs-label{color:var(--d4y-dim)}' +
      '.d4y-sub-chip{background:var(--d4y-layer2);border:1px solid var(--d4y-border);color:var(--d4y-accent);border-radius:12px;padding:3px 12px;font-size:14px;cursor:pointer}' +
      '.d4y-sub-chip:hover{border-color:var(--d4y-accent)}' +
      '.d4y-thread-list{border:1px solid var(--d4y-border);border-radius:10px;overflow:hidden}' +
      '.d4y-thread-row{display:grid;grid-template-columns:minmax(0,1fr) 140px 160px;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid var(--d4y-border);cursor:pointer}' +
      '.d4y-thread-row:last-child{border-bottom:none}' +
      '.d4y-thread-row:hover{background:rgba(90,168,255,.06)}' +
      '.d4y-thread-main{min-width:0}' +
      '.d4y-thread-title{display:block;color:var(--d4y-text);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}' +
      '.d4y-thread-meta{color:var(--d4y-dim);font-size:14px;margin-top:3px}' +
      '.d4y-thread-nums{color:var(--d4y-dim);font-size:14px;text-align:right}' +
      '.d4y-thread-last{font-size:14px;text-align:right;min-width:0}' +
      '.d4y-thread-last-a{color:var(--d4y-text);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}' +
      '.d4y-thread-last-t{color:var(--d4y-dim)}' +
      '.d4y-badge{display:inline-block;font-size:13px;border-radius:4px;padding:1px 6px;margin-right:5px;vertical-align:1px}' +
      '.d4y-badge-cat{background:rgba(255,120,120,.16);color:var(--d4y-error)}' +
      '.d4y-badge-stick{background:rgba(90,168,255,.16);color:var(--d4y-accent)}' +
      '.d4y-badge-type{background:rgba(255,180,92,.16);color:var(--d4y-accent2)}' +
      '.d4y-post{background:var(--d4y-panel);border:1px solid var(--d4y-border);border-radius:10px;padding:10px 12px;margin-bottom:12px}' +
      '.d4y-post-cols{display:flex;gap:14px;align-items:flex-start}' +
      '.d4y-user{flex:none;width:150px;text-align:center;padding-right:12px;border-right:1px dashed var(--d4y-border)}' +
      '.d4y-avatar{width:88px;height:88px;border-radius:10px;object-fit:cover;border:1px solid var(--d4y-border);background:var(--d4y-layer2)}' +
      '.d4y-user-name{font-weight:700;color:var(--d4y-accent);margin-top:6px;word-break:break-all;line-height:1.35}' +
      '.d4y-user-group{color:var(--d4y-dim);font-size:13px;margin-top:2px}' +
      '.d4y-user-online{margin-top:4px;font-size:13px;color:var(--d4y-dim)}' +
      '.d4y-user-online.d4y-on{color:var(--dsw-alias-state-success-primary,#34d399)}' +
      '.d4y-user-stats{margin-top:8px;font-size:13px;color:var(--d4y-dim);text-align:left;border-top:1px dashed var(--d4y-border);padding-top:6px}' +
      '.d4y-user-stats div{display:flex;justify-content:space-between;gap:6px;margin:2px 0}' +
      '.d4y-user-stats dd,.d4y-user-stats dt{display:inline;margin:0}' +
      '.d4y-user-stats dt{color:var(--d4y-dim)}' +
      '.d4y-user-stats dd{color:var(--d4y-text);font-weight:600}' +
      '.d4y-post-main{flex:1;min-width:0}' +
      '.d4y-post-head{display:flex;gap:10px;align-items:baseline;margin-bottom:8px;padding-bottom:8px;border-bottom:1px dashed var(--d4y-border)}' +
      '.d4y-floor{color:var(--d4y-accent2);font-weight:700}' +
      '.d4y-author{color:var(--d4y-accent);font-weight:600}' +
      '.d4y-time{color:var(--d4y-dim);font-size:14px}' +
      '.d4y-content{line-height:1.7;word-break:break-word}' +
      '.d4y-content img{max-width:100%;max-height:260px;width:auto;height:auto;display:inline-block;margin:2px 6px 2px 0;vertical-align:middle;border-radius:6px}' +
      '.d4y-imgrow{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0;align-items:flex-start}' +
      '.d4y-imgrow a,.d4y-imgrow img{display:block}' +
      '.d4y-imgrow img{max-height:240px;max-width:100%;width:auto;height:auto;margin:0;border-radius:6px;cursor:zoom-in}' +
      '.d4y-content a{color:var(--d4y-accent)}' +
      '.d4y-content .quote{background:rgba(90,168,255,.06);border-left:3px solid var(--d4y-accent);padding:6px 10px;margin:6px 0;color:var(--d4y-dim)}' +
      '.d4y-content .pstatus{color:var(--d4y-dim);font-style:italic}' +
      '.d4y-content .blockcode{background:var(--d4y-layer2);border:1px solid var(--d4y-border);padding:8px;font-family:Consolas,Monaco,monospace;font-size:14px;white-space:pre-wrap}' +
      '.d4y-pager{display:flex;gap:4px;flex-wrap:wrap;align-items:center;padding:12px 0 2px}' +
      '.d4y-page-btn{background:var(--d4y-layer2);color:var(--d4y-text);border:1px solid var(--d4y-border);border-radius:6px;padding:4px 11px;font-size:14px;cursor:pointer}' +
      '.d4y-page-btn:hover:not(:disabled){border-color:var(--d4y-accent)}' +
      '.d4y-page-btn:disabled{opacity:.35;cursor:default}' +
      '.d4y-page-cur{background:color-mix(in srgb, var(--d4y-accent) 16%, transparent);border-color:var(--d4y-accent);color:var(--d4y-accent);font-weight:700}' +
      '.d4y-page-total{color:var(--d4y-dim);font-size:14px;margin-left:6px}' +
      // ---- panel + entry ----
      '.d4y-entry{background:transparent;border:none;color:var(--d4y-accent,#5aa8ff);cursor:pointer;font-size:15px;padding:4px 8px;border-radius:6px;text-align:left}' +
      '.d4y-entry:hover{background:rgba(90,168,255,.12)}' +
      '.d4y-panel{position:fixed;top:0;right:0;bottom:0;left:var(--d4y-sidebar-w,264px);z-index:9999;display:flex;flex-direction:column;background:var(--d4y-bg,#171a20);font:16px/1.5 system-ui,-apple-system,sans-serif;color:var(--d4y-text,#e6e9ef)}' +
      '.d4y-login{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 10px;background:var(--d4y-panel);border:1px solid var(--d4y-border);border-top:none}' +
      '.d4y-login input{background:var(--d4y-layer2);color:var(--d4y-text);border:1px solid var(--d4y-border);border-radius:6px;padding:6px 9px;font-size:15px;min-width:0}' +
      '.d4y-login textarea{background:var(--d4y-layer2);color:var(--d4y-text);border:1px solid var(--d4y-border);border-radius:6px;padding:8px 10px;font-size:16px;width:100%;min-height:300px;resize:vertical;font-family:inherit;line-height:1.6}' +
      '.d4y-post-title{flex-basis:100%;font-weight:700;color:var(--d4y-accent)}' +
      '.d4y-post-subject{flex-basis:100%;font-size:16px;padding:8px 10px}' +
      '.d4y-post-type{flex-basis:100%;background:var(--d4y-layer2);color:var(--d4y-text);border:1px solid var(--d4y-border);border-radius:6px;padding:7px 9px;font-size:15px}' +
      '.d4y-file-btn{cursor:pointer;position:relative}' +
      '.d4y-post-imgs{flex-basis:100%;display:flex;flex-wrap:wrap;gap:6px}' +
      '.d4y-post-img-chip{display:inline-flex;align-items:center;gap:6px;background:var(--d4y-layer2);border:1px solid var(--d4y-border);border-radius:12px;padding:3px 10px;font-size:13px;color:var(--d4y-text)}' +
      '.d4y-post-img-del{background:transparent;border:none;color:var(--d4y-error);cursor:pointer;font-size:13px;padding:0 2px}' +
      '.d4y-login input:focus{outline:none;border-color:var(--d4y-accent)}' +
      '.d4y-login-err{color:var(--d4y-error);font-size:14px;flex-basis:100%}' +
      '.d4y-login-note{color:var(--d4y-dim);font-size:14px;flex-basis:100%}' +
      '.d4y-status{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:5px 14px;background:var(--d4y-panel);border-top:1px solid var(--d4y-border);color:var(--d4y-dim);font-size:13px;flex:none}'
    );

    if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css="4d4y-browser"]')) {
      const tag = document.createElement('style');
      tag.dataset.pluginCss = '4d4y-browser';
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    // ---------------- components ----------------
    function Pager(props) {
      const { page, total, onPage } = props;
      if (!total || total <= 1) return null;
      const pages = [];
      const lo = Math.max(1, page - 4);
      const hi = Math.min(total, page + 4);
      for (let i = lo; i <= hi; i++) pages.push(i);
      const btn = (n, label, cls, disabled) => React.createElement('button', {
        key: label + ':' + n, className: 'd4y-page-btn ' + (cls || ''), disabled: disabled && n !== page, onClick: () => onPage(n),
      }, label);
      return React.createElement('div', { className: 'd4y-pager' },
        btn(page - 1, '\u2039 上一页', '', page <= 1),
        pages.map((n) => btn(n, String(n), n === page ? 'd4y-page-cur' : '')),
        btn(page + 1, '下一页 \u203A', '', page >= total),
        React.createElement('span', { className: 'd4y-page-total' }, '共 ' + total + ' 页'));
    }

    function HomeView(props) {
      const { data, onOpen } = props;
      const cats = data.categories || [];
      if (!cats.length) return React.createElement('div', { className: 'd4y-empty' }, '暂无版块');
      const catEls = [];
      for (let ci = 0; ci < cats.length; ci++) {
        const cat = cats[ci];
        const cards = [];
        for (let fi = 0; fi < cat.forums.length; fi++) {
          const f = cat.forums[fi];
          const cardChildren = [];
          cardChildren.push(React.createElement('div', { key: 'n', className: 'd4y-forum-name' }, f.name));
          if (f.description) cardChildren.push(React.createElement('div', { key: 'd', className: 'd4y-forum-desc' }, f.description));
          cardChildren.push(React.createElement('div', { key: 'm', className: 'd4y-forum-meta' }, '主题 ' + f.threads + ' · 帖子 ' + f.posts));
          if (f.last) {
            cardChildren.push(React.createElement('div', { key: 'l', className: 'd4y-forum-last' },
              React.createElement('span', { className: 'd4y-last-t' }, '最后: ' + f.last.title),
              React.createElement('span', { className: 'd4y-last-a' }, f.last.author + ' · ' + f.last.time)));
          }
          cards.push(React.createElement('div', {
            key: f.fid, className: 'd4y-forum-card',
            onClick: () => onOpen({ kind: 'forum', fid: String(f.fid), page: 1 }),
          }, cardChildren));
        }
        catEls.push(React.createElement('div', { key: cat.gid, className: 'd4y-cat' },
          React.createElement('div', { className: 'd4y-cat-title' }, cat.name),
          React.createElement('div', { className: 'd4y-forum-grid' }, cards)));
      }
      return React.createElement('div', null, catEls);
    }

    function ForumView(props) {
      const { data, onThread, onPage, onSub, onNewThread } = props;
      const subs = data.subForums || [];
      const threads = data.threads || [];
      return React.createElement('div', null,
        React.createElement('div', { className: 'd4y-title-row' },
          React.createElement('div', { className: 'd4y-page-title' }, data.name),
          React.createElement('button', { className: 'd4y-btn', title: '在本版发布新主题', onClick: () => onNewThread() }, '发新主题')),
        subs.length ? React.createElement('div', { className: 'd4y-subs' },
          React.createElement('span', { className: 'd4y-subs-label' }, '子版块:'),
          subs.map((s) => React.createElement('span', { key: s.fid, className: 'd4y-sub-chip', onClick: () => onSub(s.fid) }, s.name + ' (' + s.threads + ')'))) : null,
        threads.length ? React.createElement('div', { className: 'd4y-thread-list' },
          threads.map((t) => React.createElement('div', { key: t.tid, className: 'd4y-thread-row', onClick: () => onThread(t.tid) },
            React.createElement('div', { className: 'd4y-thread-main' },
              React.createElement('div', { className: 'd4y-thread-title' },
                t.sticky === 2 ? React.createElement('span', { className: 'd4y-badge d4y-badge-cat' }, '分类置顶') : null,
                t.sticky === 1 ? React.createElement('span', { className: 'd4y-badge d4y-badge-stick' }, '置顶') : null,
                t.type ? React.createElement('span', { className: 'd4y-badge d4y-badge-type' }, '[' + t.type + ']') : null,
                t.title),
              React.createElement('div', { className: 'd4y-thread-meta' }, t.author + ' · ' + t.date)),
            React.createElement('div', { className: 'd4y-thread-nums' }, t.replies + ' 回复 / ' + t.views + ' 查看'),
            React.createElement('div', { className: 'd4y-thread-last' },
              React.createElement('div', { className: 'd4y-thread-last-a' }, t.lastAuthor),
              React.createElement('div', { className: 'd4y-thread-last-t' }, t.lastTime))))) :
          React.createElement('div', { className: 'd4y-empty' }, '本版暂无主题'),
        React.createElement(Pager, { page: data.page || 1, total: data.totalPages || 1, onPage: onPage }));
    }

    function PostContent(props) {
      const ref = React.useRef(null);
      React.useEffect(() => {
        const c = ref.current;
        if (!c) return;
        relayoutImages(c);
        // thumbnail-first: if a thumb 404s, fall back to the original (data-full)
        const imgs = c.querySelectorAll('img[data-full]');
        for (const img of imgs) {
          const full = img.getAttribute('data-full');
          img.addEventListener('error', function handler() {
            if (img.getAttribute('src') !== full) img.setAttribute('src', full);
          });
        }
      }, [props.html]);
      return React.createElement('div', { className: 'd4y-content', ref: ref, onClick: props.onClick, dangerouslySetInnerHTML: { __html: props.html } });
    }

    function ThreadView(props) {
      const { data, onPage, onForum, onNav, onReply, blackOn, blackList } = props;
      const posts = data.posts || [];
      const black = blackOn && Array.isArray(blackList) && blackList.length ? new Set(blackList) : null;
      const visible = black ? posts.filter((p) => !black.has(p.author)) : posts;
      const hidden = black ? posts.length - visible.length : 0;
      const avatarOnError = (e) => {
        const t = e.target;
        try {
          if (!t.dataset.fb) { t.dataset.fb = '1'; t.src = NOAVATAR; }
          else { t.style.visibility = 'hidden'; }
        } catch (err) { /* ignore */ }
      };
      const onContentClick = (ev) => {
        const a = ev.target && ev.target.closest ? ev.target.closest('a') : null;
        if (!a) return;
        const href = a.getAttribute('href') || '';
        if (href.indexOf('javascript:') === 0 || href.charAt(0) === '#') { ev.preventDefault(); return; }
        let path = href;
        if (/^https?:/i.test(href)) {
          try {
            const u = new URL(href);
            if (u.hostname.replace(/^www\./, '') !== '4d4y.com') { ev.preventDefault(); openExternal(href); return; }
            path = u.pathname + u.search;
          } catch (err) { ev.preventDefault(); openExternal(href); return; }
        }
        ev.preventDefault();
        const fm = path.match(/forumdisplay\.php\?fid=(\d+)/);
        if (fm) return onNav({ kind: 'forum', fid: fm[1], page: 1 });
        const tm = path.match(/(?:viewthread|redirect)\.php\?tid=(\d+)/);
        if (tm) {
          const pm = path.match(/[?&]page=(\d+)/);
          return onNav({ kind: 'thread', tid: tm[1], page: pm ? parseInt(pm[1], 10) : 1 });
        }
        if (/index\.php/.test(path)) return onNav({ kind: 'home' });
        openExternal(href);
      };
      return React.createElement('div', null,
        React.createElement('div', { className: 'd4y-title-row' },
          React.createElement('div', { className: 'd4y-page-title' },
            data.forumName ? React.createElement('span', { className: 'd4y-forum-link', onClick: () => onForum(data.forumFid) }, data.forumName + ' »') : null,
            data.title),
          React.createElement('button', { className: 'd4y-btn', title: '回复本主题', onClick: () => onReply() }, '回复本主题')),
        hidden > 0 ? React.createElement('div', { className: 'd4y-black-note' }, '已屏蔽 ' + hidden + ' 个黑名单用户楼层') : null,
        visible.length ? React.createElement('div', null, visible.map((p) => {
          const prof = p.profile || {};
          const stats = [];
          if (prof.posts) stats.push(React.createElement('div', { key: 'posts' }, React.createElement('dt', null, '帖子'), React.createElement('dd', null, prof.posts)));
          if (prof.credits) stats.push(React.createElement('div', { key: 'credits' }, React.createElement('dt', null, '积分'), React.createElement('dd', null, prof.credits)));
          if (prof.regDate) stats.push(React.createElement('div', { key: 'reg' }, React.createElement('dt', null, '注册'), React.createElement('dd', null, prof.regDate)));
          return React.createElement('div', { key: p.pid, className: 'd4y-post' },
            React.createElement('div', { className: 'd4y-post-cols' },
              React.createElement('div', { className: 'd4y-user' },
                p.avatar ? React.createElement('img', { className: 'd4y-avatar', src: p.avatar, referrerPolicy: 'no-referrer', loading: 'lazy', alt: '', onError: avatarOnError }) : null,
                React.createElement('div', { className: 'd4y-user-name' }, p.author),
                p.group ? React.createElement('div', { className: 'd4y-user-group' }, p.group) : null,
                p.online !== null ? React.createElement('div', { className: 'd4y-user-online' + (p.online ? ' d4y-on' : '') }, p.online ? '在线' : '当前离线') : null,
                stats.length ? React.createElement('div', { className: 'd4y-user-stats' }, stats) : null),
              React.createElement('div', { className: 'd4y-post-main' },
                React.createElement('div', { className: 'd4y-post-head' },
                  React.createElement('span', { className: 'd4y-floor' }, p.floor + '#'),
                  p.time ? React.createElement('span', { className: 'd4y-time' }, p.time) : null),
                React.createElement(PostContent, { html: p.html, onClick: onContentClick }))));
        })) :
          React.createElement('div', { className: 'd4y-empty' }, '暂无内容'),
        React.createElement(Pager, { page: data.page || 1, total: data.totalPages || 1, onPage: onPage }));
    }

    function Browser() {
      const [open, setOpen] = React.useState(store.snapshot().open);
      React.useEffect(() => store.subscribe(() => setOpen(store.snapshot().open)), []);
      const [stack, setStack] = React.useState([{ kind: 'home' }]);
      const [idx, setIdx] = React.useState(0);
      const [cache, setCache] = React.useState({});
      const [loading, setLoading] = React.useState(false);
      const [error, setError] = React.useState('');
      const [loggedIn, setLoggedIn] = React.useState(false);
      const [username, setUsername] = React.useState('');
      const [loginOpen, setLoginOpen] = React.useState(false);
      const [loginBusy, setLoginBusy] = React.useState(false);
      const [loginError, setLoginError] = React.useState('');
      const [uInput, setUInput] = React.useState('');
      const [pInput, setPInput] = React.useState('');
      const [tick, setTick] = React.useState(0);
      const [sidebarW, setSidebarW] = React.useState(264);
      const [blackOn, setBlackOn] = React.useState(loadBlackPref());
      const [blackList, setBlackList] = React.useState([]);
      const [blackBusy, setBlackBusy] = React.useState(false);
      const [blackMsg, setBlackMsg] = React.useState('');
      const [postOpen, setPostOpen] = React.useState(false);
      const [postMode, setPostMode] = React.useState('newthread');
      const [postTarget, setPostTarget] = React.useState(null);
      const [postBusy, setPostBusy] = React.useState(false);
      const [postError, setPostError] = React.useState('');
      const [postSubject, setPostSubject] = React.useState('');
      const [postMessage, setPostMessage] = React.useState('');
      const [postImages, setPostImages] = React.useState([]);
      const [postImgBusy, setPostImgBusy] = React.useState(false);
      const [postTypes, setPostTypes] = React.useState([]);
      const [postType, setPostType] = React.useState('');
      const current = stack[idx] || { kind: 'home' };
      const key = viewKey(current);
      const data = cache[key];

      React.useEffect(() => {
        if (!open || !blackOn) return;
        let alive = true;
        setBlackBusy(true);
        setBlackMsg('');
        fetchBlacklist().then((res) => {
          if (!alive) return;
          setBlackBusy(false);
          if (res && res.ok === true && res.data && Array.isArray(res.data.usernames)) {
            setBlackList(res.data.usernames);
            setBlackMsg(res.data.usernames.length ? ('已加载黑名单 ' + res.data.usernames.length + ' 人') : '黑名单为空');
          } else {
            setBlackList([]);
            setBlackMsg((res && res.error) || '获取黑名单失败');
          }
        }).catch((err) => {
          if (!alive) return;
          setBlackBusy(false);
          setBlackList([]);
          setBlackMsg((err && err.message) || String(err));
        });
        return () => { alive = false; };
      }, [open, blackOn]);

      const toggleBlack = () => {
        const next = !blackOn;
        setBlackOn(next);
        saveBlackPref(next);
        if (!next) { setBlackList([]); setBlackMsg(''); }
      };

      const openPost = (mode, target) => {
        if (!loggedIn) { setLoginOpen(true); setLoginError('请先登录 4D4Y 再发帖'); return; }
        setPostMode(mode);
        setPostTarget(target);
        setPostSubject('');
        setPostMessage('');
        setPostImages([]);
        setPostError('');
        setPostTypes([]);
        setPostType('');
        setPostOpen(true);
        if (mode === 'newthread' && target && target.fid) {
          fetch('/4d4y/postoptions?fid=' + encodeURIComponent(String(target.fid))).then((r) => r.json()).then((res) => {
            if (res && res.ok === true && res.data && Array.isArray(res.data.types)) setPostTypes(res.data.types);
          }).catch(() => { /* ignore */ });
        }
      };

      const onPickImages = (e) => {
        const files = Array.from(e.target.files || []).filter((f) => f && f.size > 0);
        if (!files.length) return;
        setPostImgBusy(true);
        setPostError('');
        const jobs = files.map((f) => new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ name: f.name, type: f.type || 'image/jpeg', data: String(reader.result).split(',')[1] || '' });
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(f);
        }));
        Promise.all(jobs).then((items) => {
          setPostImgBusy(false);
          const ok = items.filter(Boolean);
          setPostImages((prev) => prev.concat(ok));
          if (ok.length !== items.length) setPostError('部分图片读取失败');
        });
        e.target.value = '';
      };

      const submitPost = () => {
        if (postBusy || postImgBusy) return;
        if (postMode === 'newthread' && postTypes.length && !postType) {
          setPostError('请选择主题分类后再发布');
          return;
        }
        setPostBusy(true);
        setPostError('');
        const body = {
          action: postMode,
          subject: postSubject,
          message: postMessage,
          images: postImages,
          typeid: postType,
        };
        if (postMode === 'newthread' && postTarget) body.fid = String(postTarget.fid);
        if (postMode === 'reply' && postTarget) body.tid = String(postTarget.tid);
        fetch('/4d4y/post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).then((r) => r.json()).then((res) => {
          setPostBusy(false);
          if (res && res.ok === true) {
            setPostOpen(false);
            setPostMessage('');
            setPostSubject('');
            setPostImages([]);
            clearAllCache();
          } else {
            setPostError((res && res.error) || '发布失败');
          }
        }).catch((err) => {
          setPostBusy(false);
          setPostError((err && err.message) || String(err));
        });
      };

      React.useEffect(() => {
        if (!open) return;
        const measure = () => {
          try {
            const el = document.querySelector('.pI_x6G_sidebarCol') || document.querySelector('[class*="sidebarCol"]');
            if (el) {
              const w = Math.round(el.getBoundingClientRect().width);
              if (w > 0) { setSidebarW(w); return; }
            }
          } catch (e) { /* ignore */ }
          try {
            const frame = document.querySelector('.pI_x6G_frame') || document.querySelector('[class*="_frame"]');
            if (frame) {
              const cols = getComputedStyle(frame).gridTemplateColumns.split(' ');
              const px = parseFloat(cols[0]);
              if (!isNaN(px) && px > 0) setSidebarW(px);
            }
          } catch (e) { /* ignore */ }
        };
        measure();
        window.addEventListener('resize', measure);
        let mo = null;
        try {
          const frame = document.querySelector('.pI_x6G_frame') || document.querySelector('[class*="_frame"]');
          if (frame && typeof MutationObserver !== 'undefined') {
            mo = new MutationObserver(measure);
            mo.observe(frame, { attributes: true });
          }
        } catch (e) { /* ignore */ }
        return () => {
          window.removeEventListener('resize', measure);
          if (mo) { try { mo.disconnect() } catch (e) { /* ignore */ } }
        };
      }, [open]);

      React.useEffect(() => {
        if (!open) return;
        let alive = true;
        getStatus().then((res) => {
          if (!alive) return;
          if (res && res.ok === true && res.data) setLoggedIn(!!res.data.loggedIn);
        }).catch(() => { /* ignore */ });
        return () => { alive = false; };
      }, [open]);

      React.useEffect(() => {
        if (!open) return;
        if (data !== undefined) { setLoading(false); setError(''); return; }
        let alive = true;
        setLoading(true);
        setError('');
        browse(current).then((res) => {
          if (!alive) return;
          if (res && res.ok === true) {
            const next = Object.assign({}, cache);
            next[key] = res.data;
            setCache(next);
            setLoading(false);
          } else {
            setError((res && res.error) || '加载失败');
            setLoading(false);
          }
        }).catch((err) => {
          if (!alive) return;
          setError((err && err.message) || String(err));
          setLoading(false);
        });
        return () => { alive = false; };
      }, [key, open, tick]);

      const go = (view, replace) => {
        if (replace) setStack((s) => s.map((v, i) => (i === idx ? view : v)));
        else { setStack((s) => s.slice(0, idx + 1).concat(view)); setIdx((i) => i + 1); }
      };
      const back = () => setIdx((i) => Math.max(0, i - 1));
      const fwd = () => setIdx((i) => Math.min(stack.length - 1, i + 1));
      const navigate = (v) => go(v, false);
      const setPage = (n) => go(Object.assign({}, current, { page: n }), true);
      const reload = () => {
        const next = Object.assign({}, cache);
        delete next[key];
        setCache(next);
        setError('');
        setTick((t) => t + 1);
      };
      const clearAllCache = () => { setCache({}); setError(''); setTick((t) => t + 1); };

      const submitLogin = () => {
        if (loginBusy) return;
        const u = uInput.trim();
        if (!u || !pInput) { setLoginError('请输入用户名和密码'); return; }
        setLoginBusy(true);
        setLoginError('');
        postLogin(u, pInput).then((res) => {
          setLoginBusy(false);
          if (res && res.ok === true && res.data) {
            setLoggedIn(true);
            setUsername(res.data.username || u);
            setLoginOpen(false);
            setUInput('');
            setPInput('');
            clearAllCache();
          } else {
            setLoginError((res && res.error) || '登录失败');
          }
        }).catch((err) => {
          setLoginBusy(false);
          setLoginError((err && err.message) || String(err));
        });
      };

      const submitLogout = () => {
        postLogout().then((res) => {
          if (res && res.ok === true) {
            setLoggedIn(false);
            setUsername('');
            clearAllCache();
          }
        }).catch(() => { /* ignore */ });
      };

      let title = '4D4Y 论坛';
      if (data) {
        if (current.kind === 'forum' && data.name) title = data.name;
        else if (current.kind === 'thread' && data.title) title = data.title;
      }

      if (!open) return null;

      return React.createElement('div', { className: 'd4y-root d4y-panel', style: { '--d4y-sidebar-w': sidebarW + 'px' } },
        React.createElement('div', { className: 'd4y-toolbar' },
          React.createElement('button', { className: 'd4y-btn', title: '首页', onClick: () => navigate({ kind: 'home' }) }, '\u2302'),
          React.createElement('button', { className: 'd4y-btn', title: '后退', disabled: idx === 0, onClick: back }, '\u2190'),
          React.createElement('button', { className: 'd4y-btn', title: '前进', disabled: idx >= stack.length - 1, onClick: fwd }, '\u2192'),
          React.createElement('button', { className: 'd4y-btn', title: '刷新', onClick: reload }, '\u21BB'),
          React.createElement('div', { className: 'd4y-crumb', title: title }, title),
          loggedIn
            ? React.createElement('button', {
                className: 'd4y-btn d4y-login-btn', title: '退出登录',
                onClick: submitLogout,
              }, '已登录' + (username ? ': ' + username : '') + ' \u21E5')
            : React.createElement('button', {
                className: 'd4y-btn d4y-login-btn', title: '登录 4D4Y',
                onClick: () => { setLoginOpen(!loginOpen); setLoginError(''); },
              }, '登录'),
          React.createElement('button', {
            className: 'd4y-btn' + (blackOn ? ' d4y-black-on' : ''),
            title: '屏蔽黑名单用户: ' + (blackOn ? '开' : '关') + (blackMsg ? ' (' + blackMsg + ')' : ''),
            onClick: toggleBlack,
          }, blackBusy ? '黑名单…' : (blackOn ? '屏蔽黑名单 ✓' : '屏蔽黑名单')),
          React.createElement('button', { className: 'd4y-btn', title: '关闭', onClick: () => store.setOpen(false) }, '\u2715')),
        loginOpen ? React.createElement('div', { className: 'd4y-login' },
          React.createElement('input', { type: 'text', placeholder: '用户名', value: uInput, onChange: (e) => setUInput(e.target.value) }),
          React.createElement('input', { type: 'password', placeholder: '密码', value: pInput, onChange: (e) => setPInput(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter') submitLogin(); } }),
          React.createElement('button', { className: 'd4y-btn', disabled: loginBusy, onClick: submitLogin }, loginBusy ? '登录中…' : '登录'),
          React.createElement('button', { className: 'd4y-btn', onClick: () => setLoginOpen(false) }, '取消'),
          loginError ? React.createElement('div', { className: 'd4y-login-err' }, loginError) : null,
          React.createElement('div', { className: 'd4y-login-note' }, '密码仅按 4D4Y 官方登录流程加密提交给 4d4y.com,不保存;登录后首页会显示更多版块(如 生活版区 / 其它)。')) : null,
        postOpen ? React.createElement('div', { className: 'd4y-login d4y-post' },
          React.createElement('div', { className: 'd4y-post-title' }, postMode === 'newthread' ? '发新主题' : '回复本主题'),
          postMode === 'newthread' ? React.createElement('input', { type: 'text', className: 'd4y-post-subject', placeholder: '标题', value: postSubject, onChange: (e) => setPostSubject(e.target.value) }) : null,
          postMode === 'newthread' && postTypes.length ? React.createElement('select', { className: 'd4y-post-type', value: postType, onChange: (e) => setPostType(e.target.value) },
            React.createElement('option', { value: '' }, '请选择主题分类(必选)'),
            postTypes.map((t) => React.createElement('option', { key: t.id, value: String(t.id) }, t.name))) : null,
          React.createElement('textarea', { placeholder: '内容(支持 bbcode,如 [b]粗体[/b] [img]图片地址[/img])', value: postMessage, onChange: (e) => setPostMessage(e.target.value) }),
          React.createElement('label', { className: 'd4y-btn d4y-file-btn' },
            postImgBusy ? '读取图片…' : '\u{1F4F7} 添加图片(可多选)',
            React.createElement('input', { type: 'file', multiple: true, accept: 'image/*', style: { display: 'none' }, onChange: onPickImages })),
          postImages.length ? React.createElement('div', { className: 'd4y-post-imgs' },
            postImages.map((img, i) => React.createElement('span', { key: i, className: 'd4y-post-img-chip' },
              img.name + ' (' + Math.max(1, Math.round(img.data.length * 0.75 / 1024)) + ' KB)',
              React.createElement('button', { className: 'd4y-post-img-del', title: '移除', onClick: () => setPostImages((prev) => prev.filter((_, j) => j !== i)) }, '\u2715')))) : null,
          React.createElement('button', { className: 'd4y-btn', disabled: postBusy || postImgBusy, onClick: submitPost }, postBusy ? '发布中…' : '发布'),
          React.createElement('button', { className: 'd4y-btn', onClick: () => setPostOpen(false) }, '取消'),
          postError ? React.createElement('div', { className: 'd4y-login-err' }, postError) : null) : null,
        React.createElement('div', { className: 'd4y-body' },
          error ? React.createElement('div', { className: 'd4y-error' }, '出错: ' + error) : null,
          loading && data === undefined ? React.createElement('div', { className: 'd4y-loading' }, '加载中…') : null,
          data === undefined ? null : (
            current.kind === 'home' ? React.createElement(HomeView, { data: data, onOpen: navigate }) :
            current.kind === 'forum' ? React.createElement(ForumView, { data: data, fid: current.fid, onThread: (tid) => navigate({ kind: 'thread', tid: String(tid), page: 1 }), onPage: setPage, onSub: (fid) => navigate({ kind: 'forum', fid: String(fid), page: 1 }), onNewThread: () => openPost('newthread', { fid: current.fid }) }) :
            current.kind === 'thread' ? React.createElement(ThreadView, { data: data, onPage: setPage, onForum: (fid) => navigate({ kind: 'forum', fid: String(fid), page: 1 }), onNav: navigate, onReply: () => openPost('reply', { tid: current.tid }), blackOn: blackOn, blackList: blackList }) : null)),
        React.createElement('div', { className: 'd4y-status' },
          React.createElement('span', null, '4D4Y 浏览器 v' + VERSION),
          React.createElement('span', null, loggedIn ? '已登录' + (username ? ': ' + username : '') : '未登录')));
    }

    function EntryButton() {
      const [open, setOpen] = React.useState(store.snapshot().open);
      React.useEffect(() => store.subscribe(() => setOpen(store.snapshot().open)), []);
      return React.createElement('button', {
        className: 'd4y-entry',
        title: '打开 4D4Y 浏览器',
        onClick: () => store.toggle(),
        style: open ? { color: 'var(--dsw-alias-state-warn-primary, #ffb45c)' } : null,
      }, open ? '4D4Y ✕' : '4D4Y');
    }

    const inject = ['slots'];

    function apply(ctx) {
      const slots = ctx.get('slots');
      if (slots === undefined) return;
      const disposers = [];
      disposers.push(slots.inject('sidebar.footer.action', () => slots.register(
        { name: 'sidebar.footer.action', id: 'd4y-open', order: 10, label: () => '4D4Y' },
        EntryButton)));
      disposers.push(slots.inject('shell.overlay', () => slots.register(
        { name: 'shell.overlay', id: '4d4y-browser', order: 200 },
        Browser)));
      return () => { for (const d of disposers) { try { d() } catch (e) { /* ignore */ } } };
    }

    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});
