// Built-in beginner content for the default languages: writing system / pronunciation,
// a phrasebook, starter vocabulary, short grammar lessons and number words (0–99).
// Entries are [text, romanisation or '', meaning].

export type Entry = [string, string, string]
export interface Group {
  title: string
  items: Entry[]
}
export interface Lesson {
  title: string
  body: string[]
  examples: Entry[]
}
export interface ScriptSet {
  title: string
  note: string
  quiz: 'reading' | 'meaning' // what the quiz asks for
  items: Entry[] // [character(s), sound, example or meaning]
}
export interface Course {
  tts: string // speech language tag
  scripts: ScriptSet[]
  phrases: Group[]
  vocab: Group[]
  lessons: Lesson[]
  number: (n: number) => { text: string; roman: string }
  genders?: { label: string; articles: string[] } // noun gender drill (de/fr)
}

// ---------- Japanese ----------

const kana = (chars: string, romaji: string): Entry[] => {
  const c = [...chars]
  const r = romaji.split(' ')
  return c.map((ch, i) => [ch, r[i], ''])
}

const JA_DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九']
const JA_ROMAN = ['', 'ichi', 'ni', 'san', 'yon', 'go', 'roku', 'nana', 'hachi', 'kyū']

const ja: Course = {
  tts: 'ja-JP',
  scripts: [
    {
      title: 'Hiragana',
      note: 'The basic Japanese alphabet (46 sounds). Learn these first — every word can be written in hiragana.',
      quiz: 'reading',
      items: [
        ...kana('あいうえお', 'a i u e o'),
        ...kana('かきくけこ', 'ka ki ku ke ko'),
        ...kana('さしすせそ', 'sa shi su se so'),
        ...kana('たちつてと', 'ta chi tsu te to'),
        ...kana('なにぬねの', 'na ni nu ne no'),
        ...kana('はひふへほ', 'ha hi fu he ho'),
        ...kana('まみむめも', 'ma mi mu me mo'),
        ...kana('やゆよ', 'ya yu yo'),
        ...kana('らりるれろ', 'ra ri ru re ro'),
        ...kana('わをん', 'wa wo n')
      ]
    },
    {
      title: 'Hiragana with ゛ and ゜',
      note: 'Two small marks change the sound: ゛ (dakuten) makes it voiced (k→g, s→z, t→d, h→b), ゜ (handakuten) turns h into p.',
      quiz: 'reading',
      items: [
        ...kana('がぎぐげご', 'ga gi gu ge go'),
        ...kana('ざじずぜぞ', 'za ji zu ze zo'),
        ...kana('だぢづでど', 'da ji zu de do'),
        ...kana('ばびぶべぼ', 'ba bi bu be bo'),
        ...kana('ぱぴぷぺぽ', 'pa pi pu pe po')
      ]
    },
    {
      title: 'Katakana',
      note: 'The same sounds, used for foreign words and names (コーヒー kōhī = coffee, テレビ terebi = TV).',
      quiz: 'reading',
      items: [
        ...kana('アイウエオ', 'a i u e o'),
        ...kana('カキクケコ', 'ka ki ku ke ko'),
        ...kana('サシスセソ', 'sa shi su se so'),
        ...kana('タチツテト', 'ta chi tsu te to'),
        ...kana('ナニヌネノ', 'na ni nu ne no'),
        ...kana('ハヒフヘホ', 'ha hi fu he ho'),
        ...kana('マミムメモ', 'ma mi mu me mo'),
        ...kana('ヤユヨ', 'ya yu yo'),
        ...kana('ラリルレロ', 'ra ri ru re ro'),
        ...kana('ワヲン', 'wa wo n'),
        ...kana('ガギグゲゴ', 'ga gi gu ge go'),
        ...kana('ザジズゼゾ', 'za ji zu ze zo'),
        ...kana('ダヂヅデド', 'da ji zu de do'),
        ...kana('バビブベボ', 'ba bi bu be bo'),
        ...kana('パピプペポ', 'pa pi pu pe po')
      ]
    }
  ],
  phrases: [
    {
      title: 'Basics',
      items: [
        ['こんにちは', 'konnichiwa', 'Hello'],
        ['おはようございます', 'ohayō gozaimasu', 'Good morning'],
        ['こんばんは', 'konbanwa', 'Good evening'],
        ['ありがとうございます', 'arigatō gozaimasu', 'Thank you'],
        ['すみません', 'sumimasen', 'Excuse me / Sorry'],
        ['はい', 'hai', 'Yes'],
        ['いいえ', 'iie', 'No'],
        ['お願いします', 'onegai shimasu', 'Please (when asking for something)'],
        ['わかりません', 'wakarimasen', "I don't understand"],
        ['さようなら', 'sayōnara', 'Goodbye'],
        ['じゃあね', 'jā ne', 'See you (casual)'],
        ['おやすみなさい', 'oyasumi nasai', 'Good night']
      ]
    },
    {
      title: 'Meeting people',
      items: [
        ['はじめまして', 'hajimemashite', 'Nice to meet you (first meeting)'],
        ['私は〇〇です', 'watashi wa ___ desu', 'I am ___'],
        ['お名前は何ですか？', 'o-namae wa nan desu ka?', "What's your name?"],
        ['よろしくお願いします', 'yoroshiku onegai shimasu', 'Pleased to meet you'],
        ['お元気ですか？', 'o-genki desu ka?', 'How are you?'],
        ['元気です', 'genki desu', "I'm fine"],
        ['日本語を勉強しています', 'nihongo o benkyō shite imasu', "I'm studying Japanese"]
      ]
    },
    {
      title: 'Food & drink',
      items: [
        ['いただきます', 'itadakimasu', 'Said before eating'],
        ['ごちそうさまでした', 'gochisōsama deshita', 'Said after eating (thanks for the meal)'],
        ['〇〇をください', '___ o kudasai', '___, please'],
        ['お水をください', 'o-mizu o kudasai', 'Water, please'],
        ['おいしい！', 'oishii!', 'Delicious!'],
        ['お会計お願いします', 'o-kaikei onegai shimasu', 'The bill, please']
      ]
    },
    {
      title: 'Getting around',
      items: [
        ['〇〇はどこですか？', '___ wa doko desu ka?', 'Where is ___?'],
        ['駅はどこですか？', 'eki wa doko desu ka?', 'Where is the station?'],
        ['トイレはどこですか？', 'toire wa doko desu ka?', 'Where is the toilet?'],
        ['いくらですか？', 'ikura desu ka?', 'How much is it?'],
        ['英語を話せますか？', 'eigo o hanasemasu ka?', 'Do you speak English?'],
        ['もう一度お願いします', 'mō ichido onegai shimasu', 'Once more, please'],
        ['ゆっくり話してください', 'yukkuri hanashite kudasai', 'Please speak slowly']
      ]
    }
  ],
  vocab: [
    {
      title: 'People',
      items: [
        ['私', 'watashi', 'I, me'],
        ['友達', 'tomodachi', 'friend'],
        ['家族', 'kazoku', 'family'],
        ['母', 'haha', '(my) mother'],
        ['父', 'chichi', '(my) father'],
        ['先生', 'sensei', 'teacher'],
        ['学生', 'gakusei', 'student'],
        ['人', 'hito', 'person']
      ]
    },
    {
      title: 'Time',
      items: [
        ['今日', 'kyō', 'today'],
        ['明日', 'ashita', 'tomorrow'],
        ['昨日', 'kinō', 'yesterday'],
        ['今', 'ima', 'now'],
        ['朝', 'asa', 'morning'],
        ['夜', 'yoru', 'night'],
        ['毎日', 'mainichi', 'every day'],
        ['時間', 'jikan', 'time, hours']
      ]
    },
    {
      title: 'Food & drink',
      items: [
        ['水', 'mizu', 'water'],
        ['お茶', 'ocha', 'tea'],
        ['ご飯', 'gohan', 'rice, a meal'],
        ['パン', 'pan', 'bread'],
        ['肉', 'niku', 'meat'],
        ['魚', 'sakana', 'fish'],
        ['野菜', 'yasai', 'vegetables'],
        ['卵', 'tamago', 'egg']
      ]
    },
    {
      title: 'Places',
      items: [
        ['家', 'ie', 'house, home'],
        ['学校', 'gakkō', 'school'],
        ['駅', 'eki', 'station'],
        ['店', 'mise', 'shop'],
        ['国', 'kuni', 'country'],
        ['部屋', 'heya', 'room']
      ]
    },
    {
      title: 'Verbs',
      items: [
        ['食べる', 'taberu', 'to eat'],
        ['飲む', 'nomu', 'to drink'],
        ['行く', 'iku', 'to go'],
        ['来る', 'kuru', 'to come'],
        ['見る', 'miru', 'to see, to watch'],
        ['聞く', 'kiku', 'to listen, to ask'],
        ['話す', 'hanasu', 'to speak'],
        ['読む', 'yomu', 'to read'],
        ['書く', 'kaku', 'to write'],
        ['する', 'suru', 'to do'],
        ['分かる', 'wakaru', 'to understand'],
        ['寝る', 'neru', 'to sleep']
      ]
    },
    {
      title: 'Describing',
      items: [
        ['大きい', 'ōkii', 'big'],
        ['小さい', 'chiisai', 'small'],
        ['新しい', 'atarashii', 'new'],
        ['古い', 'furui', 'old (things)'],
        ['高い', 'takai', 'expensive, tall'],
        ['安い', 'yasui', 'cheap'],
        ['いい', 'ii', 'good'],
        ['悪い', 'warui', 'bad'],
        ['楽しい', 'tanoshii', 'fun'],
        ['難しい', 'muzukashii', 'difficult'],
        ['簡単', 'kantan', 'easy'],
        ['好き', 'suki', 'liked (I like …)']
      ]
    }
  ],
  lessons: [
    {
      title: 'Word order and です',
      body: ['Japanese puts the verb at the end: subject – object – verb.', '“X は Y です” means “X is Y”. は is the topic marker and is pronounced “wa”.'],
      examples: [
        ['私は学生です。', 'Watashi wa gakusei desu.', 'I am a student.'],
        ['これはペンです。', 'Kore wa pen desu.', 'This is a pen.']
      ]
    },
    {
      title: 'Particles: は が を に で',
      body: [
        'Little words after a noun show its role: は topic (“as for…”), が subject / new information, を object (pronounced “o”), に destination or time, で place where something happens or the means.'
      ],
      examples: [
        ['寿司を食べます。', 'Sushi o tabemasu.', 'I eat sushi.'],
        ['学校に行きます。', 'Gakkō ni ikimasu.', 'I go to school.'],
        ['図書館で勉強します。', 'Toshokan de benkyō shimasu.', 'I study at the library.'],
        ['猫がいます。', 'Neko ga imasu.', 'There is a cat.']
      ]
    },
    {
      title: 'Questions with か',
      body: ['Add か to the end of a sentence to make it a question. No change in word order.'],
      examples: [
        ['学生ですか？', 'Gakusei desu ka?', 'Are you a student?'],
        ['何ですか？', 'Nan desu ka?', 'What is it?'],
        ['どこですか？', 'Doko desu ka?', 'Where is it?']
      ]
    },
    {
      title: 'Polite verbs: ます forms',
      body: ['ます (does / will do), ません (doesn’t), ました (did), ませんでした (didn’t). ましょう means “let’s”.'],
      examples: [
        ['食べます / 食べません', 'tabemasu / tabemasen', 'I eat / I don’t eat'],
        ['食べました / 食べませんでした', 'tabemashita / tabemasen deshita', 'I ate / I didn’t eat'],
        ['行きましょう！', 'Ikimashō!', 'Let’s go!']
      ]
    },
    {
      title: 'Two kinds of adjectives',
      body: [
        'い-adjectives end in い and change themselves: 高い (expensive) → 高くない (not expensive) → 高かった (was expensive).',
        'な-adjectives take な before a noun: 静かな部屋 (a quiet room), and です at the end: 静かです.'
      ],
      examples: [
        ['この本は高くないです。', 'Kono hon wa takakunai desu.', 'This book isn’t expensive.'],
        ['昨日は楽しかったです。', 'Kinō wa tanoshikatta desu.', 'Yesterday was fun.'],
        ['静かな部屋です。', 'Shizuka na heya desu.', 'It’s a quiet room.']
      ]
    },
    {
      title: 'This, that and which',
      body: ['これ this (near me), それ that (near you), あれ that (over there), どれ which. Before a noun: この, その, あの, どの.'],
      examples: [
        ['それは何ですか？', 'Sore wa nan desu ka?', 'What is that?'],
        ['この本が好きです。', 'Kono hon ga suki desu.', 'I like this book.']
      ]
    },
    {
      title: 'Telling the time',
      body: ['時 (ji) is “o’clock”. 4 o’clock is よじ (yo-ji), 7 is しちじ (shichi-ji), 9 is くじ (ku-ji). 半 (han) is “half past”.'],
      examples: [
        ['何時ですか？', 'Nanji desu ka?', 'What time is it?'],
        ['三時半です。', 'Sanji han desu.', 'It’s half past three.']
      ]
    }
  ],
  number: (n) => {
    if (n === 0) return { text: 'ゼロ', roman: 'zero' }
    const t = Math.floor(n / 10)
    const u = n % 10
    const text = (t > 1 ? JA_DIGITS[t] : '') + (t ? '十' : '') + JA_DIGITS[u]
    const roman = (t > 1 ? JA_ROMAN[t] : '') + (t ? 'jū' : '') + (u ? JA_ROMAN[u] : '')
    return { text, roman }
  }
}

