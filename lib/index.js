// 4D4Y Forum Browser — host half (permanent plugin).
// Fetches the real Discuz! 7.2 interfaces (index / forumdisplay / viewthread),
// decodes GBK to UTF-8, parses the pages into structured JSON, and serves it
// to the browser client through one /4d4y/browse JSON route on the webserver.
// Also implements the site's own login flow (formhash + md5 password, exactly
// like the browser does), keeping the resulting cookies in a local jar file so
// logged-in browsing shows the extra forums (生活版区 / 其它) the site reveals
// after login. Only https://www.4d4y.com URLs are ever fetched (no SSRF).

import { existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'

const CURL = 'C:\\Windows\\System32\\curl.exe'
const POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
const BASE = 'https://www.4d4y.com/forum/'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
// Version policy: start at 0.1 and step slowly (0.1 -> 0.2 -> ...); the build
// is 1.0 only when the feature set is complete. Keep in sync with lib/client.js
// and package.json so diagnostics identify the running build.
const VERSION = '0.5'
const COOKIE_FILE = join(process.env.DSH_HOME || join(homedir(), '.dsh'), '4d4y-cookies.txt')

function stripTags(s) { return String(s).replace(/<[^>]*>/g, '') }

function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&middot;/g, '·')
    .replace(/&raquo;/g, '»')
    .replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
}

function clean(s) { return decodeEntities(stripTags(s)) }

function allowed(url) {
  return /^https?:\/\/(www\.)?4d4y\.com\//i.test(url)
}

function md5hex(s) { return createHash('md5').update(String(s), 'utf8').digest('hex') }

/** Discuz 7.2 login.js addslashes — the exact escaping the site applies before md5. */
function addslashes(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/\u0008/g, '\\b')
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\f/g, '\\f')
    .replace(/\r/g, '\\r')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
}

function hasCookieJar() { return existsSync(COOKIE_FILE) }

