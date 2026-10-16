// "English lessons" button: turns an English Coach step-by-step lesson (from /english/data.js) into normal
// Lesson Studio slides, so the teacher can draw on them, present them, and get live answers.
"use strict";
const EngLessons = {
  dir: store.get("ls-engdir", "ru2en"),   // ru2en: Russian speaker learns English; en2ru: English speaker learns Russian

  path() { return this.dir === "ru2en" ? PATH_RU2EN : PATH_EN2RU; },
  ru() { return this.dir === "ru2en"; },    // explanations are in Russian for ru2en
  word([en, ru, sound]) { return this.ru() ? { word: en, mean: ru, sound } : { word: ru, mean: en, sound: translit(ru) }; },
  letter(L) {
    if (this.ru()) { const a = ALPHABET_EN.find(x => x[0] === L); return { big: L + " " + L.toLowerCase(), name: a[1], text: "«" + a[1] + "» — " + a[2] + " [" + a[3] + "]", say: L + ". " + a[2] }; }
    const a = ALPHABET_RU.find(x => x[0].startsWith(L)); return { big: a[0], name: a[1], text: '"' + a[1] + '" - ' + a[2] + ". " + a[3] + " = " + a[4], say: L + ". " + a[3] };
  },

  // ---------------------------------------------------------------- picker window
  open() {
    document.getElementById("engwin")?.remove();
    const w = document.createElement("div"); w.id = "engwin"; w.className = "float";
    Object.assign(w.style, { left: "50%", top: "70px", transform: "translateX(-50%)", width: "min(720px, 96vw)", maxHeight: "80vh", display: "flex", flexDirection: "column" });
    const draw = () => {
      let i = 0;
      w.innerHTML = `<div class="fh"><b>📘 ${tr("engLessons")}</b><button class="btn small ghost" id="ew-x">✕</button></div>
        <div style="padding:10px 12px;display:flex;flex-direction:column;gap:10px;overflow:auto">
          <div class="row"><button class="btn small ${this.dir === "ru2en" ? "" : "ghost"}" data-dir="ru2en">🇷🇺 → 🇬🇧 ${tr("ru2en")}</button>
            <button class="btn small ${this.dir === "en2ru" ? "" : "ghost"}" data-dir="en2ru">🇬🇧 → 🇷🇺 ${tr("en2ru")}</button></div>
          <p class="muted" style="margin:0">${tr("engHelp")}</p>
          ${this.path().map(u => `<div><b>${esc(u.u)}</b><div class="row" style="margin-top:4px">${u.steps.map(s => `<button class="btn small ghost" data-i="${i++}">${esc(s.t)}</button>`).join("")}</div></div>`).join("")}
        </div>`;
      $("ew-x").onclick = () => w.remove();
      w.querySelectorAll("[data-dir]").forEach(b => b.onclick = () => { this.dir = b.dataset.dir; store.set("ls-engdir", this.dir); draw(); });
      w.querySelectorAll("[data-i]").forEach(b => b.onclick = () => { this.add(+b.dataset.i); w.remove(); });
      draggable(w);
    };
    document.body.appendChild(w); draw();
  },

  add(index) {
    const steps = this.path().flatMap(u => u.steps.map(s => Object.assign({ unit: u.u }, s)));
    const L = this.build(steps[index]);
    App.lessons.push(L); App.cur = App.lessons.length - 1; App.slide = 0; App.sel = null; Ed.hist = []; Ed.fut = [];
    autosave(); renderEditor(); Live.pushLesson(); Live.pushSlide();
    toast("📘 " + L.name + " — " + L.slides.length + " " + tr("slidesMade"));
  },

  // ---------------------------------------------------------------- lesson -> slides
  build(step) {
    const ru = this.ru(), slides = [];
    const T = (x, y, w, text, size, color, bold) => ({ id: uid(), type: "text", x, y, w, text: String(text), size, color, bold: !!bold });
    const S = (bg) => Object.assign(newSlide(), { bg: bg || "#ffffff" });
    const lines = (text, w, size) => wrapText(text, w, size).length;

    // title slide
    const t = S("#eef3ff");
    t.objects.push(T(100, 150, 1080, step.unit, 40, "#5b6b8c"), T(100, 230, 1080, step.t, 84, "#1c2230", true),
      T(100, 480, 1080, ru ? "📘 Урок английского языка" : "📘 Russian lesson", 36, "#3b6cf0"));
    slides.push(t);

    // explanation cards
    const cards = [];
    if (step.intro) cards.push({ h: step.t, p: step.intro, ex: [] });
    if (step.k === "letters") step.letters.forEach(Lt => { const i = this.letter(Lt); cards.push({ letter: i }); });
    if (step.k === "words") VOCAB[VKEY(step.topic)].slice(step.from, step.to).forEach(e => cards.push({ word: this.word(e) }));
    if (step.k === "rule") cards.push(...step.cards);
    for (const c of cards) {
      const s = S();
      if (c.letter) {
        s.objects.push(T(100, 110, 520, c.letter.big, 220, "#3b6cf0", true), T(640, 250, 560, c.letter.text, 46, "#1c2230"));
        s.say = c.letter.say;
      } else if (c.word) {
        s.objects.push(T(100, 150, 1080, c.word.word, 120, "#3b6cf0", true), T(100, 330, 1080, "[" + c.word.sound + "]", 46, "#6a7386"),
          T(100, 430, 1080, c.word.mean, 64, "#1c2230", true));
        s.say = c.word.word;
      } else {
        s.objects.push(T(80, 50, 1120, c.h, 54, "#1c2230", true));
        let y = 150;
        if (c.p) { s.objects.push(T(80, y, 1120, c.p, 34, "#333a48")); y += lines(c.p, 1120, 34) * 34 * 1.25 + 30; }
        for (const [a, b] of (c.ex || []).slice(0, 6)) {
          const hA = lines(a, 540, 38) * 38 * 1.25, hB = lines(b, 520, 30) * 30 * 1.25;
          s.objects.push(T(100, y, 540, a, 38, "#3b6cf0", true), T(660, y + 4, 520, b, 30, "#6a7386"));
          y += Math.max(hA, hB) + 18;
          if (y > 660) break;
        }
      }
      slides.push(s);
    }

    // exercises -> slides with questions
    const exs = this.exercises(step);
    exs.forEach((e, n) => {
      const s = S("#fbfaf5");
      s.objects.push(T(80, 40, 1120, (ru ? "Упражнение " : "Exercise ") + (n + 1) + " / " + exs.length, 32, "#8a7f62", true));
      const opts = (e.opts || []).map(o => ({ text: String(o), right: String(o) === String([].concat(e.a)[0]) }));
      if (e.type === "choose") {
        s.objects.push(T(80, 140, 1120, e.q, 52, "#1c2230", true));
        s.question = { type: "choice", prompt: e.q, options: opts, answer: "" };
      } else if (e.type === "listen") {
        s.objects.push(T(80, 140, 1120, ru ? "🔊 Послушай и выбери слово" : "🔊 Listen and choose", 52, "#1c2230", true),
          T(80, 260, 1120, ru ? "Нажми «🔊 Прочитать», чтобы услышать." : "Press 🔊 Read aloud to hear it.", 34, "#6a7386"));
        s.say = e.say;
        s.question = { type: "choice", prompt: ru ? "Какое слово ты услышал?" : "Which word did you hear?", options: opts, answer: "" };
      } else if (e.type === "type") {
        s.objects.push(T(80, 140, 1120, e.q, 52, "#1c2230", true));
        s.question = { type: "text", prompt: ru ? "Напиши ответ" : "Type the answer", options: [], answer: String([].concat(e.a)[0]) };
      } else if (e.type === "order") {
        const words = e.sentence.split(" ").sort(() => Math.random() - 0.5);
        s.objects.push(T(80, 140, 1120, (ru ? "Собери предложение: «" : "Build the sentence: \"") + e.mean + (ru ? "»" : "\""), 46, "#1c2230", true),
          T(80, 300, 1120, words.join("   ·   "), 48, "#3b6cf0", true));
        s.question = { type: "text", prompt: ru ? "Напиши предложение по порядку" : "Write the sentence in order", options: [], answer: e.sentence };
      }
      if (e.why) s.notes = e.why;
      slides.push(s);
    });

    // last slide
    const end = S("#eefaf2");
    end.objects.push(T(100, 250, 1080, ru ? "Молодец! 🎉 Урок пройден." : "Well done! 🎉 Lesson complete.", 72, "#1f9d55", true));
    slides.push(end);
    return { id: uid(), name: step.t, slides, noTranslate: true };   // language lessons must not be auto-translated
  },

  // the same exercises English Coach generates
  exercises(step) {
    const shuffle = a => a.slice().sort(() => Math.random() - 0.5);
    if (step.k === "rule") return step.ex.slice();
    const out = [];
    if (step.k === "letters") {
      step.letters.forEach(L => {
        const i = this.letter(L), others = shuffle(step.letters.filter(x => x !== L)).slice(0, 3);
        out.push({ type: "listen", say: L, opts: shuffle([L, ...others]), a: L, why: (this.ru() ? "Это буква " : "That was ") + L + " (" + i.name + ")" });
        out.push({ type: "choose", q: (this.ru() ? "Как называется буква " : "What is the name of ") + L + "?", opts: shuffle([i.name, ...others.map(o => this.letter(o).name)]), a: i.name });
      });
      return shuffle(out);
    }
    const words = VOCAB[VKEY(step.topic)].slice(step.from, step.to).map(e => this.word(e));
    words.forEach(w => {
      const others = shuffle(words.filter(x => x !== w)).slice(0, 3);
      out.push({ type: "choose", q: (this.ru() ? "Что значит «" : 'What does "') + w.word + (this.ru() ? "»?" : '" mean?'), opts: shuffle([w.mean, ...others.map(o => o.mean)]), a: w.mean, why: w.word + " = " + w.mean });
      out.push({ type: "listen", say: w.word, opts: shuffle([w.word, ...others.map(o => o.word)]), a: w.word, why: w.word + " [" + w.sound + "]" });
    });
    shuffle(words).slice(0, 2).forEach(w => out.push({ type: "type", q: (this.ru() ? "Напиши по-английски: " : "Write in Russian: ") + w.mean, a: w.word, why: w.mean + " = " + w.word }));
    return out;
  },
};
