// More for the language courses — added on top of what's there, never replacing it:
// extra everyday phrases for every phrasebook category, new everyday categories,
// and a C2 "Mastery" level above Advanced. Entries are [text, romanisation or '', meaning].

import type { Entry, Group } from './langContent'
import type { Tier, TierId } from './langTiers'

/** Extra phrases, by language → phrasebook category title. */
export const EXTRA_PHRASES: Record<string, Record<string, Entry[]>> = {
  ja: {
    Basics: [
      ['はい、そうです。', 'hai, sō desu.', 'Yes, that’s right.'],
      ['もう一度お願いします。', 'mō ichido onegai shimasu.', 'Once more, please.'],
      ['ゆっくり話してください。', 'yukkuri hanashite kudasai.', 'Please speak slowly.'],
      ['大丈夫です。', 'daijōbu desu.', 'I’m fine / No thanks, it’s okay.'],
      ['なるほど。', 'naruhodo.', 'I see.'],
      ['そうですね。', 'sō desu ne.', 'That’s right / Let me think…'],
      ['いいですね！', 'ii desu ne!', 'Sounds good!']
    ],
    'Meeting people': [
      ['お仕事は何ですか。', 'oshigoto wa nan desu ka.', 'What do you do for work?'],
      ['学生です。', 'gakusei desu.', 'I’m a student.'],
      ['趣味は何ですか。', 'shumi wa nan desu ka.', 'What are your hobbies?'],
      ['シンガポールから来ました。', 'Shingapōru kara kimashita.', 'I’m from Singapore.'],
      ['日本語を勉強しています。', 'Nihongo o benkyō shite imasu.', 'I’m studying Japanese.'],
      ['また会いましょう。', 'mata aimashō.', 'Let’s meet again.'],
      ['LINEを交換しませんか。', 'rain o kōkan shimasen ka.', 'Shall we swap LINE contacts?']
    ],
    'Food & drink': [
      ['いただきます。', 'itadakimasu.', 'Said before eating — “I humbly receive”.'],
      ['ごちそうさまでした。', 'gochisōsama deshita.', 'Said after eating — thank you for the meal.'],
      ['お水をください。', 'omizu o kudasai.', 'Water, please.'],
      ['おいしい！', 'oishii!', 'Delicious!'],
      ['アレルギーがあります。', 'arerugī ga arimasu.', 'I have an allergy.'],
      ['持ち帰りでお願いします。', 'mochikaeri de onegai shimasu.', 'To take away, please.'],
      ['二人です。', 'futari desu.', 'Two people (a table for two).']
    ],
    'Getting around': [
      ['駅はどこですか。', 'eki wa doko desu ka.', 'Where is the station?'],
      ['この電車は渋谷に行きますか。', 'kono densha wa Shibuya ni ikimasu ka.', 'Does this train go to Shibuya?'],
      ['まっすぐ行ってください。', 'massugu itte kudasai.', 'Go straight ahead.'],
      ['右に曲がってください。', 'migi ni magatte kudasai.', 'Turn right.'],
      ['ここで止めてください。', 'koko de tomete kudasai.', 'Please stop here (taxi).'],
      ['道に迷いました。', 'michi ni mayoimashita.', 'I’m lost.'],
      ['近いですか。', 'chikai desu ka.', 'Is it close?']
    ],
    'Making plans': [
      ['空いている日はありますか。', 'aite iru hi wa arimasu ka.', 'Are there any days you’re free?'],
      ['楽しみにしています。', 'tanoshimi ni shite imasu.', 'I’m looking forward to it.'],
      ['急に用事ができてしまいました。', 'kyū ni yōji ga dekite shimaimashita.', 'Something suddenly came up.'],
      ['着いたら連絡します。', 'tsuitara renraku shimasu.', 'I’ll message you when I arrive.'],
      ['どこで会う？', 'doko de au?', 'Where shall we meet? (casual)']
    ],
    'Eating out & shopping': [
      ['もう少し安いのはありますか。', 'mō sukoshi yasui no wa arimasu ka.', 'Do you have anything a bit cheaper?'],
      ['別のサイズはありますか。', 'betsu no saizu wa arimasu ka.', 'Do you have another size?'],
      ['袋はいりません。', 'fukuro wa irimasen.', 'I don’t need a bag.'],
      ['領収書をください。', 'ryōshūsho o kudasai.', 'A receipt, please.'],
      ['おかわりできますか。', 'okawari dekimasu ka.', 'Can I get a refill?']
    ],
    'Giving opinions': [
      ['正直に言うと…', 'shōjiki ni iu to…', 'To be honest…'],
      ['それもそうですね。', 'sore mo sō desu ne.', 'That’s true too.'],
      ['場合によります。', 'baai ni yorimasu.', 'It depends.'],
      ['気持ちはわかります。', 'kimochi wa wakarimasu.', 'I understand how you feel.'],
      ['どちらかと言えば…', 'dochira ka to ieba…', 'If anything… / I’d lean towards…']
    ],
    'Work & study': [
      ['ちょっと相談があるんですが。', 'chotto sōdan ga aru n desu ga.', 'Could I ask your advice about something?'],
      ['後で確認します。', 'ato de kakunin shimasu.', 'I’ll check later.'],
      ['間に合いそうにありません。', 'maniaisō ni arimasen.', 'I don’t think I’ll make it in time.'],
      ['手伝いましょうか。', 'tetsudaimashō ka.', 'Shall I help?'],
      ['了解です。', 'ryōkai desu.', 'Got it.']
    ],
    'Nuance & softening': [
      ['～気がします', '~ ki ga shimasu', 'I have a feeling that ~'],
      ['念のため', 'nen no tame', 'just to be safe'],
      ['できれば', 'dekireba', 'if possible'],
      ['とりあえず', 'toriaezu', 'for now, to start with'],
      ['さすがですね。', 'sasuga desu ne.', 'Just what I’d expect from you — impressive.']
    ],
    'Polite language at work': [
      ['お世話になっております。', 'osewa ni natte orimasu.', 'Thank you for your continued support (email opener).'],
      ['ご都合はいかがでしょうか。', 'gotsugō wa ikaga deshō ka.', 'Would that suit you?'],
      ['恐れ入りますが…', 'osoreirimasu ga…', 'I’m sorry to bother you, but…'],
      ['ご検討のほど、よろしくお願いいたします。', 'gokentō no hodo, yoroshiku onegai itashimasu.', 'Thank you for considering this.'],
      ['失礼いたします。', 'shitsurei itashimasu.', 'Excuse me (entering, leaving, hanging up).']
    ],
    'Formal writing & speeches': [
      ['～に関して', '~ ni kanshite', 'regarding ~'],
      ['～を踏まえ', '~ o fumae', 'based on ~'],
      ['結論から申し上げますと…', 'ketsuron kara mōshiagemasu to…', 'To start with the conclusion…'],
      ['ご清聴ありがとうございました。', 'goseichō arigatō gozaimashita.', 'Thank you for your attention (end of a talk).']
    ],
    'Idioms (慣用句)': [
      ['耳が痛い', 'mimi ga itai', 'it hurts to hear (an uncomfortable truth)'],
      ['頭が上がらない', 'atama ga agaranai', 'to be deeply indebted to someone'],
      ['足を引っ張る', 'ashi o hipparu', 'to hold someone back'],
      ['腹が立つ', 'hara ga tatsu', 'to get angry'],
      ['七転び八起き', 'nanakorobi yaoki', 'fall seven times, get up eight']
    ]
  },
  zh: {
    Basics: [
      ['没问题。', 'méi wèntí.', 'No problem.'],
      ['等一下。', 'děng yíxià.', 'Wait a moment.'],
      ['请再说一遍。', 'qǐng zài shuō yí biàn.', 'Please say it again.'],
      ['请说慢一点。', 'qǐng shuō màn yìdiǎn.', 'Please speak a bit slower.'],
      ['好的。', 'hǎo de.', 'Okay.'],
      ['没关系。', 'méi guānxi.', 'It’s alright / never mind.']
    ],
    'Meeting people': [
      ['你做什么工作？', 'nǐ zuò shénme gōngzuò?', 'What do you do?'],
      ['我是学生。', 'wǒ shì xuésheng.', 'I’m a student.'],
      ['你有什么爱好？', 'nǐ yǒu shénme àihào?', 'What are your hobbies?'],
      ['我是新加坡人。', 'wǒ shì Xīnjiāpō rén.', 'I’m Singaporean.'],
      ['我在学中文。', 'wǒ zài xué Zhōngwén.', 'I’m learning Chinese.'],
      ['加个微信吧。', 'jiā ge Wēixìn ba.', 'Let’s add each other on WeChat.']
    ],
    'Food & drink': [
      ['我要这个。', 'wǒ yào zhège.', 'I’d like this one.'],
      ['不要辣。', 'bú yào là.', 'Not spicy, please.'],
      ['好吃！', 'hǎochī!', 'Delicious!'],
      ['我对花生过敏。', 'wǒ duì huāshēng guòmǐn.', 'I’m allergic to peanuts.'],
      ['两位。', 'liǎng wèi.', 'Two people (table for two).'],
      ['可以给我一杯水吗？', 'kěyǐ gěi wǒ yì bēi shuǐ ma?', 'Could I have a glass of water?'],
      ['我吃饱了。', 'wǒ chībǎo le.', 'I’m full.']
    ],
    'Getting around': [
      ['地铁站在哪儿？', 'dìtiězhàn zài nǎr?', 'Where is the MRT / subway station?'],
      ['一直走。', 'yìzhí zǒu.', 'Go straight.'],
      ['往右拐。', 'wǎng yòu guǎi.', 'Turn right.'],
      ['在这儿停。', 'zài zhèr tíng.', 'Stop here.'],
      ['我迷路了。', 'wǒ mílù le.', 'I’m lost.'],
      ['远吗？', 'yuǎn ma?', 'Is it far?'],
      ['要多久？', 'yào duō jiǔ?', 'How long does it take?']
    ],
    'Making plans': [
      ['你哪天有空？', 'nǐ nǎ tiān yǒu kòng?', 'Which day are you free?'],
      ['我很期待！', 'wǒ hěn qīdài!', 'I’m looking forward to it!'],
      ['我临时有事，去不了了。', 'wǒ línshí yǒu shì, qù bu liǎo le.', 'Something came up — I can’t go.'],
      ['到了告诉我。', 'dào le gàosu wǒ.', 'Tell me when you arrive.'],
      ['在哪儿见？', 'zài nǎr jiàn?', 'Where shall we meet?']
    ],
    'Eating out': [
      ['有便宜一点的吗？', 'yǒu piányi yìdiǎn de ma?', 'Is there anything cheaper?'],
      ['可以便宜一点吗？', 'kěyǐ piányi yìdiǎn ma?', 'Can you make it a bit cheaper?'],
      ['不用袋子。', 'bú yòng dàizi.', 'No bag, thanks.'],
      ['可以给我收据吗？', 'kěyǐ gěi wǒ shōujù ma?', 'Could I have a receipt?'],
      ['这里有人坐吗？', 'zhèlǐ yǒu rén zuò ma?', 'Is this seat taken?']
    ],
    'Giving opinions': [
      ['老实说…', 'lǎoshi shuō…', 'Honestly…'],
      ['也有道理。', 'yě yǒu dàolǐ.', 'That makes sense too.'],
      ['看情况。', 'kàn qíngkuàng.', 'It depends.'],
      ['我理解你的感受。', 'wǒ lǐjiě nǐ de gǎnshòu.', 'I understand how you feel.'],
      ['我比较倾向于…', 'wǒ bǐjiào qīngxiàng yú…', 'I lean more towards…']
    ],
    'Work & study': [
      ['我想请教你一个问题。', 'wǒ xiǎng qǐngjiào nǐ yí ge wèntí.', 'Could I ask your advice on something?'],
      ['我待会儿确认一下。', 'wǒ dāihuìr quèrèn yíxià.', 'I’ll check in a bit.'],
      ['恐怕来不及了。', 'kǒngpà lái bu jí le.', 'I’m afraid there isn’t enough time.'],
      ['要我帮忙吗？', 'yào wǒ bāngmáng ma?', 'Do you need a hand?'],
      ['收到。', 'shōudào.', 'Got it (received).']
    ],
    Nuance: [
      ['我总觉得…', 'wǒ zǒng juéde…', 'I can’t help feeling…'],
      ['以防万一', 'yǐ fáng wàn yī', 'just in case'],
      ['可以的话', 'kěyǐ de huà', 'if possible'],
      ['先这样吧。', 'xiān zhèyàng ba.', 'Let’s leave it like this for now.'],
      ['不愧是你！', 'búkuì shì nǐ!', 'That’s so you — impressive!']
    ],
    'Formal & polite': [
      ['您好，打扰了。', 'nín hǎo, dǎrǎo le.', 'Hello, sorry to bother you.'],
      ['请问您什么时候方便？', 'qǐngwèn nín shénme shíhou fāngbiàn?', 'When would be convenient for you?'],
      ['不好意思，麻烦您…', 'bù hǎoyìsi, máfan nín…', 'Sorry to trouble you, but could you…'],
      ['请您考虑一下。', 'qǐng nín kǎolǜ yíxià.', 'Please consider it.'],
      ['祝您一切顺利。', 'zhù nín yíqiè shùnlì.', 'Wishing you all the best.']
    ],
    'Formal writing': [
      ['关于…', 'guānyú…', 'regarding…'],
      ['基于…', 'jīyú…', 'based on…'],
      ['先说结论…', 'xiān shuō jiélùn…', 'to start with the conclusion…'],
      ['感谢各位的聆听。', 'gǎnxiè gèwèi de língtīng.', 'Thank you all for listening.']
    ],
    'Chengyu (成语)': [
      ['塞翁失马', 'sài wēng shī mǎ', 'a blessing in disguise'],
      ['对牛弹琴', 'duì niú tán qín', 'to play the lute to a cow — wasted effort'],
      ['守株待兔', 'shǒu zhū dài tù', 'to wait for luck instead of working'],
      ['井底之蛙', 'jǐng dǐ zhī wā', 'a frog in a well — a narrow view'],
      ['自相矛盾', 'zì xiāng máodùn', 'to contradict yourself']
    ]
  },
  de: {
    Basics: [
      ['Kein Problem.', '', 'No problem.'],
      ['Einen Moment, bitte.', '', 'One moment, please.'],
      ['Wie bitte?', '', 'Pardon?'],
      ['Können Sie das wiederholen?', '', 'Could you repeat that?'],
      ['Langsamer, bitte.', '', 'Slower, please.'],
      ['Alles klar.', '', 'All right / Got it.'],
      ['Macht nichts.', '', 'Never mind.']
    ],
    'Meeting people': [
      ['Was machst du beruflich?', '', 'What do you do for work?'],
      ['Ich bin Student / Studentin.', '', 'I’m a student.'],
      ['Was sind deine Hobbys?', '', 'What are your hobbies?'],
      ['Ich komme aus Singapur.', '', 'I’m from Singapore.'],
      ['Ich lerne Deutsch.', '', 'I’m learning German.'],
      ['Freut mich!', '', 'Nice to meet you!'],
      ['Bis bald!', '', 'See you soon!']
    ],
    'Food & drink': [
      ['Guten Appetit!', '', 'Enjoy your meal!'],
      ['Ein Wasser, bitte.', '', 'A water, please.'],
      ['Lecker!', '', 'Tasty!'],
      ['Ich bin allergisch gegen Nüsse.', '', 'I’m allergic to nuts.'],
      ['Einen Tisch für zwei, bitte.', '', 'A table for two, please.'],
      ['Zum Mitnehmen, bitte.', '', 'To take away, please.'],
      ['Ich bin satt.', '', 'I’m full.']
    ],
    'Getting around': [
      ['Wo ist der Bahnhof?', '', 'Where is the station?'],
      ['Fährt dieser Zug nach München?', '', 'Does this train go to Munich?'],
      ['Geradeaus.', '', 'Straight ahead.'],
      ['Biegen Sie rechts ab.', '', 'Turn right.'],
      ['Halten Sie bitte hier.', '', 'Please stop here.'],
      ['Ich habe mich verlaufen.', '', 'I’m lost (on foot).'],
      ['Ist das weit?', '', 'Is it far?']
    ],
    'Making plans': [
      ['Wann hast du Zeit?', '', 'When are you free?'],
      ['Ich freue mich darauf!', '', 'I’m looking forward to it!'],
      ['Mir ist etwas dazwischengekommen.', '', 'Something’s come up.'],
      ['Schreib mir, wenn du da bist.', '', 'Text me when you’re there.'],
      ['Wo treffen wir uns?', '', 'Where shall we meet?']
    ],
    'Eating out & shopping': [
      ['Haben Sie etwas Günstigeres?', '', 'Do you have anything cheaper?'],
      ['Haben Sie das in einer anderen Größe?', '', 'Do you have this in another size?'],
      ['Ich brauche keine Tüte.', '', 'I don’t need a bag.'],
      ['Kann ich bitte die Quittung haben?', '', 'Can I have the receipt, please?'],
      ['Stimmt so.', '', 'Keep the change.']
    ],
    'Giving opinions': [
      ['Ehrlich gesagt …', '', 'Honestly …'],
      ['Da hast du auch recht.', '', 'You’re right about that too.'],
      ['Kommt drauf an.', '', 'Depends.'],
      ['Ich kann dich verstehen.', '', 'I understand you.'],
      ['Ich tendiere eher zu …', '', 'I lean more towards …']
    ],
    'Work & study': [
      ['Kann ich dich kurz um Rat fragen?', '', 'Can I quickly ask your advice?'],
      ['Ich schaue später nach.', '', 'I’ll check later.'],
      ['Das schaffe ich leider nicht rechtzeitig.', '', 'I’m afraid I won’t make it in time.'],
      ['Soll ich dir helfen?', '', 'Shall I help you?'],
      ['Geht klar.', '', 'Will do / Sure.']
    ],
    Nuance: [
      ['Ich habe das Gefühl, dass …', '', 'I have the feeling that …'],
      ['sicherheitshalber', '', 'just to be safe'],
      ['wenn möglich', '', 'if possible'],
      ['erst mal', '', 'for now, first of all'],
      ['Respekt!', '', 'Impressive! / Hats off!']
    ],
    'Formal letters & emails': [
      ['Ich hoffe, es geht Ihnen gut.', '', 'I hope you are well.'],
      ['Würde Ihnen … passen?', '', 'Would … suit you?'],
      ['Für Rückfragen stehe ich gern zur Verfügung.', '', 'I’m happy to answer any questions.'],
      ['Vielen Dank im Voraus.', '', 'Thank you in advance.'],
      ['Ich freue mich auf Ihre Antwort.', '', 'I look forward to your reply.']
    ],
    'Formal writing': [
      ['Bezüglich …', '', 'Regarding …'],
      ['Auf Grundlage von …', '', 'On the basis of …'],
      ['Um es vorwegzunehmen: …', '', 'To give the conclusion first: …'],
      ['Vielen Dank für Ihre Aufmerksamkeit.', '', 'Thank you for your attention.']
    ],
    'Idioms (Redewendungen)': [
      ['Ich drücke dir die Daumen.', '', 'I’ll keep my fingers crossed for you.'],
      ['Das ist mir Wurst.', '', 'I couldn’t care less.'],
      ['auf dem Schlauch stehen', '', 'to be slow on the uptake'],
      ['die Nase voll haben', '', 'to be fed up'],
      ['etwas auf die lange Bank schieben', '', 'to put something off']
    ]
  },
  fr: {
    Basics: [
      ['Pas de problème.', '', 'No problem.'],
      ['Un instant, s’il vous plaît.', '', 'One moment, please.'],
      ['Pardon ?', '', 'Pardon?'],
      ['Vous pouvez répéter ?', '', 'Can you repeat that?'],
      ['Plus lentement, s’il vous plaît.', '', 'More slowly, please.'],
      ['D’accord.', '', 'Okay.'],
      ['Ce n’est pas grave.', '', 'It’s no big deal.']
    ],
    'Meeting people': [
      ['Qu’est-ce que tu fais dans la vie ?', '', 'What do you do for a living?'],
      ['Je suis étudiant(e).', '', 'I’m a student.'],
      ['Qu’est-ce que tu aimes faire ?', '', 'What do you like doing?'],
      ['Je viens de Singapour.', '', 'I’m from Singapore.'],
      ['J’apprends le français.', '', 'I’m learning French.'],
      ['Enchanté(e) !', '', 'Nice to meet you!'],
      ['À bientôt !', '', 'See you soon!']
    ],
    'Food & drink': [
      ['Bon appétit !', '', 'Enjoy your meal!'],
      ['Une carafe d’eau, s’il vous plaît.', '', 'A jug of tap water, please.'],
      ['C’est délicieux !', '', 'It’s delicious!'],
      ['Je suis allergique aux arachides.', '', 'I’m allergic to peanuts.'],
      ['Une table pour deux, s’il vous plaît.', '', 'A table for two, please.'],
      ['À emporter, s’il vous plaît.', '', 'To take away, please.'],
      ['J’ai bien mangé.', '', 'That was a good meal / I’m full.']
    ],
    'Getting around': [
      ['Où est la gare ?', '', 'Where is the station?'],
      ['Ce train va à Lyon ?', '', 'Does this train go to Lyon?'],
      ['Tout droit.', '', 'Straight ahead.'],
      ['Tournez à droite.', '', 'Turn right.'],
      ['Arrêtez-vous ici, s’il vous plaît.', '', 'Stop here, please.'],
      ['Je suis perdu(e).', '', 'I’m lost.'],
      ['C’est loin ?', '', 'Is it far?']
    ],
    'Making plans': [
      ['Tu es dispo quand ?', '', 'When are you free?'],
      ['J’ai hâte !', '', 'I can’t wait!'],
      ['J’ai un empêchement.', '', 'Something’s come up.'],
      ['Envoie-moi un message quand tu arrives.', '', 'Message me when you arrive.'],
      ['On se retrouve où ?', '', 'Where shall we meet?']
    ],
    'Eating out & shopping': [
      ['Vous avez moins cher ?', '', 'Do you have anything cheaper?'],
      ['Vous l’avez dans une autre taille ?', '', 'Do you have it in another size?'],
      ['Je n’ai pas besoin de sac.', '', 'I don’t need a bag.'],
      ['Je peux avoir le ticket ?', '', 'Can I have the receipt?'],
      ['Gardez la monnaie.', '', 'Keep the change.']
    ],
    'Giving opinions': [
      ['Honnêtement …', '', 'Honestly …'],
      ['Ce n’est pas faux.', '', 'Fair point.'],
      ['Je comprends ce que tu ressens.', '', 'I understand how you feel.'],
      ['Je penche plutôt pour …', '', 'I lean more towards …'],
      ['Ça se discute.', '', 'That’s debatable.']
    ],
    'Work & study': [
      ['Je peux te demander un conseil ?', '', 'Can I ask your advice?'],
      ['Je vérifie plus tard.', '', 'I’ll check later.'],
      ['Je ne vais pas y arriver à temps.', '', 'I won’t make it in time.'],
      ['Je peux t’aider ?', '', 'Can I help you?'],
      ['Ça marche.', '', 'Sounds good / Will do.']
    ],
    Nuance: [
      ['J’ai l’impression que …', '', 'I get the feeling that …'],
      ['par précaution', '', 'as a precaution'],
      ['si possible', '', 'if possible'],
      ['pour l’instant', '', 'for now'],
      ['Chapeau !', '', 'Hats off! / Impressive!']
    ],
    'Formal letters & emails': [
      ['J’espère que vous allez bien.', '', 'I hope you are well.'],
      ['Est-ce que … vous conviendrait ?', '', 'Would … suit you?'],
      ['Je reste à votre disposition pour toute question.', '', 'I remain available for any questions.'],
      ['Merci d’avance.', '', 'Thanks in advance.'],
      ['Dans l’attente de votre réponse,', '', 'Looking forward to your reply,']
    ],
    'Formal writing': [
      ['Concernant …', '', 'Regarding …'],
      ['Sur la base de …', '', 'On the basis of …'],
      ['Pour commencer par la conclusion …', '', 'To start with the conclusion …'],
      ['Je vous remercie de votre attention.', '', 'Thank you for your attention.']
    ],
    'Idioms (expressions)': [
      ['croiser les doigts', '', 'to keep your fingers crossed'],
      ['ça me fait une belle jambe', '', 'a lot of good that does me'],
      ['avoir la flemme', '', 'to not be able to be bothered'],
      ['en avoir ras le bol', '', 'to be fed up'],
      ['tomber dans les pommes', '', 'to faint']
    ]
  }
}