// ---------- Chinese (Mandarin, simplified) ----------

const ZH_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
const ZH_PINYIN = ['líng', 'yī', 'èr', 'sān', 'sì', 'wǔ', 'liù', 'qī', 'bā', 'jiǔ']

const zh: Course = {
  tts: 'zh-CN',
  scripts: [
    {
      title: 'The four tones',
      note: 'Every syllable has a tone, and the tone changes the meaning. Listen and copy — exaggerate at first.',
      quiz: 'meaning',
      items: [
        ['mā 妈', '1st tone', 'high and level — “mother”'],
        ['má 麻', '2nd tone', 'rising, like a question — “hemp”'],
        ['mǎ 马', '3rd tone', 'dips low then rises — “horse”'],
        ['mà 骂', '4th tone', 'sharp fall — “to scold”'],
        ['ma 吗', 'neutral', 'short and light — question word']
      ]
    },
    {
      title: 'Tricky pinyin sounds',
      note: 'Pinyin uses English letters, but some don’t sound like English.',
      quiz: 'meaning',
      items: [
        ['q', 'like “ch” in cheese', 'qī 七 seven'],
        ['x', 'like “sh”, smiling', 'xiè 谢 thank'],
        ['zh', 'like “j” in jam, tongue curled back', 'zhōng 中 middle'],
        ['c', 'like “ts” in cats', 'cài 菜 dish'],
        ['z', 'like “ds” in reads', 'zài 在 at'],
        ['r', 'between English r and the s in “pleasure”', 'rén 人 person'],
        ['ü', 'say “ee” with rounded lips', 'nǚ 女 woman'],
        ['j', 'like “j” in jeep', 'jiā 家 home']
      ]
    },
    {
      title: 'Common radicals',
      note: 'Characters are built from parts. The radical often hints at the meaning — learning these makes new characters easier.',
      quiz: 'meaning',
      items: [
        ['亻', 'rén', 'person (他 he, 你 you)'],
        ['氵', 'shuǐ', 'water (河 river, 海 sea)'],
        ['口', 'kǒu', 'mouth (吃 eat, 喝 drink)'],
        ['木', 'mù', 'tree, wood (林 grove)'],
        ['女', 'nǚ', 'woman (妈 mum, 好 good)'],
        ['忄', 'xīn', 'heart, feelings (忙 busy)'],
        ['扌', 'shǒu', 'hand (打 hit, 找 look for)'],
        ['日', 'rì', 'sun, day (明 bright, 早 early)'],
        ['艹', 'cǎo', 'grass, plants (茶 tea, 菜 vegetable)'],
        ['讠', 'yán', 'speech (说 speak, 话 words)'],
        ['饣', 'shí', 'food (饭 rice, 饿 hungry)'],
        ['钅', 'jīn', 'metal (钱 money, 银 silver)']
      ]
    }
  ],
  phrases: [
    {
      title: 'Basics',
      items: [
        ['你好', 'nǐ hǎo', 'Hello'],
        ['谢谢', 'xièxie', 'Thank you'],
        ['不客气', 'bú kèqi', "You're welcome"],
        ['对不起', 'duìbuqǐ', 'Sorry'],
        ['没关系', 'méi guānxi', "It's OK / never mind"],
        ['是', 'shì', 'Yes (it is)'],
        ['不是', 'bú shì', "No (it isn't)"],
        ['请', 'qǐng', 'Please'],
        ['再见', 'zàijiàn', 'Goodbye'],
        ['早上好', 'zǎoshang hǎo', 'Good morning'],
        ['晚安', "wǎn'ān", 'Good night'],
        ['我听不懂', 'wǒ tīng bu dǒng', "I don't understand (what I hear)"]
      ]
    },
    {
      title: 'Meeting people',
      items: [
        ['你叫什么名字？', 'nǐ jiào shénme míngzi?', "What's your name?"],
        ['我叫…', 'wǒ jiào …', 'My name is …'],
        ['很高兴认识你', 'hěn gāoxìng rènshi nǐ', 'Nice to meet you'],
        ['你好吗？', 'nǐ hǎo ma?', 'How are you?'],
        ['我很好', 'wǒ hěn hǎo', "I'm good"],
        ['你是哪国人？', 'nǐ shì nǎ guó rén?', 'Which country are you from?'],
        ['我在学中文', 'wǒ zài xué Zhōngwén', "I'm learning Chinese"]
      ]
    },
    {
      title: 'Food & drink',
      items: [
        ['我要这个', 'wǒ yào zhège', "I'd like this one"],
        ['多少钱？', 'duōshao qián?', 'How much is it?'],
        ['好吃！', 'hǎochī!', 'Delicious!'],
        ['买单', 'mǎidān', 'The bill, please'],
        ['我不吃肉', 'wǒ bù chī ròu', "I don't eat meat"],
        ['一杯水', 'yì bēi shuǐ', 'A glass of water']
      ]
    },
    {
      title: 'Getting around',
      items: [
        ['…在哪里？', '… zài nǎlǐ?', 'Where is …?'],
        ['厕所在哪里？', 'cèsuǒ zài nǎlǐ?', 'Where is the toilet?'],
        ['地铁站', 'dìtiě zhàn', 'metro station'],
        ['请说慢一点', 'qǐng shuō màn yìdiǎn', 'Please speak a bit more slowly'],
        ['你会说英语吗？', 'nǐ huì shuō Yīngyǔ ma?', 'Can you speak English?'],
        ['再说一遍', 'zài shuō yí biàn', 'Say it again']
      ]
    }
  ],
  vocab: [
    {
      title: 'People',
      items: [
        ['我', 'wǒ', 'I, me'],
        ['你', 'nǐ', 'you'],
        ['他', 'tā', 'he, him'],
        ['她', 'tā', 'she, her'],
        ['我们', 'wǒmen', 'we, us'],
        ['朋友', 'péngyou', 'friend'],
        ['老师', 'lǎoshī', 'teacher'],
        ['学生', 'xuésheng', 'student'],
        ['妈妈', 'māma', 'mum'],
        ['爸爸', 'bàba', 'dad']
      ]
    },
    {
      title: 'Time',
      items: [
        ['今天', 'jīntiān', 'today'],
        ['明天', 'míngtiān', 'tomorrow'],
        ['昨天', 'zuótiān', 'yesterday'],
        ['现在', 'xiànzài', 'now'],
        ['早上', 'zǎoshang', 'morning'],
        ['晚上', 'wǎnshang', 'evening'],
        ['星期', 'xīngqī', 'week'],
        ['年', 'nián', 'year']
      ]
    },
    {
      title: 'Food & drink',
      items: [
        ['水', 'shuǐ', 'water'],
        ['茶', 'chá', 'tea'],
        ['咖啡', 'kāfēi', 'coffee'],
        ['米饭', 'mǐfàn', 'cooked rice'],
        ['面条', 'miàntiáo', 'noodles'],
        ['菜', 'cài', 'dish, vegetables'],
        ['肉', 'ròu', 'meat'],
        ['鸡蛋', 'jīdàn', 'egg']
      ]
    },
    {
      title: 'Places',
      items: [
        ['家', 'jiā', 'home'],
        ['学校', 'xuéxiào', 'school'],
        ['商店', 'shāngdiàn', 'shop'],
        ['医院', 'yīyuàn', 'hospital'],
        ['中国', 'Zhōngguó', 'China'],
        ['饭馆', 'fànguǎn', 'restaurant']
      ]
    },
    {
      title: 'Verbs',
      items: [
        ['是', 'shì', 'to be'],
        ['有', 'yǒu', 'to have, there is'],
        ['去', 'qù', 'to go'],
        ['来', 'lái', 'to come'],
        ['吃', 'chī', 'to eat'],
        ['喝', 'hē', 'to drink'],
        ['看', 'kàn', 'to look, watch, read'],
        ['听', 'tīng', 'to listen'],
        ['说', 'shuō', 'to speak'],
        ['学', 'xué', 'to learn'],
        ['想', 'xiǎng', 'to want, to think'],
        ['喜欢', 'xǐhuan', 'to like']
      ]
    },
    {
      title: 'Describing',
      items: [
        ['大', 'dà', 'big'],
        ['小', 'xiǎo', 'small'],
        ['好', 'hǎo', 'good'],
        ['多', 'duō', 'many, much'],
        ['少', 'shǎo', 'few, little'],
        ['贵', 'guì', 'expensive'],
        ['便宜', 'piányi', 'cheap'],
        ['忙', 'máng', 'busy'],
        ['累', 'lèi', 'tired'],
        ['高兴', 'gāoxìng', 'happy'],
        ['难', 'nán', 'difficult'],
        ['容易', 'róngyì', 'easy']
      ]
    }
  ],
  lessons: [
    {
      title: 'Tones change meaning',
      body: ['mā (mother), má (hemp), mǎ (horse), mà (scold). Practise tones from day one — say words out loud and exaggerate.', 'Two 3rd tones in a row: the first becomes 2nd tone (nǐ hǎo is said “ní hǎo”).'],
      examples: [
        ['妈妈骂马吗？', 'Māma mà mǎ ma?', 'Is mum scolding the horse?'],
        ['你好', 'nǐ hǎo (said ní hǎo)', 'Hello']
      ]
    },
    {
      title: 'Sentences and 是',
      body: ['Word order is like English: subject – verb – object. 是 joins two nouns (“A is B”).', 'Adjectives don’t use 是 — use 很 (hěn) instead: 我很忙 “I’m busy”.'],
      examples: [
        ['我是学生。', 'Wǒ shì xuésheng.', 'I am a student.'],
        ['我很忙。', 'Wǒ hěn máng.', "I'm busy."],
        ['我喝茶。', 'Wǒ hē chá.', 'I drink tea.']
      ]
    },
    {
      title: 'Asking questions',
      body: ['Add 吗 to make a yes/no question, or say the verb twice with 不 in the middle. Question words (什么 what, 哪里 where, 谁 who) stay where the answer would go.'],
      examples: [
        ['你忙吗？', 'Nǐ máng ma?', 'Are you busy?'],
        ['你是不是学生？', 'Nǐ shì bu shì xuésheng?', 'Are you a student?'],
        ['你去哪里？', 'Nǐ qù nǎlǐ?', 'Where are you going?']
      ]
    },
    {
      title: 'Not: 不 and 没',
      body: ['不 (bù) for the present, the future and habits. 没 (méi) for the past, and always with 有 (to have).'],
      examples: [
        ['我不喝咖啡。', 'Wǒ bù hē kāfēi.', "I don't drink coffee."],
        ['我昨天没去。', 'Wǒ zuótiān méi qù.', "I didn't go yesterday."],
        ['我没有钱。', 'Wǒ méiyǒu qián.', "I don't have money."]
      ]
    },
    {
      title: 'Measure words',
      body: ['Between a number and a noun you need a measure word. 个 (ge) is the general one; others depend on the thing (本 books, 杯 cups, 只 animals). For “two” say 两, not 二.'],
      examples: [
        ['一个人', 'yí ge rén', 'one person'],
        ['两本书', 'liǎng běn shū', 'two books'],
        ['三杯茶', 'sān bēi chá', 'three cups of tea']
      ]
    },
    {
      title: 'Done and changed: 了',
      body: ['了 after a verb shows the action is complete; at the end of a sentence it shows a change.'],
      examples: [
        ['我吃了。', 'Wǒ chī le.', "I've eaten."],
        ['下雨了。', 'Xià yǔ le.', "It's started raining."]
      ]
    },
    {
      title: 'When and where come first',
      body: ['Time and place go before the verb: who – when – where – do what.'],
      examples: [['我明天在家学习。', 'Wǒ míngtiān zài jiā xuéxí.', "I'll study at home tomorrow."]]
    }
  ],
  number: (n) => {
    if (n < 10) return { text: ZH_DIGITS[n], roman: ZH_PINYIN[n] }
    const t = Math.floor(n / 10)
    const u = n % 10
    return {
      text: (t > 1 ? ZH_DIGITS[t] : '') + '十' + (u ? ZH_DIGITS[u] : ''),
      roman: (t > 1 ? ZH_PINYIN[t] : '') + 'shí' + (u ? ZH_PINYIN[u] : '')
    }
  }
}

