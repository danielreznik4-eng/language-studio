// English Coach lesson content, shared by English Coach (/english) and Lesson Studio's "English lessons" button.
"use strict";
// ================================================================ data: English for Russian speakers
const ALPHABET_EN = [
 ["A","эй","apple","э́пл"],["B","би","ball","бол"],["C","си","cat","кэт"],["D","ди","dog","дог"],["E","и","egg","эг"],["F","эф","fish","фиш"],
 ["G","джи","green","грин"],["H","эйч","house","ха́ус"],["I","ай","ice","айс"],["J","джей","juice","джус"],["K","кей","key","ки"],["L","эл","lion","ла́йэн"],
 ["M","эм","milk","милк"],["N","эн","nose","но́уз"],["O","оу","orange","о́риндж"],["P","пи","pen","пэн"],["Q","кью","queen","квин"],["R","ар","red","рэд"],
 ["S","эс","sun","сан"],["T","ти","tree","три"],["U","ю","umbrella","амбрэ́лла"],["V","ви","van","вэн"],["W","дабл-ю","water","уо́тэ"],["X","экс","box","бокс"],
 ["Y","уай","yes","йес"],["Z","зед / зи","zoo","зу"]
];
const READING_EN = [
 ["th","θ / ð","think, this","Кончик языка между зубами и дуй: «с»/«з» с языком между зубами."],
 ["sh","ш","ship, fish","Как русское «ш»."],["ch","ч","chair, lunch","Как русское «ч»."],
 ["ph","ф","phone, photo","Две буквы = один звук «ф»."],["ck","к","back, duck","Просто «к»."],
 ["ee / ea","и (долгое)","see, sea, tea","Долгий звук «ии»."],["oo","у (долгое)","moon, food, school","Долгий «уу». Иногда короткий: book."],
 ["ay / ai","эй","day, rain","Как «эй»."],["ow / ou","ау","now, house","Как «ау»."],
 ["igh","ай","night, light","gh не читается."],["wh","у(в)","what, where","Как мягкое «уа»: what = уот."],
 ["kn","н","know, knife","k в начале не читается."],["wr","р","write, wrong","w не читается."],
 ["-e на конце","не читается","make, time, home","Немая e делает гласную «длинной»: mak→make (мэйк)."],
 ["a в открытом слоге","эй","name, late","В закрытом слоге — «э»: cat, man."],["i в открытом слоге","ай","bike, time","В закрытом — «и»: sit, big."]
];
// [english, russian, how an English word sounds written in Russian letters]
const VOCAB = {
 "greetings|Приветствия": [["hello","привет","хэлло́у"],["goodbye","до свидания","гудба́й"],["please","пожалуйста","плиз"],["thank you","спасибо","сэнк ю"],["yes","да","йес"],["no","нет","ноу"],["sorry","извините","со́ри"],["good morning","доброе утро","гуд мо́рнинг"],["good night","спокойной ночи","гуд найт"],["how are you?","как дела?","хау ар ю"],["my name is","меня зовут","май нэйм из"],["nice to meet you","приятно познакомиться","найс ту мит ю"]],
 "family|Семья": [["mother","мама","ма́зэр"],["father","папа","фа́зэр"],["brother","брат","бра́зэр"],["sister","сестра","си́стэр"],["family","семья","фэ́мили"],["friend","друг","фрэнд"],["boy","мальчик","бой"],["girl","девочка","гёрл"],["baby","малыш","бэ́йби"],["grandmother","бабушка","грэ́ндмазэр"],["grandfather","дедушка","грэ́ндфазэр"],["child","ребёнок","чайлд"]],
 "numbers|Числа": [["one","один","уан"],["two","два","ту"],["three","три","сри"],["four","четыре","фо"],["five","пять","файв"],["six","шесть","сикс"],["seven","семь","сэ́вэн"],["eight","восемь","эйт"],["nine","девять","найн"],["ten","десять","тэн"],["twenty","двадцать","твэ́нти"],["hundred","сто","ха́ндрэд"]],
 "colors|Цвета": [["red","красный","рэд"],["blue","синий","блу"],["green","зелёный","грин"],["yellow","жёлтый","йе́ллоу"],["black","чёрный","блэк"],["white","белый","уайт"],["orange","оранжевый","о́риндж"],["purple","фиолетовый","пёрпл"],["pink","розовый","пинк"],["brown","коричневый","браун"],["grey","серый","грэй"],["gold","золотой","голд"]],
 "food|Еда": [["bread","хлеб","брэд"],["water","вода","уо́тэр"],["milk","молоко","милк"],["apple","яблоко","эпл"],["meat","мясо","мит"],["fish","рыба","фиш"],["egg","яйцо","эг"],["cheese","сыр","чиз"],["chicken","курица","чи́кэн"],["potato","картофель","пэтэ́йтоу"],["soup","суп","суп"],["cake","торт","кэйк"]],
 "home|Дом": [["house","дом","ха́ус"],["room","комната","рум"],["door","дверь","до"],["window","окно","уи́ндоу"],["bed","кровать","бэд"],["table","стол","тэйбл"],["chair","стул","чэа"],["kitchen","кухня","ки́чэн"],["key","ключ","ки"],["lamp","лампа","лэмп"],["wall","стена","уол"],["floor","пол","флор"]],
 "school|Школа": [["school","школа","скул"],["teacher","учитель","ти́чэр"],["book","книга","бук"],["pen","ручка","пэн"],["pencil","карандаш","пэ́нсл"],["lesson","урок","лэсн"],["homework","домашнее задание","хо́умуорк"],["word","слово","уорд"],["question","вопрос","куэ́счэн"],["answer","ответ","а́нсэр"],["read","читать","рид"],["write","писать","райт"]],
 "verbs|Глаголы": [["go","идти","гоу"],["come","приходить","кам"],["eat","есть","ит"],["drink","пить","дринк"],["sleep","спать","слип"],["play","играть","плэй"],["see","видеть","си"],["want","хотеть","уонт"],["like","нравиться","лайк"],["know","знать","ноу"],["make","делать","мэйк"],["help","помогать","хэлп"]],
 "adjectives|Прилагательные": [["big","большой","биг"],["small","маленький","смол"],["good","хороший","гуд"],["bad","плохой","бэд"],["hot","горячий","хот"],["cold","холодный","коулд"],["new","новый","нью"],["old","старый","оулд"],["fast","быстрый","фаст"],["slow","медленный","слоу"],["happy","счастливый","хэ́пи"],["easy","лёгкий","и́зи"]],
 "games & Minecraft|Игры и Minecraft": [["game","игра","гэйм"],["player","игрок","плэ́йэр"],["world","мир","уорлд"],["build","строить","билд"],["mine","копать","майн"],["craft","создавать","крафт"],["sword","меч","сорд"],["pickaxe","кирка","пи́кэкс"],["win","побеждать","уин"],["lose","проигрывать","луз"],["level","уровень","лэвл"],["chest","сундук","чэст"]],
 "time|Время": [["day","день","дэй"],["night","ночь","найт"],["today","сегодня","тудэ́й"],["tomorrow","завтра","тумо́роу"],["yesterday","вчера","йе́стэдэй"],["week","неделя","уик"],["year","год","йиэр"],["morning","утро","мо́рнинг"],["evening","вечер","и́внинг"],["now","сейчас","нау"],["always","всегда","о́лвэйз"],["never","никогда","нэ́вэр"]],
 "city|Город": [["street","улица","стрит"],["shop","магазин","шоп"],["car","машина","кар"],["bus","автобус","бас"],["park","парк","парк"],["city","город","си́ти"],["left","налево","лэфт"],["right","направо","райт"],["near","рядом","ниэр"],["far","далеко","фар"],["money","деньги","ма́ни"],["hospital","больница","хо́спитл"]]
};
const GRAMMAR_EN = [
 {t:"Глагол to be (am / is / are)", x:"В английском нельзя сказать «Я ученик» без глагола. Нужно: <b>I am</b> a student. <br>I <b>am</b> · you / we / they <b>are</b> · he / she / it <b>is</b>. Коротко: I'm, you're, he's.",
  ex:[["I ___ happy.","am"],["She ___ my sister.","is"],["They ___ friends.","are"],["It ___ cold.","is"],["We ___ at school.","are"]]},
 {t:"Артикли a / an / the", x:"<b>a</b> — какой-то один (a cat). <b>an</b> — перед гласным звуком (an apple, an egg). <b>the</b> — тот самый, известный (the sun, the cat from yesterday).",
  ex:[["I have ___ apple.","an"],["This is ___ dog.","a"],["Look at ___ sun!","the"],["She is ___ teacher.","a"],["I want ___ egg.","an"]]},
 {t:"Множественное число", x:"Обычно добавь <b>-s</b>: cat → cats. После s, sh, ch, x: <b>-es</b> (box → boxes). Исключения: man → men, child → children, foot → feet, mouse → mice.",
  ex:[["one book, two ___","books"],["one box, two ___","boxes"],["one child, two ___","children"],["one man, two ___","men"],["one bus, two ___","buses"]]},
 {t:"Местоимения", x:"I — я, you — ты/вы, he — он, she — она, it — оно (вещи, животные), we — мы, they — они. <br>Мой — <b>my</b>, твой — <b>your</b>, его — <b>his</b>, её — <b>her</b>, наш — <b>our</b>, их — <b>their</b>.",
  ex:[["This is ___ (мой) cat.","my"],["___ (она) is nice.","she"],["___ (мы) play games.","we"],["Is this ___ (твой) pen?","your"],["___ (они) are here.","they"]]},
 {t:"Present Simple (обычно, всегда)", x:"Для привычек: I play, you play, we play. <b>He / she / it + s</b>: he play<b>s</b>, she like<b>s</b>. <br>Слова-подсказки: always, usually, every day.",
  ex:[["He ___ (play) games every day.","plays"],["I ___ (like) pizza.","like"],["She ___ (read) books.","reads"],["We ___ (go) to school.","go"],["It ___ (rain) a lot.","rains"]]},
 {t:"Вопросы и «не» (do / does)", x:"Вопрос: <b>Do</b> you like cats? <b>Does</b> he play? <br>Отрицание: I <b>don't</b> like..., she <b>doesn't</b> play... (после does глагол без -s!).",
  ex:[["___ you speak English?","do"],["___ she like milk?","does"],["I ___ (не) know.","don't"],["He ___ (не) play football.","doesn't"],["___ they live here?","do"]]},
 {t:"Can (могу, умею)", x:"<b>can</b> + глагол: I can swim. Не умею: I <b>can't</b> swim. Вопрос: <b>Can</b> you help me? С can никогда не добавляется -s: he can (не cans).",
  ex:[["I ___ swim. (умею)","can"],["She ___ fly. (не может)","can't"],["___ you help me?","can"],["He ___ play the guitar. (умеет)","can"]]},
 {t:"There is / There are", x:"<b>There is</b> + один предмет: There is a cat in the room. <b>There are</b> + много: There are two books.",
  ex:[["There ___ a dog in the park.","is"],["There ___ three apples.","are"],["There ___ a key on the table.","is"],["There ___ many people.","are"]]},
 {t:"Past Simple (вчера, раньше)", x:"Обычно добавь <b>-ed</b>: play → played. Неправильные надо выучить: go → <b>went</b>, see → <b>saw</b>, eat → <b>ate</b>, have → <b>had</b>, make → <b>made</b>, be → <b>was / were</b>.",
  ex:[["Yesterday I ___ (play) games.","played"],["She ___ (go) home.","went"],["We ___ (see) a film.","saw"],["I ___ (be) tired.","was"],["They ___ (eat) pizza.","ate"]]},
 {t:"Present Continuous (прямо сейчас)", x:"am / is / are + глагол<b>-ing</b>: I am read<b>ing</b> now. She is play<b>ing</b>. Подсказки: now, right now, look!",
  ex:[["I am ___ (read) now.","reading"],["She is ___ (play).","playing"],["They are ___ (eat).","eating"],["He is ___ (sleep).","sleeping"]]},
 {t:"Порядок слов", x:"Порядок строгий: <b>кто → что делает → что → где → когда</b>. I play games at home every day. Вопросы начинаются со вспомогательного глагола или вопросительного слова (What, Where, When, Why, How).",
  order:[["I play games at home","я играю в игры дома"],["she likes red apples","ей нравятся красные яблоки"],["where do you live","где ты живёшь"],["we went to the park yesterday","мы ходили в парк вчера"],["can you help me please","можешь мне помочь, пожалуйста"]]}
];
const TYPING_EN = [
 {t:"Основной ряд: F и J", hint:"Указательные пальцы на F и J (на них бугорки). Не смотри на клавиши!", text:"fff jjj fjf jfj ff jj fj jf fjfj jfjf"},
 {t:"Основной ряд: A S D F", hint:"Левая рука: мизинец A, безымянный S, средний D, указательный F.", text:"asdf asdf fdsa sad dad add fad sass"},
 {t:"Основной ряд: J K L ;", hint:"Правая рука: указательный J, средний K, безымянный L, мизинец ;.", text:"jkl; jkl; lkj; all fall lad lass ask flask"},
 {t:"Весь основной ряд + G H", hint:"G и H — указательными пальцами.", text:"glad flash hall dash gash half ash had has shall"},
 {t:"Верхний ряд: E и I", hint:"E — средний палец левой, I — средний правой.", text:"see fee lie die like hide side feel seed field"},
 {t:"Верхний ряд: R T Y U", hint:"Указательные пальцы тянутся вверх.", text:"tree true try rut yet your turn rust trust"},
 {t:"Верхний ряд: Q W O P", hint:"Q и P — мизинцы, W и O — безымянные.", text:"we wow pop power quote swoop poke quiet"},
 {t:"Нижний ряд", hint:"Z X C V B N M — пальцы тянутся вниз.", text:"zoom box cave bin man van mix cab next"},
 {t:"Частые слова", hint:"Самые частые английские слова.", text:"the and you that have for not with this but from they say"},
 {t:"Предложения", hint:"Заглавная буква: держи Shift другой рукой.", text:"I like to play games. My friend is very good at Minecraft."},
 {t:"Предложения 2", hint:"Следи за точностью, скорость придёт сама.", text:"We build a big house near the river. The sun is hot today."},
 {t:"Мастер", hint:"Попробуй без ошибок!", text:"The quick brown fox jumps over the lazy dog. Practice makes perfect."}
];