/** Whole new everyday categories, by language → level. */
export const NEW_GROUPS: Record<string, Partial<Record<TierId, Group[]>>> = {
  ja: {
    A1: [
      {
        title: 'Small talk & reactions',
        items: [
          ['いい天気ですね。', 'ii tenki desu ne.', 'Nice weather, isn’t it?'],
          ['暑いですね。', 'atsui desu ne.', 'It’s hot, isn’t it?'],
          ['本当？', 'hontō?', 'Really?'],
          ['すごい！', 'sugoi!', 'Amazing!'],
          ['残念ですね。', 'zannen desu ne.', 'That’s a shame.'],
          ['おめでとうございます！', 'omedetō gozaimasu!', 'Congratulations!'],
          ['お大事に。', 'odaiji ni.', 'Get well soon / take care.'],
          ['楽しかったです。', 'tanoshikatta desu.', 'I had fun.']
        ]
      },
      {
        title: 'Help & emergencies',
        items: [
          ['助けて！', 'tasukete!', 'Help!'],
          ['救急車を呼んでください。', 'kyūkyūsha o yonde kudasai.', 'Please call an ambulance.'],
          ['気分が悪いです。', 'kibun ga warui desu.', 'I feel unwell.'],
          ['財布をなくしました。', 'saifu o nakushimashita.', 'I’ve lost my wallet.'],
          ['交番はどこですか。', 'kōban wa doko desu ka.', 'Where is the police box?'],
          ['薬局はありますか。', 'yakkyoku wa arimasu ka.', 'Is there a pharmacy?'],
          ['英語を話せる人はいますか。', 'eigo o hanaseru hito wa imasu ka.', 'Is there anyone who speaks English?']
        ]
      }
    ],
    A2: [
      {
        title: 'Phone & messaging',
        items: [
          ['もしもし。', 'moshi moshi.', 'Hello? (on the phone)'],
          ['今、話せますか。', 'ima, hanasemasu ka.', 'Can you talk now?'],
          ['後でかけ直します。', 'ato de kakenaoshimasu.', 'I’ll call you back later.'],
          ['メッセージを送りますね。', 'messēji o okurimasu ne.', 'I’ll send you a message.'],
          ['既読スルーしないで！', 'kidoku surū shinaide!', 'Don’t leave me on read!'],
          ['充電が切れそうです。', 'jūden ga kiresō desu.', 'My battery is about to die.']
        ]
      }
    ]
  },
  zh: {
    A1: [
      {
        title: 'Small talk & reactions',
        items: [
          ['今天天气真好。', 'jīntiān tiānqì zhēn hǎo.', 'The weather’s really nice today.'],
          ['好热啊！', 'hǎo rè a!', 'It’s so hot!'],
          ['真的吗？', 'zhēn de ma?', 'Really?'],
          ['太棒了！', 'tài bàng le!', 'That’s great!'],
          ['太可惜了。', 'tài kěxī le.', 'What a pity.'],
          ['恭喜！', 'gōngxǐ!', 'Congratulations!'],
          ['多保重。', 'duō bǎozhòng.', 'Take care.'],
          ['玩得很开心。', 'wán de hěn kāixīn.', 'I had a great time.']
        ]
      },
      {
        title: 'Help & emergencies',
        items: [
          ['救命！', 'jiùmìng!', 'Help!'],
          ['请叫救护车。', 'qǐng jiào jiùhùchē.', 'Please call an ambulance.'],
          ['我不舒服。', 'wǒ bù shūfu.', 'I don’t feel well.'],
          ['我的钱包丢了。', 'wǒ de qiánbāo diū le.', 'I’ve lost my wallet.'],
          ['警察局在哪儿？', 'jǐngchájú zài nǎr?', 'Where is the police station?'],
          ['附近有药房吗？', 'fùjìn yǒu yàofáng ma?', 'Is there a pharmacy nearby?'],
          ['有人会说英语吗？', 'yǒu rén huì shuō Yīngyǔ ma?', 'Does anyone speak English?']
        ]
      }
    ],
    A2: [
      {
        title: 'Phone & messaging',
        items: [
          ['喂？', 'wéi?', 'Hello? (on the phone)'],
          ['你现在方便说话吗？', 'nǐ xiànzài fāngbiàn shuōhuà ma?', 'Is now a good time to talk?'],
          ['我等一下打给你。', 'wǒ děng yíxià dǎ gěi nǐ.', 'I’ll call you back in a bit.'],
          ['我发信息给你。', 'wǒ fā xìnxī gěi nǐ.', 'I’ll send you a message.'],
          ['怎么不回我信息？', 'zěnme bù huí wǒ xìnxī?', 'Why aren’t you replying?'],
          ['我手机快没电了。', 'wǒ shǒujī kuài méi diàn le.', 'My phone is about to die.']
        ]
      }
    ]
  },
  de: {
    A1: [
      {
        title: 'Small talk & reactions',
        items: [
          ['Schönes Wetter heute, oder?', '', 'Nice weather today, isn’t it?'],
          ['Es ist so heiß!', '', 'It’s so hot!'],
          ['Echt?', '', 'Really?'],
          ['Super!', '', 'Great!'],
          ['Schade.', '', 'What a shame.'],
          ['Herzlichen Glückwunsch!', '', 'Congratulations!'],
          ['Gute Besserung!', '', 'Get well soon!'],
          ['Es hat Spaß gemacht.', '', 'It was fun.']
        ]
      },
      {
        title: 'Help & emergencies',
        items: [
          ['Hilfe!', '', 'Help!'],
          ['Rufen Sie bitte einen Krankenwagen!', '', 'Please call an ambulance!'],
          ['Mir ist schlecht.', '', 'I feel sick.'],
          ['Ich habe meinen Geldbeutel verloren.', '', 'I’ve lost my wallet.'],
          ['Wo ist die Polizei?', '', 'Where is the police?'],
          ['Gibt es hier eine Apotheke?', '', 'Is there a pharmacy here?'],
          ['Spricht hier jemand Englisch?', '', 'Does anyone here speak English?']
        ]
      }
    ],
    A2: [
      {
        title: 'Phone & messaging',
        items: [
          ['Hallo, hier ist …', '', 'Hello, this is … (on the phone)'],
          ['Passt es gerade?', '', 'Is now a good time?'],
          ['Ich rufe dich später zurück.', '', 'I’ll call you back later.'],
          ['Ich schreibe dir.', '', 'I’ll text you.'],
          ['Warum antwortest du nicht?', '', 'Why aren’t you answering?'],
          ['Mein Akku ist fast leer.', '', 'My battery is almost dead.']
        ]
      }
    ]
  },
  fr: {
    A1: [
      {
        title: 'Small talk & reactions',
        items: [
          ['Il fait beau aujourd’hui !', '', 'It’s lovely today!'],
          ['Il fait chaud !', '', 'It’s hot!'],
          ['C’est vrai ?', '', 'Really?'],
          ['Génial !', '', 'Great!'],
          ['Dommage.', '', 'What a shame.'],
          ['Félicitations !', '', 'Congratulations!'],
          ['Bon rétablissement !', '', 'Get well soon!'],
          ['C’était super.', '', 'It was great.']
        ]
      },
      {
        title: 'Help & emergencies',
        items: [
          ['Au secours !', '', 'Help!'],
          ['Appelez une ambulance, s’il vous plaît !', '', 'Please call an ambulance!'],
          ['Je ne me sens pas bien.', '', 'I don’t feel well.'],
          ['J’ai perdu mon portefeuille.', '', 'I’ve lost my wallet.'],
          ['Où est le commissariat ?', '', 'Where is the police station?'],
          ['Il y a une pharmacie près d’ici ?', '', 'Is there a pharmacy nearby?'],
          ['Quelqu’un parle anglais ?', '', 'Does anyone speak English?']
        ]
      }
    ],
    A2: [
      {
        title: 'Phone & messaging',
        items: [
          ['Allô ?', '', 'Hello? (on the phone)'],
          ['Tu peux parler, là ?', '', 'Can you talk right now?'],
          ['Je te rappelle plus tard.', '', 'I’ll call you back later.'],
          ['Je t’envoie un message.', '', 'I’ll text you.'],
          ['Pourquoi tu ne réponds pas ?', '', 'Why aren’t you answering?'],
          ['Je n’ai presque plus de batterie.', '', 'My battery is almost dead.']
        ]
      }
    ]
  }
}

