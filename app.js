/* into_english — 웹툰 · 문장 · 튜터 셋을 한 껍데기에 담는다.
   공부노트(anki_civil_note)와 같은 방식: 해시 하나가 화면 하나, 상태는 localStorage. */

const DAY = 864e5;
const KEY = "into_english.v1";
const TUTOR_DEFAULT = "http://localhost:8787";

/* 그림·소리·자료는 비공개 저장소에 있다. 이 껍데기는 공개돼 있어도 토큰 없이는
   아무것도 못 읽는다. 토큰은 이 브라우저에만 저장된다. */
const GH = { owner: "notjaeyoung0108-lang", repo: "into_english_media", ref: "main" };

const esc = s => String(s ?? "").replace(/[&<>"]/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const today0 = () => new Date().setHours(0, 0, 0, 0);
const $ = id => document.getElementById(id);

/* 파형 아이콘. 가운데가 높은 다섯 개 막대 — 소리가 난다는 뜻만 전하면 된다. */
const WAVE = `<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
  ${[[2, 7], [6, 12], [10, 18], [14, 12], [18, 7]].map(([x, h]) =>
    `<rect x="${x}" y="${(22 - h) / 2}" width="2.4" height="${h}" rx="1.2"/>`).join("")}
</svg>`;
const playBtn = `<button class="play" id="play" aria-label="듣기">${WAVE}</button>`;

/* ── 저장소 ── */
let S = { v: 1, tutor: TUTOR_DEFAULT, gh: "", s: {}, log: [] };
try {
  const raw = localStorage.getItem(KEY);
  if (raw) S = Object.assign(S, JSON.parse(raw));
} catch (e) { /* 사파리 프라이빗 등 — 기본값으로 그냥 간다 */ }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

/* ── 비공개 저장소에서 읽기 ──────────────────────────────
   토큰은 헤더로만 보낼 수 있다. 그래서 <img src> 로는 안 되고, 컷 하나하나를
   fetch 로 받아 blob 주소로 바꿔 끼운다. 브라우저 캐시가 안 먹는 대신
   Cache API 에 직접 넣어 두 번째부터는 네트워크를 안 탄다. */
const API = p =>
  `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${p}?ref=${GH.ref}`;

async function ghGet(path) {
  const r = await fetch(API(path), {
    headers: { Authorization: `Bearer ${S.gh}`, Accept: "application/vnd.github.raw" },
  });
  if (r.status === 401 || r.status === 403)
    throw new Error("토큰이 거부됐습니다 — 만료됐거나 권한이 없습니다.");
  if (r.status === 404)
    throw new Error(`저장소에 ${path} 가 없습니다.`);
  if (!r.ok) throw new Error(`${path} — HTTP ${r.status}`);
  return r;
}

const MEM = new Map();
let CACHE;
async function cacheBox() {
  if (CACHE === undefined) {
    try { CACHE = await caches.open("into_english.media"); }
    catch (e) { CACHE = null; }   /* 사파리 프라이빗 등 — 매번 받는다 */
  }
  return CACHE;
}

/* 같은 이름의 파일이 새 빌드로 바뀌었으면 도장(V)이 달라져 캐시가 안 맞는다. */
async function media(path) {
  const key = `https://media.local/${path}?v=${V}`;
  if (MEM.has(key)) return MEM.get(key);
  const job = (async () => {
    const box = await cacheBox();
    let res = box && await box.match(key);
    if (!res) {
      res = await ghGet(path);
      if (box) { try { await box.put(key, res.clone()); } catch (e) {} }
    }
    return URL.createObjectURL(await res.blob());
  })();
  MEM.set(key, job);
  return job;
}

/* 지난 빌드의 찌꺼기를 치운다. 안 하면 컷을 다시 구울 때마다 캐시가 쌓인다. */
async function sweepCache() {
  const box = await cacheBox();
  if (!box) return;
  for (const req of await box.keys())
    if (!req.url.endsWith(`?v=${V}`)) box.delete(req);
}

/* 컷이 화면에 다가올 때 받는다. 한 화가 100컷이라 한꺼번에 부르면 안 된다.
   여유를 크게 잡는 이유: 세로 2800px 짜리 긴 컷이 섞여 있어 1500px 로는
   컷이 화면에 닿고 나서야 받기 시작해 그 컷만 빈칸으로 보인다. */
const IO = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { IO.unobserve(e.target); fill(e.target); }
}), { rootMargin: "5000px 0px" });

