// DevKit's built-in library: landmark AI papers, concepts, geopolitics frameworks,
// philosophy, mental models and builder's principles. One of each is featured daily.

export interface Paper {
  title: string
  authors: string
  year: number
  url: string
  why: string
}
export interface Card {
  title: string
  who?: string
  body: string
  ask?: string // a question to think about
}

export const PAPERS: Paper[] = [
  { title: 'Attention Is All You Need', authors: 'Vaswani et al.', year: 2017, url: 'https://arxiv.org/abs/1706.03762', why: 'Introduced the Transformer — the architecture behind essentially every modern language model.' },
  { title: 'Deep Residual Learning for Image Recognition (ResNet)', authors: 'He et al.', year: 2015, url: 'https://arxiv.org/abs/1512.03385', why: 'Skip connections made very deep networks trainable; the idea lives on inside Transformers.' },
  { title: 'Playing Atari with Deep Reinforcement Learning (DQN)', authors: 'Mnih et al.', year: 2013, url: 'https://arxiv.org/abs/1312.5602', why: 'One network learned many games from pixels — the start of deep RL.' },
  { title: 'Outrageously Large Neural Networks: Sparsely-Gated Mixture-of-Experts', authors: 'Shazeer et al.', year: 2017, url: 'https://arxiv.org/abs/1701.06538', why: 'Route each token to a few "experts" — more parameters without more compute per token.' },
  { title: 'Proximal Policy Optimization (PPO)', authors: 'Schulman et al.', year: 2017, url: 'https://arxiv.org/abs/1707.06347', why: 'A stable, simple RL algorithm — later the workhorse of RLHF.' },
  { title: 'BERT: Pre-training of Deep Bidirectional Transformers', authors: 'Devlin et al.', year: 2018, url: 'https://arxiv.org/abs/1810.04805', why: 'Showed pre-train-then-fine-tune works across language tasks.' },
  { title: 'Scaling Laws for Neural Language Models', authors: 'Kaplan et al.', year: 2020, url: 'https://arxiv.org/abs/2001.08361', why: 'Loss falls predictably with more compute, data and parameters — the bet behind giant models.' },
  { title: 'Language Models are Few-Shot Learners (GPT-3)', authors: 'Brown et al.', year: 2020, url: 'https://arxiv.org/abs/2005.14165', why: 'At scale, models learn tasks from a few examples in the prompt (in-context learning).' },
  { title: 'Retrieval-Augmented Generation (RAG)', authors: 'Lewis et al.', year: 2020, url: 'https://arxiv.org/abs/2005.11401', why: 'Look things up, then generate — the pattern behind most "chat with your documents" apps.' },
  { title: 'Denoising Diffusion Probabilistic Models', authors: 'Ho et al.', year: 2020, url: 'https://arxiv.org/abs/2006.11239', why: 'Generate by learning to remove noise — the foundation of modern image generators.' },
  { title: 'An Image is Worth 16x16 Words (ViT)', authors: 'Dosovitskiy et al.', year: 2020, url: 'https://arxiv.org/abs/2010.11929', why: 'Transformers work on images too, treating patches like words.' },
  { title: 'CLIP: Learning Transferable Visual Models From Natural Language Supervision', authors: 'Radford et al.', year: 2021, url: 'https://arxiv.org/abs/2103.00020', why: 'Matched images and captions at internet scale — linking vision and language.' },
  { title: 'LoRA: Low-Rank Adaptation of Large Language Models', authors: 'Hu et al.', year: 2021, url: 'https://arxiv.org/abs/2106.09685', why: 'Fine-tune huge models cheaply by training tiny add-on matrices.' },
  { title: 'High-Resolution Image Synthesis with Latent Diffusion', authors: 'Rombach et al.', year: 2021, url: 'https://arxiv.org/abs/2112.10752', why: 'Diffusion in a compressed space — the paper behind Stable Diffusion.' },
  { title: 'Chain-of-Thought Prompting Elicits Reasoning', authors: 'Wei et al.', year: 2022, url: 'https://arxiv.org/abs/2201.11903', why: 'Asking for step-by-step reasoning boosts accuracy on hard problems.' },
  { title: 'Training Language Models to Follow Instructions with Human Feedback (InstructGPT)', authors: 'Ouyang et al.', year: 2022, url: 'https://arxiv.org/abs/2203.02155', why: 'RLHF turned raw predictors into helpful assistants.' },
  { title: 'Training Compute-Optimal Large Language Models (Chinchilla)', authors: 'Hoffmann et al.', year: 2022, url: 'https://arxiv.org/abs/2203.15556', why: 'Most models were under-trained: scale data along with parameters.' },
  { title: 'FlashAttention', authors: 'Dao et al.', year: 2022, url: 'https://arxiv.org/abs/2205.14135', why: 'Exact attention, much faster, by being careful about GPU memory — systems matter.' },
  { title: 'ReAct: Synergizing Reasoning and Acting', authors: 'Yao et al.', year: 2022, url: 'https://arxiv.org/abs/2210.03629', why: 'Interleave thinking and tool use — a blueprint for AI agents.' },
  { title: 'Constitutional AI: Harmlessness from AI Feedback', authors: 'Bai et al.', year: 2022, url: 'https://arxiv.org/abs/2212.08073', why: 'Train behaviour from written principles and AI feedback instead of only human labels.' },
  { title: 'Toolformer: Language Models Can Teach Themselves to Use Tools', authors: 'Schick et al.', year: 2023, url: 'https://arxiv.org/abs/2302.04761', why: 'Models learning when to call calculators, search and APIs.' },
  { title: 'LLaMA: Open and Efficient Foundation Language Models', authors: 'Touvron et al.', year: 2023, url: 'https://arxiv.org/abs/2302.13971', why: 'Strong open-weight models kick-started the open-source LLM ecosystem.' },
  { title: 'Direct Preference Optimization (DPO)', authors: 'Rafailov et al.', year: 2023, url: 'https://arxiv.org/abs/2305.18290', why: 'Learn from preferences without a separate reward model or RL loop.' }
]

