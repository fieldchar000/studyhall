// Content beyond the beginner course: phrasebook, words and grammar for A2, B1, B2 and C1,
// for the four built-in languages. Entries are [text, romanisation or '', meaning].

import type { Group, Lesson } from './langContent'

export type TierId = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

export interface Tier {
  id: TierId
  label: string
  phrases: Group[]
  vocab: Group[]
  lessons: Lesson[]
}

export const TIER_LABELS: Record<TierId, string> = {
  A1: 'Beginner',
  A2: 'Elementary',
  B1: 'Intermediate',
  B2: 'Upper-intermediate',
  C1: 'Advanced',
  C2: 'Mastery'
}

/** Which tier a CEFR level belongs to. */
export function tierFor(level: string): TierId {
  if (level === 'C2') return 'C2'
  if (/^C/.test(level)) return 'C1'
  if (level === 'B2') return 'B2'
  if (level === 'B1') return 'B1'
  if (level === 'A2') return 'A2'
  return 'A1'
}

// ---------- Japanese ----------

const ja: Tier[] = [
  {
    id: 'A2',
    label: TIER_LABELS.A2,
    phrases: [
      {
        title: 'Making plans',
        items: [
          ['今週末、何をしますか。', 'konshūmatsu, nani o shimasu ka.', 'What are you doing this weekend?'],
          ['一緒に映画を見に行きませんか。', 'issho ni eiga o mi ni ikimasen ka.', 'Would you like to go and see a film together?'],
          ['何時に会いましょうか。', 'nanji ni aimashō ka.', 'What time shall we meet?'],
          ['駅の前で待っています。', 'eki no mae de matte imasu.', 'I’ll be waiting in front of the station.'],
          ['すみません、少し遅れます。', 'sumimasen, sukoshi okuremasu.', 'Sorry, I’ll be a little late.'],
          ['また今度にしましょう。', 'mata kondo ni shimashō.', 'Let’s make it another time.']
        ]
      },
      {
        title: 'Eating out & shopping',
        items: [
          ['予約した田中です。', 'yoyaku shita Tanaka desu.', 'I have a reservation — Tanaka.'],
          ['おすすめは何ですか。', 'osusume wa nan desu ka.', 'What do you recommend?'],
          ['辛くしないでください。', 'karaku shinaide kudasai.', 'Please don’t make it spicy.'],
          ['お会計をお願いします。', 'okaikei o onegai shimasu.', 'The bill, please.'],
          ['カードで払えますか。', 'kādo de haraemasu ka.', 'Can I pay by card?'],
          ['試着してもいいですか。', 'shichaku shite mo ii desu ka.', 'May I try this on?']
        ]
      }
    ],
    vocab: [
      {
        title: 'Time & frequency',
        items: [
          ['いつも', 'itsumo', 'always'],
          ['よく', 'yoku', 'often'],
          ['ときどき', 'tokidoki', 'sometimes'],
          ['あまり～ない', 'amari ~nai', 'not often'],
          ['全然～ない', 'zenzen ~nai', 'not at all'],
          ['毎日', 'mainichi', 'every day'],
          ['先週', 'senshū', 'last week'],
          ['来月', 'raigetsu', 'next month']
        ]
      },
      {
        title: 'Feelings & states',
        items: [
          ['うれしい', 'ureshii', 'happy, glad'],
          ['楽しい', 'tanoshii', 'fun, enjoyable'],
          ['寂しい', 'sabishii', 'lonely'],
          ['疲れた', 'tsukareta', 'tired'],
          ['忙しい', 'isogashii', 'busy'],
          ['暇', 'hima', 'free (time)'],
          ['心配', 'shinpai', 'worry'],
          ['大丈夫', 'daijōbu', 'all right, okay']
        ]
      }
    ],
    lessons: [
      {
        title: 'て-form: linking actions and asking',
        body: [
          'The て-form joins actions (“…and then…”) and makes requests with ください.',
          'Group 2 verbs drop る and add て (食べる → 食べて). Group 1 depends on the ending: う・つ・る → って, む・ぶ・ぬ → んで, く → いて, ぐ → いで, す → して. 行く is irregular: 行って.'
        ],
        examples: [
          ['朝ご飯を食べて、学校に行きます。', 'asagohan o tabete, gakkō ni ikimasu.', 'I eat breakfast and then go to school.'],
          ['ちょっと待ってください。', 'chotto matte kudasai.', 'Please wait a moment.']
        ]
      },
      {
        title: 'Plain form and casual speech',
        body: ['With friends, Japanese drops です/ます: 食べます → 食べる, 食べません → 食べない, 食べました → 食べた.'],
        examples: [
          ['明日、何する？', 'ashita, nani suru?', 'What are you doing tomorrow? (casual)'],
          ['もう食べた。', 'mō tabeta.', 'I’ve already eaten.']
        ]
      },
      {
        title: '～たい (want to) and ～たことがある (have done)',
        body: ['Attach たい to the verb stem for “want to”. Use the past plain form + ことがある for experiences.'],
        examples: [
          ['日本に行きたいです。', 'Nihon ni ikitai desu.', 'I want to go to Japan.'],
          ['すしを食べたことがありますか。', 'sushi o tabeta koto ga arimasu ka.', 'Have you ever eaten sushi?']
        ]
      }
    ]
  },
  {
    id: 'B1',
    label: TIER_LABELS.B1,
    phrases: [
      {
        title: 'Giving opinions',
        items: [
          ['私はそう思います。', 'watashi wa sō omoimasu.', 'I think so.'],
          ['それはどうかな。', 'sore wa dō ka na.', 'I’m not so sure about that.'],
          ['確かにそうですね。', 'tashika ni sō desu ne.', 'That’s certainly true.'],
          ['理由は二つあります。', 'riyū wa futatsu arimasu.', 'There are two reasons.'],
          ['例えば…', 'tatoeba…', 'For example…'],
          ['結局', 'kekkyoku', 'in the end, after all']
        ]
      },
      {
        title: 'Work & study',
        items: [
          ['締め切りはいつですか。', 'shimekiri wa itsu desu ka.', 'When is the deadline?'],
          ['資料を送っていただけますか。', 'shiryō o okutte itadakemasu ka.', 'Could you send me the materials?'],
          ['もう一度説明していただけますか。', 'mō ichido setsumei shite itadakemasu ka.', 'Could you explain it once more?'],
          ['お先に失礼します。', 'osaki ni shitsurei shimasu.', 'Excuse me for leaving before you.'],
          ['お疲れさまでした。', 'otsukaresama deshita.', 'Thanks for your hard work.'],
          ['よろしくお願いします。', 'yoroshiku onegai shimasu.', 'I’m counting on you / thank you in advance.']
        ]
      }
    ],
    vocab: [
      {
        title: 'Opinion & discussion',
        items: [
          ['意見', 'iken', 'opinion'],
          ['賛成', 'sansei', 'agreement'],
          ['反対', 'hantai', 'opposition'],
          ['理由', 'riyū', 'reason'],
          ['経験', 'keiken', 'experience'],
          ['比べる', 'kuraberu', 'to compare'],
          ['説明する', 'setsumei suru', 'to explain'],
          ['決める', 'kimeru', 'to decide']
        ]
      },
      {
        title: 'Society & news',
        items: [
          ['社会', 'shakai', 'society'],
          ['環境', 'kankyō', 'environment'],
          ['経済', 'keizai', 'economy'],
          ['政府', 'seifu', 'government'],
          ['選挙', 'senkyo', 'election'],
          ['問題', 'mondai', 'problem'],
          ['影響', 'eikyō', 'influence'],
          ['増える', 'fueru', 'to increase']
        ]
      }
    ],
    lessons: [
      {
        title: 'Conditionals: ～たら, ～ば, ～と',
        body: ['～たら is the most versatile “if/when”. ～ば is a hypothetical “if”, often for advice. ～と is for natural, automatic results (“whenever”).'],
        examples: [
          ['雨が降ったら、家にいます。', 'ame ga futtara, ie ni imasu.', 'If it rains, I’ll stay home.'],
          ['早く寝れば、元気になりますよ。', 'hayaku nereba, genki ni narimasu yo.', 'If you sleep early, you’ll feel better.'],
          ['春になると、桜が咲きます。', 'haru ni naru to, sakura ga sakimasu.', 'When spring comes, the cherry blossoms bloom.']
        ]
      },
      {
        title: 'Giving and receiving: あげる・くれる・もらう',
        body: ['あげる: give to someone else. くれる: someone gives to me (or my group). もらう: receive. With the て-form they describe favours.'],
        examples: [
          ['友達が本をくれました。', 'tomodachi ga hon o kuremashita.', 'A friend gave me a book.'],
          ['先生に教えてもらいました。', 'sensei ni oshiete moraimashita.', 'The teacher kindly taught me.']
        ]
      },
      {
        title: 'Passive and potential forms',
        body: ['Passive: 言われる (be told), ほめられる (be praised). Potential: 話せる (can speak), 食べられる (can eat) — group 1 verbs change the final う-sound to え + る.'],
        examples: [
          ['先生にほめられました。', 'sensei ni homeraremashita.', 'I was praised by the teacher.'],
          ['日本語が少し話せます。', 'Nihongo ga sukoshi hanasemasu.', 'I can speak a little Japanese.']
        ]
      }
    ]
  },
  {
    id: 'B2',
    label: TIER_LABELS.B2,
    phrases: [
      {
        title: 'Nuance & softening',
        items: [
          ['～かもしれません', '~ kamo shiremasen', 'it might be ~'],
          ['～わけではありません', '~ wake de wa arimasen', 'it’s not that ~'],
          ['言われてみれば、そうですね。', 'iwarete mireba, sō desu ne.', 'Now that you mention it, that’s true.'],
          ['一概には言えません。', 'ichigai ni wa iemasen.', 'You can’t generalise.'],
          ['なるほど、そういうことですか。', 'naruhodo, sō iu koto desu ka.', 'I see — so that’s what it is.'],
          ['お言葉に甘えて…', 'okotoba ni amaete…', 'Taking you up on your kind offer…']
        ]
      },
      {
        title: 'Polite language at work',
        items: [
          ['少々お待ちください。', 'shōshō omachi kudasai.', 'Please wait a moment.'],
          ['拝見してもよろしいでしょうか。', 'haiken shite mo yoroshii deshō ka.', 'May I take a look?'],
          ['ご確認いただけますでしょうか。', 'gokakunin itadakemasu deshō ka.', 'Could you kindly check?'],
          ['申し訳ございません。', 'mōshiwake gozaimasen.', 'I sincerely apologise.'],
          ['承知いたしました。', 'shōchi itashimashita.', 'Certainly, understood.'],
          ['お手数をおかけします。', 'otesū o okake shimasu.', 'Sorry for the trouble.']
        ]
      }
    ],
    vocab: [
      {
        title: 'Abstract ideas',
        items: [
          ['価値観', 'kachikan', 'values'],
          ['責任', 'sekinin', 'responsibility'],
          ['可能性', 'kanōsei', 'possibility'],
          ['傾向', 'keikō', 'tendency'],
          ['対策', 'taisaku', 'countermeasure'],
          ['課題', 'kadai', 'issue, task'],
          ['曖昧', 'aimai', 'ambiguous'],
          ['柔軟', 'jūnan', 'flexible']
        ]
      },
      {
        title: 'Linking words',
        items: [
          ['しかし', 'shikashi', 'however'],
          ['したがって', 'shitagatte', 'therefore'],
          ['一方で', 'ippō de', 'on the other hand'],
          ['さらに', 'sara ni', 'furthermore'],
          ['つまり', 'tsumari', 'in other words'],
          ['にもかかわらず', 'ni mo kakawarazu', 'despite'],
          ['～に対して', '~ ni taishite', 'towards, in contrast to'],
          ['～によって', '~ ni yotte', 'depending on, by means of']
        ]
      }
    ],
    lessons: [
      {
        title: 'Keigo: 尊敬語 and 謙譲語',
        body: ['Respectful language (尊敬語) raises the other person: いらっしゃる (be/come/go), おっしゃる (say), 召し上がる (eat). Humble language (謙譲語) lowers yourself: 参る (go/come), 申す (say), いただく (receive, eat).'],
        examples: [
          ['社長はもういらっしゃいましたか。', 'shachō wa mō irasshaimashita ka.', 'Has the company president arrived?'],
          ['田中と申します。', 'Tanaka to mōshimasu.', 'My name is Tanaka (humble).']
        ]
      },
      {
        title: 'Explaining with ～んです',
        body: ['～んです adds explanation or feeling: it explains a situation, asks for an explanation, or softens a statement.'],
        examples: [
          ['どうしたんですか。', 'dō shita n desu ka.', 'What happened? (concerned)'],
          ['頭が痛いんです。', 'atama ga itai n desu.', '(The thing is,) I have a headache.']
        ]
      },
      {
        title: '～ようにする and ～ようになる',
        body: ['～ようにする: make an effort to do something regularly. ～ようになる: come to be able to, or change over time.'],
        examples: [
          ['毎日野菜を食べるようにしています。', 'mainichi yasai o taberu yō ni shite imasu.', 'I try to eat vegetables every day.'],
          ['漢字が読めるようになりました。', 'kanji ga yomeru yō ni narimashita.', 'I’ve become able to read kanji.']
        ]
      }
    ]
  },
  {
    id: 'C1',
    label: TIER_LABELS.C1,
    phrases: [
      {
        title: 'Formal writing & speeches',
        items: [
          ['～と考えられる', '~ to kangaerareru', 'it is thought that ~'],
          ['本日はお忙しいところ、ありがとうございます。', 'honjitsu wa oisogashii tokoro, arigatō gozaimasu.', 'Thank you for coming today despite your busy schedule.'],
          ['以上の点を踏まえて…', 'ijō no ten o fumaete…', 'Taking the above points into account…'],
          ['～と言っても過言ではない', '~ to itte mo kagon de wa nai', 'it is no exaggeration to say ~'],
          ['今後ともよろしくお願い申し上げます。', 'kongo tomo yoroshiku onegai mōshiagemasu.', 'We look forward to your continued support.']
        ]
      },
      {
        title: 'Idioms (慣用句)',
        items: [
          ['猫の手も借りたい', 'neko no te mo karitai', 'so busy you’d borrow even a cat’s paws'],
          ['猿も木から落ちる', 'saru mo ki kara ochiru', 'even monkeys fall from trees — everyone makes mistakes'],
          ['口が堅い', 'kuchi ga katai', 'can keep a secret'],
          ['顔が広い', 'kao ga hiroi', 'knows a lot of people'],
          ['気が利く', 'ki ga kiku', 'thoughtful, attentive'],
          ['一石二鳥', 'isseki nichō', 'two birds with one stone']
        ]
      }
    ],
    vocab: [
      {
        title: 'Academic words',
        items: [
          ['概念', 'gainen', 'concept'],
          ['仮説', 'kasetsu', 'hypothesis'],
          ['分析', 'bunseki', 'analysis'],
          ['根拠', 'konkyo', 'grounds, evidence'],
          ['矛盾', 'mujun', 'contradiction'],
          ['要因', 'yōin', 'factor'],
          ['顕著', 'kencho', 'remarkable, marked'],
          ['普遍的', 'fuhenteki', 'universal']
        ]
      },
      {
        title: 'Taking a stance',
        items: [
          ['確かに', 'tashika ni', 'certainly, admittedly'],
          ['むしろ', 'mushiro', 'rather'],
          ['あくまで', 'akumade', 'strictly, to the end'],
          ['いわば', 'iwaba', 'so to speak'],
          ['少なくとも', 'sukunaku tomo', 'at least'],
          ['必ずしも～ない', 'kanarazushimo ~nai', 'not necessarily'],
          ['～に過ぎない', '~ ni suginai', 'is nothing more than ~'],
          ['～ざるを得ない', '~ zaru o enai', 'cannot help but ~']
        ]
      }
    ],
    lessons: [
      {
        title: 'Written style: である',
        body: ['Essays and reports use である instead of です and avoid ます. ～のである emphasises a conclusion.'],
        examples: [['これは重要な問題である。', 'kore wa jūyō na mondai de aru.', 'This is an important problem.']]
      },
      {
        title: '～ものの, ～にもかかわらず, ～ばかりか',
        body: ['～ものの: although (formal). ～にもかかわらず: despite. ～ばかりか: not only… but also.'],
        examples: [
          ['勉強したものの、試験に落ちた。', 'benkyō shita mono no, shiken ni ochita.', 'Although I studied, I failed the exam.'],
          ['彼は英語ばかりか中国語も話せる。', 'kare wa eigo bakari ka chūgokugo mo hanaseru.', 'He speaks not only English but also Chinese.']
        ]
      },
      {
        title: 'Reading between the lines',
        body: ['Japanese often leaves things unsaid. A trailing ちょっと… usually means no; 検討します (we’ll consider it) can be a polite refusal; 結構です can mean “no, thank you”.'],
        examples: [
          ['それはちょっと…', 'sore wa chotto…', 'That’s a bit… (= probably not)'],
          ['前向きに検討します。', 'maemuki ni kentō shimasu.', 'We’ll consider it positively (often non-committal).']
        ]
      }
    ]
  }
]

