import { heightAt } from '../world/island';
import type { Game } from '../game';
import { Person, SW, SH, FEET, personRects } from '../life/people';
import { SECRET_LABEL, SKILL_LABEL, trustWord } from '../life/persona';
import { PARTY_MAX } from '../life/group';
import { dirName } from '../life/scouting';
import { Input } from './input';

const CSS = `
.so { position: absolute; font-family: 'Press Start 2P', monospace; color: #f4f1e6; z-index: 6; user-select: none; }
.box { background: #121a33f2; border: 3px solid #2b3766; border-radius: 14px; box-shadow: 0 3px 0 #0007; }
.so button { font: 9px 'Press Start 2P', monospace; color: #f4f1e6; background: #24305c; border: 3px solid #4a5a9a; border-radius: 10px; padding: 9px 11px; cursor: pointer; }
.so button:hover { background: #3b4f9a; }
.so button.go { background: #2f6e33; border-color: #6bc06b; }
.so button.no { background: #6a2a2a; border-color: #c06060; }
#lead { left: 14px; bottom: 14px; display: flex; gap: 10px; align-items: flex-end; }
#lead .me { display: flex; gap: 10px; align-items: center; padding: 8px 12px 8px 8px; cursor: pointer; }
#lead .me canvas { image-rendering: pixelated; width: 60px; height: 78px; }
#lead .nm { font-size: 11px; line-height: 1.8; }
#lead .sub { font-size: 8px; opacity: .8; line-height: 1.8; }
#lead .party { display: flex; gap: 6px; padding: 6px; align-items: flex-end; min-height: 52px; }
#lead .party .pp { position: relative; cursor: pointer; text-align: center; font-size: 7px; }
#lead .party canvas { image-rendering: pixelated; width: 30px; height: 39px; display: block; }
#lead .party .tag { position: absolute; top: -4px; right: -6px; font-size: 10px; }
#lead .btns { display: flex; flex-direction: column; gap: 6px; }
#tip { left: 50%; transform: translateX(-50%); bottom: 112px; font-size: 9px; padding: 10px 14px; line-height: 1.7; max-width: 560px; text-align: center; transition: opacity .4s; }
#toasts { left: 50%; top: 14px; transform: translateX(-50%); display: flex; flex-direction: column; gap: 6px; align-items: center; pointer-events: none; }
#toasts .t { font-size: 9px; padding: 9px 14px; line-height: 1.6; max-width: 620px; text-align: center; animation: tin .3s ease-out; }
#toasts .t.good { border-color: #6bc06b; } #toasts .t.bad { border-color: #d0605a; }
@keyframes tin { from { transform: translateY(-12px); opacity: 0; } to { transform: none; opacity: 1; } }
#card { right: 14px; bottom: 50px; width: 440px; padding: 14px; font-size: 8px; line-height: 1.9; display: none; }
#card.open { display: block; }
#card .hd { display: flex; gap: 12px; }
#card canvas { image-rendering: pixelated; width: 60px; height: 78px; flex: none; }
#card h3 { font-size: 12px; margin: 2px 0 4px; font-weight: normal; }
#card .q { opacity: .85; font-style: italic; }
#card .row b { color: #ffd65a; font-weight: normal; }
#card .acts { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
#card .x { position: absolute; right: 10px; top: 8px; cursor: pointer; font-size: 12px; }
.panel { right: 14px; top: 286px; width: 330px; max-height: 55vh; overflow-y: auto; padding: 12px; font-size: 8px; line-height: 1.8; display: none; }
.panel.open { display: block; }
.panel h4 { font-size: 10px; margin: 0 0 8px; font-weight: normal; color: #ffd65a; }
#roster .r { display: flex; gap: 8px; align-items: center; padding: 4px; border-radius: 8px; cursor: pointer; }
#roster .r:hover { background: #24305c; }
#roster canvas { image-rendering: pixelated; width: 20px; height: 26px; }
#journal .d { color: #ffd65a; margin-top: 8px; }
#journal p { margin: 2px 0 6px; }
#pick { inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; background: #0b102066; }
#pick h2 { font-size: 18px; font-weight: normal; text-shadow: 0 3px 0 #000; margin: 0; }
#pick .cards { display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; }
#pick .c { width: 230px; padding: 14px; font-size: 8px; line-height: 1.9; cursor: pointer; transition: transform .15s; }
#pick .c:hover { transform: translateY(-6px); border-color: #ffd65a; }
#pick .c canvas { image-rendering: pixelated; width: 60px; height: 78px; display: block; margin: 0 auto 8px; }
#pick .c h3 { font-size: 12px; text-align: center; margin: 0 0 6px; font-weight: normal; }
#title { left: 50%; top: 26%; transform: translateX(-50%); font-size: 26px; text-shadow: 0 4px 0 #000, 0 0 30px #000; letter-spacing: 3px; pointer-events: none; opacity: 0; transition: opacity 1s; white-space: nowrap; }
#name { left: 50%; top: calc(26% + 60px); transform: translateX(-50%); padding: 12px 14px; font-size: 9px; display: none; gap: 8px; align-items: center; }
#name.open { display: flex; }
#name input { font: 10px 'Press Start 2P', monospace; background: #0b1020; color: #f4f1e6; border: 2px solid #4a5a9a; border-radius: 6px; padding: 7px; width: 200px; }
.bub { position: absolute; z-index: 4; transform: translate(-50%, -100%); background: #fffbea; color: #1c1626; font: 8px/1.5 'Press Start 2P', monospace; padding: 6px 8px; border: 2px solid #1c1626; border-radius: 8px; max-width: 220px; text-align: center; pointer-events: none; }
.bub:after { content: ''; position: absolute; left: 50%; bottom: -7px; margin-left: -5px; border: 5px solid transparent; border-top-color: #1c1626; border-bottom: 0; }
.lbl { position: absolute; z-index: 3; transform: translate(-50%, -100%); font: 8px 'Press Start 2P', monospace; color: #fff; text-shadow: 0 2px 0 #000, 0 0 4px #000; pointer-events: none; white-space: nowrap; }
.lbl.map { font-size: 9px; background: #121a33cc; border: 2px solid #2b3766; border-radius: 8px; padding: 5px 7px; text-shadow: none; }
.lbl.map:after { content: ''; position: absolute; left: 50%; bottom: -8px; margin-left: -1px; width: 2px; height: 6px; background: #2b3766; }
.lbl.rum { color: #ffd65a; font-size: 7px; }
.ask { position: absolute; z-index: 7; transform: translate(-50%, -100%); background: #fffbea; color: #1c1626; font: 8px/1.7 'Press Start 2P', monospace; padding: 10px 12px; border: 3px solid #1c1626; border-radius: 10px; width: 300px; text-align: center; box-shadow: 0 3px 0 #0006; }
.ask:after { content: ''; position: absolute; left: 50%; bottom: -9px; margin-left: -7px; border: 7px solid transparent; border-top-color: #1c1626; border-bottom: 0; }
.ask .who { color: #8a5a20; margin-bottom: 4px; }
.ask .acts { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; margin-top: 8px; }
.ask .x { position: absolute; right: 6px; top: 2px; cursor: pointer; }
#goal { left: 50%; top: 70px; transform: translateX(-50%); display: none; flex-direction: column; align-items: center; gap: 8px; }
#goal.open { display: flex; }
#goal h2 { font-size: 11px; font-weight: normal; margin: 0; text-shadow: 0 2px 0 #000; }
#goal .cards { display: flex; gap: 10px; }
#goal .c { width: 190px; padding: 10px; font-size: 7px; line-height: 1.8; cursor: pointer; transition: transform .15s; text-align: center; }
#goal .c:hover { transform: translateY(-4px); border-color: #ffd65a; }
#goal .c canvas { image-rendering: pixelated; width: 40px; height: 52px; display: block; margin: 0 auto 4px; }
#goal .c h3 { font-size: 9px; color: #ffd65a; margin: 0 0 4px; font-weight: normal; }
#goal .bar { width: 300px; height: 6px; background: #121a33; border: 2px solid #2b3766; border-radius: 4px; overflow: hidden; }
#goal .bar i { display: block; height: 100%; background: #ffd65a; }
#today { left: 14px; top: 160px; font-size: 8px; padding: 8px 12px; line-height: 1.9; display: none; }
`;