async function fetchHtml(sub, url, opts = {}) {
  if (!allowed(url)) throw new Error('URL not allowed: ' + url)
  const args = [
    CURL, '-sS', '-L', '--compressed',
    '--connect-timeout', '10', '--max-time', '25',
    '-A', UA,
    '-H', 'Accept-Language: zh-CN,zh;q=0.9',
    '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  ]
  let stdinData
  if (opts.body !== undefined) {
    args.push('-d', '@-')
    stdinData = opts.body
  }
  if (opts.jar) {
    if (hasCookieJar()) args.push('-b', COOKIE_FILE)
    if (opts.jarCreate) args.push('-c', COOKIE_FILE)
  }
  if (Array.isArray(opts.extraArgs)) {
    for (const a of opts.extraArgs) args.push(a)
  }
  args.push('-w', '\n__DSH_HTTP_STATUS__%{http_code}__DSH_END__', url)
  const handle = sub.spawn({
    argv: args,
    stdio: { stdin: stdinData !== undefined ? { data: stdinData } : 'ignore', stdout: 'pipe', stderr: 'pipe' },
    graceMs: 15000,
  })
  const chunks = []
  let sniff = ''
  let sniffed = 0
  const SNIFF_LIMIT = 8192
  const sniffDec = new TextDecoder('utf-8')
  handle.stdout.on('data', (chunk) => {
    chunks.push(chunk)
    if (sniffed < SNIFF_LIMIT) {
      const view = chunk.subarray ? chunk.subarray(0, SNIFF_LIMIT - sniffed) : chunk.slice(0, SNIFF_LIMIT - sniffed)
      sniff += sniffDec.decode(view, { stream: true })
      sniffed += view.length
    }
  })
  let errTail = ''
  handle.stderr.on('data', (chunk) => {
    try { errTail = (errTail + String(chunk)).slice(-400) } catch (e) { /* ignore */ }
  })
  const out = await handle.done
  if (out.exitCode !== 0) throw new Error('curl failed (exit ' + out.exitCode + ')' + (errTail ? ': ' + errTail : ''))
  let charset = 'gbk'
  const csM = sniff.match(/charset\s*=\s*["']?\s*([\w-]+)/i)
  if (csM) {
    const c = csM[1].toLowerCase()
    if (c === 'utf-8' || c === 'utf8') charset = 'utf-8'
  }
  const dec = new TextDecoder(charset)
  let html = ''
  for (const c of chunks) html += dec.decode(c, { stream: true })
  html += dec.decode()
  const stM = html.match(/__DSH_HTTP_STATUS__(\d+)__DSH_END__\s*$/)
  if (stM) {
    const status = parseInt(stM[1], 10)
    html = html.slice(0, stM.index)
    if (status >= 400) throw new Error('HTTP ' + status)
  }
  return html
}

function parsePages(html) {
  const m = html.match(/<div class="pages">([\s\S]*?)<\/div>/)
  if (!m) return { page: 1, totalPages: 1 }
  const inner = m[1]
  const curM = inner.match(/<strong>(\d+)<\/strong>/)
  const page = curM ? parseInt(curM[1], 10) : 1
  let total = 1
  const nums = []
  const linkRe = /page=(\d+)/g
  let lm
  while ((lm = linkRe.exec(inner)) !== null) nums.push(parseInt(lm[1], 10))
  if (nums.length) total = Math.max.apply(null, nums)
  return { page: page, totalPages: total }
}

function parseHome(html) {
  const categories = []
  let last = null
  const re = /<h3><a href="index\.php\?gid=(\d+)[^"]*"[^>]*>([^<]*)<\/a><\/h3>|<tbody id="forum(\d+)">([\s\S]*?)<\/tbody>/g
  let m
  while ((m = re.exec(html)) !== null) {
    if (m[1] !== undefined) {
      last = { gid: m[1], name: clean(m[2]), forums: [] }
      categories.push(last)
    } else {
      const b = m[4]
      const f = { fid: m[3], name: '', description: '', threads: '0', posts: '0', last: null }
      const nameM = b.match(/<h2><a href="forumdisplay\.php\?fid=\d+[^"]*"[^>]*>([^<]*)<\/a>(?:[\s\S]*?)<\/h2>/)
      if (nameM) f.name = clean(nameM[1])
      const descM = b.match(/<h2>[\s\S]*?<\/h2>\s*<p>([\s\S]*?)<\/p>/)
      if (descM) f.description = clean(descM[1])
      const numsM = b.match(/<td class="forumnums">\s*<em>([^<]*)<\/em>\s*\/\s*([^<]*)/)
      if (numsM) { f.threads = String(numsM[1]).trim(); f.posts = String(numsM[2]).trim() }
      const lastM = b.match(/<td class="forumlast">[\s\S]*?<a href="redirect\.php\?tid=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<cite>[\s\S]*?<a[^>]*>([^<]*)<\/a>\s*-\s*([^<]*)<\/cite>/)
      if (lastM) f.last = { tid: lastM[1], title: clean(lastM[2]), author: clean(lastM[3]), time: clean(lastM[4]) }
      if (last) last.forums.push(f)
    }
  }
  // Product rules for the browser home: hide the Buy & Sell forum (fid 6, the
  // only forum under the "4D4Y" category) and show 生活版区 above 技术版区.
  // Empty categories (e.g. 生活版区 while logged out) are dropped entirely.
  const HIDE_FIDS = new Set(['6'])
  const CATEGORY_ORDER = ['34', '36'] // 生活版区 first, then 技术版区
  const visible = []
  for (const c of categories) {
    if (!c.forums) continue
    const forums = c.forums.filter((f) => !HIDE_FIDS.has(String(f.fid)))
    if (forums.length === 0) continue
    visible.push({ gid: c.gid, name: c.name, forums: forums })
  }
  visible.sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a.gid)
    const ib = CATEGORY_ORDER.indexOf(b.gid)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })
  return { categories: visible }
}