export const AI_CONCEPTS: Card[] = [
  { title: 'Token', body: 'The unit a language model reads and writes — roughly ¾ of an English word. Prices, limits and speed are all counted in tokens.' },
  { title: 'Embedding', body: 'A list of numbers representing meaning. Similar things have nearby embeddings — the basis of semantic search.' },
  { title: 'Attention', body: 'Each token looks at every other token and decides what matters for it. Self-attention is the core operation of a Transformer.' },
  { title: 'Pre-training', body: 'Learning to predict the next token over a huge text corpus. Most of a model’s knowledge comes from here.' },
  { title: 'Fine-tuning', body: 'Further training on a smaller, targeted dataset to specialise behaviour or style.' },
  { title: 'RLHF', body: 'Reinforcement learning from human feedback: people rank outputs, a reward model learns their taste, and the model is tuned to score well.' },
  { title: 'Context window', body: 'How much text the model can consider at once. Bigger windows let it read whole codebases or books, but cost more.' },
  { title: 'In-context learning', body: 'Learning a task from examples inside the prompt, with no weight updates.' },
  { title: 'Hallucination', body: 'Confident output that is false. Models predict plausible text, not verified facts — always check claims that matter.' },
  { title: 'RAG', body: 'Retrieval-augmented generation: fetch relevant documents first, then answer using them. Reduces hallucination and adds fresh knowledge.' },
  { title: 'Agent', body: 'A model in a loop that plans, calls tools (search, code, APIs) and acts on the results until a goal is met.' },
  { title: 'Evals', body: 'Tests that measure what a model can do. Public benchmarks saturate fast; your own task-specific evals are what tell you if something works.' },
  { title: 'Scaling laws', body: 'Empirical curves showing performance improves predictably with compute, data and parameters.' },
  { title: 'Mixture of experts', body: 'Many sub-networks where only a few run per token: a huge total size with modest compute per step.' },
  { title: 'Quantisation', body: 'Storing weights with fewer bits (e.g. 4-bit) so models run on smaller hardware, at a small quality cost.' },
  { title: 'Distillation', body: 'Training a small "student" model to imitate a big "teacher" — cheaper models that keep much of the skill.' },
  { title: 'Alignment', body: 'Getting AI systems to reliably do what their developers and users intend — and not what they don’t.' },
  { title: 'Interpretability', body: 'Reverse-engineering what is happening inside a network: which features and circuits produce a behaviour.' },
  { title: 'Diffusion model', body: 'A generator that starts from noise and removes it step by step, guided by a prompt. Used for images, audio and video.' },
  { title: 'Overfitting', body: 'Memorising the training data instead of learning the pattern. Watch the gap between training and held-out performance.' },
  { title: 'Reasoning models', body: 'Models trained to spend extra tokens thinking before answering — trading time for accuracy on hard problems.' },
  { title: 'Open weights', body: 'Model weights you can download and run yourself, as opposed to models only available through an API.' }
]