// ================================================================ data: Russian for English speakers
// [letter, name, sounds like, example, meaning]
const ALPHABET_RU = [
 ["А а","a","a in father","арбуз","watermelon"],["Б б","be","b in bat","банан","banana"],["В в","ve","v in van","вода","water"],["Г г","ge","g in go","город","city"],
 ["Д д","de","d in dog","дом","house"],["Е е","ye","ye in yes","ель","fir tree"],["Ё ё","yo","yo in yogurt","ёж","hedgehog"],["Ж ж","zhe","s in pleasure","жук","beetle"],
 ["З з","ze","z in zoo","зима","winter"],["И и","i","ee in see","игра","game"],["Й й","i kratkoye","y in boy","йогурт","yogurt"],["К к","ka","k in kite","кот","cat"],
 ["Л л","el","l in lamp","лук","onion"],["М м","em","m in map","мама","mom"],["Н н","en","n in no","нос","nose"],["О о","o","o in more","окно","window"],
 ["П п","pe","p in pen","папа","dad"],["Р р","er","rolled r","рыба","fish"],["С с","es","s in sun","сок","juice"],["Т т","te","t in top","торт","cake"],
 ["У у","u","oo in moon","утка","duck"],["Ф ф","ef","f in fun","флаг","flag"],["Х х","kha","ch in Scottish loch","хлеб","bread"],["Ц ц","tse","ts in cats","цирк","circus"],
 ["Ч ч","che","ch in chair","чай","tea"],["Ш ш","sha","sh in shop","шар","ball"],["Щ щ","shcha","long soft sh","щука","pike"],["Ъ ъ","tvyordy znak","hard sign, no sound","подъезд","entrance"],
 ["Ы ы","y","i in ill, said further back","сыр","cheese"],["Ь ь","myagky znak","soft sign, softens the letter before","соль","salt"],["Э э","e","e in met","это","this"],["Ю ю","yu","you","юла","spinning top"],
 ["Я я","ya","ya in yard","яблоко","apple"]
];
const READING_RU = [
 ["О without stress","sounds like A","молоко = malaká","Only the stressed O sounds like O. Others become 'a' (akanye)."],
 ["Е Ё Ю Я","ye yo yu ya","ель, ёж, юла, яблоко","At the start of a word or after a vowel they add a 'y' sound."],
 ["Ь soft sign","no sound","соль, мать","Makes the consonant before it soft (tongue pressed up)."],
 ["Ъ hard sign","no sound","подъезд","Separates sounds: a small pause before е/ё/ю/я."],
 ["Ы","between i and u","сыр, мы","Say 'i' with your tongue pulled back."],
 ["Final Б В Г Д Ж З","become П Ф К Т Ш С","хлеб = khlep, город = gorat","Voiced letters at the end of a word lose their voice."],
 ["-ОГО / -ЕГО","sounds like -ova","его = yevó, сегодня = sevódnya","The Г is read as В in these endings."],
 ["Ж Ш Ц","always hard","жизнь = zhyzn","After them И sounds like Ы."],
 ["Ч Щ","always soft","час, щи","Soft no matter what follows."],
 ["Stress","only one per word","мАма, молокО, вОда→водА","Stress moves and must be learned with each word. Dictionaries mark it with ´."]
];
const GRAMMAR_RU = [
 {t:"No 'to be' in the present", x:"Russian drops 'am/is/are' in the present tense. <b>Я студент</b> = I (am a) student. <b>Это кот</b> = This (is a) cat. There are also no articles (a/the)!",
  ex:[["I am happy = Я ___","счастлив"],["This is a house = ___ дом","это"],["She is my sister = Она моя ___","сестра"],["It is cold = ___","холодно"]]},
 {t:"Gender of nouns", x:"Every noun is masculine, feminine or neuter. <b>Masculine</b>: ends in a consonant (дом, кот). <b>Feminine</b>: ends in -а/-я (мама, земля). <b>Neuter</b>: ends in -о/-е (окно, море). Words with -ь can be either.",
  ex:[["кот is ___ (m/f/n)","m"],["книга is ___ (m/f/n)","f"],["окно is ___ (m/f/n)","n"],["мама is ___ (m/f/n)","f"],["стол is ___ (m/f/n)","m"]]},
 {t:"Pronouns", x:"я — I, ты — you (friend), вы — you (polite/plural), он — he, она — she, оно — it, мы — we, они — they.<br>My: <b>мой</b> (m), <b>моя</b> (f), <b>моё</b> (n), <b>мои</b> (plural).",
  ex:[["I = ___","я"],["we = ___","мы"],["they = ___","они"],["my cat (кот, m) = ___ кот","мой"],["my mom (мама, f) = ___ мама","моя"]]},
 {t:"Plurals", x:"Most masculine and -а words add <b>-ы</b>: кот → коты, мама → мамы. After к, г, х, ж, ш, ч, щ and for -я/-ь words use <b>-и</b>: книга → книги. Neuter -о → <b>-а</b>: окно → окна.",
  ex:[["кот → ___","коты"],["книга → ___","книги"],["окно → ___","окна"],["мама → ___","мамы"],["стол → ___","столы"]]},
 {t:"Present tense verbs", x:"Verbs change with the person. <b>читать</b> (to read): я чита<b>ю</b>, ты чита<b>ешь</b>, он чита<b>ет</b>, мы чита<b>ем</b>, вы чита<b>ете</b>, они чита<b>ют</b>. Many verbs follow this pattern (играть, знать, делать).",
  ex:[["я ___ (читать)","читаю"],["он ___ (играть)","играет"],["мы ___ (знать)","знаем"],["они ___ (делать)","делают"],["ты ___ (читать)","читаешь"]]},
 {t:"Past tense", x:"Take the verb, remove <b>-ть</b>, add <b>-л</b> (he), <b>-ла</b> (she), <b>-ло</b> (it), <b>-ли</b> (they). играть → он игра<b>л</b>, она игра<b>ла</b>, они игра<b>ли</b>.",
  ex:[["he played = он ___","играл"],["she read = она ___","читала"],["they knew = они ___","знали"],["she did = она ___","делала"]]},
 {t:"Not and questions", x:"Put <b>не</b> before the verb: Я <b>не</b> знаю = I don't know. Questions often keep the same words, only your voice goes up: Ты играешь? = Do you play? Question words: что (what), где (where), кто (who), когда (when), почему (why), как (how).",
  ex:[["I don't know = Я ___ знаю","не"],["what = ___","что"],["where = ___","где"],["who = ___","кто"],["how = ___","как"]]},
 {t:"Accusative (object) case", x:"When a feminine -а word is the object of a verb, -а becomes <b>-у</b> (-я → -ю): Я читаю книг<b>у</b>. Я люблю мам<b>у</b>. Masculine things and neuter words stay the same: Я вижу дом.",
  ex:[["Я читаю ___ (книга)","книгу"],["Я люблю ___ (мама)","маму"],["Я вижу ___ (дом)","дом"],["Я пью ___ (вода)","воду"]]},
 {t:"Word order", x:"Russian word order is flexible because word endings show who does what, but the normal order is like English: <b>who → does → what</b>. Я люблю кошек = I love cats.",
  order:[["я люблю играть","I love to play"],["мама читает книгу","mom is reading a book"],["где ты живёшь","where do you live"],["мы были в парке вчера","we were in the park yesterday"],["ты можешь мне помочь","can you help me"]]}
];
const TYPING_RU = [
 {t:"Home row: А and О", hint:"Index fingers rest on А (F key) and О (J key).", text:"ааа ооо аоа оао аа оо ао оа"},
 {t:"Home row: Ф Ы В А", hint:"Left hand: pinky Ф, ring Ы, middle В, index А.", text:"фыва фыва авыф вы ва ыв фа"},
 {t:"Home row: О Л Д Ж", hint:"Right hand: index О, middle Л, ring Д, pinky Ж.", text:"олдж олдж ждло ло до да ода лад"},
 {t:"Home row + П Р", hint:"П and Р with your index fingers.", text:"пар рад дар вода пора ладо право"},
 {t:"Top row: К Е Н Г", hint:"Index fingers reach up.", text:"кен ген нега река ветер нерв гена"},
 {t:"Top row: Й Ц У Ш Щ З", hint:"Pinkies and ring fingers.", text:"утро шум щука зуб цвет шкаф"},
 {t:"Bottom row: Я Ч С М И Т Ь", hint:"Fingers reach down.", text:"мяч сила тихо мать час сто имя"},
 {t:"Common words", hint:"The most common Russian words.", text:"и в не на я он с что это как но мы"},
 {t:"Sentences", hint:"Capitals: hold Shift with the other hand.", text:"Я люблю играть в игры. Мой друг хорошо строит."},
 {t:"Master", hint:"Try with no mistakes!", text:"Съешь же ещё этих мягких французских булок, да выпей чаю."}
];
// English QWERTY key -> Russian letter on the same key
const RU_KEYS = {"`":"ё",q:"й",w:"ц",e:"у",r:"к",t:"е",y:"н",u:"г",i:"ш",o:"щ",p:"з","[":"х","]":"ъ",a:"ф",s:"ы",d:"в",f:"а",g:"п",h:"р",j:"о",k:"л",l:"д",";":"ж","'":"э",z:"я",x:"ч",c:"с",v:"м",b:"и",n:"т",m:"ь",",":"б",".":"ю"};
const EN_FROM_RU = Object.fromEntries(Object.entries(RU_KEYS).map(([en, ru]) => [ru, en]));
const TRANSLIT = {а:"a",б:"b",в:"v",г:"g",д:"d",е:"ye",ё:"yo",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"shch",ъ:"",ы:"y",ь:"'",э:"e",ю:"yu",я:"ya"};
const translit = s => [...s].map(c => TRANSLIT[c.toLowerCase()] ?? c).join("");

