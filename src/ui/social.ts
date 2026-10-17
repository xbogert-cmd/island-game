import { heightAt } from '../world/island';
import type { Game } from '../game';
import { Person, SW, SH, FEET, personRects } from '../life/people';
import { SECRET_LABEL, SKILL_LABEL, trustWord } from '../life/persona';
import { PARTY_MAX } from '../life/group';
import { dirName } from '../life/scouting';
import { Input } from './input';
import { load, saveInfo } from '../life/save';
import { objectives } from '../life/objectives';
import { JOB, JOB_KINDS, JobKind, LEVEL_WORD, PRIO_WORD, level } from '../life/jobs';
import { BUILD } from '../life/buildings';
import { HEALTH_WORD } from '../life/health';
import { drawIslandMap } from './islandmap';
import { mapImage } from './hud';
import { N } from '../world/island';

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
#roster { left: 50%; top: 50%; right: auto; transform: translate(-50%, -50%); width: min(1060px, 94vw); max-height: 82vh; padding: 16px 18px; z-index: 8; }
#roster .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 10px; }
#roster .r { display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px; border: 2px solid #2b3766; border-radius: 10px; cursor: pointer; line-height: 1.8; }
#roster .r:hover { background: #24305c; border-color: #ffd65a; }
#roster canvas { image-rendering: pixelated; width: 40px; height: 52px; flex: none; }
#roster .nm { font-size: 10px; } #roster .nm span { font-size: 7px; opacity: .7; }
#roster .g { color: #8af07a; } #roster .b { color: #ff8a7a; } #roster .k { color: #ffd65a; } #roster .dim { opacity: .7; }
#roster .x { position: absolute; right: 14px; top: 12px; cursor: pointer; font-size: 12px; }
#journal { left: 50%; top: 50%; right: auto; transform: translate(-50%, -50%); width: min(820px, 94vw); max-height: 88vh; padding: 16px 18px; z-index: 8; }
#journal .d { color: #ffd65a; margin-top: 8px; }
#journal p { margin: 2px 0 6px; }
#journal .jl { max-height: 64vh; overflow-y: auto; }
#journal .x, #roster .x { position: absolute; right: 14px; top: 12px; cursor: pointer; font-size: 12px; }
.tabs { display: flex; gap: 6px; margin-bottom: 10px; }
.tabs button.on { background: #3b4f9a; border-color: #ffd65a; }
.tag { color: #1c1626; background: #ffd65a; border-radius: 4px; padding: 1px 3px; font-size: 6px; margin-left: 4px; }
#roster .jr { display: grid; grid-template-columns: 190px 70px 1fr 160px; gap: 10px; align-items: center; padding: 6px 8px; border-bottom: 2px solid #1b2547; }
#roster .jr .pr { cursor: pointer; text-align: center; border: 2px solid #4a5a9a; border-radius: 6px; padding: 3px 0; }
#roster .jr .pr:hover { border-color: #ffd65a; }
#roster .jr .p2 { color: #ffd65a; } #roster .jr .p0 { opacity: .6; }
#roster .jr .who { display: flex; gap: 2px; flex-wrap: wrap; } #roster .jr .who canvas { width: 20px; height: 26px; }
#roster .jr .st { opacity: .85; } #roster .jr .st.bad { color: #ff8a7a; }
#roster .qr { padding: 5px 8px; cursor: pointer; border-radius: 6px; } #roster .qr:hover { background: #24305c; }
#roster h5 { font-size: 9px; color: #ffd65a; margin: 14px 0 6px; font-weight: normal; }
#goal .recap { font-size: 8px; line-height: 1.8; max-width: 640px; text-align: center; background: #121a33e6; border: 2px solid #2b3766; border-radius: 10px; padding: 8px 12px; }
#title .sub { display: block; font-size: 11px; margin-top: 12px; text-align: center; opacity: .8; }
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
#today { left: 14px; top: 160px; font-size: 8px; padding: 8px 12px; line-height: 1.9; display: none; max-width: 300px; }
#today .gh { color: #ffd65a; margin-top: 6px; }
#today .ob { cursor: default; padding-left: 10px; text-indent: -10px; }
#today .ob.at { cursor: pointer; } #today .ob.at:hover { color: #ffd65a; }
#today .ob.done { color: #8af07a; }
`;

const MOOD_TXT: Record<string, string> = { sick: '🤢', none: '', happy: '😊', angry: '😠', worried: '😟', sad: '😢', scared: '😨', tired: '💤', fond: '❤', pain: '🤕' };
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
  private obKeys = new Map<string, string>(); private obDone: { text: string; t: number }[] = [];
  private cardP: Person | null = null; private cardKey = ''; private partyKey = ''; private rosterKey = '';
  private tipT = 0; private momentT = 0; private refreshT = 0; private journalN = -1;
  private peopleTab: 'roster' | 'jobs' = 'roster'; private islandTab: 'map' | 'journal' = 'map'; private mapBase: ImageData; private mapT = 0;
  private toastQ: { el: HTMLElement; t: number }[] = [];

  constructor(private game: Game, private input: Input) {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.lead = this.el(`<div id="lead" class="so"><div class="me box"><canvas width="${SW}" height="${SH}"></canvas><div><div class="nm"></div><div class="sub"></div></div></div><div class="party box"></div><div class="btns"><button data-a="roster">PEOPLE</button><button data-a="journal">ISLAND</button></div></div>`);
    this.card = this.el('<div id="card" class="so box"></div>');
    this.roster = this.el('<div id="roster" class="so box panel"></div>');
    this.journal = this.el('<div id="journal" class="so box panel"></div>');
    this.mapBase = mapImage(game.world, 384);
    this.roster.addEventListener('click', e => this.pageClick(e));
    this.journal.addEventListener('click', e => this.pageClick(e));
    this.toastsEl = this.el('<div id="toasts" class="so"></div>');
    this.tip = this.el('<div id="tip" class="so box" style="opacity:0"></div>');
    this.title = this.el('<div id="title" class="so"></div>');
    this.nameBox = this.el('<div id="name" class="so box"></div>');
    this.askEl = this.el('<div class="ask so" style="display:none"></div>');
    this.goalEl = this.el('<div id="goal" class="so"></div>');
    this.todayEl = this.el('<div id="today" class="so box"></div>');
    // clicking a goal with a place on it shows that place
    this.todayEl.addEventListener('click', e => {
      const o = (e.target as HTMLElement).closest('.ob.at') as HTMLElement | null; if (!o) return;
      game.rig.jumpTo(Number(o.dataset.x), Number(o.dataset.z)); game.rig.followOn = false;
    });
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
    const info = saveInfo(this.game.world.seed);
    if (info) {
      const c = this.el(`<button class="go" style="font-size:11px;padding:14px 22px">CONTINUE — DAY ${info.day}, ${info.leader.toUpperCase()} LEADING</button>`);
      pick.insertBefore(c, pick.firstChild);
      c.onclick = () => { if (load(this.game)) { pick.remove(); this.lead.style.display = 'flex'; } else c.remove(); };
      (pick.querySelector('h2') as HTMLElement).textContent = 'OR START OVER: WHO WILL LEAD?';
    }
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
  private toggle(e: HTMLElement) { const o = !e.classList.contains('open'); this.roster.classList.remove('open'); this.journal.classList.remove('open'); if (o) { e.classList.add('open'); this.journalN = -1; this.rosterKey = ''; this.refreshT = 0; this.mapT = 0; } }

  /** Tabs, priorities, the build queue, the map: all clicks inside the two big pages. */
  private pageClick(e: MouseEvent) {
    const t = e.target as HTMLElement, g = this.game.group;
    const tab = t.closest('[data-t]') as HTMLElement | null;
    if (tab) {
      const v = tab.dataset.t!;
      if (v === 'roster' || v === 'jobs') { this.peopleTab = v; if (v === 'jobs') g.jobs.fresh = false; this.rosterKey = ''; this.fillRoster(); }
      else { this.islandTab = v as 'map' | 'journal'; this.journalN = -1; this.mapT = 0; this.fillJournal(); }
      return;
    }
    if (t.closest('.x')) { this.roster.classList.remove('open'); this.journal.classList.remove('open'); return; }
    const pk = t.closest('[data-k]') as HTMLElement | null;
    if (pk) { g.jobs.cyclePrio(pk.dataset.k as JobKind); this.rosterKey = ''; this.fillRoster(); return; }
    const q = t.closest('[data-q]') as HTMLElement | null;
    if (q) { const b = g.camp.queue.find(x => x.id === Number(q.dataset.q)); if (b) g.camp.toFront(b); this.rosterKey = ''; this.fillRoster(); return; }
    if (t.tagName === 'CANVAS' && t.closest('.wrap')) {
      const r = t.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * N, z = ((e.clientY - r.top) / r.height) * N;
      if (g.scoutPick) g.clickGround(x, z); else { this.game.rig.jumpTo(x, z); this.game.rig.followOn = false; }
      this.journal.classList.remove('open');
    }
  }
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
    const where = { dead: 'Dead', asleep: 'Asleep', camp: 'At camp', leader: 'Leading', follow: 'With you', wait: 'Waiting for you', scout: 'Out scouting', lost: 'Lost!', hurt: 'Hurt, out there!', rescued: 'Coming home with you' }[p.mode];
    const html = `<div class="x">✕</div><div class="hd"><div class="pc"></div><div style="flex:1">
      <h3>${per.name} <span style="font-size:8px;opacity:.7">${per.age}${isL ? ' · YOU' : ''}</span></h3>
      <div class="q">"${per.backstory}"</div>
      ${pair ? `<div>Arrived with ${pair.per.name} (${per.pairKind === 'parent' ? 'family' : per.pairKind})</div>` : ''}
      <div class="row"><b>Traits</b> ${per.traits.map(cap).join(' · ')}</div>
      <div class="row"><b>+</b> ${cap(per.strength)} &nbsp; <b>−</b> ${cap(per.weakness)}</div>
      <div class="row"><b>Skill</b> ${skill}${secret ? ` &nbsp; <b>Secret</b> ${secret}` : ''}</div>
      <div class="row"><b>Now</b> ${where} ${MOOD_TXT[p.mood]} ${p.why}${p.ask ? ' · <b>❗ wants to talk</b>' : ''}</div>
      ${p.health ? `<div class="row"><b>Health</b> ${HEALTH_WORD[p.health]}</div>` : ''}
      ${rec ? `<div class="row"><b>Ideas</b> ${rec.good} worked · ${rec.bad} didn't</div>` : ''}
      <div class="row">${this.workLine(p).replace(/class="k"/g, '').replace('<span >Job</span>', '<b>Job</b>')}</div>
      ${isL ? '' : `<div class="row"><b>Trust in you</b> ${trustWord(per.trust)}</div>`}
      <div class="row">${fr ? `<b>Friend</b> ${fr.per.name} &nbsp; ` : ''}${rv ? `<b>Rival</b> ${rv.per.name}` : ''}</div>
      </div></div><div class="acts"></div>`;
    const btns: [string, string, () => void][] = [];
    if (p.ask) btns.push(['HEAR THEM OUT', 'go', () => { this.closeCard(); this.openCard(p); }]);
    if (!isL && p.mode === 'camp') btns.push([g.party.length >= PARTY_MAX ? 'GROUP FULL' : 'COME WITH ME', 'go', () => g.invite(p)]);
    if (p.mode === 'follow' || p.mode === 'wait') btns.push(['GO BACK TO CAMP', '', () => g.dismiss(p)]);
    if (!isL && (p.mode === 'camp' || p.mode === 'follow' || p.mode === 'wait')) btns.push(['GO SCOUT', '', () => { g.askScout(p); if (g.scoutPick === p) { this.closeCard(); this.showTip(`Click where ${per.name} should scout. Right-click to cancel.`, 99); } }]);
    const pj = (p.pin || p.job) as JobKind | '';
    if (!isL && p.mode === 'camp' && pj) btns.push([p.pin ? 'UNPIN JOB' : `KEEP ON ${JOB[pj].label.toUpperCase()}`, '', () => { p.pin = p.pin ? '' : pj; }]);
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
    else if (g.eraCards.length) { const c = g.eraCards.shift()!; this.title.innerHTML = `${c.title}<span class="sub">${c.sub}</span>`; this.title.style.opacity = '1'; this.momentT = 5; }
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
    // goals: what to do now; finished ones tick off for a few seconds
    const obs = objectives(g), now = new Map(obs.map(o => [o.key, o.text]));
    for (const [k, t] of this.obKeys) if (!now.has(k) && k !== 'ask' && k !== 'plan') this.obDone.push({ text: t, t: 5 });
    this.obKeys = now;
    this.obDone = this.obDone.filter(d => (d.t -= 0.5) > 0);
    const esc = (t: string) => t.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
    const obHtml = this.obDone.map(d => `<div class="ob done">✓ ${esc(d.text)}</div>`).join('') +
      obs.map(o => o.x !== undefined ? `<div class="ob at" data-x="${o.x.toFixed(1)}" data-z="${o.z!.toFixed(1)}">› ${esc(o.text)} ⌖</div>` : `<div class="ob">› ${esc(o.text)}</div>`).join('');
    const tw = `${cur ? `TODAY: ${cur.title}<br>` : g.goals.opts.length ? 'TODAY: DECIDING...<br>' : ''}FOOD: ${st.word(st.totalFood, n)} · WATER: ${st.word(st.water, n)}${st.ration ? ' · HALF RATIONS' : ''}<div class="gh">GOALS</div>${obHtml}`;
    if (this.todayEl.innerHTML !== tw) this.todayEl.innerHTML = tw;
    const party = this.lead.querySelector('.party') as HTMLElement;
    const list = [...g.party, ...g.people.filter(p => p.mode === 'rescued'), ...g.scouts];
    const pk = list.map(p => p.id + p.mode + p.mood + p.ask).join() + Math.round(game.rig.yaw * 2);
    if (pk !== this.partyKey) this.fillParty(party, list, pk);
    if (this.cardP && this.card.classList.contains('open')) this.fillCard();
    if (this.roster.classList.contains('open')) this.fillRoster();
    if (this.journal.classList.contains('open') && (this.islandTab === 'map' ? (this.mapT -= 0.5) <= 0 : this.journalN !== S.journal.length)) { this.mapT = 1; this.fillJournal(); }
    const pb = this.lead.querySelector('[data-a="roster"]') as HTMLElement, ph = g.jobs.fresh ? 'PEOPLE<span class="tag">NEW</span>' : 'PEOPLE';
    if (pb.innerHTML !== ph) pb.innerHTML = ph;
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

  /** Everyone at a glance: what they're good and bad at, what you've learned about them, how they feel about you. */
  private fillRoster() {
    if (this.peopleTab === 'jobs') { this.fillJobs(); return; }
    const g = this.game.group, S = g.story;
    const key = 'r' + g.people.map(p => p.mode + p.mood + p.ask + p.health + p.job + trustWord(p.per.trust) + S.skillKnown.has(p.id) + S.secretKnown.has(p.id) + JSON.stringify(g.requests.record.get(p.id) ?? '')).join();
    if (key === this.rosterKey) return;
    this.rosterKey = key;
    const esc = (t: string) => t.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
    this.roster.innerHTML = `<div class="x">✕</div>${this.peopleTabs()}<h4>SURVIVORS (${g.people.filter(p => p.mode !== 'dead').length}) — click someone for more</h4><div class="grid"></div>`;
    const grid = this.roster.querySelector('.grid') as HTMLElement;
    const order = [g.leader!, ...g.people.filter(p => p !== g.leader)];
    for (const p of order) {
      const per = p.per, isL = p === g.leader;
      const where = { dead: 'dead', asleep: 'asleep', camp: 'at camp', leader: 'leading', follow: 'with you', wait: 'waiting', scout: 'scouting', lost: 'LOST', hurt: 'HURT', rescued: 'with you' }[p.mode];
      const skill = S.skillKnown.has(p.id) ? SKILL_LABEL[per.skill] : '???';
      const secret = per.secret && S.secretKnown.has(p.id) ? SECRET_LABEL[per.secret] : '';
      const pair = per.pair >= 0 ? g.people[per.pair] : null, fr = S.friend(p), rv = S.rival(p), rec = g.requests.record.get(p.id);
      const ties = [pair && `Came with ${esc(pair.per.name)}`, fr && fr !== pair && `Friend: ${esc(fr.per.name)}`, rv && `Rival: ${esc(rv.per.name)}`].filter(Boolean).join(' · ');
      const html = `<div style="flex:1">
        <div class="nm">${esc(per.name)} <span>${per.age}${isL ? ' · YOU' : ''}</span> ${p.ask ? '❗' : MOOD_TXT[p.mood]}</div>
        <div class="dim">${p.mode === 'dead' ? `† ${esc(g.health.dead.find(d => d.name === per.name)?.cause ?? '')}` : `${where}${isL ? '' : ` · <span class="k">${trustWord(per.trust)}</span>`}${p.hurt ? ' · hurt' : ''}${p.health ? ` · <span class="b">${HEALTH_WORD[p.health]}</span>` : ''}${p.hungry ? ' · hungry' : ''}`}</div>
        <div class="dim">"${esc(per.backstory)}"</div>
        <div>${per.traits.map(cap).join(' · ')}</div>
        <div><span class="g">+ ${cap(per.strength)}</span> &nbsp; <span class="b">− ${cap(per.weakness)}</span></div>
        <div><span class="k">Skill</span> ${skill}${secret ? ` &nbsp; <span class="k">Secret</span> ${secret}` : ''}</div>
        ${ties ? `<div class="dim">${ties}</div>` : ''}
        ${rec ? `<div class="dim">Ideas: ${rec.good} worked · ${rec.bad} didn't</div>` : ''}
        ${this.workLine(p)}
      </div>`;
      const r = this.el(`<div class="r">${html}</div>`, grid);
      r.prepend(this.portrait(p));
      // clicking a scout also follows them with the camera
      r.onclick = () => { this.roster.classList.remove('open'); this.openCard(p); if (p.mode === 'scout' || p.mode === 'lost' || p.mode === 'hurt') { this.game.camWho = p; this.game.rig.followOn = true; } };
    }
  }

  /** ISLAND page: the full map, or the journal. */
  private fillJournal() {
    const tabs = `<div class="x">✕</div><div class="tabs"><button data-t="map" class="${this.islandTab === 'map' ? 'on' : ''}">MAP</button><button data-t="journal" class="${this.islandTab === 'journal' ? 'on' : ''}">JOURNAL</button></div>`;
    if (this.islandTab === 'map') {
      if (!this.journal.querySelector('.wrap')) this.journal.innerHTML = tabs + `<h4>THE ISLAND — click anywhere to look there</h4><div class="wrap"><canvas width="384" height="384"></canvas></div><div class="leg">◆ PLACE &nbsp; ~ WATER &nbsp; ✱ FOOD &nbsp; ■ BUILDING &nbsp; <span style="color:#ffd65a">? RUMOR</span> &nbsp; <span style="color:#ff5a4a">! TROUBLE</span> &nbsp; <span style="color:#8af07a">■ YOUR GROUP</span> &nbsp; <span style="color:#ffa040">■ SCOUT</span> &nbsp; □ YOU</div>`;
      drawIslandMap(this.game, this.journal.querySelector('canvas')!, this.journal.querySelector('.wrap')!, this.mapBase);
      return;
    }
    const J = this.game.group.story.journal;
    this.journalN = J.length;
    let html = '', day = -1;
    for (const e of J) { if (e.day !== day) { day = e.day; html += `<div class="d">DAY ${day}</div>`; } html += `<p>${e.text}</p>`; }
    this.journal.innerHTML = tabs + `<h4>JOURNAL</h4><div class="jl">${html}</div>`;
    const jl = this.journal.querySelector('.jl') as HTMLElement; jl.scrollTop = jl.scrollHeight;
  }

  private peopleTabs() {
    const g = this.game.group;
    return `<div class="tabs"><button data-t="roster" class="${this.peopleTab === 'roster' ? 'on' : ''}">ROSTER</button><button data-t="jobs" class="${this.peopleTab === 'jobs' ? 'on' : ''}">JOBS${g.jobs.fresh ? '<span class="tag">NEW</span>' : ''}</button></div>`;
  }

  /** What someone does all day, how good they are at it, what they like. */
  private workLine(p: Person) {
    const g = this.game.group, J = g.jobs;
    const exp = Object.entries(p.xp).filter(([k, v]) => v >= 6 && (JOB[k as JobKind].skill !== p.per.skill || g.story.skillKnown.has(p.id))).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${JOB[k as JobKind].label} (${LEVEL_WORD[level(v)]})`);
    const likes = [J.likeKnown.has(p.id + ':love') ? `Loves ${JOB[p.love as JobKind].verb}` : '', J.likeKnown.has(p.id + ':hate') ? `Hates ${JOB[p.hate as JobKind].verb}` : ''].filter(Boolean).join(' · ');
    const now = p.job ? `${JOB[p.job as JobKind].label}${p.pin ? ' 📌' : ''}` : p === g.leader ? 'Leading' : 'Free time';
    return `<div><span class="k">Job</span> ${now}${exp.length ? ` <span class="dim">· ${exp.join(', ')}</span>` : ''}</div>${likes ? `<div class="dim">${likes}</div>` : ''}`;
  }

  /** JOBS tab: every job the camp has, who's on it, why it isn't getting done. No numbers to set. */
  private fillJobs() {
    const g = this.game.group, J = g.jobs, C = g.camp, st = g.stock, vis = J.visible();
    const word = (n: number) => n <= 0 ? 'Out' : n < 6 ? 'Low' : n < 16 ? 'Enough' : 'Plenty';
    const key = 'j' + vis.map(k => k + J.prio[k] + J.status(k) + g.people.filter(p => p.job === k).map(p => p.id).join('.')).join() + C.queue.map(b => b.id + ':' + Math.floor(b.progress * 3) + (C.waitingFor(b) ?? '')).join() + Object.values(st.mat).map(word).join() + J.fresh;
    if (key === this.rosterKey) return;
    this.rosterKey = key;
    const shiftG = { day: '☀', evening: '☀☾', night: '☾' };
    let html = `<div class="x">✕</div>${this.peopleTabs()}<h4>JOBS — the camp decides who does what. Click a priority to change it.</h4>`;
    if (!vis.length) html += '<div class="dim" style="line-height:2">No jobs yet. Find fresh water and food first; jobs show up as the camp can do them.</div>';
    for (const k of JOB_KINDS) if (vis.includes(k)) {
      const s = J.status(k), bad = s === 'Short-handed' || s.startsWith('Waiting') || s === 'Raining';
      html += `<div class="jr"><span>${JOB[k].label} <span class="dim">${shiftG[JOB[k].shift]}</span></span><span class="pr p${J.prio[k]}" data-k="${k}">${PRIO_WORD[J.prio[k]]}</span><span class="who" data-w="${k}"></span><span class="st ${bad ? 'bad' : ''}">${s}</span></div>`;
    }
    if (C.queue.length) {
      html += '<h5>BUILD QUEUE — click one to build it next</h5>';
      for (const b of C.queue) {
        const m = C.waitingFor(b), stage = b.progress <= 0 ? 'Planned' : b.progress < 0.34 ? 'Stakes in' : b.progress < 0.67 ? 'Frame up' : 'Almost done';
        html += `<div class="qr" data-q="${b.id}">› ${cap(BUILD[b.kind].label)} — ${stage}${m ? ` <span style="color:#ff8a7a">· waiting for ${m}</span>` : ''}</div>`;
      }
    }
    const T = st.tools, tw = (n: number) => n <= 0 ? '—' : n === 1 ? 'one' : n < 4 ? 'a few' : 'plenty';
    if (st.toolKnown.size) html += `<h5>TOOLS</h5><div>${(['axe', 'spear', 'knife', 'basket', 'rope'] as const).filter(t => st.toolKnown.has(t) || T[t] > 0).map(t => `${cap(t)}: ${tw(T[t])}`).join(' · ')}${C.has('workbench') ? '' : ' <span class="dim">(needs a workbench to make more)</span>'}</div>`;
    if (g.era !== 'crash') html += `<h5>MATERIALS</h5><div>Wood: ${word(st.mat.wood)} · Bamboo: ${word(st.mat.bamboo)} · Stone: ${word(st.mat.stone)} · Vines: ${word(st.mat.vines)} · Scrap: ${word(st.mat.scrap)}</div>`;
    const free = g.people.filter(p => p !== g.leader && p.mode === 'camp' && !p.job && !p.hurt);
    html += `<h5>FREE RIGHT NOW</h5><div class="dim">${free.length ? free.map(p => p.per.name).join(', ') : 'Nobody — everyone is busy.'}</div>`;
    this.roster.innerHTML = html;
    for (const el of this.roster.querySelectorAll('[data-w]')) for (const p of g.people.filter(p => p.job === (el as HTMLElement).dataset.w)) { const c = this.portrait(p); c.title = p.per.name; el.appendChild(c); }
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
    // hovering a building says what it is and whose it is
    let hb = null, hd = 26 * this.game.rig.zoom;
    for (const b of g.camp.list) { if (b.kind === 'fence') continue; const sc = this.input.screen(b.x, heightAt(w, b.x, b.z) + 1, b.z), d = Math.hypot(sc.x - this.input.mx, sc.y - this.input.my); if (d < hd) { hd = d; hb = b; } }
    if (hb) {
      const d = BUILD[hb.kind], own = hb.owners.map(i => g.people[i].per.name).join(' & ');
      const text = hb.kind === 'grave' ? `Here lies ${own || 'a friend'}` : hb.progress < 1 ? `${cap(d.label)} — being built` : `${own ? `${own}'s hut` : cap(d.label)} — ${d.desc}${hb.shaky ? ' (shaky)' : ''}`;
      put('hb', 'lbl map', text, hb.x, hb.z, 3.2);
    }
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

  /** Morning plan: three cards, one click. Time crawls while they are up; nobody picks in 30 s → the most trusted idea wins. */
  private drawGoal(dt: number) {
    const G = this.game.group.goals, opts = G.opts;
    if (!opts.length) { if (this.goalKey) { this.goalKey = ''; this.goalEl.classList.remove('open'); } return; }
    const key = opts.map(o => o.who.id + o.title).join();
    if (key !== this.goalKey) {
      this.goalKey = key; this.goalT = 30;
      this.goalEl.innerHTML = (this.game.group.recap ? `<div class="recap"><b style="color:#ffd65a;font-weight:normal">YESTERDAY:</b> ${this.game.group.recap}</div>` : '') + '<h2>WHAT DO WE DO TODAY?</h2><div class="cards box" style="background:none;border:0;box-shadow:none"></div><div class="bar"><i></i></div>';
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
    (this.goalEl.querySelector('.bar i') as HTMLElement).style.width = `${Math.max(0, this.goalT / 30) * 100}%`;
  }
}