// ---------- Chinese ----------

const zh: Tier[] = [
  {
    id: 'A2',
    label: TIER_LABELS.A2,
    phrases: [
      {
        title: 'Making plans',
        items: [
          ['你周末有空吗？', 'nǐ zhōumò yǒu kòng ma?', 'Are you free this weekend?'],
          ['我们一起去吃饭吧。', 'wǒmen yìqǐ qù chīfàn ba.', 'Let’s go and eat together.'],
          ['几点见面？', 'jǐ diǎn jiànmiàn?', 'What time shall we meet?'],
          ['我在地铁站等你。', 'wǒ zài dìtiězhàn děng nǐ.', 'I’ll wait for you at the MRT station.'],
          ['不好意思，我会晚一点到。', 'bù hǎoyìsi, wǒ huì wǎn yìdiǎn dào.', 'Sorry, I’ll be a bit late.'],
          ['下次吧。', 'xià cì ba.', 'Next time, then.']
        ]
      },
      {
        title: 'Eating out',
        items: [
          ['这个辣不辣？', 'zhège là bu là?', 'Is this spicy?'],
          ['少放点糖。', 'shǎo fàng diǎn táng.', 'Less sugar, please.'],
          ['打包，谢谢。', 'dǎbāo, xièxie.', 'To take away, thanks.'],
          ['可以刷卡吗？', 'kěyǐ shuākǎ ma?', 'Can I pay by card?'],
          ['买单。', 'mǎidān.', 'The bill, please.'],
          ['你推荐什么？', 'nǐ tuījiàn shénme?', 'What do you recommend?']
        ]
      }
    ],
    vocab: [
      {
        title: 'Time & frequency',
        items: [
          ['总是', 'zǒngshì', 'always'],
          ['经常', 'jīngcháng', 'often'],
          ['有时候', 'yǒu shíhou', 'sometimes'],
          ['从来不', 'cónglái bù', 'never'],
          ['以前', 'yǐqián', 'before'],
          ['以后', 'yǐhòu', 'later, afterwards'],
          ['上个星期', 'shàng ge xīngqī', 'last week'],
          ['下个月', 'xià ge yuè', 'next month']
        ]
      },
      {
        title: 'Feelings',
        items: [
          ['开心', 'kāixīn', 'happy'],
          ['难过', 'nánguò', 'sad'],
          ['累', 'lèi', 'tired'],
          ['忙', 'máng', 'busy'],
          ['紧张', 'jǐnzhāng', 'nervous'],
          ['担心', 'dānxīn', 'to worry'],
          ['无聊', 'wúliáo', 'bored, boring'],
          ['感动', 'gǎndòng', 'moved, touched']
        ]
      }
    ],
    lessons: [
      {
        title: '了: completed actions and change',
        body: ['了 right after a verb marks a completed action. 了 at the end of a sentence marks a new situation or change.'],
        examples: [
          ['我吃了三个包子。', 'wǒ chīle sān ge bāozi.', 'I ate three buns.'],
          ['下雨了。', 'xià yǔ le.', 'It’s started raining.']
        ]
      },
      {
        title: '过: experiences',
        body: ['Verb + 过 says you have done something before. Negate with 没 (没…过).'],
        examples: [
          ['你去过北京吗？', 'nǐ qùguo Běijīng ma?', 'Have you been to Beijing?'],
          ['我没吃过榴莲。', 'wǒ méi chīguo liúlián.', 'I’ve never eaten durian.']
        ]
      },
      {
        title: 'Comparisons with 比',
        body: ['A 比 B + adjective. Add 一点 (a bit) or 多了 (much) after the adjective — and don’t use 很 here.'],
        examples: [
          ['今天比昨天热。', 'jīntiān bǐ zuótiān rè.', 'Today is hotter than yesterday.'],
          ['他比我高多了。', 'tā bǐ wǒ gāo duō le.', 'He’s much taller than me.']
        ]
      }
    ]
  },
  {
    id: 'B1',
    label: TIER_LABELS.B1,
    phrases: [
      {
        title: 'Giving opinions',
        items: [
          ['我觉得…', 'wǒ juéde…', 'I think…'],
          ['我同意你的看法。', 'wǒ tóngyì nǐ de kànfǎ.', 'I agree with your view.'],
          ['我不太同意。', 'wǒ bú tài tóngyì.', 'I don’t quite agree.'],
          ['一方面…另一方面…', 'yì fāngmiàn… lìng yì fāngmiàn…', 'on the one hand… on the other…'],
          ['比如说', 'bǐrú shuō', 'for example'],
          ['总的来说', 'zǒng de lái shuō', 'all in all']
        ]
      },
      {
        title: 'Work & study',
        items: [
          ['截止日期是什么时候？', 'jiézhǐ rìqī shì shénme shíhou?', 'When is the deadline?'],
          ['你能再解释一下吗？', 'nǐ néng zài jiěshì yíxià ma?', 'Could you explain it again?'],
          ['我负责这个项目。', 'wǒ fùzé zhège xiàngmù.', 'I’m in charge of this project.'],
          ['我们开个会讨论一下。', 'wǒmen kāi ge huì tǎolùn yíxià.', 'Let’s have a meeting to discuss it.'],
          ['辛苦了！', 'xīnkǔ le!', 'Thanks for your hard work!'],
          ['麻烦你了。', 'máfan nǐ le.', 'Sorry for the trouble — thank you.']
        ]
      }
    ],
    vocab: [
      {
        title: 'Opinion & discussion',
        items: [
          ['看法', 'kànfǎ', 'view'],
          ['意见', 'yìjiàn', 'opinion'],
          ['支持', 'zhīchí', 'to support'],
          ['反对', 'fǎnduì', 'to oppose'],
          ['原因', 'yuányīn', 'reason'],
          ['结果', 'jiéguǒ', 'result'],
          ['经验', 'jīngyàn', 'experience'],
          ['比较', 'bǐjiào', 'to compare; relatively']
        ]
      },
      {
        title: 'Society & news',
        items: [
          ['社会', 'shèhuì', 'society'],
          ['环境', 'huánjìng', 'environment'],
          ['经济', 'jīngjì', 'economy'],
          ['政府', 'zhèngfǔ', 'government'],
          ['发展', 'fāzhǎn', 'to develop'],
          ['问题', 'wèntí', 'problem, question'],
          ['影响', 'yǐngxiǎng', 'influence'],
          ['增加', 'zēngjiā', 'to increase']
        ]
      }
    ],
    lessons: [
      {
        title: 'Result complements',
        body: ['A verb plus a result shows the outcome: 看完 (finish watching), 听懂 (understand by listening), 找到 (find). Negate with 没.'],
        examples: [
          ['我听懂了。', 'wǒ tīngdǒng le.', 'I understood (what I heard).'],
          ['钥匙还没找到。', 'yàoshi hái méi zhǎodào.', 'I still haven’t found the keys.']
        ]
      },
      {
        title: 'The 把 construction',
        body: ['把 brings the object before the verb when you do something to it with a result: subject + 把 + object + verb + result.'],
        examples: [
          ['请把门关上。', 'qǐng bǎ mén guānshang.', 'Please close the door.'],
          ['我把作业做完了。', 'wǒ bǎ zuòyè zuòwán le.', 'I’ve finished my homework.']
        ]
      },
      {
        title: 'Linking ideas: 虽然…但是, 因为…所以, 如果…就',
        body: ['These pairs are used together: although… (but), because… (so), if… (then).'],
        examples: [
          ['虽然很累，但是很开心。', 'suīrán hěn lèi, dànshì hěn kāixīn.', 'Although I’m tired, I’m happy.'],
          ['如果明天下雨，我们就不去了。', 'rúguǒ míngtiān xià yǔ, wǒmen jiù bú qù le.', 'If it rains tomorrow, we won’t go.']
        ]
      }
    ]
  },
  {
    id: 'B2',
    label: TIER_LABELS.B2,
    phrases: [
      {
        title: 'Nuance',
        items: [
          ['说实话', 'shuō shíhuà', 'to be honest'],
          ['不见得', 'bú jiàndé', 'not necessarily'],
          ['话虽如此', 'huà suī rúcǐ', 'that said'],
          ['这要看情况。', 'zhè yào kàn qíngkuàng.', 'It depends on the situation.'],
          ['我倒觉得…', 'wǒ dào juéde…', 'Actually, I think… (contrary view)'],
          ['难怪！', 'nánguài!', 'No wonder!']
        ]
      },
      {
        title: 'Formal & polite',
        items: [
          ['请多指教。', 'qǐng duō zhǐjiào.', 'I look forward to your guidance.'],
          ['不好意思，打扰一下。', 'bù hǎoyìsi, dǎrǎo yíxià.', 'Excuse me for interrupting.'],
          ['如有问题，请随时联系我。', 'rú yǒu wèntí, qǐng suíshí liánxì wǒ.', 'If you have any questions, contact me any time.'],
          ['感谢您的耐心。', 'gǎnxiè nín de nàixīn.', 'Thank you for your patience.'],
          ['我们会尽快处理。', 'wǒmen huì jǐnkuài chǔlǐ.', 'We’ll deal with it as soon as possible.'],
          ['期待与您合作。', 'qīdài yǔ nín hézuò.', 'I look forward to working with you.']
        ]
      }
    ],
    vocab: [
      {
        title: 'Abstract ideas',
        items: [
          ['价值观', 'jiàzhíguān', 'values'],
          ['责任', 'zérèn', 'responsibility'],
          ['可能性', 'kěnéngxìng', 'possibility'],
          ['趋势', 'qūshì', 'trend'],
          ['措施', 'cuòshī', 'measure'],
          ['挑战', 'tiǎozhàn', 'challenge'],
          ['模糊', 'móhu', 'vague, blurred'],
          ['灵活', 'línghuó', 'flexible']
        ]
      },
      {
        title: 'Linking words',
        items: [
          ['然而', 'rán’ér', 'however'],
          ['因此', 'yīncǐ', 'therefore'],
          ['此外', 'cǐwài', 'besides'],
          ['也就是说', 'yě jiù shì shuō', 'that is to say'],
          ['尽管', 'jǐnguǎn', 'even though'],
          ['不仅…而且…', 'bùjǐn… érqiě…', 'not only… but also…'],
          ['至于', 'zhìyú', 'as for'],
          ['由于', 'yóuyú', 'due to']
        ]
      }
    ],
    lessons: [
      {
        title: 'Directional complements',
        body: ['来 and 去 show movement towards or away from the speaker, combined with 上下进出回过起: 走进来 (walk in, towards me), 拿出去 (take out). They also have figurative uses: 想起来 (recall), 看起来 (it seems).'],
        examples: [
          ['他跑进来了。', 'tā pǎo jìnlai le.', 'He ran in.'],
          ['看起来要下雨了。', 'kàn qǐlai yào xià yǔ le.', 'It looks like it’s going to rain.']
        ]
      },
      {
        title: 'Passive with 被',
        body: ['被 marks who did it in a passive sentence, often for something unwelcome. In speech, 叫 and 让 are also used.'],
        examples: [['我的手机被偷了。', 'wǒ de shǒujī bèi tōu le.', 'My phone was stolen.']]
      },
      {
        title: '连…都/也… (even)',
        body: ['连 + something surprising + 都/也 stresses “even”.'],
        examples: [['他连饭都没吃就走了。', 'tā lián fàn dōu méi chī jiù zǒu le.', 'He left without even eating.']]
      }
    ]
  },
  {
    id: 'C1',
    label: TIER_LABELS.C1,
    phrases: [
      {
        title: 'Formal writing',
        items: [
          ['综上所述', 'zōng shàng suǒ shù', 'in summary'],
          ['值得注意的是', 'zhídé zhùyì de shì', 'it is worth noting that'],
          ['由此可见', 'yóu cǐ kě jiàn', 'from this we can see'],
          ['不可否认', 'bù kě fǒurèn', 'undeniably'],
          ['在一定程度上', 'zài yídìng chéngdù shang', 'to a certain extent']
        ]
      },
      {
        title: 'Chengyu (成语)',
        items: [
          ['一举两得', 'yì jǔ liǎng dé', 'one action, two gains'],
          ['半途而废', 'bàn tú ér fèi', 'to give up halfway'],
          ['入乡随俗', 'rù xiāng suí sú', 'when in Rome, do as the Romans do'],
          ['马马虎虎', 'mǎmǎhūhū', 'so-so; careless'],
          ['画蛇添足', 'huà shé tiān zú', 'to spoil something by adding the unnecessary'],
          ['熟能生巧', 'shú néng shēng qiǎo', 'practice makes perfect']
        ]
      }
    ],
    vocab: [
      {
        title: 'Academic words',
        items: [
          ['概念', 'gàiniàn', 'concept'],
          ['假设', 'jiǎshè', 'hypothesis'],
          ['分析', 'fēnxī', 'analysis'],
          ['依据', 'yījù', 'basis, grounds'],
          ['矛盾', 'máodùn', 'contradiction'],
          ['因素', 'yīnsù', 'factor'],
          ['显著', 'xiǎnzhù', 'marked, notable'],
          ['普遍', 'pǔbiàn', 'widespread, universal']
        ]
      },
      {
        title: 'Taking a stance',
        items: [
          ['确实', 'quèshí', 'indeed'],
          ['反而', 'fǎn’ér', 'on the contrary'],
          ['毕竟', 'bìjìng', 'after all'],
          ['甚至', 'shènzhì', 'even'],
          ['至少', 'zhìshǎo', 'at least'],
          ['未必', 'wèibì', 'not necessarily'],
          ['只不过', 'zhǐ búguò', 'merely'],
          ['不得不', 'bù dé bù', 'have no choice but to']
        ]
      }
    ],
    lessons: [
      {
        title: 'Written register (书面语)',
        body: ['Formal Chinese prefers short, classical-flavoured words: 之 (的), 于 (在/对), 以 (用/来), 其 (他的/它的), 此 (这).'],
        examples: [['此方法适用于各种情况。', 'cǐ fāngfǎ shìyòng yú gè zhǒng qíngkuàng.', 'This method applies to all kinds of situations.']]
      },
      {
        title: 'Using chengyu naturally',
        body: ['Use chengyu inside a sentence as a verb or description rather than on their own — and sparingly in speech.'],
        examples: [['学语言要坚持，不要半途而废。', 'xué yǔyán yào jiānchí, bú yào bàn tú ér fèi.', 'Stick with learning a language — don’t give up halfway.']]
      },
      {
        title: 'Rhetorical questions',
        body: ['难道…吗？ and 何必…呢？ express surprise or disagreement.'],
        examples: [
          ['难道你不知道吗？', 'nándào nǐ bù zhīdào ma?', 'Don’t tell me you didn’t know?'],
          ['何必这么着急呢？', 'hébì zhème zháojí ne?', 'Why be in such a hurry?']
        ]
      }
    ]
  }
]