export const GEO_CONCEPTS: Card[] = [
  { title: 'Realism', body: 'States act to survive in an anarchic world with no global police: power and security come first, ideals second.', ask: 'Which recent events does realism explain well — and which badly?' },
  { title: 'Liberal internationalism', body: 'Trade, institutions and democracy can make cooperation durable and war less likely.', ask: 'When have institutions actually constrained a powerful state?' },
  { title: 'Constructivism', body: 'Interests aren’t fixed: identities, norms and ideas shape what states want.', ask: 'How did a norm (e.g. against chemical weapons) change behaviour?' },
  { title: 'Balance of power', body: 'When one state grows strong, others tend to arm or ally to balance it.', ask: 'Who is balancing whom right now?' },
  { title: 'Deterrence', body: 'Preventing an attack by making its cost look higher than its gain. Needs capability, credibility and clear communication.', ask: 'What makes a threat credible?' },
  { title: 'Security dilemma', body: 'One side’s defensive build-up looks threatening to another, who builds up in turn — spirals nobody wanted.', ask: 'Where is a spiral happening today?' },
  { title: 'Thucydides trap', body: 'Graham Allison’s term for the danger when a rising power challenges an established one.', ask: 'Is the analogy useful, or does it make conflict sound inevitable?' },
  { title: 'Polarity', body: 'How power is spread: one superpower (unipolar), two (bipolar) or several (multipolar). Each has different risks.', ask: 'How would you describe today’s order?' },
  { title: 'Soft power', body: 'Joseph Nye’s idea of getting what you want through attraction — culture, values, legitimacy — rather than force or payment.', ask: 'Which countries gained or lost soft power recently, and why?' },
  { title: 'Sanctions', body: 'Economic pressure to change behaviour. Effects are often slower and leakier than hoped; they work best with broad coalitions.', ask: 'What would success look like for a given sanctions regime?' },
  { title: 'Grey-zone tactics', body: 'Coercion below the threshold of open war: cyber attacks, militias, disinformation, coast-guard pressure.', ask: 'Why do states prefer the grey zone?' },
  { title: 'Proxy conflict', body: 'Powers back opposing sides in someone else’s war to compete without fighting each other directly.' },
  { title: 'Chokepoints', body: 'Narrow routes much of world trade passes through: the straits of Hormuz, Malacca, Bab el-Mandeb and the Bosporus; the Suez and Panama canals.', ask: 'What happens to prices if one closes for a month?' },
  { title: 'Hedging', body: 'Middle powers keeping options open with several great powers instead of picking a side.' },
  { title: 'Sovereignty', body: 'The principle that states govern their own territory without outside interference — the foundation of the modern state system.' }
]

export const INSTITUTIONS: Card[] = [
  { title: 'UN Security Council', body: '15 members; five permanent members with a veto: the US, UK, France, Russia and China. Can authorise force and sanctions.' },
  { title: 'NATO', body: 'Transatlantic military alliance founded in 1949. Article 5: an attack on one is an attack on all.' },
  { title: 'European Union', body: 'Political and economic union with a single market; most members share the euro.' },
  { title: 'G7 / G20', body: 'Forums of major economies. The G7 are large advanced democracies; the G20 adds big emerging economies.' },
  { title: 'BRICS', body: 'A grouping started by Brazil, Russia, India, China and South Africa that has since added more members; a forum for non-Western powers.' },
  { title: 'ASEAN', body: 'Association of Southeast Asian Nations — regional cooperation in a strategically central region.' },
  { title: 'African Union', body: 'Continental body of African states working on peace, security and integration.' },
  { title: 'WTO', body: 'Sets and arbitrates the rules of international trade.' },
  { title: 'IMF and World Bank', body: 'The IMF lends to stabilise economies in crisis; the World Bank funds development.' },
  { title: 'OPEC+', body: 'Oil producers coordinating output to influence prices.' }
]

