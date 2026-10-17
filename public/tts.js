// Text to speech: reads the slide out loud (text, math in words, fraction pictures, the question and its options).
// Each sentence is read with a Russian or English voice depending on its letters.
"use strict";
const Speak = {
  rate: store.get("ls-rate", 0.9), on: false,

  mathWords(src, ru) {
    const W = ru ? { over: " делить на ", sq: " в квадрате", cube: " в кубе", pow: " в степени ", root: "корень из ", times: " умножить на ", div: " делить на ",
      eq: " равно ", plus: " плюс ", minus: " минус ", le: " меньше или равно ", ge: " больше или равно ", ne: " не равно ", pm: " плюс-минус ", pi: " пи ", deg: " градусов", lt: " меньше ", gt: " больше " }
      : { over: " over ", sq: " squared", cube: " cubed", pow: " to the power of ", root: "the square root of ", times: " times ", div: " divided by ",
      eq: " equals ", plus: " plus ", minus: " minus ", le: " is less than or equal to ", ge: " is greater than or equal to ", ne: " is not equal to ", pm: " plus or minus ", pi: " pi ", deg: " degrees", lt: " is less than ", gt: " is greater than " };
    return String(src)
      .replace(/sqrt\s*\(([^)]*)\)/g, (m, a) => W.root + a + " ").replace(/sqrt\s*(\w+)/g, (m, a) => W.root + a)
      .replace(/\^\s*2\b/g, W.sq).replace(/\^\s*3\b/g, W.cube).replace(/\^\s*\(?([^)\s]+)\)?/g, (m, a) => W.pow + a)
      .replace(/_\s*(\w)/g, " $1")
      .replace(/<=/g, W.le).replace(/>=/g, W.ge).replace(/!=/g, W.ne).replace(/\+-/g, W.pm)
      .replace(/\//g, W.over).replace(/[*×]/g, W.times).replace(/÷/g, W.div)
      .replace(/=/g, W.eq).replace(/\+/g, W.plus).replace(/(^|\s)-/g, "$1" + W.minus.trim() + " ").replace(/</g, W.lt).replace(/>/g, W.gt)
      .replace(/\bpi\b/g, W.pi).replace(/\bdeg\b/g, W.deg).replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  },

  phrases(s, texts) {
    if (!s) return [];
    const ru = LANG === "ru", out = [];
    if (s.say) out.push(s.say);   // listening exercises: the word is spoken but not shown
    const objs = s.objects.filter(o => ["text", "math", "fracpie", "fracbar"].includes(o.type) || o.label).slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
    for (const o of objs) {
      if (o.label) out.push(texts?.[o.id + ":label"] ?? o.label);
      if (o.type === "text") out.push(texts?.[o.id] ?? o.text);
      else if (o.type === "math") out.push(this.mathWords(o.src, ru || /[а-яё]/i.test(o.src)));
      else if (o.type === "fracpie" || o.type === "fracbar") out.push(ru ? `${o.k} из ${o.n} частей закрашено` : `${o.k} out of ${o.n} parts are shaded`);
    }
    const q = s.question;
    if (q && q.type !== "none") {
      out.push(texts?.["q:prompt"] ?? q.prompt);
      if (q.type === "choice") q.options.forEach((o, i) => out.push((ru ? "Вариант " : "Option ") + (i + 1) + ". " + (texts?.["q:" + i] ?? o.text)));
    }
    return out.filter(t => t && t.trim());
  },

  voice(lang) {
    const all = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith(lang));
    return all.find(v => /natural|online/i.test(v.name)) || all[0];
  },

  read(s, texts, button) {
    if (!("speechSynthesis" in window)) return toast("✖");
    if (this.on) return this.stop(button);
    const list = this.phrases(s, texts);
    if (!list.length) return;
    this.on = true; if (button) button.textContent = "⏹";
    speechSynthesis.cancel();
    list.forEach((text, i) => {
      const lang = /[а-яё]/i.test(text) ? "ru" : "en";
      const u = new SpeechSynthesisUtterance(text); u.lang = lang === "ru" ? "ru-RU" : "en-US"; u.rate = this.rate;
      const v = this.voice(lang); if (v) u.voice = v;
      if (i === list.length - 1) u.onend = u.onerror = () => this.stop(button);
      speechSynthesis.speak(u);
    });
  },
  stop(button) { this.on = false; try { speechSynthesis.cancel(); } catch (e) { /* none */ } if (button) button.textContent = "🔊"; },
};
try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => {}; } catch (e) { /* no speech */ }