// ---------- German ----------

const de: Tier[] = [
  {
    id: 'A2',
    label: TIER_LABELS.A2,
    phrases: [
      {
        title: 'Making plans',
        items: [
          ['Hast du am Wochenende Zeit?', '', 'Are you free at the weekend?'],
          ['Wollen wir zusammen ins Kino gehen?', '', 'Shall we go to the cinema together?'],
          ['Wann treffen wir uns?', '', 'When shall we meet?'],
          ['Ich warte am Bahnhof auf dich.', '', 'I’ll wait for you at the station.'],
          ['Tut mir leid, ich komme etwas später.', '', 'Sorry, I’ll be a bit late.'],
          ['Lass uns das verschieben.', '', 'Let’s postpone it.']
        ]
      },
      {
        title: 'Eating out & shopping',
        items: [
          ['Ich hätte gern …', '', 'I’d like …'],
          ['Was können Sie empfehlen?', '', 'What can you recommend?'],
          ['Ist das vegetarisch?', '', 'Is that vegetarian?'],
          ['Zusammen oder getrennt?', '', 'Together or separately? (paying)'],
          ['Kann ich mit Karte zahlen?', '', 'Can I pay by card?'],
          ['Kann ich das anprobieren?', '', 'Can I try this on?']
        ]
      }
    ],
    vocab: [
      {
        title: 'Time & frequency',
        items: [
          ['immer', '', 'always'],
          ['oft', '', 'often'],
          ['manchmal', '', 'sometimes'],
          ['selten', '', 'rarely'],
          ['nie', '', 'never'],
          ['letzte Woche', '', 'last week'],
          ['nächsten Monat', '', 'next month'],
          ['jeden Tag', '', 'every day']
        ]
      },
      {
        title: 'Feelings',
        items: [
          ['glücklich', '', 'happy'],
          ['traurig', '', 'sad'],
          ['müde', '', 'tired'],
          ['gestresst', '', 'stressed'],
          ['nervös', '', 'nervous'],
          ['gelangweilt', '', 'bored'],
          ['überrascht', '', 'surprised'],
          ['zufrieden', '', 'content, satisfied']
        ]
      }
    ],
    lessons: [
      {
        title: 'Perfekt: talking about the past',
        body: ['Spoken German uses haben or sein + a past participle at the end: ge-…-t (gemacht) or ge-…-en (gegessen). Verbs of movement and change of state take sein.'],
        examples: [
          ['Ich habe Pizza gegessen.', '', 'I ate pizza.'],
          ['Wir sind nach Berlin gefahren.', '', 'We went to Berlin.']
        ]
      },
      {
        title: 'The dative case',
        body: ['The indirect object is dative: dem / der / dem / den (+n). aus, bei, mit, nach, seit, von and zu always take the dative.'],
        examples: [
          ['Ich gebe dem Mann das Buch.', '', 'I give the man the book.'],
          ['Ich fahre mit dem Bus.', '', 'I’m going by bus.']
        ]
      },
      {
        title: 'Modal verbs',
        body: ['können, müssen, wollen, dürfen, sollen, möchten. The modal comes second; the main verb goes to the end as an infinitive.'],
        examples: [
          ['Ich muss heute arbeiten.', '', 'I have to work today.'],
          ['Darf ich hier sitzen?', '', 'May I sit here?']
        ]
      }
    ]
  },
  {
    id: 'B1',
    label: TIER_LABELS.B1,
    phrases: [
      {
        title: 'Giving opinions',
        items: [
          ['Meiner Meinung nach …', '', 'In my opinion …'],
          ['Ich bin der Meinung, dass …', '', 'I’m of the opinion that …'],
          ['Da stimme ich dir zu.', '', 'I agree with you there.'],
          ['Das sehe ich anders.', '', 'I see that differently.'],
          ['Einerseits …, andererseits …', '', 'On the one hand …, on the other …'],
          ['Zum Beispiel', '', 'For example']
        ]
      },
      {
        title: 'Work & study',
        items: [
          ['Bis wann muss das fertig sein?', '', 'When does it need to be finished?'],
          ['Könnten Sie das bitte noch einmal erklären?', '', 'Could you explain that again, please?'],
          ['Ich kümmere mich darum.', '', 'I’ll take care of it.'],
          ['Lass uns einen Termin ausmachen.', '', 'Let’s arrange a time.'],
          ['Ich melde mich bei dir.', '', 'I’ll get back to you.'],
          ['Viel Erfolg!', '', 'Good luck!']
        ]
      }
    ],
    vocab: [
      {
        title: 'Discussion',
        items: [
          ['die Meinung', '', 'opinion'],
          ['der Grund', '', 'reason'],
          ['die Erfahrung', '', 'experience'],
          ['der Vorteil', '', 'advantage'],
          ['der Nachteil', '', 'disadvantage'],
          ['vergleichen', '', 'to compare'],
          ['entscheiden', '', 'to decide'],
          ['überzeugen', '', 'to convince']
        ]
      },
      {
        title: 'Society & news',
        items: [
          ['die Gesellschaft', '', 'society'],
          ['die Umwelt', '', 'environment'],
          ['die Wirtschaft', '', 'economy'],
          ['die Regierung', '', 'government'],
          ['die Wahl', '', 'election'],
          ['das Problem', '', 'problem'],
          ['der Einfluss', '', 'influence'],
          ['steigen', '', 'to rise']
        ]
      }
    ],
    lessons: [
      {
        title: 'Subordinate clauses: weil, dass, wenn, ob',
        body: ['These conjunctions send the verb to the end of their clause.'],
        examples: [
          ['Ich bleibe zu Hause, weil ich krank bin.', '', 'I’m staying home because I’m ill.'],
          ['Ich weiß nicht, ob er kommt.', '', 'I don’t know whether he’s coming.']
        ]
      },
      {
        title: 'Konjunktiv II: polite requests and wishes',
        body: ['Use würde + infinitive for most verbs, and hätte, wäre, könnte for the common ones — for politeness and “if” situations.'],
        examples: [
          ['Ich würde gern mitkommen.', '', 'I’d like to come along.'],
          ['Wenn ich Zeit hätte, würde ich reisen.', '', 'If I had time, I’d travel.']
        ]
      },
      {
        title: 'Präteritum in writing',
        body: ['Stories and news use the simple past: ich ging, er sagte, wir waren. In speech, war, hatte and the modals are common in this form too.'],
        examples: [['Gestern war ich sehr müde.', '', 'Yesterday I was very tired.']]
      }
    ]
  },
  {
    id: 'B2',
    label: TIER_LABELS.B2,
    phrases: [
      {
        title: 'Nuance',
        items: [
          ['Das kommt darauf an.', '', 'It depends.'],
          ['Im Grunde genommen …', '', 'Basically …'],
          ['Wie gesagt …', '', 'As I said …'],
          ['Das stimmt so nicht ganz.', '', 'That’s not quite right.'],
          ['Ich gebe zu, dass …', '', 'I admit that …'],
          ['Na ja …', '', 'Well … (hesitant)']
        ]
      },
      {
        title: 'Formal letters & emails',
        items: [
          ['Sehr geehrte Damen und Herren,', '', 'Dear Sir or Madam,'],
          ['Vielen Dank für Ihre Rückmeldung.', '', 'Thank you for your reply.'],
          ['Ich wäre Ihnen dankbar, wenn …', '', 'I would be grateful if …'],
          ['Anbei sende ich Ihnen …', '', 'Please find attached …'],
          ['Mit freundlichen Grüßen', '', 'Kind regards (formal)'],
          ['Entschuldigen Sie die Verspätung.', '', 'Apologies for the delay.']
        ]
      }
    ],
    vocab: [
      {
        title: 'Abstract ideas',
        items: [
          ['die Verantwortung', '', 'responsibility'],
          ['die Möglichkeit', '', 'possibility'],
          ['die Entwicklung', '', 'development'],
          ['die Maßnahme', '', 'measure'],
          ['die Herausforderung', '', 'challenge'],
          ['die Voraussetzung', '', 'prerequisite'],
          ['zweideutig', '', 'ambiguous'],
          ['flexibel', '', 'flexible']
        ]
      },
      {
        title: 'Linking words',
        items: [
          ['jedoch', '', 'however'],
          ['deshalb', '', 'therefore'],
          ['außerdem', '', 'besides'],
          ['das heißt', '', 'that is'],
          ['obwohl', '', 'although'],
          ['trotzdem', '', 'nevertheless'],
          ['nicht nur … sondern auch', '', 'not only … but also'],
          ['infolgedessen', '', 'as a result']
        ]
      }
    ],
    lessons: [
      {
        title: 'The passive',
        body: ['werden + past participle. The doer, if mentioned, takes von + dative.'],
        examples: [
          ['Das Haus wird renoviert.', '', 'The house is being renovated.'],
          ['Das Buch wurde von Goethe geschrieben.', '', 'The book was written by Goethe.']
        ]
      },
      {
        title: 'Relative clauses',
        body: ['der / die / das / die, changing for case (den, dem, dessen, deren). The verb goes to the end.'],
        examples: [
          ['Das ist der Mann, den ich gestern getroffen habe.', '', 'That’s the man I met yesterday.'],
          ['Die Frau, deren Auto rot ist, wohnt hier.', '', 'The woman whose car is red lives here.']
        ]
      },
      {
        title: 'The genitive and its prepositions',
        body: ['wegen, trotz, während and statt take the genitive in writing: des Mannes, der Frau.'],
        examples: [['Wegen des Regens bleiben wir zu Hause.', '', 'Because of the rain we’re staying home.']]
      }
    ]
  },
  {
    id: 'C1',
    label: TIER_LABELS.C1,
    phrases: [
      {
        title: 'Formal writing',
        items: [
          ['Zusammenfassend lässt sich sagen, dass …', '', 'In summary, it can be said that …'],
          ['Es ist davon auszugehen, dass …', '', 'It can be assumed that …'],
          ['Im Hinblick auf …', '', 'With regard to …'],
          ['Nicht zuletzt …', '', 'Not least …'],
          ['Es sei darauf hingewiesen, dass …', '', 'It should be pointed out that …']
        ]
      },
      {
        title: 'Idioms (Redewendungen)',
        items: [
          ['Das ist nicht mein Bier.', '', 'That’s not my problem (lit. not my beer).'],
          ['Ich verstehe nur Bahnhof.', '', 'It’s all Greek to me (lit. I only understand “station”).'],
          ['Tomaten auf den Augen haben', '', 'to miss the obvious (lit. tomatoes on the eyes)'],
          ['Schwein haben', '', 'to be lucky'],
          ['den Nagel auf den Kopf treffen', '', 'to hit the nail on the head'],
          ['ins Fettnäpfchen treten', '', 'to put your foot in it']
        ]
      }
    ],
    vocab: [
      {
        title: 'Academic words',
        items: [
          ['der Begriff', '', 'concept, term'],
          ['die Hypothese', '', 'hypothesis'],
          ['die Analyse', '', 'analysis'],
          ['der Beleg', '', 'evidence'],
          ['der Widerspruch', '', 'contradiction'],
          ['der Faktor', '', 'factor'],
          ['erheblich', '', 'considerable'],
          ['allgemeingültig', '', 'universally valid']
        ]
      },
      {
        title: 'Taking a stance',
        items: [
          ['zweifellos', '', 'undoubtedly'],
          ['vielmehr', '', 'rather'],
          ['immerhin', '', 'at least, after all'],
          ['sozusagen', '', 'so to speak'],
          ['zumindest', '', 'at least'],
          ['keineswegs', '', 'by no means'],
          ['lediglich', '', 'merely'],
          ['zwangsläufig', '', 'inevitably']
        ]
      }
    ],
    lessons: [
      {
        title: 'Konjunktiv I: reported speech',
        body: ['News reports what someone said with Konjunktiv I: er sagt, er sei krank; sie habe keine Zeit.'],
        examples: [['Der Minister sagte, die Lage sei ernst.', '', 'The minister said the situation was serious.']]
      },
      {
        title: 'Nominal style',
        body: ['Formal German turns verbs into nouns: entscheiden → die Entscheidung, umsetzen → die Umsetzung.'],
        examples: [['Nach der Umsetzung der Maßnahmen …', '', 'After the measures had been implemented …']]
      },
      {
        title: 'Extended participle phrases',
        body: ['Formal texts put long descriptions before the noun.'],
        examples: [['der von der Regierung beschlossene Plan', '', 'the plan adopted by the government']]
      }
    ]
  }
]