function parseForum(html) {
  const nameM = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
  const name = nameM ? clean(nameM[1]) : ''
  const subForums = []
  const subM = html.match(/<table id="subforum_\d+"([\s\S]*?)<\/table>/)
  if (subM) {
    const rowRe = /<h2><a href="forumdisplay\.php\?fid=(\d+)[^"]*"[^>]*>([^<]*)<\/a>(?:[\s\S]*?)<\/h2>[\s\S]*?<td class="forumnums">\s*<em>([^<]*)<\/em>\s*\/\s*([^<]*)/g
    let rm
    while ((rm = rowRe.exec(subM[1])) !== null) {
      subForums.push({ fid: rm[1], name: clean(rm[2]), threads: String(rm[3]).trim(), posts: String(rm[4]).trim() })
    }
  }
  const threads = []
  const rowRe = /<tbody id="normalthread_(\d+)">([\s\S]*?)<\/tbody>/g
  let m
  while ((m = rowRe.exec(html)) !== null) {
    const tid = m[1]
    const b = m[2]
    const t = { tid: tid, title: '', type: '', sticky: 0, author: '', date: '', replies: '0', views: '0', lastAuthor: '', lastTime: '', pages: 1 }
    const titleM = b.match(/<span id="thread_\d+">([\s\S]*?)<\/span>/)
    if (titleM) {
      const am = titleM[1].match(/<a href="viewthread\.php\?tid=\d+[^"]*"[^>]*>([\s\S]*?)<\/a>/)
      t.title = clean(am ? am[1] : titleM[1])
    }
    const typeM = b.match(/<em>\[<a[^>]*>([^<]*)<\/a>\]<\/em>/)
    if (typeM) t.type = clean(typeM[1])
    const folderM = b.match(/<td class="folder">[\s\S]*?alt="([^"]*)"/)
    if (folderM) {
      const fa = folderM[1]
      if (fa.indexOf('置顶') !== -1) t.sticky = fa.indexOf('分类') !== -1 ? 2 : 1
    }
    const authM = b.match(/<td class="author">[\s\S]*?<cite>[\s\S]*?<a[^>]*>([^<]*)<\/a>[\s\S]*?<\/cite>\s*<em>([^<]*)<\/em>/)
    if (authM) { t.author = clean(authM[1]); t.date = clean(authM[2]) }
    const numsM = b.match(/<td class="nums"><strong>([^<]*)<\/strong>\s*\/\s*<em>([^<]*)<\/em>/)
    if (numsM) { t.replies = String(numsM[1]).trim(); t.views = String(numsM[2]).trim() }
    const lastM = b.match(/<td class="lastpost">[\s\S]*?<cite><a[^>]*>([^<]*)<\/a><\/cite>[\s\S]*?<em><a[^>]*>([^<]*)<\/a><\/em>/)
    if (lastM) { t.lastAuthor = clean(lastM[1]); t.lastTime = clean(lastM[2]) }
    const pagesM = b.match(/<span class="threadpages">([\s\S]*?)<\/span>/)
    if (pagesM) {
      const nums = []
      const pr = /page=(\d+)/g
      let pm
      while ((pm = pr.exec(pagesM[1])) !== null) nums.push(parseInt(pm[1], 10))
      if (nums.length) t.pages = Math.max.apply(null, nums)
    }
    threads.push(t)
  }
  const pag = parsePages(html)
  return { name: name, subForums: subForums, threads: threads, page: pag.page, totalPages: pag.totalPages }
}

function sanitizeContent(h) {
  let s = String(h)
  // Discuz lazy-load thumbnails: the real image lives in the `file` attribute
  // while `src` is a placeholder (none.gif) that the site swaps via JS, which
  // we never run — so promote `file` to `src` here.
  s = s.replace(/<img\b([^>]*?)\bfile="([^"]+)"([^>]*)>/gi, function (m, a1, file, a2) {
    const orig = file.replace(/&amp;/g, '&')
    const thumb = /\.thumb(\.|$)/i.test(orig) ? orig : orig + '.thumb.jpg'
    const rest = (a1 + ' ' + a2).replace(/\bfile="[^"]*"/gi, ' ').replace(/\bsrc="[^"]*"/gi, ' ')
    return '<a href="' + orig + '" target="_blank" rel="noopener noreferrer"><img src="' + thumb + '" data-full="' + orig + '"' + rest + '></a>'
  })
  s = s.replace(/<img([^>]*?)onclick="zoom\(this,\s*'([^']*)'\)"([^>]*)>/gi, function (m, a1, full, a2) {
    return '<a href="' + full.replace(/&amp;/g, '&') + '" target="_blank" rel="noopener noreferrer"><img' + a1 + a2 + '></a>'
  })
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '')
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '')
  s = s.replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
  s = s.replace(/<object[\s\S]*?<\/object>/gi, '')
  s = s.replace(/<embed[^>]*>/gi, '')
  s = s.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ' ')
  s = s.replace(/(href|src)\s*=\s*(?:"|')\s*javascript:[^"']*(?:"|')/gi, function (m2) { return m2.replace(/javascript:/i, '#') })
  // native lazy loading for every image (and async decode) — only visible
  // images are fetched, which is the biggest win for slow picture loading.
  s = s.replace(/<img\b/gi, '<img loading="lazy" decoding="async"')
  // Group CONSECUTIVE images (and their <a> wrappers) into .d4y-imgrow flex
  // rows so a floor with several pictures shows them side by side instead of
  // stacked. The grouping is done here in the HTML so it is guaranteed
  // structure, independent of any client-side DOM work.
  {
    const tokens = []
    s = s.replace(/<a\s[^>]*>\s*<img[^>]*>\s*<\/a>|<img[^>]*>/gi, (m) => {
      tokens.push(m)
      return '@@IMG' + (tokens.length - 1) + '@@'
    })
    s = s.replace(/(?:<br\s*\/?>|<div[^>]*style="[^"]*display\s*:\s*none[^"]*"[^>]*>[\s\S]*?<\/div>|\s)+/gi, (m) => {
      tokens.push(m)
      return '@@G' + (tokens.length - 1) + '@@'
    })
    s = s.replace(/(@@IMG\d+@@(?:(?:@@G\d+@@)*(?:@@IMG\d+@@))+)/g, (m) => '<div class="d4y-imgrow">' + m + '</div>')
    s = s.replace(/@@IMG(\d+)@@/g, (m, i) => tokens[parseInt(i, 10)])
    s = s.replace(/@@G(\d+)@@/g, (m, i) => tokens[parseInt(i, 10)])
  }
  return s
}