export const NEWS_HABITS: Card[] = [
  { title: 'Read the other side', body: 'For any big story, read one source you agree with and one you don’t. Try to state their best argument fairly (steelman it).' },
  { title: 'Separate reporting from opinion', body: 'Ask: is this telling me what happened, or what to think about it?' },
  { title: 'Check base rates', body: 'Before reacting to one dramatic event, ask how often this kind of thing happens.' },
  { title: 'Follow incentives', body: 'Who benefits? What does each actor need — domestically and abroad?' },
  { title: 'Read laterally', body: 'Open new tabs to check who is behind a claim before going deep into it.' },
  { title: 'Update in small steps', body: 'One article rarely justifies a big change of view. Note your confidence and adjust as evidence accumulates — the Forecasts page helps.' },
  { title: 'Budget your attention', body: 'A daily briefing and a reading list beat endless scrolling. Depth beats volume.' }
]

export const PHILOSOPHY: Card[] = [
  { title: 'The Socratic method', who: 'Socrates', body: 'Keep asking questions until hidden assumptions surface. Real knowledge starts with admitting what you don’t know.', ask: 'What belief of yours have you never seriously questioned?' },
  { title: 'The allegory of the cave', who: 'Plato', body: 'Prisoners mistake shadows for reality; the freed one finds the real world painful to see at first.', ask: 'What “shadows” do your feeds show you?' },
  { title: 'Virtue and the golden mean', who: 'Aristotle', body: 'A good life (eudaimonia) comes from practising virtues — each a balance between two extremes, like courage between cowardice and recklessness.', ask: 'Which virtue is most out of balance in you right now?' },
  { title: 'The dichotomy of control', who: 'Epictetus', body: 'Some things are up to us (our judgements and actions), most aren’t. Put your energy only into the first.', ask: 'What are you worrying about that isn’t up to you?' },
  { title: 'Memento mori', who: 'Marcus Aurelius', body: 'Remembering that life is short isn’t morbid — it clarifies what matters and what doesn’t.', ask: 'What would you stop doing if you took this seriously?' },
  { title: 'Pleasure, properly understood', who: 'Epicurus', body: 'The good life is tranquillity: simple pleasures, friendship, and freedom from fear — not luxury.', ask: 'Which simple pleasure do you undervalue?' },
  { title: 'I think, therefore I am', who: 'René Descartes', body: 'Doubt everything you can; the fact that you are doubting proves at least that you exist.', ask: 'What, if anything, can you be completely certain of?' },
  { title: 'The is–ought gap', who: 'David Hume', body: 'You can’t derive what ought to be purely from facts about what is. Every moral argument smuggles in a value somewhere.', ask: 'Find the hidden “ought” in an argument you read today.' },
  { title: 'The problem of induction', who: 'David Hume', body: 'The sun rising every day so far doesn’t logically guarantee it rises tomorrow. Science rests on an assumption we can’t prove.', ask: 'How do you justify trusting patterns?' },
  { title: 'The categorical imperative', who: 'Immanuel Kant', body: 'Act only on rules you could will everyone to follow, and never treat people merely as means.', ask: 'Would your last white lie survive this test?' },
  { title: 'The greatest happiness', who: 'John Stuart Mill', body: 'Actions are right as they tend to promote happiness — for everyone affected, counted equally.', ask: 'When does maximising happiness feel wrong?' },
  { title: 'Eternal recurrence', who: 'Friedrich Nietzsche', body: 'Imagine living your life again, exactly the same, forever. Would you welcome that or dread it?', ask: 'What would you change so you could say yes?' },
  { title: 'Existence precedes essence', who: 'Jean-Paul Sartre', body: 'There’s no pre-written human nature: we make ourselves through our choices, and we’re responsible for them.', ask: 'Which choice is quietly defining who you are?' },
  { title: 'The absurd', who: 'Albert Camus', body: 'We crave meaning; the universe stays silent. Camus’ answer is to keep pushing the boulder — and imagine Sisyphus happy.', ask: 'Where do you find meaning without guarantees?' },
  { title: 'The veil of ignorance', who: 'John Rawls', body: 'Design society’s rules without knowing who you’ll be in it — rich or poor, healthy or sick. What rules would you pick?', ask: 'Apply it to a policy in today’s news.' },
  { title: 'The trolley problem', who: 'Philippa Foot & Judith Jarvis Thomson', body: 'Divert a runaway trolley to kill one instead of five? Most say yes — but not if it means pushing someone. Why the difference?', ask: 'How should a self-driving car decide?' },
  { title: 'The ship of Theseus', who: 'Plutarch', body: 'Replace every plank of a ship one by one. Is it still the same ship? And if you rebuild the old planks — which is the real one?', ask: 'Are you the same person you were ten years ago?' },
  { title: 'The Chinese room', who: 'John Searle', body: 'Someone follows rules to answer Chinese questions without understanding Chinese. Is symbol manipulation ever understanding?', ask: 'Does a language model understand?' },
  { title: 'Mary’s room', who: 'Frank Jackson', body: 'A scientist knows every physical fact about colour but has only seen black and white. When she sees red, does she learn something new?', ask: 'Is experience more than information?' },
  { title: 'The experience machine', who: 'Robert Nozick', body: 'A machine could give you any experiences you want, indistinguishable from reality. Would you plug in for life?', ask: 'If not, what do you value besides how life feels?' },
  { title: 'The butterfly dream', who: 'Zhuangzi', body: 'Zhuangzi dreamt he was a butterfly — then woke, unsure whether he was a man who dreamt of a butterfly or a butterfly dreaming of a man.', ask: 'How do you know you’re not dreaming?' },
  { title: 'No-self (anattā)', who: 'Buddhist philosophy', body: 'Look for a fixed, unchanging “self” and you only find changing sensations, thoughts and habits.', ask: 'Who, exactly, is having your thoughts?' },
  { title: 'The simulation argument', who: 'Nick Bostrom', body: 'If advanced civilisations run many simulations of minds, simulated minds would vastly outnumber real ones — so maybe we’re simulated.', ask: 'Would it change how you should live?' },
  { title: 'Teleportation and identity', who: 'Derek Parfit', body: 'A teleporter scans you, destroys you, and builds an exact copy on Mars. Did you travel, or die?', ask: 'What actually matters in survival?' },
  { title: 'Moral luck', who: 'Bernard Williams & Thomas Nagel', body: 'Two equally careless drivers; one hits a child by chance. We judge them differently — but should we?', ask: 'How much of your success is luck?' }
]