// ---------- German ----------

const DE_UNITS = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn']
const DE_TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig']

const de: Course = {
  tts: 'de-DE',
  genders: { label: 'der / die / das', articles: ['der', 'die', 'das'] },
  scripts: [
    {
      title: 'Letters and sounds',
      note: 'German is spelled almost exactly how it sounds — once you know these, you can read anything aloud.',
      quiz: 'meaning',
      items: [
        ['ä', 'like “e” in “bed”', 'Mädchen (girl)'],
        ['ö', 'say “e”, round your lips', 'schön (beautiful)'],
        ['ü', 'say “ee”, round your lips', 'über (over)'],
        ['ß', '“ss”', 'Straße (street)'],
        ['ei', 'like “eye”', 'mein (my)'],
        ['ie', 'like “ee”', 'Liebe (love)'],
        ['eu / äu', 'like “oy”', 'heute (today)'],
        ['ch (after a, o, u)', 'rough, from the throat', 'Bach (stream)'],
        ['ch (after e, i)', 'soft hiss', 'ich (I)'],
        ['sch', 'like “sh”', 'Schule (school)'],
        ['w', 'like English “v”', 'Wasser (water)'],
        ['v', 'like English “f”', 'Vater (father)'],
        ['z', 'like “ts”', 'Zeit (time)'],
        ['j', 'like English “y”', 'ja (yes)'],
        ['sp / st at the start', '“shp” / “sht”', 'Sport, Stadt (city)']
      ]
    }
  ],
  phrases: [
    {
      title: 'Basics',
      items: [
        ['Hallo', '', 'Hello'],
        ['Guten Morgen', '', 'Good morning'],
        ['Guten Tag', '', 'Hello / good day'],
        ['Guten Abend', '', 'Good evening'],
        ['Danke (schön)', '', 'Thank you'],
        ['Bitte', '', "Please / you're welcome"],
        ['Entschuldigung', '', 'Excuse me / sorry'],
        ['Ja', '', 'Yes'],
        ['Nein', '', 'No'],
        ['Tschüss', '', 'Bye'],
        ['Auf Wiedersehen', '', 'Goodbye (formal)'],
        ['Ich verstehe nicht', '', "I don't understand"]
      ]
    },
    {
      title: 'Meeting people',
      items: [
        ['Wie heißen Sie?', '', "What's your name? (formal)"],
        ['Wie heißt du?', '', "What's your name? (informal)"],
        ['Ich heiße …', '', 'My name is …'],
        ['Freut mich!', '', 'Nice to meet you'],
        ["Wie geht's?", '', 'How are you?'],
        ['Gut, danke. Und dir?', '', 'Good, thanks. And you?'],
        ['Woher kommst du?', '', 'Where are you from?'],
        ['Ich lerne Deutsch.', '', "I'm learning German."]
      ]
    },
    {
      title: 'Food & drink',
      items: [
        ['Ich hätte gern …', '', "I'd like …"],
        ['Ein Wasser, bitte.', '', 'A water, please.'],
        ['Die Rechnung, bitte.', '', 'The bill, please.'],
        ['Lecker!', '', 'Tasty!'],
        ['Guten Appetit!', '', 'Enjoy your meal!'],
        ['Prost!', '', 'Cheers!']
      ]
    },
    {
      title: 'Getting around',
      items: [
        ['Wo ist …?', '', 'Where is …?'],
        ['Wo ist der Bahnhof?', '', 'Where is the station?'],
        ['Wo ist die Toilette?', '', 'Where is the toilet?'],
        ['Was kostet das?', '', 'How much is that?'],
        ['Sprechen Sie Englisch?', '', 'Do you speak English?'],
        ['Können Sie das wiederholen?', '', 'Could you repeat that?'],
        ['Langsamer, bitte.', '', 'More slowly, please.']
      ]
    }
  ],
  vocab: [
    {
      title: 'People',
      items: [
        ['ich', '', 'I'],
        ['du', '', 'you (informal)'],
        ['Sie', '', 'you (formal)'],
        ['der Freund', '', 'friend (male)'],
        ['die Freundin', '', 'friend (female)'],
        ['die Familie', '', 'family'],
        ['die Mutter', '', 'mother'],
        ['der Vater', '', 'father'],
        ['der Lehrer', '', 'teacher'],
        ['das Kind', '', 'child']
      ]
    },
    {
      title: 'Time',
      items: [
        ['heute', '', 'today'],
        ['morgen', '', 'tomorrow'],
        ['gestern', '', 'yesterday'],
        ['jetzt', '', 'now'],
        ['der Morgen', '', 'morning'],
        ['der Abend', '', 'evening'],
        ['die Woche', '', 'week'],
        ['das Jahr', '', 'year']
      ]
    },
    {
      title: 'Food & drink',
      items: [
        ['das Wasser', '', 'water'],
        ['der Kaffee', '', 'coffee'],
        ['der Tee', '', 'tea'],
        ['das Brot', '', 'bread'],
        ['der Käse', '', 'cheese'],
        ['das Fleisch', '', 'meat'],
        ['das Gemüse', '', 'vegetables'],
        ['der Apfel', '', 'apple']
      ]
    },
    {
      title: 'Places',
      items: [
        ['das Haus', '', 'house'],
        ['die Schule', '', 'school'],
        ['der Bahnhof', '', 'station'],
        ['die Stadt', '', 'town, city'],
        ['das Zimmer', '', 'room'],
        ['die Straße', '', 'street']
      ]
    },
    {
      title: 'Verbs',
      items: [
        ['sein', '', 'to be'],
        ['haben', '', 'to have'],
        ['gehen', '', 'to go (on foot)'],
        ['kommen', '', 'to come'],
        ['essen', '', 'to eat'],
        ['trinken', '', 'to drink'],
        ['sehen', '', 'to see'],
        ['hören', '', 'to hear, listen'],
        ['sprechen', '', 'to speak'],
        ['lesen', '', 'to read'],
        ['schreiben', '', 'to write'],
        ['machen', '', 'to do, to make']
      ]
    },
    {
      title: 'Describing',
      items: [
        ['groß', '', 'big, tall'],
        ['klein', '', 'small'],
        ['gut', '', 'good'],
        ['schlecht', '', 'bad'],
        ['neu', '', 'new'],
        ['alt', '', 'old'],
        ['teuer', '', 'expensive'],
        ['billig', '', 'cheap'],
        ['schön', '', 'beautiful, nice'],
        ['schwer', '', 'difficult, heavy'],
        ['einfach', '', 'easy, simple'],
        ['müde', '', 'tired']
      ]
    }
  ],
  lessons: [
    {
      title: 'der, die, das',
      body: ['Every noun is masculine (der), feminine (die) or neuter (das); plural is always die. There are few reliable rules, so learn each noun with its article. Nouns start with a capital letter.'],
      examples: [
        ['der Tisch, die Lampe, das Buch', '', 'the table, the lamp, the book'],
        ['die Bücher', '', 'the books']
      ]
    },
    {
      title: 'The verb comes second',
      body: ['In a statement the verb is always the second element — even if the sentence starts with something other than the subject.'],
      examples: [
        ['Ich lerne heute Deutsch.', '', "I'm learning German today."],
        ['Heute lerne ich Deutsch.', '', "Today I'm learning German."]
      ]
    },
    {
      title: 'Present tense',
      body: ['Regular endings: ich lerne, du lernst, er/sie/es lernt, wir lernen, ihr lernt, sie/Sie lernen.', 'sein (to be): ich bin, du bist, er ist, wir sind, ihr seid, sie sind.'],
      examples: [
        ['Wir wohnen in Berlin.', '', 'We live in Berlin.'],
        ['Du bist nett.', '', 'You are nice.']
      ]
    },
    {
      title: 'du or Sie?',
      body: ['du: friends, family, children and other students. Sie (always capital S): strangers, shop staff, teachers, anyone formal. If unsure, start with Sie.'],
      examples: [
        ['Kommst du mit?', '', 'Are you coming along? (informal)'],
        ['Kommen Sie mit?', '', 'Are you coming along? (formal)']
      ]
    },
    {
      title: 'Cases: who does what to whom',
      body: ['The subject is in the nominative, the direct object in the accusative. Only the masculine article changes: der → den, ein → einen.'],
      examples: [
        ['Der Hund sieht den Mann.', '', 'The dog sees the man.'],
        ['Ich habe einen Bruder.', '', 'I have a brother.']
      ]
    },
    {
      title: 'Questions',
      body: ['Yes/no questions start with the verb. Other questions start with a W-word: was, wer, wo, wann, wie, warum.'],
      examples: [
        ['Hast du Zeit?', '', 'Do you have time?'],
        ['Wo wohnst du?', '', 'Where do you live?']
      ]
    },
    {
      title: 'nicht and kein',
      body: ['nicht negates verbs and adjectives; kein (“no / not a”) negates nouns.'],
      examples: [
        ['Ich komme nicht.', '', "I'm not coming."],
        ['Ich habe keine Zeit.', '', "I don't have time."]
      ]
    }
  ],
  number: (n) => {
    if (n < 20) return { text: DE_UNITS[n], roman: '' }
    const t = Math.floor(n / 10)
    const u = n % 10
    return { text: u ? `${u === 1 ? 'ein' : DE_UNITS[u]}und${DE_TENS[t]}` : DE_TENS[t], roman: '' }
  }
}