function parseThread(html, tid) {
  let title = ''
  const titleM = html.match(/<div id="threadtitle">[\s\S]*?<h1>([\s\S]*?)<\/h1>/)
  if (titleM) title = clean(titleM[1])
  let forumName = ''
  let forumFid = ''
  const navM = html.match(/<a href="forumdisplay\.php\?fid=(\d+)[^"]*"[^>]*>([^<]*)<\/a> &raquo;/)
  if (navM) { forumFid = navM[1]; forumName = clean(navM[2]) }
  const posts = []
  const parts = html.split(/<div id="post_(\d+)">/)
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const seg = parts[i + 1]
    const p = { pid: parts[i], floor: 0, author: '', uid: '', time: '', avatar: '', group: '', online: null, profile: null, html: '' }
    const floorM = seg.match(/<em>(\d+)<\/em><sup>#<\/sup>/)
    if (floorM) p.floor = parseInt(floorM[1], 10)
    const authM = seg.match(/<td class="postauthor"[^>]*>[\s\S]*?<div class="postinfo">[\s\S]*?<a[^>]*?href="space\.php\?uid=(\d+)[^"]*"[^>]*>([^<]*)<\/a>/)
    if (authM) { p.uid = authM[1]; p.author = clean(authM[2]) }
    const avatarM = seg.match(/<div class="avatar"[\s\S]*?<img[^>]*src="([^"]*)"/)
    if (avatarM) p.avatar = avatarM[1].replace(/&amp;/g, '&')
    const groupM = seg.match(/<p><em><a href="faq\.php[^"]*"[^>]*>([^<]*)<\/a><\/em><\/p>/)
    if (groupM) p.group = clean(groupM[1])
    const onlineM = seg.match(/<em>([^<]*(?:在线|离线)[^<]*)<\/em>/)
    if (onlineM) p.online = onlineM[1].indexOf('离线') === -1
    const profM = seg.match(/<dl class="profile[^"]*">([\s\S]*?)<\/dl>/)
    if (profM) {
      const profile = {}
      const dtRe = /<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g
      let dm
      while ((dm = dtRe.exec(profM[1])) !== null) {
        const k = clean(dm[1]).replace(/\s+/g, '')
        const v = clean(dm[2]).replace(/\s+/g, '')
        if (k === '帖子') profile.posts = v
        else if (k === '积分') profile.credits = v
        else if (k === '注册时间') profile.regDate = v
      }
      if (Object.keys(profile).length) p.profile = profile
    }
    const timeM = seg.match(/<em id="authorposton\d+">([^<]*)<\/em>/)
    if (timeM) p.time = clean(timeM[1]).replace(/^发表于\s*/, '')
    const contentM = seg.match(/<td class="t_msgfont" id="postmessage_\d+">([\s\S]*?)<\/td>/)
    if (contentM) p.html = sanitizeContent(contentM[1])
    posts.push(p)
  }
  const pag = parsePages(html)
  return { tid: String(tid), title: title, forumName: forumName, forumFid: forumFid, posts: posts, page: pag.page, totalPages: pag.totalPages }
}