/* 그래도 아래로 빨리 훑으면 관찰자가 못 따라온다. 회차를 열면 남은 컷을
   앞에서부터 조용히 받아 둔다 — 한 번에 셋씩, 스크롤을 막지 않는다. */
let prefetchRun = 0;
async function prefetch(paths) {
  const mine = ++prefetchRun;
  const queue = paths.slice();
  const worker = async () => {
    while (queue.length && mine === prefetchRun) {
      try { await media(queue.shift()); } catch (e) { /* 한 컷 실패는 넘긴다 */ }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

function fill(img) {
  media(img.dataset.gh).then(u => { img.src = u; })
    .catch(() => img.classList.add("bad"));
}
/* 화면을 새로 그린 뒤 반드시 부른다 — data-gh 만 있고 src 가 없는 그림을 잇는다. */
function hydrate() {
  document.querySelectorAll("img[data-gh]:not([src])").forEach(img =>
    "eager" in img.dataset ? fill(img) : IO.observe(img));
}

/* ── 자료 ── */
let EPS = [], SENT = [], V = "";
async function load() {
  const j = async p => JSON.parse(await (await ghGet(p)).text());
  V = await j("data/version.json").then(o => o.v || "").catch(() => "");
  [EPS, SENT] = await Promise.all([j("data/webtoon.json"), j("data/sentences.json")]);
}

/* ── 일정 ────────────────────────────────────────────────
   몰랐어요 → 내일 · 헷갈려요 → 사흘 뒤 · 맞혔어요 → 연속 정답 수만큼 벌린다.
   문장은 낱개 사실이라 공부노트의 '장 사이클' 대신 간격을 늘려가는 쪽이 맞다. */
const G = [null, { t: "몰랐어요" }, { t: "헷갈려요" }, { t: "맞혔어요" }];
const OK_STEP = [1, 3, 7, 16, 35, 70];
function ivlDays(st, g) {
  if (g === 1) return 1;
  if (g === 2) return 3;
  return OK_STEP[Math.min((st && st.ok || 0), OK_STEP.length - 1)];
}
function grade(it, g) {
  const st = S.s[it.id] || { reps: 0, ok: 0 };
  const d = ivlDays(st, g);
  st.reps = (st.reps || 0) + 1;
  st.ok = g === 3 ? (st.ok || 0) + 1 : 0;
  st.due = today0() + d * DAY;
  st.last = Date.now(); st.lastG = g;
  S.s[it.id] = st;
  S.log.push({ t: Date.now(), id: it.id, g });
  save();
}
const stOf = it => S.s[it.id];
/* 오늘 볼 것 = 기한이 찬 카드 + 아직 한 번도 안 본 카드. */
const dueList = () => SENT.filter(it => { const s = stOf(it); return s && s.due <= today0(); });
const freshList = () => SENT.filter(it => !stOf(it));
const shuffled = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(p => p[1]);

/* ── 껍데기 ── */
function head(title, canBack) {
  $("ttl").textContent = title;
  $("back").disabled = !canBack;
}
$("back").onclick = () => history.back();
$("gear").onclick = () => { location.hash = "#settings"; };

/* ══════════ 웹툰 ══════════ */
function webtoonHome() {
  head("웹툰", false);
  prefetchRun++;   /* 읽던 화의 남은 컷을 계속 받고 있을 이유가 없다 */
  if (!EPS.length) return $("app").innerHTML = `<div class="empty">올린 에피소드가 없습니다.</div>`;
  $("app").innerHTML = `
    <div class="hero">
      <div class="band"></div>
      <div class="in">
        <img data-gh="assets/webtoon/cover.webp" data-eager alt="">
        <div class="wt"><b>차현의 게임일기</b>
          <span>전체 ${EPS.length}화</span></div>
      </div>
    </div>
    <div class="epwrap"><div class="eplist">` + [...EPS].reverse().map(e => `
    <a class="ep" href="#webtoon!${esc(e.id)}">
      <img data-gh="assets/webtoon/${esc(e.id)}/${esc(e.cover)}" alt="">
      <div>
        <div class="ti">${esc(e.label)}</div>
        <div class="n">${esc(e.date)}</div>
      </div>
    </a>`).join("") + `</div></div>`;
  hydrate();
}

function webtoonRead(id) {
  const i = EPS.findIndex(e => e.id === id);
  if (i < 0) return webtoonHome();
  const e = EPS[i], prev = EPS[i - 1], next = EPS[i + 1];
  head("", true);   /* 회차 제목은 첫 컷의 제목 카드가 이미 보여준다 */
  /* 세로 비율을 미리 잡아둔다 — 안 그러면 컷이 늦게 뜰 때마다 읽던 자리가 밀린다. */
  $("app").innerHTML = `<div class="strip">` + e.panels.map((p, n) => `
      <img data-gh="assets/webtoon/${esc(e.id)}/${esc(p.f)}" alt="${n + 1}컷"
           width="900" height="${Math.round(900 * p.r)}"
           ${n < 3 ? "data-eager" : ""} decoding="async">`).join("") + `</div>
    <div class="epnav">
      ${prev ? `<a href="#webtoon!${esc(prev.id)}">← ${esc(prev.label)}</a>` : ""}
      <a href="#webtoon">목록</a>
      ${next ? `<a href="#webtoon!${esc(next.id)}">${esc(next.label)} →</a>` : ""}
    </div>`;
  hydrate();
  prefetch(e.panels.map(p => `assets/webtoon/${e.id}/${p.f}`));
  window.scrollTo(0, 0);
}

/* ══════════ 문장 ══════════ */
let q = [], qi = 0, flip = false, fallback = "";

function sentenceHome() {
  head("학습 기록", true);
  const due = dueList().length, fresh = freshList().length;
  const learned = SENT.filter(it => { const s = stOf(it); return s && s.ok >= 2; }).length;
  const doneToday = S.log.filter(l => l.t >= today0()).length;
  const peek = shuffled(SENT).slice(0, 6);
  $("app").innerHTML = `
    <div class="tiles">
      <div class="tile"><div class="k">오늘 볼 것</div><div class="v">${due + fresh}</div></div>
      <div class="tile"><div class="k">오늘 한 것</div><div class="v">${doneToday}</div></div>
      <div class="tile"><div class="k">외운 문장</div><div class="v">${learned}</div></div>
    </div>
    <div class="acts"><button class="flip" id="start">
      ${due + fresh ? `카드 ${due + fresh}장 보기` : "복습할 게 없어요 — 그냥 돌리기"}
    </button></div>
    <div class="sect">전체 ${SENT.length}문장</div>
    <div class="slist">${peek.map(it => `
      <div class="srow"><div class="en">${esc(it.en)}</div>
        <div class="ko">${esc(it.ko)}</div></div>`).join("")}</div>`;
  $("start").onclick = () => { q = []; location.hash = "#sentence"; };
}

function sentenceRun() {
  if (!q.length) {
    q = shuffled(dueList()).concat(shuffled(freshList()));
    fallback = "";
    /* 볼 게 없어도 탭을 눌렀으면 카드가 나와야 한다 — 안내 화면을 한 장 더 두면
       매일 그걸 지나쳐 누르게 된다. */
    if (!q.length) { q = shuffled(SENT); fallback = "복습 완료 · 자유 연습"; }
    qi = 0; flip = false;
  }
  if (qi >= q.length) return sentenceDone();
  const it = q[qi];
  head("문장", false);   /* 이제 탭의 첫 화면이라 '뒤로' 갈 곳이 없다 */

  const pic = it.img
    ? `<img class="pic" data-gh="assets/sentence/${esc(it.img)}" data-eager alt="">` : "";
  /* 말투(casual · business)만 남긴다 — 화자 이름은 그림 만들 때 쓰는 값이지
     외우는 사람이 알아야 할 것이 아니다. */
  const meta = it.register ? `<div class="meta"><span>${esc(it.register)}</span></div>` : "";

  /* 앞면은 영어 문장만 — 그림도 뜻도 없다. 그림이 앞에 있으면 뜻이 먼저 떠올라
     외웠는지 아닌지를 스스로 속이게 된다. */
  const front = `${meta}<div class="fq">
      <div class="en">${esc(it.en)}</div>
      ${it.audio ? `<div>${playBtn}</div>` : ""}
    </div>`;
  const back = `${pic}${meta}<div class="fa">
      <div class="en">${esc(it.en)}</div>
      <div class="ko">${esc(it.ko)}</div>
      ${it.audio ? playBtn : ""}
      ${it.chunk ? `<div class="chunk">
        <div class="c">${esc(it.chunk)}</div>
        <div class="ck">${esc(it.chunk_ko)}</div>
        ${it.note ? `<div class="nt">${esc(it.note)}</div>` : ""}
      </div>` : ""}
    </div>`;

  const acts = flip
    ? `<div id="grades">${[1, 2, 3].map(g => {
        const d = ivlDays(stOf(it), g);
        return `<button class="g${g}" data-g="${g}"><b>${G[g].t}</b>` +
               `<span>${d}일 후</span></button>`;
      }).join("")}</div>`
    : `<button class="flip" id="doflip">뒷면 보기</button>`;

  $("app").innerHTML = `
    <div class="cnt"><b>${qi + 1}</b> / ${q.length}${fallback ? " · " + fallback : ""}
      · <a href="#sentence!home">기록</a></div>
    <div class="fcard${flip && pic ? " hasimg" : ""}">${flip ? back : front}</div>
    <div class="acts">${acts}</div>`;

  hydrate();

  const f = $("doflip");
  if (f) f.onclick = () => { flip = true; sentenceRun(); };

  if (it.audio) {
    const wasFlip = flip;
    media("assets/sentence/" + it.audio).then(u => {
      const a = new Audio(u);
      /* 뒤집자마자 한 번 들려준다. 브라우저가 자동재생을 막으면 조용히 넘어가고,
         듣기 버튼은 사용자 클릭이라 항상 난다. */
      if (wasFlip) a.play().catch(() => {});
      const pb = $("play");
      if (pb) pb.onclick = () => { a.currentTime = 0; a.play().catch(() => {}); };
    }).catch(() => {});
  }

  document.querySelectorAll("#grades button").forEach(b => {
    b.onclick = () => {
      grade(it, +b.getAttribute("data-g"));
      qi++; flip = false; window.scrollTo(0, 0); sentenceRun();
    };
  });
}

function sentenceDone() {
  head("문장", false);
  const done = S.log.filter(l => l.t >= today0()).length;
  $("app").innerHTML = `
    <div class="empty">오늘 ${done}장 봤습니다.<br>다음 카드는 내일 돌아옵니다.</div>
    <div class="acts"><button class="flip" id="again">한 바퀴 더</button></div>`;
  $("again").onclick = () => { q = []; qi = 0; flip = false; sentenceRun(); };
}

/* ══════════ 튜터 ══════════ */
function tutorHome() {
  head("튜터", false);
  const url = S.tutor || TUTOR_DEFAULT;
  $("app").innerHTML = `
    <div class="call">
      <div class="ring">📞</div>
      <div class="who">한요일</div>
      <div class="sub">받으면 요일이 방송하면서<br>너랑 영어로 수다 떨어</div>
      <a class="accept" href="${esc(url)}" target="_blank" rel="noopener">받기</a>
    </div>
    <div class="callnote">
      통화는 집 컴퓨터에서 도는 튜터 서버로 이어집니다.
      먼저 <code>SPEAKING_TUTOR/run.sh</code> 를 켜 두세요.<br>
      지금 연결 주소: <code>${esc(url)}</code> — 설정에서 바꿀 수 있습니다.
    </div>`;
}

/* ══════════ 설정 ══════════ */
function settings() {
  head("설정", true);
  const seen = Object.keys(S.s).length;
  $("app").innerHTML = `
    <label class="row">튜터 서버 주소</label>
    <input type="text" id="turl" value="${esc(S.tutor || TUTOR_DEFAULT)}"
           placeholder="${TUTOR_DEFAULT}" autocapitalize="off" spellcheck="false">
    <div class="note">로컬에서 <code>python3 server.py</code> 로 띄운 주소입니다.
      같은 집 안 다른 기기에서 볼 거면 <code>http://192.168.0.x:8787</code> 처럼 적으세요.</div>
    <div class="tools">
      <button class="pri" id="tsave">저장</button>
      <button id="treset">기본값</button>
    </div>
    <div class="sect">읽기 토큰</div>
    <div class="note">${S.gh ? "저장돼 있습니다 — <code>…" + esc(S.gh.slice(-6)) + "</code>" :
      "없습니다."} 만료되면 새로 만들어 넣으세요.</div>
    <div class="tools">
      <button id="tokclear">토큰 지우기</button>
      <button id="cacheclear">받아둔 그림 지우기</button>
    </div>

    <div class="sect">학습 기록</div>
    <div class="note">기록이 있는 문장 ${seen}개 · 채점 ${S.log.length}회.
      이 브라우저에만 저장됩니다.</div>
    <div class="tools"><button id="wipe">학습 기록 지우기</button></div>`;

  $("tsave").onclick = () => {
    S.tutor = $("turl").value.trim() || TUTOR_DEFAULT; save();
    $("tsave").textContent = "저장됨";
  };
  $("treset").onclick = () => { $("turl").value = TUTOR_DEFAULT; };
  $("tokclear").onclick = () => {
    if (!confirm("토큰을 지웁니다. 다시 넣어야 자료가 보입니다.")) return;
    S.gh = ""; save(); location.hash = "#webtoon"; boot();
  };
  $("cacheclear").onclick = async () => {
    MEM.clear();
    try { await caches.delete("into_english.media"); } catch (e) {}
    $("cacheclear").textContent = "지웠습니다";
  };
  $("wipe").onclick = () => {
    if (!confirm("문장 학습 기록을 모두 지웁니다. 계속할까요?")) return;
    S.s = {}; S.log = []; save(); q = []; settings();
  };
}

/* ══════════ 길잡이 ══════════ */
function route() {
  const h = (location.hash || "#webtoon").slice(1);
  const [name, arg] = h.split("!");
  document.querySelectorAll("#tabs a").forEach(a =>
    a.classList.toggle("on", a.dataset.t === name));

  if (name === "webtoon") return arg ? webtoonRead(arg) : webtoonHome();
  /* 탭을 누르면 곧장 카드다 — 통계 화면을 앞에 두면 매일 그걸 지나쳐 누르게 된다.
     통계는 #sentence!home 으로 따로 본다. */
  if (name === "sentence") return arg === "home" ? sentenceHome() : sentenceRun();
  if (name === "tutor") return tutorHome();
  if (name === "settings") return settings();
  location.replace("#webtoon");
}

/* ══════════ 토큰 문 ══════════
   자료가 비공개 저장소에 있으므로 토큰이 없으면 아무것도 못 그린다.
   이 화면이 사실상의 로그인이다. */
function gate(msg) {
  head("into english", false);
  $("app").innerHTML = `
    <div class="sect">읽기 토큰</div>
    <div class="note">자료는 비공개 저장소(<code>${esc(GH.repo)}</code>)에 있습니다.
      GitHub 에서 만든 읽기 전용 토큰을 한 번 넣어 두면 이 브라우저에 저장됩니다.</div>
    ${msg ? `<div class="note" style="color:#e2726e">${esc(msg)}</div>` : ""}
    <input type="password" id="tok" placeholder="github_pat_..."
           autocapitalize="off" autocomplete="off" spellcheck="false">
    <div class="tools"><button class="pri" id="tokok">확인</button></div>`;
  $("tokok").onclick = async () => {
    const v = $("tok").value.trim();
    if (!v) return;
    $("tokok").textContent = "확인 중…";
    S.gh = v; save();
    boot();
  };
}

async function boot() {
  if (!S.gh) return gate("");
  try {
    await load();
  } catch (err) {
    return gate(err.message);
  }
  sweepCache();
  route();
}

addEventListener("hashchange", () => { if (S.gh && EPS.length) route(); });
boot();