// ---------- C2: mastery (above Advanced) ----------

const C2 = 'Mastery'

export const C2_TIERS: Record<string, Tier> = {
  ja: {
    id: 'C2',
    label: C2,
    phrases: [
      {
        title: 'Natural speech',
        items: [
          ['てか', 'teka', 'I mean / anyway (casual)'],
          ['っていうか', 'tte iu ka', 'or rather'],
          ['まあね', 'mā ne', 'well, yeah'],
          ['なんか', 'nanka', 'like, kind of (filler)'],
          ['やばい', 'yabai', 'crazy (good or bad)'],
          ['ウケる', 'ukeru', 'that’s hilarious'],
          ['しょうがない', 'shō ga nai', 'it can’t be helped'],
          ['お疲れ！', 'otsukare!', 'good work! / see you (casual)']
        ]
      },
      {
        title: 'Proverbs (ことわざ)',
        items: [
          ['石の上にも三年', 'ishi no ue ni mo sannen', 'perseverance pays off (three years on a cold stone)'],
          ['花より団子', 'hana yori dango', 'substance over style (dumplings over flowers)'],
          ['案ずるより産むが易し', 'anzuru yori umu ga yasashi', 'it’s easier done than worried about'],
          ['急がば回れ', 'isogaba maware', 'more haste, less speed'],
          ['井の中の蛙大海を知らず', 'i no naka no kawazu taikai o shirazu', 'a frog in a well knows nothing of the sea'],
          ['塵も積もれば山となる', 'chiri mo tsumoreba yama to naru', 'even dust piles up into a mountain']
        ]
      }
    ],
    vocab: [
      {
        title: 'Words with no neat translation',
        items: [
          ['懐かしい', 'natsukashii', 'warmly nostalgic'],
          ['切ない', 'setsunai', 'bittersweet, aching'],
          ['面倒くさい', 'mendōkusai', 'too much hassle'],
          ['もったいない', 'mottainai', 'too good to waste'],
          ['気まずい', 'kimazui', 'awkward'],
          ['甘える', 'amaeru', 'to lean on someone’s kindness'],
          ['頑張る', 'ganbaru', 'to keep at it, do your best'],
          ['空気を読む', 'kūki o yomu', 'to read the room']
        ]
      },
      {
        title: 'Literary words',
        items: [
          ['儚い', 'hakanai', 'fleeting, fragile'],
          ['趣', 'omomuki', 'quiet charm, atmosphere'],
          ['侘び寂び', 'wabi-sabi', 'beauty in the imperfect and impermanent'],
          ['刹那', 'setsuna', 'an instant'],
          ['黄昏', 'tasogare', 'twilight'],
          ['面影', 'omokage', 'a trace or likeness of the past']
        ]
      }
    ],
    lessons: [
      {
        title: 'Sentence-final particles: ね, よ, よね, かな, っけ',
        body: ['They carry attitude: ね seeks agreement, よ gives new information, よね checks something you both know, かな wonders aloud, っけ asks to be reminded.'],
        examples: [
          ['今日は休みだっけ？', 'kyō wa yasumi da kke?', 'Was today a holiday again?'],
          ['これ、おいしいよね。', 'kore, oishii yo ne.', 'This is good, right?']
        ]
      },
      {
        title: 'Contractions in speech',
        body: ['ている → てる, ておく → とく, てしまう → ちゃう, なければ → なきゃ, ては → ちゃ.'],
        examples: [
          ['全部食べちゃった。', 'zenbu tabechatta.', 'I ate it all (oops).'],
          ['もう行かなきゃ。', 'mō ikanakya.', 'I have to go now.']
        ]
      },
      {
        title: 'Leaving things unsaid',
        body: ['Advanced Japanese drops subjects and objects whenever the context makes them clear; giving/receiving verbs and honorifics tell you who did what to whom.'],
        examples: [['教えてくれてありがとう。', 'oshiete kurete arigatō.', 'Thanks for telling me (“you → me” is implied).']]
      }
    ]
  },
  zh: {
    id: 'C2',
    label: C2,
    phrases: [
      {
        title: 'Natural speech',
        items: [
          ['就是说', 'jiùshì shuō', 'I mean, that is'],
          ['那个…', 'nàge…', 'um… (filler)'],
          ['好吧', 'hǎo ba', 'fine, alright then'],
          ['随便', 'suíbiàn', 'whatever, up to you'],
          ['真的假的？', 'zhēn de jiǎ de?', 'For real?'],
          ['绝了！', 'jué le!', 'Incredible!'],
          ['算了', 'suàn le', 'forget it'],
          ['加油！', 'jiāyóu!', 'You can do it!']
        ]
      },
      {
        title: 'Sayings (俗语)',
        items: [
          ['三个臭皮匠，顶个诸葛亮', 'sān ge chòu píjiàng, dǐng ge Zhūgě Liàng', 'three ordinary heads beat one genius'],
          ['活到老，学到老', 'huó dào lǎo, xué dào lǎo', 'you’re never too old to learn'],
          ['不入虎穴，焉得虎子', 'bú rù hǔxué, yān dé hǔzǐ', 'nothing ventured, nothing gained'],
          ['千里之行，始于足下', 'qiān lǐ zhī xíng, shǐ yú zú xià', 'a journey of a thousand miles starts with one step'],
          ['有志者事竟成', 'yǒu zhì zhě shì jìng chéng', 'where there’s a will, there’s a way']
        ]
      }
    ],
    vocab: [
      {
        title: 'Words with no neat translation',
        items: [
          ['舍不得', 'shěbude', 'can’t bear to part with'],
          ['心疼', 'xīnténg', 'to ache for someone; to treasure'],
          ['面子', 'miànzi', 'face, standing'],
          ['讲究', 'jiǎngjiu', 'particular, refined'],
          ['尴尬', 'gāngà', 'awkward'],
          ['撒娇', 'sājiāo', 'to act cute, playfully needy'],
          ['靠谱', 'kàopǔ', 'reliable, makes sense'],
          ['内卷', 'nèijuǎn', 'pointless over-competition (involution)']
        ]
      },
      {
        title: 'Literary words',
        items: [
          ['惆怅', 'chóuchàng', 'melancholy, wistful'],
          ['缥缈', 'piāomiǎo', 'misty, elusive'],
          ['沧桑', 'cāngsāng', 'the changes and hardships of time'],
          ['刹那', 'chànà', 'an instant'],
          ['黄昏', 'huánghūn', 'dusk'],
          ['缘分', 'yuánfèn', 'the fate that brings people together']
        ]
      }
    ],
    lessons: [
      {
        title: 'Modal particles: 吧, 呢, 啊, 嘛',
        body: ['吧 suggests or seeks agreement; 呢 asks “what about…?” or marks something ongoing; 啊 softens or adds feeling; 嘛 says “obviously”.'],
        examples: [
          ['你呢？', 'nǐ ne?', 'And you?'],
          ['这是常识嘛。', 'zhè shì chángshí ma.', 'It’s common sense, obviously.']
        ]
      },
      {
        title: 'Two-part allegorical sayings (歇后语)',
        body: ['A riddle-like saying: the first half paints an image, the second half (often left unsaid) gives the meaning — frequently through a pun.'],
        examples: [['外甥打灯笼——照舅（照旧）', 'wàisheng dǎ dēnglong — zhào jiù', '“as before” — 舅 (uncle) sounds like 旧 (old)']]
      },
      {
        title: 'Reduplication for tone',
        body: ['Repeating a verb softens it (看看, 试试); repeating an adjective makes it vivid (高高兴兴, 干干净净).'],
        examples: [
          ['我们去走走吧。', 'wǒmen qù zǒuzou ba.', 'Let’s go for a little walk.'],
          ['房间收拾得干干净净。', 'fángjiān shōushi de gāngān jìngjìng.', 'The room is spotless.']
        ]
      }
    ]
  },
  de: {
    id: 'C2',
    label: C2,
    phrases: [
      {
        title: 'Natural speech',
        items: [
          ['Na ja …', '', 'Well …'],
          ['Also …', '', 'So … / well …'],
          ['Ist halt so.', '', 'That’s just how it is.'],
          ['Krass!', '', 'Wow! / crazy!'],
          ['Quatsch!', '', 'Nonsense!'],
          ['Keine Ahnung.', '', 'No idea.'],
          ['Passt schon.', '', 'It’s fine.'],
          ['Mach’s gut!', '', 'Take care!']
        ]
      },
      {
        title: 'Sayings (Sprichwörter)',
        items: [
          ['Aller Anfang ist schwer.', '', 'Every beginning is hard.'],
          ['Übung macht den Meister.', '', 'Practice makes perfect.'],
          ['Wer rastet, der rostet.', '', 'If you rest, you rust.'],
          ['Ende gut, alles gut.', '', 'All’s well that ends well.'],
          ['Lügen haben kurze Beine.', '', 'Lies don’t get you far.'],
          ['Morgenstund hat Gold im Mund.', '', 'The early bird catches the worm.']
        ]
      }
    ],
    vocab: [
      {
        title: 'Words with no neat translation',
        items: [
          ['die Gemütlichkeit', '', 'cosy warmth, feeling at home'],
          ['die Schadenfreude', '', 'pleasure at someone else’s misfortune'],
          ['das Fernweh', '', 'longing for faraway places'],
          ['die Torschlusspanik', '', 'fear that life’s chances are running out'],
          ['der Feierabend', '', 'the end of the workday — free time'],
          ['verschlimmbessern', '', 'to make worse by trying to improve'],
          ['doch', '', 'yes (contradicting a negative)'],
          ['eigentlich', '', 'actually, really']
        ]
      },
      {
        title: 'Literary words',
        items: [
          ['die Sehnsucht', '', 'deep longing'],
          ['vergänglich', '', 'transient'],
          ['die Dämmerung', '', 'twilight'],
          ['der Augenblick', '', 'moment, the blink of an eye'],
          ['die Wehmut', '', 'wistful melancholy'],
          ['erhaben', '', 'sublime, lofty']
        ]
      }
    ],
    lessons: [
      {
        title: 'Modal particles: doch, ja, mal, halt, eben',
        body: ['They add tone, not meaning: doch (come on / surely), ja (as we both know), mal (softens a request), halt / eben (that’s just how it is).'],
        examples: [
          ['Komm doch mit!', '', 'Come along, why don’t you!'],
          ['Mach mal das Fenster auf.', '', 'Just open the window, would you.']
        ]
      },
      {
        title: 'How people really talk',
        body: ['Speech drops endings (ich hab, ich geh), uses weil with main-clause order (weil – ich hab keine Zeit), and swaps dass-clauses for simpler sentences.'],
        examples: [['Ich hab heute keine Lust.', '', 'I can’t be bothered today.']]
      },
      {
        title: 'Building compound nouns',
        body: ['German stacks nouns to make precise new words; the last part sets the gender and the core meaning.'],
        examples: [
          ['der Handschuh', '', 'glove (hand + shoe)'],
          ['die Weltanschauung', '', 'world view']
        ]
      }
    ]
  },
  fr: {
    id: 'C2',
    label: C2,
    phrases: [
      {
        title: 'Natural speech',
        items: [
          ['Bah …', '', 'Well … (filler)'],
          ['Du coup', '', 'so, as a result (very common filler)'],
          ['Genre', '', 'like (filler)'],
          ['Grave !', '', 'Totally!'],
          ['N’importe quoi !', '', 'Nonsense!'],
          ['Aucune idée.', '', 'No idea.'],
          ['T’inquiète.', '', 'Don’t worry.'],
          ['Bon ben, j’y vais.', '', 'Right then, I’m off.']
        ]
      },
      {
        title: 'Sayings (proverbes)',
        items: [
          ['Petit à petit, l’oiseau fait son nid.', '', 'Little by little the bird builds its nest.'],
          ['C’est en forgeant qu’on devient forgeron.', '', 'Practice makes perfect.'],
          ['Qui ne tente rien n’a rien.', '', 'Nothing ventured, nothing gained.'],
          ['Tout est bien qui finit bien.', '', 'All’s well that ends well.'],
          ['L’habit ne fait pas le moine.', '', 'Don’t judge a book by its cover.'],
          ['Il ne faut pas vendre la peau de l’ours avant de l’avoir tué.', '', 'Don’t count your chickens before they hatch.']
        ]
      }
    ],
    vocab: [
      {
        title: 'Words with no neat translation',
        items: [
          ['la flânerie', '', 'unhurried strolling for its own sake'],
          ['le dépaysement', '', 'the feeling of being somewhere new'],
          ['l’esprit de l’escalier', '', 'the perfect reply you think of too late'],
          ['les retrouvailles', '', 'the joy of meeting again'],
          ['le savoir-vivre', '', 'good manners, the art of living'],
          ['bof', '', 'meh'],
          ['quand même', '', 'all the same, still'],
          ['la nostalgie', '', 'nostalgia']
        ]
      },
      {
        title: 'Literary words',
        items: [
          ['éphémère', '', 'ephemeral'],
          ['la mélancolie', '', 'melancholy'],
          ['le crépuscule', '', 'twilight'],
          ['l’instant', '', 'the moment'],
          ['la langueur', '', 'languor'],
          ['sublime', '', 'sublime']
        ]
      }
    ],
    lessons: [
      {
        title: 'Discourse markers: du coup, bref, en fait, quand même',
        body: ['They organise speech: du coup (so), bref (anyway), en fait (actually), quand même (still, all the same).'],
        examples: [
          ['Du coup, on fait quoi ?', '', 'So, what are we doing?'],
          ['Il est quand même sympa.', '', 'He’s nice, all the same.']
        ]
      },
      {
        title: 'Inversion and register',
        body: ['Formal questions invert subject and verb (Avez-vous… ?); everyday speech keeps statement order with rising intonation (Vous avez… ?).'],
        examples: [
          ['Pourriez-vous m’indiquer la gare ?', '', 'Could you direct me to the station? (formal)'],
          ['Tu viens ?', '', 'Are you coming? (casual)']
        ]
      },
      {
        title: 'Verlan and shortened words',
        body: ['Verlan reverses syllables (louche → chelou, fou → ouf); speech shortens words (resto, appart, d’acc).'],
        examples: [
          ['C’est chelou.', '', 'That’s weird.'],
          ['On va au resto ?', '', 'Shall we go to a restaurant?']
        ]
      }
    ]
  }
}

/** A tier with the extra phrases and categories merged in (duplicates skipped). */
export function enrich(code: string, tier: Tier): Tier {
  const extra = EXTRA_PHRASES[code] ?? {}
  const phrases = tier.phrases.map((g) => {
    const seen = new Set(g.items.map((e) => e[0]))
    return { ...g, items: [...g.items, ...(extra[g.title] ?? []).filter((e) => !seen.has(e[0]))] }
  })
  return { ...tier, phrases: [...phrases, ...(NEW_GROUPS[code]?.[tier.id] ?? [])] }
}