async function browse(sub, kind, fid, tid, page) {
  if (kind === 'home') {
    return parseHome(await fetchHtml(sub, BASE + 'index.php', { jar: true }))
  }
  if (kind === 'forum') {
    const cleanFid = String(fid || '').replace(/\D/g, '')
    if (!cleanFid) throw new Error('missing fid')
    return parseForum(await fetchHtml(sub, BASE + 'forumdisplay.php?fid=' + cleanFid + '&page=' + page, { jar: true }))
  }
  if (kind === 'thread') {
    const cleanTid = String(tid || '').replace(/\D/g, '')
    if (!cleanTid) throw new Error('missing tid')
    return parseThread(await fetchHtml(sub, BASE + 'viewthread.php?tid=' + cleanTid + '&page=' + page, { jar: true }), cleanTid)
  }
  throw new Error('unknown kind: ' + kind)
}

/** True only when the cookie jar holds a live session (discuz_uid > 0 on index). */
async function checkLoggedIn(sub) {
  try {
    if (!hasCookieJar()) return false
    const idx = await fetchHtml(sub, BASE + 'index.php', { jar: true })
    const uidM = idx.match(/discuz_uid\s*=\s*(\d+)/)
    return !!(uidM && parseInt(uidM[1], 10) > 0)
  } catch (e) {
    return false
  }
}

/** Replicate the site's own login POST exactly: md5(addslashes(password)) + formhash/sid. */
async function doLogin(sub, username, password) {
  const uname = String(username || '').trim()
  if (!uname || password === undefined || password === '') throw new Error('缺少用户名或密码')
  const loginPage = await fetchHtml(sub, BASE + 'logging.php?action=login', { jar: true, jarCreate: true })
  const sidM = loginPage.match(/name="sid"\s+value="([^"]*)"/)
  const fhM = loginPage.match(/name="formhash"\s+value="([^"]*)"|name="formhash"\s+value='([^']*)'/)
  const sid = sidM ? sidM[1] : ''
  const formhash = fhM ? (fhM[1] || fhM[2]) : ''
  if (!formhash) {
    // logging.php redirects to the index when a valid session already exists
    // (no login form is rendered), so treat that as already logged in.
    const uidM = loginPage.match(/discuz_uid\s*=\s*(\d+)/)
    if (uidM && parseInt(uidM[1], 10) > 0) {
      return { uid: parseInt(uidM[1], 10), username: uname, already: true }
    }
    throw new Error('无法获取登录表单 (formhash)')
  }
  const pwd = md5hex(addslashes(password))
  const enc = encodeURIComponent
  const body = 'sid=' + enc(sid) +
    '&formhash=' + enc(formhash) +
    '&referer=' + enc(BASE + 'index.php') +
    '&loginfield=username' +
    '&username=' + enc(uname) +
    '&password=' + pwd +
    '&questionid=0&answer=&cookietime=2592000&loginsubmit=true'
  await fetchHtml(sub, BASE + 'logging.php?action=login&loginsubmit=yes', { jar: true, jarCreate: true, body: body })
  if (!(await checkLoggedIn(sub))) {
    try { unlinkSync(COOKIE_FILE) } catch (e) { /* ignore */ }
    throw new Error('登录失败: 用户名或密码错误')
  }
  return { uid: 1, username: uname }
}

/** Extract the blacklist usernames from the pm.php?action=viewblack page. */
function parseBlacklist(html) {
  const names = []
  const seen = new Set()
  const re = /<a href="space\.php\?username=[^"]*"[^>]*>([^<]*)<\/a>/g
  let m
  while ((m = re.exec(html)) !== null) {
    const name = clean(m[1]).trim()
    if (name && !seen.has(name)) {
      seen.add(name)
      names.push(name)
    }
  }
  return names
}

/** Pull the error message out of a Discuz response (alert_error block), or null. */
function extractPostError(html) {
  const m = html.match(/<div class="alert_error">([\s\S]*?)<\/div>/)
  if (!m) return null
  const text = clean(m[1]).replace(/\s+/g, ' ').trim()
  return text || null
}