export const MENTAL_MODELS: Card[] = [
  { title: 'First principles', body: 'Break a problem down to what you know is true, and reason up from there instead of by analogy.' },
  { title: 'Inversion', body: 'Ask how you’d guarantee failure — then avoid those things.' },
  { title: 'Second-order thinking', body: 'And then what? Consider the consequences of the consequences.' },
  { title: 'The map is not the territory', body: 'Models, metrics and summaries simplify reality. Notice where yours leave things out.' },
  { title: 'Occam’s razor', body: 'Prefer the explanation with the fewest extra assumptions.' },
  { title: 'Hanlon’s razor', body: 'Don’t assume malice when mistakes or misunderstanding explain it.' },
  { title: 'Chesterton’s fence', body: 'Before removing a rule or a piece of code, find out why it was put there.' },
  { title: 'Circle of competence', body: 'Know the edges of what you really understand, and be careful outside them.' },
  { title: 'Opportunity cost', body: 'The real cost of anything is the best alternative you gave up.' },
  { title: 'Base rates', body: 'Start from how often something usually happens before adjusting for the specifics.' },
  { title: 'Bayesian updating', body: 'Hold beliefs with confidence levels and move them in proportion to new evidence.' },
  { title: 'Goodhart’s law', body: 'When a measure becomes a target, it stops being a good measure.' },
  { title: 'Regression to the mean', body: 'Extreme results tend to be followed by more ordinary ones — don’t over-read a lucky streak.' },
  { title: 'Survivorship bias', body: 'You see the winners, not the many who tried the same thing and failed.' },
  { title: 'Incentives', body: 'Show me the incentive and I’ll show you the outcome. Most behaviour makes sense once you see what’s rewarded.' },
  { title: 'Feedback loops', body: 'Reinforcing loops amplify (growth, panic); balancing loops stabilise. Find the loop that drives a system.' },
  { title: 'Pareto principle', body: 'Roughly 80% of the effect often comes from 20% of the causes. Find the 20%.' },
  { title: 'Margin of safety', body: 'Leave room for being wrong — in budgets, schedules and bridges.' },
  { title: 'Lindy effect', body: 'For ideas and technologies, the longer something has lasted, the longer it’s likely to keep lasting.' },
  { title: 'Steelmanning', body: 'Restate the opposing view in its strongest form before you argue with it.' }
]