const Cd = (h, p, ex) => ({h, p, ex: ex || []});                 // explanation card: heading, text, examples [[target, meaning]]
const Ch = (q, opts, a, why) => ({type:"choose", q, opts, a, why}); // pick the right answer
const Li = (sayText, opts, a, why) => ({type:"listen", say: sayText, opts, a, why}); // listen, then pick
const Ty = (q, a, why) => ({type:"type", q, a, why});              // type the answer (a can be a list)
const Or = (sentence, mean, why) => ({type:"order", sentence, mean, why}); // put words in order
const VKEY = k => Object.keys(VOCAB).find(x => x.startsWith(k + "|"));

const PATH_RU2EN = [
 {u:"Буквы", steps:[
  {k:"letters", t:"Буквы A B C D E", letters:["A","B","C","D","E"], intro:"В английском алфавите 26 букв. Учим по 5. У каждой буквы есть имя (как она называется) и звук (как она читается в словах). Нажимай 🔊 и повторяй вслух."},
  {k:"letters", t:"Буквы F G H I J", letters:["F","G","H","I","J"], intro:"Следующие 5 букв. Обрати внимание: буква I называется «ай», а G — «джи»."},
  {k:"letters", t:"Буквы K L M N O", letters:["K","L","M","N","O"], intro:"Эти буквы похожи на русские К, Л, М, Н, О — но запоминай английские имена: эл, эм, эн, оу."},
  {k:"letters", t:"Буквы P Q R S T", letters:["P","Q","R","S","T"], intro:"Осторожно: английская P читается как русская «п», а не «р». Буква R — это «р»."},
  {k:"letters", t:"Буквы U V W X Y Z", letters:["U","V","W","X","Y","Z"], intro:"Последние 6 букв. W — единственная буква из трёх слогов: «дабл-ю» (двойная u)."},
  {k:"rule", t:"Большие и маленькие буквы", cards:[
   Cd("Две формы", "У каждой буквы есть большая (A) и маленькая (a) форма. Большая — в начале предложения и в именах.", [["Anna is my friend.","Анна — мой друг."]]),
   Cd("I — всегда большая", "Слово I («я») всегда пишется с большой буквы, даже в середине предложения.", [["Yes, I can.","Да, я могу."]])],
   ex:[Ch("Маленькая форма буквы G:", ["g","q","j","y"], "g", "G и g — одна буква. q, j, y — другие."),
       Ch("Как правильно?", ["Yes, I can.","Yes, i can."], "Yes, I can.", "«I» (я) всегда с большой буквы."),
       Ch("Где нужна большая буква?", ["london","London"], "London", "Названия городов и имена — с большой буквы."),
       Ty("Напиши маленькую форму буквы B", "b", "B → b.")]}
 ]},
 {u:"Первое чтение", steps:[
  {k:"rule", t:"Короткие гласные", cards:[
   Cd("Гласные в коротких словах", "В коротком слове (согласная + гласная + согласная) гласные читаются коротко:", [["cat","кэт — a звучит как «э»"],["bed","бэд — e как «э»"],["sit","сит — i как «и»"],["hot","хот — o как «о»"],["cup","кап — u как «а»!"]]),
   Cd("Главное отличие", "Самое непривычное: u в коротком слове звучит как «а» (cup = кап, sun = сан, bus = бас).", [["sun","сан"],["bus","бас"]])],
   ex:[Li("cat", ["cat","cut","cot"], "cat", "a в коротком слове = «э»: кэт."),
       Li("cup", ["cap","cup","cop"], "cup", "u в коротком слове = «а»: кап."),
       Li("sit", ["set","sat","sit"], "sit", "i = «и»: сит."),
       Ch("Как читается «sun»?", ["сан","сун","сюн"], "сан", "u в коротком слове звучит как «а»."),
       Ch("Как читается «bed»?", ["бэд","бид","буд"], "бэд", "e в коротком слове = «э».")]},
  {k:"rule", t:"Немая e на конце", cards:[
   Cd("Волшебная e", "Если слово кончается на e, сама e НЕ читается, но меняет гласную перед ней: гласная читается как своё имя (a = эй, i = ай, o = оу, u = ю).", [["cap → cape","кэп → кэйп"],["kit → kite","кит → кайт"],["hop → hope","хоп → хоуп"],["cut → cute","кат → кьют"]])],
   ex:[Li("kite", ["kit","kite"], "kite", "e на конце: i читается как «ай» — кайт."),
       Li("hope", ["hop","hope"], "hope", "e на конце: o читается как «оу» — хоуп."),
       Ch("Как читается «time»?", ["тайм","тим","тайми"], "тайм", "i = «ай», а e на конце не читается."),
       Ch("Как читается «name»?", ["нэйм","нам","намэ"], "нэйм", "a = «эй», e не читается.")]},
  {k:"rule", t:"sh, ch, th", cards:[
   Cd("Две буквы — один звук", "sh = «ш», ch = «ч», th = звук, которого нет в русском: кончик языка между зубами и выдох.", [["ship","шип"],["chair","чэа"],["think","синк (язык между зубами)"],["this","зис (язык между зубами)"]])],
   ex:[Li("ship", ["ship","chip","sip"], "ship", "sh = «ш»."),
       Li("chip", ["ship","chip"], "chip", "ch = «ч»."),
       Ch("Какой звук в «fish»?", ["ш","ч","с"], "ш", "sh на конце — тоже «ш»: фиш."),
       Ch("Как произнести th?", ["язык между зубами","как русское «т»","как «ф»"], "язык между зубами", "th — особый звук: кончик языка между зубами.")]},
  {k:"rule", t:"ee, oo, ay, igh", cards:[
   Cd("Частые сочетания", "Эти пары букв встречаются постоянно:", [["see, tree","ee = долгое «и»"],["moon, food","oo = долгое «у»"],["day, play","ay = «эй»"],["night, light","igh = «ай» (gh не читается)"]])],
   ex:[Li("moon", ["moon","man","mean"], "moon", "oo = долгое «у»: мун."),
       Ch("Как читается «day»?", ["дэй","дай","дау"], "дэй", "ay = «эй»."),
       Ch("Как читается «night»?", ["найт","нигхт","нит"], "найт", "igh = «ай», gh молчит."),
       Ch("Как читается «tree»?", ["три","трэ","трээ"], "три", "ee = долгое «и».")]}
 ]},
 {u:"Слова и первые фразы", steps:[
  {k:"words", t:"Привет и пока", topic:"greetings", from:0, to:6, intro:"Первые слова, с которых начинается любой разговор."},
  {k:"words", t:"Вежливые фразы", topic:"greetings", from:6, to:12, intro:"Фразы для знакомства и вежливого разговора."},
  {k:"rule", t:"I am — «я есть»", cards:[
   Cd("Нужен глагол am", "По-русски: «Я ученик». По-английски так нельзя — нужен глагол-связка am: I am a student. Слово am не переводится, но без него предложение неправильное.", [["I am Anna.","Я Анна."],["I am happy.","Я счастлив."],["I am at home.","Я дома."]])],
   ex:[Ty("I ___ happy. (вставь слово)", "am", "После I всегда am."),
       Ch("Как сказать «Я дома»?", ["I at home.","I am at home.","Me am at home."], "I am at home.", "Нужно I + am."),
       Or("I am a student", "Я ученик.", "Порядок: I + am + кто."),
       Ch("Как сказать «Я Макс»?", ["I am Max.","I Max.","Am I Max."], "I am Max.", "I am + имя.")]},
  {k:"rule", t:"you / we / they are", cards:[
   Cd("are", "С you (ты, вы), we (мы) и they (они) используем are.", [["You are my friend.","Ты мой друг."],["We are at school.","Мы в школе."],["They are cold.","Им холодно."]])],
   ex:[Ty("We ___ friends.", "are", "we → are."),
       Ty("You ___ funny.", "are", "you → are."),
       Ch("They ___ at home.", ["am","is","are"], "are", "they → are."),
       Or("they are my friends", "Они мои друзья.", "they + are + ...")]},
  {k:"rule", t:"he / she / it is", cards:[
   Cd("is", "С he (он), she (она) и it (оно — вещи и животные) используем is.", [["He is tall.","Он высокий."],["She is my sister.","Она моя сестра."],["It is cold.","Холодно."]]),
   Cd("Итог", "I am · you / we / they are · he / she / it is.", [])],
   ex:[Ch("She ___ nice.", ["am","is","are"], "is", "she → is."),
       Ty("It ___ big.", "is", "it → is."),
       Ch("My cat ___ black.", ["is","are","am"], "is", "my cat = it → is."),
       Ch("Tom and Anna ___ friends.", ["is","are"], "are", "Двое = they → are."),
       Or("he is my brother", "Он мой брат.", "he + is + ...")]},
  {k:"rule", t:"Короткие формы: I'm, you're, he's", cards:[
   Cd("Сокращения", "В разговоре am, are, is сокращают с апострофом ('):", [["I am → I'm","айм"],["you are → you're","юа"],["he is → he's","хиз"],["it is → it's","итс"]])],
   ex:[Ch("I am = ?", ["I'm","Im","I'am"], "I'm", "Апостроф стоит вместо буквы a."),
       Ch("she is = ?", ["she's","shes","she'is"], "she's", "is → 's."),
       Ty("they are = ? (короткая форма)", ["they're"], "are → 're."),
       Ch("it's = ?", ["it is","it has","its"], "it is", "it's — это it is.")]}
 ]},
 {u:"Числа и вопросы", steps:[
  {k:"words", t:"Числа 1–6", topic:"numbers", from:0, to:6, intro:"Числа нужны везде: время, деньги, возраст."},
  {k:"words", t:"Числа 7–100", topic:"numbers", from:6, to:12, intro:"Ещё числа. twenty = 20, hundred = 100."},
  {k:"rule", t:"Вопросы: Are you…? Is it…?", cards:[
   Cd("Меняем местами", "Чтобы спросить, поставь am / is / are ПЕРЕД тем, о ком говоришь.", [["You are happy. → Are you happy?","Ты счастлив?"],["It is big. → Is it big?","Он большой?"]]),
   Cd("Короткие ответы", "Yes, I am. / No, I'm not. Yes, it is. / No, it isn't.", [])],
   ex:[Or("are you ready", "Ты готов?", "Вопрос: are + you + ..."),
       Ch("Как спросить «Она дома?»", ["Is she at home?","She is at home?","Are she at home?"], "Is she at home?", "is перед she."),
       Ty("___ they your friends?", "are", "they → are, в начале вопроса."),
       Ch("Is it cold? — Yes, it ___.", ["is","are","am"], "is", "Короткий ответ повторяет is.")]},
  {k:"rule", t:"Отрицание: not", cards:[
   Cd("Добавь not", "Чтобы сказать «не», добавь not после am / is / are. Коротко: isn't, aren't, I'm not.", [["I am not tired. (I'm not tired.)","Я не устал."],["He is not here. (He isn't here.)","Его здесь нет."],["We are not late. (We aren't late.)","Мы не опоздали."]])],
   ex:[Ty("She ___ not hungry.", "is", "she → is + not."),
       Ch("is not = ?", ["isn't","isnt","is'nt"], "isn't", "Апостроф вместо o: isn't."),
       Ch("Как сказать «Я не устал»?", ["I'm not tired.","I amn't tired.","I not tired."], "I'm not tired.", "С I говорят только I'm not."),
       Or("they are not here", "Их здесь нет.", "are + not.")]}
 ]},
 {u:"Цвета и артикли", steps:[
  {k:"words", t:"Цвета 1", topic:"colors", from:0, to:6},
  {k:"words", t:"Цвета 2", topic:"colors", from:6, to:12},
  {k:"rule", t:"a и an", cards:[
   Cd("Какой-то один", "Перед одним предметом ставят a: a cat, a book. Это значит «какой-то один». По-русски не переводится.", [["I have a dog.","У меня есть собака."]]),
   Cd("an перед гласным звуком", "Если слово начинается с гласного звука (a, e, i, o, u), говорят an — так легче произносить.", [["an apple","яблоко"],["an egg","яйцо"],["an hour","час (h не читается!)"]])],
   ex:[Ch("___ apple", ["a","an"], "an", "apple начинается с гласной → an."),
       Ch("___ book", ["a","an"], "a", "book — с согласной → a."),
       Ch("___ egg", ["a","an"], "an", "egg — с гласной → an."),
       Ty("I have ___ cat.", "a", "cat — согласная → a.")]},
  {k:"rule", t:"the", cards:[
   Cd("Тот самый", "the ставят, когда понятно, о каком именно предмете речь: он уже упоминался, или он один такой.", [["I have a dog. The dog is big.","Сначала a (какая-то), потом the (та самая)."],["the sun, the moon","Солнце одно — the."]])],
   ex:[Ch("Look at ___ sun!", ["a","the"], "the", "Солнце одно — the."),
       Ch("I see a cat. ___ cat is black.", ["A","The"], "The", "Кошку уже упомянули → the."),
       Ch("Open ___ door, please. (в комнате одна дверь)", ["a","the"], "the", "Понятно, какая дверь → the.")]}
 ]},
 {u:"Семья и много предметов", steps:[
  {k:"words", t:"Семья 1", topic:"family", from:0, to:6},
  {k:"words", t:"Семья 2", topic:"family", from:6, to:12},
  {k:"rule", t:"Много: -s и -es", cards:[
   Cd("Добавь -s", "Чтобы сказать «много», чаще всего добавь -s.", [["cat → cats","кошки"],["book → books","книги"]]),
   Cd("-es и исключения", "После s, sh, ch, x добавь -es. Есть исключения, их надо выучить.", [["box → boxes","коробки"],["bus → buses","автобусы"],["man → men","мужчины"],["child → children","дети"]])],
   ex:[Ty("one dog, two ___", "dogs", "dog + s."),
       Ty("one box, two ___", "boxes", "После x → es."),
       Ch("one child, two ___", ["childs","children","childes"], "children", "Исключение: children."),
       Ch("one man, three ___", ["mans","men","manes"], "men", "Исключение: men.")]},
  {k:"rule", t:"this, that, these, those", cards:[
   Cd("Близко и далеко", "this — этот (близко), that — тот (далеко). Для многих: these (эти), those (те).", [["This is my pen.","Это моя ручка (здесь)."],["That is your house.","Вон тот — твой дом."],["These are my friends.","Это мои друзья."]])],
   ex:[Ch("___ is my phone. (в руке)", ["This","That"], "This", "Близко → this."),
       Ch("___ are my shoes. (здесь, много)", ["This","These"], "These", "Много и близко → these."),
       Ch("Look at ___ bird! (далеко на дереве)", ["this","that"], "that", "Далеко → that.")]}
 ]},
 {u:"Еда и «у меня есть»", steps:[
  {k:"words", t:"Еда 1", topic:"food", from:0, to:6},
  {k:"words", t:"Еда 2", topic:"food", from:6, to:12},
  {k:"rule", t:"have / has — у меня есть", cards:[
   Cd("«У меня есть» = I have", "По-английски говорят «я имею»: I have a cat. С he / she / it — has.", [["I have a brother.","У меня есть брат."],["She has a red bag.","У неё красная сумка."]])],
   ex:[Ty("I ___ a dog.", "have", "I → have."),
       Ch("He ___ a car.", ["have","has"], "has", "he → has."),
       Ch("We ___ two cats.", ["have","has"], "have", "we → have."),
       Or("she has a new phone", "У неё новый телефон.", "she + has + что.")]},
  {k:"rule", t:"my, your, his, her", cards:[
   Cd("Чей?", "my — мой, your — твой/ваш, his — его, her — её, our — наш, their — их. Они не меняются по родам, как в русском.", [["my mother, my father","моя мама, мой папа"],["his book","его книга"],["her cat","её кошка"]])],
   ex:[Ch("This is ___ pen. (моя)", ["my","me","I"], "my", "Мой/моя = my."),
       Ch("Tom has a dog. ___ dog is big.", ["Her","His"], "His", "Том — он → his."),
       Ch("Anna loves ___ cat.", ["his","her"], "her", "Анна — она → her.")]}
 ]},
 {u:"Дом и действия", steps:[
  {k:"words", t:"Дом", topic:"home", from:0, to:6},
  {k:"words", t:"Глаголы 1", topic:"verbs", from:0, to:6},
  {k:"words", t:"Глаголы 2", topic:"verbs", from:6, to:12},
  {k:"rule", t:"I play — я играю", cards:[
   Cd("Обычные действия", "Для того, что делаешь обычно или всегда, глагол стоит как есть: I play, you play, we play, they play.", [["I play games.","Я играю в игры."],["We eat bread.","Мы едим хлеб."]])],
   ex:[Or("I like apples", "Я люблю яблоки.", "Я + like + что."),
       Ty("They ___ (play) football.", "play", "they → play без изменений."),
       Ch("Как сказать «Мы читаем книги»?", ["We read books.","We reads books.","We are read books."], "We read books.", "we → read.")]},
  {k:"rule", t:"He plays — он играет", cards:[
   Cd("Добавь -s для he / she / it", "Самое важное правило: с he, she, it к глаголу добавляем -s.", [["He plays.","Он играет."],["She likes cats.","Ей нравятся кошки."],["It eats fish.","Оно ест рыбу."]]),
   Cd("-es", "После s, sh, ch, x, o добавь -es: he watches, she goes.", [])],
   ex:[Ty("He ___ (play) games.", "plays", "he → +s."),
       Ch("She ___ milk.", ["like","likes"], "likes", "she → +s."),
       Ty("My dad ___ (go) to work.", "goes", "go → goes (после o + es)."),
       Ch("I ___ music.", ["love","loves"], "love", "С I без -s.")]},
  {k:"rule", t:"Вопросы с do и don't", cards:[
   Cd("do в начале", "Вопрос об обычных действиях начинается с Do: Do you like cats? Ответ: Yes, I do. / No, I don't.", [["Do you play games?","Ты играешь в игры?"]]),
   Cd("don't = не", "Отрицание: don't (do not) перед глаголом.", [["I don't know.","Я не знаю."],["We don't eat meat.","Мы не едим мясо."]])],
   ex:[Ty("___ you speak English?", "do", "Вопрос начинается с Do."),
       Ch("Как сказать «Я не знаю»?", ["I don't know.","I not know.","I no know."], "I don't know.", "don't + глагол."),
       Or("do you like pizza", "Ты любишь пиццу?", "Do + you + глагол.")]},
  {k:"rule", t:"does и doesn't", cards:[
   Cd("Для he / she / it", "С he, she, it вместо do — does, а глагол теряет -s!", [["Does he play?","Он играет?"],["She doesn't like milk.","Она не любит молоко."]])],
   ex:[Ch("___ she like music?", ["Do","Does"], "Does", "she → does."),
       Ch("He doesn't ___ fish.", ["eat","eats"], "eat", "После doesn't глагол без -s."),
       Ty("My cat ___ (не) like water.", ["doesn't","does not"], "cat = it → doesn't.")]}
 ]},
 {u:"Умения и место", steps:[
  {k:"words", t:"Прилагательные", topic:"adjectives", from:0, to:6},
  {k:"rule", t:"can / can't", cards:[
   Cd("Умею, могу", "can + глагол: I can swim. Не умею: can't. can одинаковый для всех (he can, без -s).", [["I can swim.","Я умею плавать."],["She can't drive.","Она не умеет водить."],["Can you help me?","Можешь помочь?"]])],
   ex:[Ch("He ___ play the piano.", ["can","cans"], "can", "can не меняется."),
       Ty("I ___ (не умею) fly.", ["can't","cannot"], "не умею = can't."),
       Or("can you help me", "Можешь мне помочь?", "Can + you + глагол.")]},
  {k:"rule", t:"there is / there are", cards:[
   Cd("Где-то есть", "Чтобы сказать «где-то есть что-то», начинай с There is (одно) или There are (много).", [["There is a cat in the room.","В комнате есть кошка."],["There are two books on the table.","На столе две книги."]])],
   ex:[Ch("There ___ a park near my house.", ["is","are"], "is", "Один парк → is."),
       Ch("There ___ many people here.", ["is","are"], "are", "Много → are."),
       Ty("There ___ a key on the table.", "is", "Один ключ → is.")]}
 ]},
 {u:"Время и прошлое", steps:[
  {k:"words", t:"Время", topic:"time", from:0, to:6},
  {k:"rule", t:"Прямо сейчас: I am playing", cards:[
   Cd("-ing", "То, что происходит прямо сейчас: am / is / are + глагол с -ing.", [["I am reading.","Я читаю (сейчас)."],["She is playing.","Она играет (сейчас)."],["Look! It is raining.","Смотри! Идёт дождь."]])],
   ex:[Ty("I am ___ (read) a book now.", "reading", "read + ing."),
       Ch("She ___ sleeping.", ["is","are"], "is", "she → is."),
       Ch("Что происходит сейчас?", ["They are eating.","They eat every day."], "They are eating.", "Сейчас → are + -ing.")]},
  {k:"rule", t:"Вчера: played", cards:[
   Cd("-ed", "О прошлом: к обычным глаголам добавь -ed. Для всех одинаково.", [["I played games yesterday.","Я играл вчера."],["She watched a film.","Она смотрела фильм."]])],
   ex:[Ty("Yesterday I ___ (play) football.", "played", "play + ed."),
       Ty("We ___ (watch) TV.", "watched", "watch + ed."),
       Ch("She ___ her mom yesterday.", ["helps","helped"], "helped", "yesterday → прошлое → -ed.")]},
  {k:"rule", t:"Неправильные: went, saw, ate", cards:[
   Cd("Нужно выучить", "Самые частые глаголы в прошлом меняются по-своему:", [["go → went","идти → ходил"],["see → saw","видеть → видел"],["eat → ate","есть → ел"],["have → had","иметь → имел"],["be → was / were","быть → был / были"]])],
   ex:[Ch("Yesterday I ___ to school.", ["goed","went"], "went", "go → went."),
       Ch("We ___ a big dog.", ["saw","seed"], "saw", "see → saw."),
       Ty("I ___ (be) tired yesterday.", "was", "I → was."),
       Ty("They ___ (be) at home.", "were", "they → were.")]},
  {k:"rule", t:"Порядок слов", cards:[
   Cd("Строгий порядок", "В английском порядок слов не меняют: кто → что делает → что → где → когда.", [["I play games at home every day.","Я каждый день играю дома в игры."]]),
   Cd("Вопросительные слова", "what — что, where — где, when — когда, why — почему, who — кто, how — как. Они идут в начало вопроса.", [["Where do you live?","Где ты живёшь?"]])],
   ex:[Or("we went to the park yesterday", "Мы ходили в парк вчера.", "кто → действие → куда → когда."),
       Or("where do you live", "Где ты живёшь?", "Where + do + you + live."),
       Ch("«почему» = ?", ["why","who","what"], "why", "why = почему.")]}
 ]}
];