/** Run one PowerShell helper: feeds UTF-8 JSON in, collects stdout text out. */
async function runPwsh(sub, script, input) {
  const handle = sub.spawn({
    argv: [POWERSHELL, '-NoProfile', '-NonInteractive', '-Command', script],
    stdio: { stdin: { data: input }, stdout: 'pipe', stderr: 'pipe' },
    graceMs: 25000,
  })
  const out = []
  handle.stdout.on('data', (c) => { try { out.push(String(c)) } catch (e) { /* ignore */ } })
  let errTail = ''
  handle.stderr.on('data', (c) => { try { errTail = (errTail + String(c)).slice(-300) } catch (e) { /* ignore */ } })
  const r = await handle.done
  if (r.exitCode !== 0) throw new Error('powershell helper failed (exit ' + r.exitCode + ')' + (errTail ? ': ' + errTail : ''))
  return out.join('')
}

/**
 * Stage one post in the site's own encoding: subject/message go through a
 * PowerShell helper into GBK temp files (the forum is GBK — UTF-8 bytes would
 * garble Chinese), while image payloads are written straight from Node as real
 * binary files (no size limit, no encoding hop).
 */
async function stagePost(sub, subject, message, images) {
  const payload = JSON.stringify({ subject: subject || '', message: message || '' })
  const script = "[Console]::InputEncoding=[Text.Encoding]::UTF8; $j=[Console]::In.ReadToEnd()|ConvertFrom-Json; " +
    "$enc=[Text.Encoding]::GetEncoding(936); $dir=[IO.Path]::GetTempPath(); " +
    "$out=@{subject='';message=''}; " +
    "if($j.subject){$b=$enc.GetBytes([string]$j.subject);$p=Join-Path $dir ('d4y_sub_'+[guid]::NewGuid().ToString('N')+'.txt');[IO.File]::WriteAllBytes($p,$b);$out.subject=$p}; " +
    "if($j.message){$b=$enc.GetBytes([string]$j.message);$p=Join-Path $dir ('d4y_msg_'+[guid]::NewGuid().ToString('N')+'.txt');[IO.File]::WriteAllBytes($p,$b);$out.message=$p}; " +
    "[Console]::OutputEncoding=[Text.Encoding]::ASCII; Write-Output ($out|ConvertTo-Json -Compress)"
  const text = await runPwsh(sub, script, payload)
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('无法准备发帖文本')
  const files = JSON.parse(m[0])
  const imagesOut = []
  for (const img of images || []) {
    const data = String(img.data || '')
    if (!data) continue
    let buf = null
    try { buf = Buffer.from(data, 'base64') } catch (e) { buf = null }
    if (!buf || buf.length === 0) continue
    let ext = '.jpg'
    const nm = String(img.name || '')
    const em = nm.match(/\.([a-z0-9]{1,6})$/i)
    if (em) ext = '.' + em[1].toLowerCase()
    const path = join(tmpdir(), 'd4y_img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + ext)
    try { writeFileSync(path, buf) } catch (e) { continue }
    imagesOut.push({ path: path, name: safeFilename(img.name), type: img.type })
  }
  return { subject: files.subject || '', message: files.message || '', images: imagesOut }
}

function safeFilename(name) {
  return String(name || 'photo.jpg').replace(/[\\/";\r\n]+/g, '_').slice(0, 80)
}

/** Topic-type options for one forum's new-thread form (typed forums require one). */
async function postOptions(sub, fid) {
  const cleanFid = String(fid || '').replace(/\D/g, '')
  if (!cleanFid) return { types: [] }
  const form = await fetchHtml(sub, BASE + 'post.php?action=newthread&fid=' + cleanFid, { jar: true })
  const types = []
  const sel = form.match(/<select[^>]*name="typeid"[^>]*>([\s\S]*?)<\/select>/)
  if (sel) {
    const optRe = /<option[^>]*value="(\d+)"[^>]*>([\s\S]*?)<\/option>/g
    let m
    while ((m = optRe.exec(sel[1])) !== null) {
      const id = parseInt(m[1], 10)
      const name = clean(m[2]).trim()
      if (id > 0 && name) types.push({ id: id, name: name })
    }
  }
  return { types: types }
}

/** Publish a new thread or a reply (multipart), with optional image attachments. */
async function doPost(sub, action, fid, tid, subject, message, images, typeid) {
  const cleanMsg = String(message || '').trim()
  if (!cleanMsg) throw new Error('内容不能为空')
  let url, formUrl, label, submitField
  if (action === 'newthread') {
    const cleanFid = String(fid || '').replace(/\D/g, '')
    if (!cleanFid) throw new Error('缺少版块 fid')
    if (!String(subject || '').trim()) throw new Error('标题不能为空')
    formUrl = BASE + 'post.php?action=newthread&fid=' + cleanFid
    url = formUrl
    label = '发帖'
    submitField = 'topicsubmit'
  } else if (action === 'reply') {
    const cleanTid = String(tid || '').replace(/\D/g, '')
    if (!cleanTid) throw new Error('缺少主题 tid')
    formUrl = BASE + 'post.php?action=reply&tid=' + cleanTid
    url = formUrl
    label = '回复'
    submitField = 'replysubmit'
  } else {
    throw new Error('未知操作: ' + action)
  }
  const form = await fetchHtml(sub, formUrl, { jar: true })
  const hidden = (name) => {
    const re = new RegExp('name=["\\\']' + name + '["\\\'][^>]*value=["\\\']([^"\\\']*)["\\\']|value=["\\\'][^"\\\']*["\\\'][^>]*name=["\\\']' + name + '["\\\']')
    const m = form.match(re)
    return m ? m[1] : ''
  }
  const formhash = hidden('formhash')
  const sid = hidden('sid')
  if (!formhash) throw new Error('无法获取发帖表单,请确认已登录(若刚登录,请稍候重试)')
  if (/id="seccodeverify"|name="seccode"/i.test(form)) {
    throw new Error('该操作需要填写验证码,请在浏览器中手动完成')
  }
  const staged = await stagePost(sub, action === 'newthread' ? subject : '', cleanMsg, images || [])
  const posttime = hidden('posttime') || String(Math.floor(Date.now() / 1000))
  const uid = hidden('uid')
  const hash = hidden('hash')
  // Upload images through the site's own swfupload endpoint (each file gets an
  // aid), then mark them used via attachnew[aid][description] and place them
  // inline with [attachimg]aid[/attachimg] in the message.
  const aids = []
  for (const img of staged.images) {
    const upUrl = BASE + 'misc.php?action=swfupload&operation=upload&simple=1&type=image'
    const up = await fetchHtml(sub, upUrl, {
      jar: true, jarCreate: true,
      extraArgs: ['-F', 'uid=' + uid, '-F', 'hash=' + hash, '-F', 'posttime=' + posttime,
        '-F', 'Filedata=@' + img.path + ';type=' + (img.type && /^image\//i.test(img.type) ? img.type : 'image/jpeg') + ';filename=' + safeFilename(img.name)],
    })
    const am = up.match(/DISCUZUPLOAD\|0\|(\d+)\|/)
    if (!am) {
      const st = (up.match(/DISCUZUPLOAD\|(\d+)\|/) || [])[1]
      throw new Error('图片 ' + (img.name || '') + ' 上传失败' + (st ? ' (状态 ' + st + ',文件无效或超限)' : ''))
    }
    aids.push(am[1])
  }
  // Re-stage the text with the [attachimg] tags appended for inline placement.
  let tagStr = ''
  for (const aid of aids) tagStr += '\n[attachimg]' + aid + '[/attachimg]'
  const stagedText = tagStr ? await stagePost(sub, '', cleanMsg + tagStr, []) : null
  const finalSubject = staged.subject
  const finalMessage = stagedText ? stagedText.message : staged.message
  const cleanup = () => {
    const all = [staged.subject, staged.message].filter(Boolean).concat(staged.images.map((i) => i.path))
    if (stagedText) all.push(stagedText.subject, stagedText.message)
    for (const p of all) { if (p) { try { unlinkSync(p) } catch (e) { /* ignore */ } } }
  }
  const curlArgs = ['-F', 'formhash=' + formhash]
  if (sid) curlArgs.push('-F', 'sid=' + sid)
  curlArgs.push('-F', 'extra=', '-F', 'posttime=' + posttime)
  if (action === 'newthread') {
    const cleanType = String(typeid || '').replace(/\D/g, '')
    curlArgs.push('-F', 'typeid=' + (cleanType || '0'), '-F', 'topicsort=0')
  }
  curlArgs.push('-F', submitField + '=true')
  if (finalSubject) curlArgs.push('-F', 'subject=<' + finalSubject)
  curlArgs.push('-F', 'message=<' + finalMessage)
  for (const aid of aids) {
    curlArgs.push('-F', 'attachnew[' + aid + '][description]=')
  }
  try {
    const res = await fetchHtml(sub, url, { jar: true, jarCreate: true, extraArgs: curlArgs })
    const err = extractPostError(res)
    if (err) throw new Error(label + '失败: ' + err)
    return { action: action }
  } finally {
    cleanup()
  }
}

function apply(ctx) {
  const sub = ctx.subprocess
  const webServer = ctx.webServer
  if (sub === undefined || webServer === undefined) {
    console.error('[4d4y-browser] host half skipped: missing services')
    return
  }

  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: '/4d4y',
    handler: async (req, res) => {
      let body
      const send = (payload) => {
        body = JSON.stringify(payload)
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        })
        res.end(body)
      }
      try {
        const url = new URL(req.url ?? '/', 'http://4d4y.local')
        const action = url.pathname.replace(/^\/4d4y\/?/, '')
        if (action === 'browse') {
          const kind = url.searchParams.get('kind') ?? ''
          const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
          const data = await browse(sub, kind, url.searchParams.get('fid'), url.searchParams.get('tid'), page)
          send({ ok: true, data: data })
          return
        }
        if (action === 'status') {
          send({ ok: true, data: { loggedIn: await checkLoggedIn(sub), version: VERSION } })
          return
        }
        if (action === 'blacklist') {
          if (!(await checkLoggedIn(sub))) throw new Error('未登录: 请先在面板登录 4D4Y,再开启黑名单屏蔽')
          const html = await fetchHtml(sub, BASE + 'pm.php?action=viewblack', { jar: true })
          const usernames = parseBlacklist(html)
          send({ ok: true, data: { usernames: usernames } })
          return
        }
        if (action === 'postoptions') {
          if (!(await checkLoggedIn(sub))) throw new Error('未登录: 请先登录')
          const data = await postOptions(sub, url.searchParams.get('fid'))
          send({ ok: true, data: data })
          return
        }
        if (action === 'post') {
          if (req.method !== 'POST') throw new Error('post requires POST')
          if (!(await checkLoggedIn(sub))) throw new Error('未登录: 请先在面板登录 4D4Y,再发帖')
          let raw = ''
          for await (const chunk of req) raw += chunk
          let params
          const ct = req.headers && req.headers['content-type'] ? String(req.headers['content-type']) : ''
          if (/json/i.test(ct)) {
            params = raw ? JSON.parse(raw) : {}
          } else {
            const sp = new URLSearchParams(raw)
            params = {}
            for (const k of sp.keys()) params[k] = sp.get(k)
          }
          const data = await doPost(sub, params.action, params.fid, params.tid, params.subject, params.message, params.images, params.typeid)
          send({ ok: true, data: data })
          return
        }
        if (action === 'login') {
          if (req.method !== 'POST') throw new Error('login requires POST')
          let raw = ''
          for await (const chunk of req) raw += chunk
          const params = new URLSearchParams(raw)
          const data = await doLogin(sub, params.get('username'), params.get('password'))
          send({ ok: true, data: data })
          return
        }
        if (action === 'logout') {
          if (hasCookieJar()) {
            try { unlinkSync(COOKIE_FILE) } catch (e) { /* ignore */ }
          }
          send({ ok: true, data: { loggedIn: false } })
          return
        }
        throw new Error('unknown action: ' + action)
      } catch (e) {
        send({ ok: false, error: String(e && e.message ? e.message : e) })
      }
    },
  }), '4d4y:route')

  console.log('[4d4y-browser] host half ready: /4d4y/browse + /4d4y/login + /4d4y/status + /4d4y/logout')
}

export { addslashes, apply, browse, checkLoggedIn, clean, doLogin, doPost, extractPostError, fetchHtml, md5hex, parseBlacklist, parseForum, parseHome, parsePages, parseThread, postOptions, runPwsh, sanitizeContent, stagePost }
export default { name: '4d4y-browser', inject: ['webServer', 'subprocess'], apply }