// ---------- French ----------

const fr: Tier[] = [
  {
    id: 'A2',
    label: TIER_LABELS.A2,
    phrases: [
      {
        title: 'Making plans',
        items: [
          ['Tu es libre ce week-end ?', '', 'Are you free this weekend?'],
          ['On va au cinéma ensemble ?', '', 'Shall we go to the cinema together?'],
          ['On se retrouve à quelle heure ?', '', 'What time shall we meet?'],
          ['Je t’attends devant la gare.', '', 'I’ll wait for you in front of the station.'],
          ['Désolé, je vais être un peu en retard.', '', 'Sorry, I’m going to be a bit late.'],
          ['On remet ça à une autre fois ?', '', 'Shall we do it another time?']
        ]
      },
      {
        title: 'Eating out & shopping',
        items: [
          ['Je voudrais …', '', 'I’d like …'],
          ['Qu’est-ce que vous me conseillez ?', '', 'What do you recommend?'],
          ['C’est épicé ?', '', 'Is it spicy?'],
          ['L’addition, s’il vous plaît.', '', 'The bill, please.'],
          ['Je peux payer par carte ?', '', 'Can I pay by card?'],
          ['Je peux l’essayer ?', '', 'Can I try it on?']
        ]
      }
    ],
    vocab: [
      {
        title: 'Time & frequency',
        items: [
          ['toujours', '', 'always'],
          ['souvent', '', 'often'],
          ['parfois', '', 'sometimes'],
          ['rarement', '', 'rarely'],
          ['jamais', '', 'never'],
          ['la semaine dernière', '', 'last week'],
          ['le mois prochain', '', 'next month'],
          ['tous les jours', '', 'every day']
        ]
      },
      {
        title: 'Feelings',
        items: [
          ['heureux / heureuse', '', 'happy'],
          ['triste', '', 'sad'],
          ['fatigué(e)', '', 'tired'],
          ['stressé(e)', '', 'stressed'],
          ['inquiet / inquiète', '', 'worried'],
          ['ennuyé(e)', '', 'bored; bothered'],
          ['surpris(e)', '', 'surprised'],
          ['content(e)', '', 'pleased']
        ]
      }
    ],
    lessons: [
      {
        title: 'Passé composé',
        body: ['avoir or être + past participle. Verbs of movement (aller, venir, partir…) and reflexive verbs take être, and the participle agrees with the subject.'],
        examples: [
          ['J’ai mangé une pizza.', '', 'I ate a pizza.'],
          ['Elle est allée à Paris.', '', 'She went to Paris.']
        ]
      },
      {
        title: 'Futur proche',
        body: ['aller + infinitive for plans and the near future.'],
        examples: [['On va voir un film ce soir.', '', 'We’re going to see a film tonight.']]
      },
      {
        title: 'Object pronouns',
        body: ['le / la / les (direct) and lui / leur (indirect) go before the verb.'],
        examples: [
          ['Je le vois.', '', 'I see him / it.'],
          ['Je lui parle.', '', 'I’m speaking to him / her.']
        ]
      }
    ]
  },
  {
    id: 'B1',
    label: TIER_LABELS.B1,
    phrases: [
      {
        title: 'Giving opinions',
        items: [
          ['À mon avis …', '', 'In my opinion …'],
          ['Je pense que …', '', 'I think that …'],
          ['Je suis d’accord avec toi.', '', 'I agree with you.'],
          ['Je ne suis pas tout à fait d’accord.', '', 'I don’t entirely agree.'],
          ['D’un côté …, de l’autre …', '', 'On one hand …, on the other …'],
          ['Par exemple', '', 'For example']
        ]
      },
      {
        title: 'Work & study',
        items: [
          ['C’est pour quand ?', '', 'When is it due?'],
          ['Pourriez-vous m’expliquer encore une fois ?', '', 'Could you explain it to me again?'],
          ['Je m’en occupe.', '', 'I’ll take care of it.'],
          ['On fixe un rendez-vous ?', '', 'Shall we set a meeting?'],
          ['Je te tiens au courant.', '', 'I’ll keep you posted.'],
          ['Bon courage !', '', 'Hang in there! / Good luck!']
        ]
      }
    ],
    vocab: [
      {
        title: 'Discussion',
        items: [
          ['l’avis (m.)', '', 'opinion'],
          ['la raison', '', 'reason'],
          ['l’expérience (f.)', '', 'experience'],
          ['l’avantage (m.)', '', 'advantage'],
          ['l’inconvénient (m.)', '', 'drawback'],
          ['comparer', '', 'to compare'],
          ['décider', '', 'to decide'],
          ['convaincre', '', 'to convince']
        ]
      },
      {
        title: 'Society & news',
        items: [
          ['la société', '', 'society'],
          ['l’environnement (m.)', '', 'environment'],
          ['l’économie (f.)', '', 'economy'],
          ['le gouvernement', '', 'government'],
          ['l’élection (f.)', '', 'election'],
          ['le problème', '', 'problem'],
          ['l’influence (f.)', '', 'influence'],
          ['augmenter', '', 'to increase']
        ]
      }
    ],
    lessons: [
      {
        title: 'Imparfait vs passé composé',
        body: ['The imparfait sets the scene and describes habits (il faisait beau, je jouais); the passé composé gives the completed events (il est arrivé).'],
        examples: [['Il pleuvait quand je suis sorti.', '', 'It was raining when I went out.']]
      },
      {
        title: 'The conditional',
        body: ['Future stem + imperfect endings: je voudrais, tu pourrais. Used for politeness and with si + imparfait for hypotheticals.'],
        examples: [
          ['Si j’avais le temps, je voyagerais.', '', 'If I had time, I would travel.'],
          ['Pourriez-vous m’aider ?', '', 'Could you help me?']
        ]
      },
      {
        title: 'y and en',
        body: ['y replaces à + a place or thing (j’y vais); en replaces de + a thing, or a quantity (j’en veux deux).'],
        examples: [
          ['Tu vas à Paris ? — Oui, j’y vais demain.', '', 'Are you going to Paris? — Yes, I’m going there tomorrow.'],
          ['Tu as des frères ? — Oui, j’en ai deux.', '', 'Do you have brothers? — Yes, I have two.']
        ]
      }
    ]
  },
  {
    id: 'B2',
    label: TIER_LABELS.B2,
    phrases: [
      {
        title: 'Nuance',
        items: [
          ['Ça dépend.', '', 'It depends.'],
          ['En fait …', '', 'Actually …'],
          ['Cela dit …', '', 'That said …'],
          ['Ce n’est pas tout à fait vrai.', '', 'That’s not quite true.'],
          ['Je dois avouer que …', '', 'I must admit that …'],
          ['Bref …', '', 'Anyway / in short …']
        ]
      },
      {
        title: 'Formal letters & emails',
        items: [
          ['Madame, Monsieur,', '', 'Dear Sir or Madam,'],
          ['Je vous remercie de votre réponse.', '', 'Thank you for your reply.'],
          ['Je vous serais reconnaissant(e) de …', '', 'I would be grateful if you could …'],
          ['Veuillez trouver ci-joint …', '', 'Please find attached …'],
          ['Je vous prie d’agréer mes salutations distinguées.', '', 'Yours faithfully (formal sign-off).'],
          ['Toutes mes excuses pour ce retard.', '', 'My apologies for the delay.']
        ]
      }
    ],
    vocab: [
      {
        title: 'Abstract ideas',
        items: [
          ['la responsabilité', '', 'responsibility'],
          ['la possibilité', '', 'possibility'],
          ['le développement', '', 'development'],
          ['la mesure', '', 'measure'],
          ['le défi', '', 'challenge'],
          ['la condition préalable', '', 'prerequisite'],
          ['ambigu / ambiguë', '', 'ambiguous'],
          ['souple', '', 'flexible']
        ]
      },
      {
        title: 'Linking words',
        items: [
          ['cependant', '', 'however'],
          ['donc', '', 'therefore'],
          ['de plus', '', 'moreover'],
          ['c’est-à-dire', '', 'that is'],
          ['bien que (+ subjonctif)', '', 'although'],
          ['pourtant', '', 'yet, nevertheless'],
          ['non seulement … mais aussi', '', 'not only … but also'],
          ['par conséquent', '', 'consequently']
        ]
      }
    ],
    lessons: [
      {
        title: 'The subjunctive',
        body: ['Used after wishes, feelings, necessity and doubt: il faut que, je veux que, bien que. Take the ils form of the present, drop -ent, add -e, -es, -e, -ions, -iez, -ent.'],
        examples: [
          ['Il faut que tu viennes.', '', 'You have to come.'],
          ['Bien qu’il soit fatigué, il travaille.', '', 'Although he’s tired, he’s working.']
        ]
      },
      {
        title: 'Relative pronouns: qui, que, dont, où',
        body: ['qui = subject, que = object, dont replaces de + noun, où = where / when.'],
        examples: [
          ['Le livre dont je parle est ici.', '', 'The book I’m talking about is here.'],
          ['La ville où je suis né est petite.', '', 'The town where I was born is small.']
        ]
      },
      {
        title: 'Plus-que-parfait',
        body: ['avoir or être in the imperfect + past participle: something that had happened before another past event.'],
        examples: [['Quand je suis arrivé, il était déjà parti.', '', 'When I arrived, he had already left.']]
      }
    ]
  },
  {
    id: 'C1',
    label: TIER_LABELS.C1,
    phrases: [
      {
        title: 'Formal writing',
        items: [
          ['En somme …', '', 'In short …'],
          ['Il convient de souligner que …', '', 'It should be emphasised that …'],
          ['Force est de constater que …', '', 'One has to acknowledge that …'],
          ['En ce qui concerne …', '', 'As regards …'],
          ['Il n’en demeure pas moins que …', '', 'The fact remains that …']
        ]
      },
      {
        title: 'Idioms (expressions)',
        items: [
          ['avoir le cafard', '', 'to feel down'],
          ['coûter les yeux de la tête', '', 'to cost an arm and a leg'],
          ['poser un lapin à quelqu’un', '', 'to stand someone up'],
          ['avoir un poil dans la main', '', 'to be lazy'],
          ['mettre son grain de sel', '', 'to put in your two cents'],
          ['ce n’est pas la mer à boire', '', 'it’s not that hard']
        ]
      }
    ],
    vocab: [
      {
        title: 'Academic words',
        items: [
          ['le concept', '', 'concept'],
          ['l’hypothèse (f.)', '', 'hypothesis'],
          ['l’analyse (f.)', '', 'analysis'],
          ['la preuve', '', 'evidence, proof'],
          ['la contradiction', '', 'contradiction'],
          ['le facteur', '', 'factor'],
          ['considérable', '', 'considerable'],
          ['universel(le)', '', 'universal']
        ]
      },
      {
        title: 'Taking a stance',
        items: [
          ['certes', '', 'admittedly'],
          ['plutôt', '', 'rather'],
          ['quand même', '', 'all the same'],
          ['pour ainsi dire', '', 'so to speak'],
          ['du moins', '', 'at least'],
          ['nullement', '', 'by no means'],
          ['sans doute', '', 'probably (not “without doubt”)'],
          ['inévitablement', '', 'inevitably']
        ]
      }
    ],
    lessons: [
      {
        title: 'Passé simple (literary past)',
        body: ['Written narrative uses the passé simple: il fut, elle alla, ils dirent. You mostly need to recognise it when reading.'],
        examples: [['Il entra et s’assit.', '', 'He came in and sat down.']]
      },
      {
        title: 'Nominalisation',
        body: ['Formal French prefers nouns to verbs: décider → la décision, mettre en œuvre → la mise en œuvre.'],
        examples: [['La mise en œuvre de ces mesures …', '', 'The implementation of these measures …']]
      },
      {
        title: 'Register: dropping ne, “on”, and slang',
        body: ['Spoken French often drops ne (je sais pas), uses on for nous, and slang such as verlan (relou, ouf).'],
        examples: [
          ['Je sais pas.', '', 'I don’t know (casual).'],
          ['C’est ouf !', '', 'That’s crazy! (verlan for fou)']
        ]
      }
    ]
  }
]

export const TIERS: Record<string, Tier[]> = { ja, zh, de, fr }