export const BUILDER: Card[] = [
  { title: 'Find the fun first (games)', body: 'Prototype the core loop with grey boxes before any art. If moving and jumping aren’t fun, nothing on top will save it.' },
  { title: 'Playtest early and often (games)', body: 'Watch people play silently. Where they get stuck is the truth; what they say is a hint.' },
  { title: 'Juice (games)', body: 'Screen shake, sound, particles and tiny animations make actions feel good — cheap to add, huge effect.' },
  { title: 'Scope ruthlessly (games)', body: 'Finish small games. A finished tiny game teaches more than an unfinished big one.' },
  { title: 'Start with a baseline (AI)', body: 'Measure the dumbest reasonable approach first, so you know whether the clever one actually helps.' },
  { title: 'Overfit one batch (AI)', body: 'Before a long training run, make sure the model can memorise a tiny batch. If it can’t, there’s a bug.' },
  { title: 'Change one thing at a time (AI)', body: 'Log every run with its config and result (the Experiments log in each project). Otherwise you won’t know what worked.' },
  { title: 'Build your own eval (AI)', body: 'A small set of real examples you care about beats any public benchmark for deciding what to ship.' },
  { title: 'Ship, then iterate', body: 'Put something in front of real users early. Feedback beats speculation.' },
  { title: 'Keep a devlog', body: 'A few lines a day: what you did, what blocked you, what’s next. It makes restarting easy and progress visible.' }
]

/** Deterministic pick for today (same card all day, changes at midnight). */
export function ofTheDay<T>(items: T[], salt = 0): T {
  const d = new Date()
  const n = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 864e5) + salt * 7
  return items[((n % items.length) + items.length) % items.length]
}

export const TOPICS: { id: string; label: string; icon: string; color: string }[] = [
  { id: 'ai', label: 'AI', icon: '🤖', color: '#0aa5c8' },
  { id: 'geo', label: 'Geopolitics', icon: '🌍', color: '#f59e0b' },
  { id: 'politics', label: 'Politics', icon: '🏛️', color: '#e8457a' },
  { id: 'philosophy', label: 'Philosophy', icon: '🦉', color: '#8b5cf6' },
  { id: 'science', label: 'Science', icon: '🔭', color: '#10b981' },
  { id: 'tech', label: 'Tech', icon: '💻', color: '#3b82f6' },
  { id: 'games', label: 'Games', icon: '🎮', color: '#f97316' },
  { id: 'other', label: 'Other', icon: '📰', color: '#64748b' }
]
export const topicOf = (id: string): (typeof TOPICS)[number] => TOPICS.find((t) => t.id === id) ?? TOPICS[TOPICS.length - 1]

export const LEANS: { id: string; label: string; color: string }[] = [
  { id: 'left', label: 'Left', color: '#2563eb' },
  { id: 'lean-left', label: 'Lean left', color: '#60a5fa' },
  { id: 'centre', label: 'Centre', color: '#a855f7' },
  { id: 'mixed', label: 'Mixed', color: '#94a3b8' },
  { id: 'lean-right', label: 'Lean right', color: '#f87171' },
  { id: 'right', label: 'Right', color: '#dc2626' },
  { id: 'libertarian', label: 'Libertarian', color: '#eab308' }
]