// ---------- French ----------

const FR_UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf']
const FR_TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante']

function frNumber(n: number): string {
  if (n < 20) return FR_UNITS[n]
  if (n < 70) {
    const t = Math.floor(n / 10)
    const u = n % 10
    return u === 0 ? FR_TENS[t] : u === 1 ? `${FR_TENS[t]} et un` : `${FR_TENS[t]}-${FR_UNITS[u]}`
  }
  if (n < 80) return n === 71 ? 'soixante et onze' : `soixante-${FR_UNITS[n - 60]}`
  if (n === 80) return 'quatre-vingts'
  return `quatre-vingt-${FR_UNITS[n - 80]}`
}

const fr: Course = {
  tts: 'fr-FR',
  genders: { label: 'le / la', articles: ['le', 'la'] },
  scripts: [
    {
      title: 'Letters and sounds',
      note: 'French spelling has patterns. These cover most of what you’ll read.',
      quiz: 'meaning',
      items: [
        ['é', 'like “ay”', 'café'],
        ['è / ê', 'like “e” in “bet”', 'très, fête'],
        ['ç', 'like “s”', 'français'],
        ['ou', 'like “oo”', 'vous (you)'],
        ['u', 'say “ee”, round your lips', 'tu (you)'],
        ['oi', 'like “wa”', 'moi (me)'],
        ['eau / au', 'like “o”', 'beau (beautiful)'],
        ['an / en', 'nasal “ahn”', 'vent (wind)'],
        ['on', 'nasal “ohn”', 'bon (good)'],
        ['in / ain', 'nasal “an”', 'pain (bread)'],
        ['gn', 'like “ny” in canyon', 'montagne (mountain)'],
        ['h', 'always silent', 'homme (man)'],
        ['final consonants', 'usually silent', 'petit, beaucoup'],
        ['r', 'from the back of the throat', 'rouge (red)']
      ]
    }
  ],
  phrases: [
    {
      title: 'Basics',
      items: [
        ['Bonjour', '', 'Hello / good morning'],
        ['Bonsoir', '', 'Good evening'],
        ['Salut', '', 'Hi / bye (informal)'],
        ['Merci (beaucoup)', '', 'Thank you (very much)'],
        ["S'il vous plaît", '', 'Please (formal)'],
        ["S'il te plaît", '', 'Please (informal)'],
        ['De rien', '', "You're welcome"],
        ['Pardon / Excusez-moi', '', 'Sorry / excuse me'],
        ['Oui', '', 'Yes'],
        ['Non', '', 'No'],
        ['Au revoir', '', 'Goodbye'],
        ['Je ne comprends pas', '', "I don't understand"]
      ]
    },
    {
      title: 'Meeting people',
      items: [
        ['Comment vous appelez-vous ?', '', "What's your name? (formal)"],
        ["Tu t'appelles comment ?", '', "What's your name? (informal)"],
        ["Je m'appelle …", '', 'My name is …'],
        ['Enchanté(e) !', '', 'Nice to meet you'],
        ['Comment ça va ?', '', 'How are you?'],
        ['Ça va bien, merci.', '', "I'm fine, thanks."],
        ["Tu viens d'où ?", '', 'Where are you from?'],
        ["J'apprends le français.", '', "I'm learning French."]
      ]
    },
    {
      title: 'Food & drink',
      items: [
        ['Je voudrais …', '', 'I would like …'],
        ["Une carafe d'eau, s'il vous plaît.", '', 'A jug of tap water, please.'],
        ["L'addition, s'il vous plaît.", '', 'The bill, please.'],
        ["C'est délicieux !", '', "It's delicious!"],
        ['Bon appétit !', '', 'Enjoy your meal!'],
        ['Santé !', '', 'Cheers!']
      ]
    },
    {
      title: 'Getting around',
      items: [
        ['Où est … ?', '', 'Where is …?'],
        ['Où est la gare ?', '', 'Where is the station?'],
        ['Où sont les toilettes ?', '', 'Where are the toilets?'],
        ["C'est combien ?", '', 'How much is it?'],
        ['Vous parlez anglais ?', '', 'Do you speak English?'],
        ['Pouvez-vous répéter ?', '', 'Could you repeat that?'],
        ["Plus lentement, s'il vous plaît.", '', 'More slowly, please.']
      ]
    }
  ],
  vocab: [
    {
      title: 'People',
      items: [
        ['je', '', 'I'],
        ['tu', '', 'you (informal)'],
        ['vous', '', 'you (formal or plural)'],
        ["l'ami", '', 'friend (male)'],
        ["l'amie", '', 'friend (female)'],
        ['la famille', '', 'family'],
        ['la mère', '', 'mother'],
        ['le père', '', 'father'],
        ['le professeur', '', 'teacher'],
        ["l'enfant", '', 'child']
      ]
    },
    {
      title: 'Time',
      items: [
        ["aujourd'hui", '', 'today'],
        ['demain', '', 'tomorrow'],
        ['hier', '', 'yesterday'],
        ['maintenant', '', 'now'],
        ['le matin', '', 'morning'],
        ['le soir', '', 'evening'],
        ['la semaine', '', 'week'],
        ["l'année", '', 'year']
      ]
    },
    {
      title: 'Food & drink',
      items: [
        ["l'eau", '', 'water'],
        ['le café', '', 'coffee'],
        ['le thé', '', 'tea'],
        ['le pain', '', 'bread'],
        ['le fromage', '', 'cheese'],
        ['la viande', '', 'meat'],
        ['les légumes', '', 'vegetables'],
        ['la pomme', '', 'apple']
      ]
    },
    {
      title: 'Places',
      items: [
        ['la maison', '', 'house'],
        ["l'école", '', 'school'],
        ['la gare', '', 'station'],
        ['le magasin', '', 'shop'],
        ['la ville', '', 'town, city'],
        ['la chambre', '', 'bedroom']
      ]
    },
    {
      title: 'Verbs',
      items: [
        ['être', '', 'to be'],
        ['avoir', '', 'to have'],
        ['aller', '', 'to go'],
        ['venir', '', 'to come'],
        ['manger', '', 'to eat'],
        ['boire', '', 'to drink'],
        ['voir', '', 'to see'],
        ['écouter', '', 'to listen'],
        ['parler', '', 'to speak'],
        ['lire', '', 'to read'],
        ['écrire', '', 'to write'],
        ['faire', '', 'to do, to make']
      ]
    },
    {
      title: 'Describing',
      items: [
        ['grand', '', 'big, tall'],
        ['petit', '', 'small'],
        ['bon', '', 'good'],
        ['mauvais', '', 'bad'],
        ['nouveau', '', 'new'],
        ['vieux', '', 'old'],
        ['cher', '', 'expensive'],
        ['facile', '', 'easy'],
        ['difficile', '', 'difficult'],
        ['beau', '', 'beautiful'],
        ['content', '', 'happy, pleased'],
        ['fatigué', '', 'tired']
      ]
    }
  ],
  lessons: [
    {
      title: 'le, la, les',
      body: ['Nouns are masculine (le, un) or feminine (la, une). Before a vowel or silent h both become l’. Plural is les. Learn each noun with its article.'],
      examples: [
        ['le livre, la table, l’eau (f.)', '', 'the book, the table, the water'],
        ['un ami, une amie', '', 'a friend (m.), a friend (f.)']
      ]
    },
    {
      title: 'être and avoir',
      body: ['être (to be): je suis, tu es, il/elle est, nous sommes, vous êtes, ils/elles sont.', 'avoir (to have): j’ai, tu as, il a, nous avons, vous avez, ils ont.'],
      examples: [
        ['Je suis étudiant.', '', 'I am a student.'],
        ["J'ai vingt ans.", '', "I'm twenty (lit. I have twenty years)."]
      ]
    },
    {
      title: '-er verbs',
      body: ['Most verbs end in -er and follow one pattern: je parle, tu parles, il parle, nous parlons, vous parlez, ils parlent. The je, tu, il and ils forms all sound the same.'],
      examples: [
        ['Nous parlons français.', '', 'We speak French.'],
        ['Elle aime la musique.', '', 'She likes music.']
      ]
    },
    {
      title: 'tu or vous?',
      body: ['tu: friends, family, children, people your age in casual settings. vous: strangers, shop staff, teachers — and always for more than one person.'],
      examples: [
        ['Tu viens ?', '', 'Are you coming? (informal)'],
        ['Vous venez ?', '', 'Are you coming? (formal / plural)']
      ]
    },
    {
      title: 'Saying “not”: ne … pas',
      body: ['Put ne before the verb and pas after it. In everyday speech the ne is often dropped.'],
      examples: [
        ['Je ne parle pas allemand.', '', "I don't speak German."],
        ['Je sais pas.', '', "I dunno (casual)."]
      ]
    },
    {
      title: 'Three ways to ask',
      body: ['Raise your voice at the end (casual), start with est-ce que (neutral), or swap verb and subject (formal). Question words: qui, quoi, où, quand, comment, pourquoi, combien.'],
      examples: [
        ['Tu viens ?', '', 'Are you coming?'],
        ['Est-ce que tu viens ?', '', 'Are you coming?'],
        ['Où habites-tu ?', '', 'Where do you live?']
      ]
    },
    {
      title: 'Adjectives',
      body: ['Adjectives agree with the noun (add -e for feminine, -s for plural) and usually come after it. Short common ones about beauty, age, goodness and size come before.'],
      examples: [
        ['un livre intéressant', '', 'an interesting book'],
        ['une maison blanche', '', 'a white house'],
        ['une petite maison', '', 'a small house']
      ]
    }
  ],
  number: (n) => ({ text: frNumber(n), roman: '' })
}

export const COURSES: Record<string, Course> = { ja, zh, de, fr }