const MOOD_TXT: Record<string, string> = { none: '', happy: '😊', angry: '😠', worried: '😟', sad: '😢', scared: '😨', tired: '💤', fond: '❤', pain: '🤕' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Everything on screen about people: leader, party strip, cards, roster, journal, toasts, bubbles, first sightings. */
export class Social {
  private el = (html: string, parent: HTMLElement = document.body) => { const d = document.createElement('div'); d.innerHTML = html.trim(); const e = d.firstElementChild as HTMLElement; parent.appendChild(e); e.addEventListener('pointerdown', ev => ev.stopPropagation()); return e; };
  private lead: HTMLElement; private card: HTMLElement; private roster: HTMLElement; private journal: HTMLElement;
  private toastsEl: HTMLElement; private tip: HTMLElement; private title: HTMLElement; private nameBox: HTMLElement;
  private bubbles = new Map<object, HTMLElement>();
  private labels = new Map<string, HTMLElement>();
  private askEl: HTMLElement; private askKey = ''; private askOpen = false;
  private goalEl: HTMLElement; private goalKey = ''; private goalT = 0; private todayEl: HTMLElement;
  private cardP: Person | null = null; private cardKey = ''; private partyKey = ''; private rosterKey = '';
  private tipT = 0; private momentT = 0; private refreshT = 0; private journalN = -1;
  private toastQ: { el: HTMLElement; t: number }[] = [];

  constructor(private game: Game, private input: Input) {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.lead = this.el(`<div id="lead" class="so"><div class="me box"><canvas width="${SW}" height="${SH}"></canvas><div><div class="nm"></div><div class="sub"></div></div></div><div class="party box"></div><div class="btns"><button data-a="roster">ROSTER</button><button data-a="journal">JOURNAL</button></div></div>`);
    this.card = this.el('<div id="card" class="so box"></div>');
    this.roster = this.el('<div id="roster" class="so box panel"></div>');
    this.journal = this.el('<div id="journal" class="so box panel"></div>');
    this.toastsEl = this.el('<div id="toasts" class="so"></div>');
    this.tip = this.el('<div id="tip" class="so box" style="opacity:0"></div>');
    this.title = this.el('<div id="title" class="so"></div>');
    this.nameBox = this.el('<div id="name" class="so box"></div>');
    this.askEl = this.el('<div class="ask so" style="display:none"></div>');
    this.goalEl = this.el('<div id="goal" class="so"></div>');
    this.todayEl = this.el('<div id="today" class="so box"></div>');
    this.lead.style.display = 'none';
    (this.lead.querySelector('.me') as HTMLElement).onclick = () => { game.camWho = null; game.rig.followOn = true; };
    this.lead.querySelectorAll('.btns button').forEach(b => (b as HTMLElement).onclick = () => this.toggle((b as HTMLElement).dataset.a === 'roster' ? this.roster : this.journal));
    input.onPerson = (p) => this.openCard(p);
    addEventListener('keydown', e => { if (e.key === 'Escape') { this.closeCard(); this.roster.classList.remove('open'); this.journal.classList.remove('open'); game.group.scoutPick = null; } });
    this.pickScreen();
  }

  // ---------------------------------------------------------------- start
  private pickScreen() {
    const g = this.game.group;
    const pick = this.el('<div id="pick" class="so"><h2>WHO WILL LEAD?</h2><div class="cards"></div><div style="font-size:8px;opacity:.75">The others are waking up. Somebody has to take charge.</div></div>');
    for (const p of g.choices) {
      const c = this.el(`<div class="c box">${''}<h3>${p.per.name}</h3><div class="q">"${p.per.backstory}"</div>
        <div>${p.per.traits.map(cap).join(' · ')}</div><div>+ ${cap(p.per.strength)}</div><div>− ${cap(p.per.weakness)}</div>${p.per.secret ? '<div style="color:#ffd65a">? Seems to be hiding something</div>' : ''}</div>`, pick.querySelector('.cards') as HTMLElement);
      c.prepend(this.portrait(p));
      c.onclick = () => { g.chooseLeader(p); pick.remove(); this.lead.style.display = 'flex'; };
    }
  }

  // ---------------------------------------------------------------- helpers
  portrait(p: Person) {
    const c = document.createElement('canvas'); c.width = SW; c.height = SH;
    const g = c.getContext('2d')!, fake = { ...p, pose: 'idle', face: 1, torch: false, carry: 0, anim: 0 } as Person;
    const R = personRects(fake), cx = SW >> 1;
    g.fillStyle = '#1c1626'; for (const q of R) g.fillRect(cx + q[0] - 1, FEET + q[1] - 1, q[2] + 2, q[3] + 2);
    for (const q of R) { g.fillStyle = q[4]; g.fillRect(cx + q[0], FEET + q[1], q[2], q[3]); }
    return c;
  }
  private toggle(e: HTMLElement) { const o = !e.classList.contains('open'); this.roster.classList.remove('open'); this.journal.classList.remove('open'); if (o) { e.classList.add('open'); this.journalN = -1; this.rosterKey = ''; this.refreshT = 0; } }
  private closeCard() { this.card.classList.remove('open'); this.cardP = null; this.cardKey = ''; }

  openCard(p: Person) {
    if (this.game.group.requests.cur?.p === p) { this.askOpen = true; this.askKey = ''; return; }
    this.cardP = p; this.card.classList.add('open'); this.fillCard();
  }

  private fillCard() {
    const p = this.cardP!, g = this.game.group, S = g.story, per = p.per, isL = p === g.leader;
    const pair = per.pair >= 0 ? g.people[per.pair] : null, fr = S.friend(p), rv = S.rival(p);
    const skill = S.skillKnown.has(p.id) ? SKILL_LABEL[per.skill] : '???';
    const secret = per.secret && S.secretKnown.has(p.id) ? SECRET_LABEL[per.secret] : '';
    const rec = g.requests.record.get(p.id);
    const where = { asleep: 'Asleep', camp: 'At camp', leader: 'Leading', follow: 'With you', wait: 'Waiting for you', scout: 'Out scouting', lost: 'Lost!', hurt: 'Hurt, out there!', rescued: 'Coming home with you' }[p.mode];
    const html = `<div class="x">✕</div><div class="hd"><div class="pc"></div><div style="flex:1">
      <h3>${per.name} <span style="font-size:8px;opacity:.7">${per.age}${isL ? ' · YOU' : ''}</span></h3>
      <div class="q">"${per.backstory}"</div>
      ${pair ? `<div>Arrived with ${pair.per.name} (${per.pairKind === 'parent' ? 'family' : per.pairKind})</div>` : ''}
      <div class="row"><b>Traits</b> ${per.traits.map(cap).join(' · ')}</div>
      <div class="row"><b>+</b> ${cap(per.strength)} &nbsp; <b>−</b> ${cap(per.weakness)}</div>
      <div class="row"><b>Skill</b> ${skill}${secret ? ` &nbsp; <b>Secret</b> ${secret}` : ''}</div>
      <div class="row"><b>Now</b> ${where} ${MOOD_TXT[p.mood]} ${p.why}${p.ask ? ' · <b>❗ wants to talk</b>' : ''}</div>
      ${rec ? `<div class="row"><b>Ideas</b> ${rec.good} worked · ${rec.bad} didn't</div>` : ''}
      ${isL ? '' : `<div class="row"><b>Trust in you</b> ${trustWord(per.trust)}</div>`}
      <div class="row">${fr ? `<b>Friend</b> ${fr.per.name} &nbsp; ` : ''}${rv ? `<b>Rival</b> ${rv.per.name}` : ''}</div>
      </div></div><div class="acts"></div>`;
    const btns: [string, string, () => void][] = [];
    if (p.ask) btns.push(['HEAR THEM OUT', 'go', () => { this.closeCard(); this.openCard(p); }]);
    if (!isL && p.mode === 'camp') btns.push([g.party.length >= PARTY_MAX ? 'GROUP FULL' : 'COME WITH ME', 'go', () => g.invite(p)]);
    if (p.mode === 'follow' || p.mode === 'wait') btns.push(['GO BACK TO CAMP', '', () => g.dismiss(p)]);
    if (!isL && (p.mode === 'camp' || p.mode === 'follow' || p.mode === 'wait')) btns.push(['GO SCOUT', '', () => { g.askScout(p); if (g.scoutPick === p) { this.closeCard(); this.showTip(`Click where ${per.name} should scout. Right-click to cancel.`, 99); } }]);
    btns.push(['FIND', '', () => { if (p.mode === 'camp' || p === g.leader) { this.game.rig.jumpTo(p.x, p.z); this.game.rig.followOn = p === g.leader; } else { this.game.camWho = p; this.game.rig.followOn = true; } }]);
    // only rebuild when something changed, so a click is never lost to a refresh
    const key = p.id + html + btns.map(b => b[0]).join();
    if (key === this.cardKey) return;
    this.cardKey = key;
    this.card.innerHTML = html;
    this.card.querySelector('.pc')!.appendChild(this.portrait(p));
    (this.card.querySelector('.x') as HTMLElement).onclick = () => this.closeCard();
    const acts = this.card.querySelector('.acts') as HTMLElement;
    for (const [label, cls, fn] of btns) { const b = document.createElement('button'); b.textContent = label; b.className = cls; b.onclick = () => { fn(); this.fillCard(); }; acts.appendChild(b); }
  }

  private showTip(t: string, secs = 9) { this.tip.textContent = t; this.tip.style.opacity = '1'; this.tipT = secs; }

  private toast(text: string, kind: string) {
    const e = this.el(`<div class="t box ${kind}"></div>`, this.toastsEl); e.textContent = text;
    this.toastQ.push({ el: e, t: 6 });
    while (this.toastQ.length > 4) this.toastQ.shift()!.el.remove();
  }

  /** First sight: title card, then a name suggestion that one click accepts. */
  private moment() {
    const g = this.game.group, m = g.moments.shift(); if (!m) return;
    this.title.textContent = m.poi.title; this.title.style.opacity = '1'; this.momentT = 4;
    const sug = g.disc.suggest(m.poi, m.finder.per.name);
    this.nameBox.innerHTML = '<span>NAME IT:</span>';
    const inp = document.createElement('input'); inp.value = sug; inp.maxLength = 28;
    const ok = document.createElement('button'); ok.textContent = '✓'; ok.className = 'go';
    const done = () => { g.nameIt(m.poi, inp.value || sug); this.nameBox.classList.remove('open'); };
    ok.onclick = done; inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') done(); };
    this.nameBox.append(inp, ok);
    setTimeout(() => this.nameBox.classList.add('open'), 1800);
    setTimeout(() => { if (this.nameBox.classList.contains('open') && document.activeElement !== inp) done(); }, 25000);
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number) {
    const game = this.game, g = game.group, S = g.story;
    for (const t of S.toasts.splice(0)) this.toast(t.text, t.kind);
    for (const q of this.toastQ) if ((q.t -= dt) <= 0) q.el.remove();
    this.toastQ = this.toastQ.filter(q => q.t > 0);
    if (g.hints.length && this.tipT <= 0) this.showTip(g.hints.shift()!);
    if (this.tipT > 0 && (this.tipT -= dt) <= 0) this.tip.style.opacity = '0';
    if (!g.scoutPick && this.tipT > 50) this.tipT = 0.01;
    if (this.momentT > 0) { if ((this.momentT -= dt) <= 0) this.title.style.opacity = '0'; } else if (g.moments.length) this.moment();
    this.drawBubbles();
    this.drawLabels();
    this.drawAsk();
    this.drawGoal(dt);
    if ((this.refreshT -= dt) > 0 || !g.leader) return;
    this.refreshT = 0.5;
    // leader + party strip
    const L = g.leader;
    const me = this.lead.querySelector('.me canvas') as HTMLCanvasElement, mx = me.getContext('2d')!;
    mx.clearRect(0, 0, SW, SH); mx.drawImage(this.portrait(L), 0, 0);
    (this.lead.querySelector('.nm') as HTMLElement).textContent = L.per.name.toUpperCase();
    (this.lead.querySelector('.sub') as HTMLElement).innerHTML = `Group: ${trustWord(S.avgTrust(L))}<br>${g.party.length}/${PARTY_MAX} with you`;
    const st = g.stock, n = g.people.length, cur = g.goals.cur;
    this.todayEl.style.display = 'block';
    const tw = `${cur ? `TODAY: ${cur.title}<br>` : g.goals.opts.length ? 'TODAY: DECIDING...<br>' : ''}FOOD: ${st.word(st.totalFood, n)} · WATER: ${st.word(st.water, n)}${st.ration ? ' · HALF RATIONS' : ''}`;
    if (this.todayEl.innerHTML !== tw) this.todayEl.innerHTML = tw;
    const party = this.lead.querySelector('.party') as HTMLElement;
    const list = [...g.party, ...g.people.filter(p => p.mode === 'rescued'), ...g.scouts];
    const pk = list.map(p => p.id + p.mode + p.mood + p.ask).join() + Math.round(game.rig.yaw * 2);
    if (pk !== this.partyKey) this.fillParty(party, list, pk);
    if (this.cardP && this.card.classList.contains('open')) this.fillCard();
    if (this.roster.classList.contains('open')) this.fillRoster();
    if (this.journal.classList.contains('open') && this.journalN !== S.journal.length) this.fillJournal();
  }

  private fillParty(party: HTMLElement, list: Person[], key: string) {
    const g = this.game.group, yaw = this.game.rig.yaw;
    this.partyKey = key; party.innerHTML = '';
    for (const p of list) {
      const e = this.el(`<div class="pp"><span class="tag"></span></div>`, party);
      e.prepend(this.portrait(p)); e.title = p.per.name;
      const tag = e.querySelector('.tag') as HTMLElement;
      if (p.mode === 'scout' || p.mode === 'lost' || p.mode === 'hurt') {
        const tr = g.scouting.tripOf(p);
        if (p.mode !== 'scout') tag.textContent = '❗';
        else if (tr) { const a = Math.atan2(tr.dir.z, tr.dir.x) + yaw; tag.innerHTML = `<span style="display:inline-block;transform:rotate(${a}rad)">➜</span>`; e.title += ` · scouting ${dirName(tr.dir.x, tr.dir.z)}`; }
      } else tag.textContent = p.ask ? '❗' : p.mode === 'wait' ? '⏸' : MOOD_TXT[p.mood];
      e.onclick = () => this.openCard(p);
    }
    if (!list.length) party.innerHTML = '<div style="font-size:7px;opacity:.6;padding:8px;line-height:1.7">Click a survivor<br>to bring them</div>';
  }

  private fillRoster() {
    const g = this.game.group, key = g.people.map(p => p.mode + p.mood + p.ask + trustWord(p.per.trust)).join();
    if (key === this.rosterKey) return;
    this.rosterKey = key;
    this.roster.innerHTML = `<h4>SURVIVORS (${g.people.length})</h4>`;
    for (const p of g.people) {
      const where = { asleep: 'asleep', camp: 'at camp', leader: 'you', follow: 'with you', wait: 'waiting', scout: 'scouting', lost: 'LOST', hurt: 'HURT', rescued: 'with you' }[p.mode];
      const r = this.el(`<div class="r"><div style="flex:1">${p.per.name} ${p.ask ? '❗' : MOOD_TXT[p.mood]}<br><span style="opacity:.7">${where}${p === g.leader ? '' : ' · ' + trustWord(p.per.trust)}</span></div></div>`, this.roster);
      r.prepend(this.portrait(p));
      // clicking a scout also follows them with the camera
      r.onclick = () => { this.openCard(p); if (p.mode === 'scout' || p.mode === 'lost' || p.mode === 'hurt') { this.game.camWho = p; this.game.rig.followOn = true; } };
    }
  }

  private fillJournal() {
    const J = this.game.group.story.journal;
    this.journalN = J.length;
    let html = '<h4>JOURNAL</h4>', day = -1;
    for (const e of J) { if (e.day !== day) { day = e.day; html += `<div class="d">DAY ${day}</div>`; } html += `<p>${e.text}</p>`; }
    this.journal.innerHTML = html;
    this.journal.scrollTop = this.journal.scrollHeight;
  }

  private drawBubbles() {
    const S = this.game.group.story, z = this.game.rig.zoom, w = this.game.world, seen = new Set<object>();
    for (const b of S.bubbles) {
      seen.add(b);
      let e = this.bubbles.get(b);
      if (!e) { e = document.createElement('div'); e.className = 'bub'; e.textContent = b.text; document.body.appendChild(e); this.bubbles.set(b, e); }
      const p = b.p, s = this.input.screen(p.x, heightAt(w, p.x, p.z), p.z);
      e.style.left = `${s.x}px`; e.style.top = `${s.y - 26 * z}px`;
      e.style.opacity = String(Math.min(1, (b.max - b.t) * 3, b.t * 8));
    }
    for (const [k, e] of this.bubbles) if (!seen.has(k)) { e.remove(); this.bubbles.delete(k); }
  }

  /**
   * Place names. Zoomed all the way out: every known place, map-style. Closer in: only what you are near.
   * Rumors get a short line under their "?".
   */
  private drawLabels() {
    const g = this.game.group, w = this.game.world, t = this.game.rig.target, R = this.game.viewR, zi = this.game.rig.zoomI, seen = new Set<string>();
    const inView = (x: number, z: number) => Math.abs(x - t.x) < R * 1.2 && Math.abs(z - t.z) < R * 1.4;
    const near = zi === 0 ? 1e9 : zi === 1 ? 32 : 18;
    const put = (key: string, cls: string, text: string, x: number, z: number, up: number) => {
      seen.add(key);
      let e = this.labels.get(key);
      if (!e) { e = document.createElement('div'); document.body.appendChild(e); this.labels.set(key, e); }
      if (e.className !== cls) e.className = cls;
      if (e.textContent !== text) e.textContent = text;
      const s = this.input.screen(x, heightAt(w, x, z) + up, z);
      e.style.display = ''; e.style.left = `${s.x}px`; e.style.top = `${s.y}px`;
    };
    for (const p of g.disc.pois) {
      if (!p.known || !inView(p.x, p.z) || Math.hypot(p.x - t.x, p.z - t.z) > near) continue;
      if (p.major) put('p' + p.id, zi === 0 ? 'lbl map' : 'lbl', (zi === 0 ? '◆ ' : '') + cap(g.disc.display(p)), p.x, p.z, 4);
      else if (zi === 0 && (p.kind === 'water' || p.kind === 'food')) put('p' + p.id, 'lbl', (p.kind === 'water' ? '~ ' : '* ') + cap(p.label), p.x, p.z, 1.5);
    }
    for (const m of g.disc.markers) if (m.kind === '?' && inView(m.x, m.z) && Math.hypot(m.x - t.x, m.z - t.z) < near + m.r) put('m' + m.id, 'lbl rum', m.text, m.x, m.z, 1.6);
    if (zi === 0 && inView(g.fire.x, g.fire.z)) put('camp', 'lbl map', '◆ Camp', g.fire.x, g.fire.z, 4);
    for (const [k, e] of this.labels) if (!seen.has(k)) e.style.display = 'none';
  }

  /** The open request: a big speech bubble over the asker with the answers on it. */
  private drawAsk() {
    const g = this.game.group, r = g.requests.cur;
    if (!r || !this.askOpen) { this.askEl.style.display = 'none'; if (!r) this.askOpen = false; return; }
    const key = r.p.id + r.text;
    if (key !== this.askKey) {
      this.askKey = key;
      this.askEl.innerHTML = `<div class="x">✕</div><div class="who">${r.p.per.name.toUpperCase()}</div><div></div><div class="acts"></div>`;
      (this.askEl.children[2] as HTMLElement).textContent = `"${r.text}"`;
      (this.askEl.querySelector('.x') as HTMLElement).onclick = () => { this.askOpen = false; };
      const acts = this.askEl.querySelector('.acts') as HTMLElement;
      r.answers.forEach((a, i) => { const b = document.createElement('button'); b.textContent = a.label; if (a.cls) b.className = a.cls; b.onclick = () => { g.requests.answer(i); this.askOpen = false; }; acts.appendChild(b); });
    }
    const p = r.p, z = this.game.rig.zoom, s = this.input.screen(p.x, heightAt(this.game.world, p.x, p.z), p.z);
    this.askEl.style.display = 'block';
    this.askEl.style.left = `${Math.max(160, Math.min(innerWidth - 160, s.x))}px`; this.askEl.style.top = `${Math.max(120, s.y - 28 * z)}px`;
  }

  /** Morning plan: three cards, one click. Nobody picks in 20 s → the most trusted idea wins. */
  private drawGoal(dt: number) {
    const G = this.game.group.goals, opts = G.opts;
    if (!opts.length) { if (this.goalKey) { this.goalKey = ''; this.goalEl.classList.remove('open'); } return; }
    const key = opts.map(o => o.who.id + o.title).join();
    if (key !== this.goalKey) {
      this.goalKey = key; this.goalT = 20;
      this.goalEl.innerHTML = '<h2>WHAT DO WE DO TODAY?</h2><div class="cards box" style="background:none;border:0;box-shadow:none"></div><div class="bar"><i></i></div>';
      const cards = this.goalEl.querySelector('.cards') as HTMLElement;
      opts.forEach((o, i) => {
        const c = this.el(`<div class="c box"><h3></h3><div class="q"></div><div style="opacity:.7;margin-top:4px"></div></div>`, cards);
        (c.querySelector('h3') as HTMLElement).textContent = o.title;
        (c.querySelector('.q') as HTMLElement).textContent = `"${o.line}"`;
        (c.lastElementChild as HTMLElement).textContent = `— ${o.who.per.name}`;
        c.prepend(this.portrait(o.who));
        c.onclick = () => G.choose(i);
      });
      this.goalEl.classList.add('open');
    }
    if (this.game.clock.speed > 0 && (this.goalT -= dt) <= 0) G.autoPick();
    (this.goalEl.querySelector('.bar i') as HTMLElement).style.width = `${Math.max(0, this.goalT / 20) * 100}%`;
  }
}