const PATH_EN2RU = [
 {u:"The Russian alphabet", steps:[
  {k:"letters", t:"Easy letters: А К М О Т", letters:["А","К","М","О","Т"], intro:"Good news: these 5 letters look AND sound almost like English. That's a quick start!"},
  {k:"letters", t:"Tricky look-alikes: В Е Н Р С У Х", letters:["В","Е","Н","Р","С","У","Х"], intro:"Careful! These look like English letters but sound different: В = V, Н = N, Р = R, С = S, У = OO, Х = KH."},
  {k:"letters", t:"New letters 1: Б Г Д З И Л П", letters:["Б","Г","Д","З","И","Л","П"], intro:"These are new shapes, but their sounds are easy: B, G, D, Z, EE, L, P."},
  {k:"letters", t:"New letters 2: Ж Ф Ц Ч Ш Щ Й", letters:["Ж","Ф","Ц","Ч","Ш","Щ","Й"], intro:"Sounds like ZH, F, TS, CH, SH, a long soft SHCH, and a short Y."},
  {k:"letters", t:"Vowels and signs: Ё Ю Я Э Ы Ь Ъ", letters:["Ё","Ю","Я","Э","Ы","Ь","Ъ"], intro:"Ё Ю Я add a Y sound (yo, yu, ya). Э is E as in 'met'. Ы is special. Ь and Ъ have no sound - they change other letters."},
  {k:"rule", t:"Stress", cards:[
   Cd("One strong syllable", "Every Russian word has ONE stressed syllable, said louder and longer. Textbooks mark it with an accent: мАма, молокО. The stress has to be learned with each word.", [["мама","MA-ma"],["вода","va-DA"],["молоко","ma-la-KO"]])],
   ex:[Ch("Where is the stress in вода (water)?", ["ВОда","воДА"], "воДА", "It's va-DA - the second syllable."),
       Ch("How many stressed syllables does a word have?", ["one","two","all of them"], "one", "Always exactly one.")]}
 ]},
 {u:"Reading", steps:[
  {k:"rule", t:"Unstressed О sounds like A", cards:[
   Cd("Akanye", "When О is NOT stressed, it sounds like 'a'. That's why молоко sounds like 'malako'.", [["молоко","ma-la-KO"],["хорошо","kha-ra-SHO"],["окно","ak-NO"]])],
   ex:[Ch("How is молоко spelled?", ["молоко","малака"], "молоко", "It's spelled with О, even though you hear A."),
       Ch("How does окно (window) sound?", ["akno","okno","ukno"], "akno", "The first О isn't stressed → 'a'.")]},
  {k:"rule", t:"Е Ё Ю Я", cards:[
   Cd("The Y-vowels", "At the start of a word or after a vowel, Е Ё Ю Я say 'ye yo yu ya'. After a consonant, they make it soft instead.", [["ель","yel"],["юла","yu-LA"],["яблоко","YAB-la-ka"]])],
   ex:[Ch("Я sounds like:", ["ya","a","yo"], "ya", "Я = ya at the start of a word."),
       Li("юла", ["юла","ула"], "юла", "Ю = yu.")]},
  {k:"rule", t:"Final letters lose their voice", cards:[
   Cd("Devoicing", "At the end of a word, Б В Г Д Ж З sound like П Ф К Т Ш С.", [["хлеб","khlep (bread)"],["город","GO-rat (city)"],["нож","nosh (knife)"]])],
   ex:[Ch("How does хлеб (bread) end?", ["-p","-b"], "-p", "Final Б sounds like П."),
       Ch("How does город end?", ["-t","-d"], "-t", "Final Д sounds like Т.")]},
  {k:"rule", t:"Ь and Ы", cards:[
   Cd("Soft sign Ь", "Ь has no sound. It makes the letter before it soft (tongue pressed up toward the roof of your mouth).", [["мать","mat' (mother)"],["соль","sol' (salt)"]]),
   Cd("Ы", "Say 'i' but pull your tongue back. It never starts a word.", [["мы","we"],["сыр","cheese"]])],
   ex:[Ch("Does Ь have its own sound?", ["no","yes"], "no", "It only softens the letter before it."),
       Li("мы", ["мы","ми"], "мы", "Ы is deeper than И.")]}
 ]},
 {u:"First words", steps:[
  {k:"words", t:"Hello and goodbye", topic:"greetings", from:0, to:6, intro:"The words every conversation starts with."},
  {k:"words", t:"Polite phrases", topic:"greetings", from:6, to:12},
  {k:"rule", t:"No 'am / is / are'", cards:[
   Cd("Just skip it", "Russian drops am/is/are in the present. 'I am a student' = Я студент (literally 'I student'). There are no words for 'a' or 'the' either!", [["Я студент.","I am a student."],["Он дома.","He is at home."],["Это кот.","This is a cat."]])],
   ex:[Ch("'I am happy' in Russian:", ["Я счастлив.","Я есть счастлив."], "Я счастлив.", "No 'am' needed."),
       Ty("'This is' = ___ (one word)", "это", "Это = this is."),
       Or("он мой брат", "He is my brother.", "No word for 'is'.")]},
  {k:"rule", t:"Pronouns", cards:[
   Cd("Who", "я = I, ты = you (friend), вы = you (polite or many), он = he, она = she, оно = it, мы = we, они = they.", [["Я дома.","I am at home."],["Вы готовы?","Are you ready? (polite)"]])],
   ex:[Ty("we = ___", "мы", "мы = we."),
       Ch("they = ?", ["они","оно","она"], "они", "они = they."),
       Ch("Polite 'you' to a teacher:", ["вы","ты"], "вы", "Use вы for adults you don't know well.")]}
 ]},
 {u:"Numbers and gender", steps:[
  {k:"words", t:"Numbers 1-6", topic:"numbers", from:0, to:6},
  {k:"words", t:"Numbers 7-100", topic:"numbers", from:6, to:12},
  {k:"rule", t:"Masculine, feminine, neuter", cards:[
   Cd("Every noun has a gender", "Look at the ending: a consonant = masculine (дом, кот). -а or -я = feminine (мама, земля). -о or -е = neuter (окно, море).", [["стол","masculine"],["книга","feminine"],["окно","neuter"]])],
   ex:[Ch("кот (cat) is:", ["masculine","feminine","neuter"], "masculine", "Ends in a consonant."),
       Ch("школа (school) is:", ["masculine","feminine","neuter"], "feminine", "Ends in -а."),
       Ch("море (sea) is:", ["masculine","feminine","neuter"], "neuter", "Ends in -е.")]},
  {k:"rule", t:"My: мой, моя, моё", cards:[
   Cd("Matches the gender", "'My' changes with the noun: мой (m), моя (f), моё (n), мои (plural).", [["мой дом","my house"],["моя мама","my mom"],["моё окно","my window"],["мои друзья","my friends"]])],
   ex:[Ch("___ кот", ["мой","моя","моё"], "мой", "кот is masculine."),
       Ch("___ сестра", ["мой","моя","моё"], "моя", "сестра is feminine."),
       Ty("___ окно (my window)", "моё", "окно is neuter.")]}
 ]},
 {u:"Colors and questions", steps:[
  {k:"words", t:"Colors 1", topic:"colors", from:0, to:6},
  {k:"words", t:"Colors 2", topic:"colors", from:6, to:12},
  {k:"rule", t:"Asking questions", cards:[
   Cd("Just raise your voice", "A yes/no question uses the same words - only your voice goes up at the end.", [["Ты дома.","You're at home."],["Ты дома?","Are you at home?"]]),
   Cd("Question words", "что = what, где = where, кто = who, когда = when, почему = why, как = how.", [["Где ты?","Where are you?"],["Что это?","What is this?"]])],
   ex:[Ty("where = ___", "где", "где = where."),
       Ch("'What is this?'", ["Что это?","Где это?"], "Что это?", "что = what."),
       Ty("who = ___", "кто", "кто = who.")]},
  {k:"rule", t:"Not: не", cards:[
   Cd("не before the word", "Put не right before the word you're negating.", [["Я не знаю.","I don't know."],["Это не кот.","This isn't a cat."]])],
   ex:[Ty("'I don't know' = Я ___ знаю", "не", "не goes before the verb."),
       Or("я не люблю молоко", "I don't like milk.", "не before люблю.")]}
 ]},
 {u:"Family and plurals", steps:[
  {k:"words", t:"Family 1", topic:"family", from:0, to:6},
  {k:"words", t:"Family 2", topic:"family", from:6, to:12},
  {k:"rule", t:"Plurals", cards:[
   Cd("-ы / -и / -а", "Masculine and -а words usually add -ы (кот → коты, мама → мамы). After к г х ж ш ч щ, and for -я words, use -и (книга → книги). Neuter -о → -а (окно → окна).", [["коты","cats"],["книги","books"],["окна","windows"]])],
   ex:[Ty("стол → ___ (tables)", "столы", "Consonant + ы."),
       Ch("книга → ?", ["книгы","книги"], "книги", "After г use и."),
       Ty("окно → ___", "окна", "-о → -а.")]}
 ]},
 {u:"Verbs", steps:[
  {k:"words", t:"Verbs 1", topic:"verbs", from:0, to:6},
  {k:"words", t:"Verbs 2", topic:"verbs", from:6, to:12},
  {k:"rule", t:"I read, you read, he reads", cards:[
   Cd("Endings change", "Take читать (to read): drop -ть, add an ending: я читаю, ты читаешь, он/она читает.", [["я читаю","I read"],["ты читаешь","you read"],["она читает","she reads"]])],
   ex:[Ty("я ___ (читать)", "читаю", "я → -ю."),
       Ch("он ___ (играть)", ["играю","играет","играешь"], "играет", "он → -ет."),
       Ty("ты ___ (знать)", "знаешь", "ты → -ешь.")]},
  {k:"rule", t:"We read, you read, they read", cards:[
   Cd("More endings", "мы читаем, вы читаете, они читают.", [["мы читаем","we read"],["вы читаете","you read"],["они читают","they read"]])],
   ex:[Ty("мы ___ (играть)", "играем", "мы → -ем."),
       Ch("они ___ (знать)", ["знают","знаем"], "знают", "они → -ют."),
       Ty("вы ___ (читать)", "читаете", "вы → -ете.")]},
  {k:"rule", t:"I have: у меня есть", cards:[
   Cd("'At me there is'", "Russian says 'у меня есть' = 'at me there is'. у тебя есть = you have, у него = he has, у неё = she has.", [["У меня есть кот.","I have a cat."],["У неё есть брат.","She has a brother."]])],
   ex:[Ch("'I have a dog' =", ["У меня есть собака.","Я имею собака."], "У меня есть собака.", "Use у меня есть."),
       Ty("'You have' (friend) = у ___ есть", "тебя", "у тебя = you have.")]}
 ]},
 {u:"Past and more", steps:[
  {k:"words", t:"Time", topic:"time", from:0, to:6},
  {k:"rule", t:"Past tense", cards:[
   Cd("-л / -ла / -ли", "Drop -ть and add: -л (he), -ла (she), -ло (it), -ли (they/we/you). It shows the gender, not the person!", [["он играл","he played"],["она играла","she played"],["они играли","they played"]])],
   ex:[Ty("she read = она ___", "читала", "читать → читала."),
       Ch("he knew = он ___", ["знал","знала"], "знал", "He → -л."),
       Ty("they did = они ___ (делать)", "делали", "They → -ли.")]},
  {k:"rule", t:"The object: -а → -у", cards:[
   Cd("Accusative", "When a feminine -а word is the object, -а becomes -у (and -я becomes -ю).", [["Я читаю книгу.","I'm reading a book."],["Я люблю маму.","I love mom."]])],
   ex:[Ty("Я пью ___ (вода)", "воду", "вода → воду."),
       Ch("Я вижу ___ (кошка)", ["кошка","кошку"], "кошку", "Object → -у."),
       Ch("Я вижу ___ (дом)", ["дом","дому"], "дом", "Masculine things don't change.")]},
  {k:"rule", t:"Adjectives match", cards:[
   Cd("Same gender as the noun", "новый дом (m), новая книга (f), новое окно (n), новые друзья (plural).", [["красный мяч","red ball"],["красная машина","red car"]])],
   ex:[Ch("___ машина (new car)", ["новый","новая","новое"], "новая", "машина is feminine."),
       Ch("___ дом (big house)", ["большой","большая"], "большой", "дом is masculine.")]}
 ]}
];

