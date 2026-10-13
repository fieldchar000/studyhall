// More for the DevKit Codex: further landmark papers and concepts, plus Economics and
// Politics. Written in plain language, each with why it matters or a question to think about.

import type { Card, Paper } from './devContent'

export const MORE_PAPERS: Paper[] = [
  { title: 'Efficient Estimation of Word Representations in Vector Space (word2vec)', authors: 'Mikolov et al.', year: 2013, url: 'https://arxiv.org/abs/1301.3781', why: 'Showed that simple models learn word vectors where meaning becomes geometry — king − man + woman ≈ queen.' },
  { title: 'Generative Adversarial Networks', authors: 'Goodfellow et al.', year: 2014, url: 'https://arxiv.org/abs/1406.2661', why: 'Two networks compete — a forger and a detective — and the forger learns to make realistic images.' },
  { title: 'Sequence to Sequence Learning with Neural Networks', authors: 'Sutskever et al.', year: 2014, url: 'https://arxiv.org/abs/1409.3215', why: 'An encoder reads a sentence, a decoder writes the translation: the template for machine translation and chat.' },
  { title: 'Neural Machine Translation by Jointly Learning to Align and Translate', authors: 'Bahdanau et al.', year: 2014, url: 'https://arxiv.org/abs/1409.0473', why: 'The first attention mechanism — letting the decoder look back at the right words — three years before Transformers.' },
  { title: 'Adam: A Method for Stochastic Optimization', authors: 'Kingma & Ba', year: 2014, url: 'https://arxiv.org/abs/1412.6980', why: 'The default optimiser for most of deep learning: adaptive step sizes per parameter.' },
  { title: 'Batch Normalization', authors: 'Ioffe & Szegedy', year: 2015, url: 'https://arxiv.org/abs/1502.03167', why: 'Normalising activations made deep networks train faster and more reliably.' },
  { title: 'U-Net: Convolutional Networks for Biomedical Image Segmentation', authors: 'Ronneberger et al.', year: 2015, url: 'https://arxiv.org/abs/1505.04597', why: 'Built for medical images, its encoder–decoder shape later became the backbone of diffusion image models.' },
  { title: 'Layer Normalization', authors: 'Ba et al.', year: 2016, url: 'https://arxiv.org/abs/1607.06450', why: 'The normalisation used inside Transformers, because it works per example rather than per batch.' },
  { title: 'Mastering Chess and Shogi by Self-Play (AlphaZero)', authors: 'Silver et al.', year: 2017, url: 'https://arxiv.org/abs/1712.01815', why: 'One algorithm learned three games from scratch by playing itself — no human games needed.' },
  { title: 'World Models', authors: 'Ha & Schmidhuber', year: 2018, url: 'https://arxiv.org/abs/1803.10122', why: 'An agent learns a compressed model of its world and can practise inside its own “dream”.' },
  { title: 'Language Models are Unsupervised Multitask Learners (GPT-2)', authors: 'Radford et al.', year: 2019, url: 'https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf', why: 'Scaling up next-word prediction produced a model that could do many tasks with no task-specific training.' },
  { title: 'Exploring the Limits of Transfer Learning (T5)', authors: 'Raffel et al.', year: 2019, url: 'https://arxiv.org/abs/1910.10683', why: 'Framed every NLP task as text-in, text-out and carefully compared what actually matters in pre-training.' },
  { title: 'Mastering Atari, Go, Chess and Shogi by Planning with a Learned Model (MuZero)', authors: 'Schrittwieser et al.', year: 2019, url: 'https://arxiv.org/abs/1911.08265', why: 'Learned to plan without being told the rules — it learned its own model of what matters.' },
  { title: 'Switch Transformers', authors: 'Fedus et al.', year: 2021, url: 'https://arxiv.org/abs/2101.03961', why: 'Made mixture-of-experts simple: send each token to just one expert and scale parameters cheaply.' },
  { title: 'Emergent Abilities of Large Language Models', authors: 'Wei et al.', year: 2022, url: 'https://arxiv.org/abs/2206.07682', why: 'Catalogued skills that seem to appear suddenly at scale — and started a debate about whether that’s real or a measurement artefact.' },
  { title: 'Self-Consistency Improves Chain of Thought Reasoning', authors: 'Wang et al.', year: 2022, url: 'https://arxiv.org/abs/2203.11171', why: 'Sample several reasoning paths and take the majority answer — a simple trick with big gains.' },
  { title: 'Generative Agents: Interactive Simulacra of Human Behavior', authors: 'Park et al.', year: 2023, url: 'https://arxiv.org/abs/2304.03442', why: 'A small town of LLM-driven characters with memories and plans — a blueprint for believable NPCs.' },
  { title: 'Tree of Thoughts', authors: 'Yao et al.', year: 2023, url: 'https://arxiv.org/abs/2305.10601', why: 'Let the model explore and backtrack over multiple lines of reasoning, like a search tree.' },
  { title: 'QLoRA: Efficient Finetuning of Quantized LLMs', authors: 'Dettmers et al.', year: 2023, url: 'https://arxiv.org/abs/2305.14314', why: 'Fine-tune big models on a single GPU by combining 4-bit weights with LoRA adapters.' },
  { title: 'Let’s Verify Step by Step', authors: 'Lightman et al.', year: 2023, url: 'https://arxiv.org/abs/2305.20050', why: 'Rewarding each correct reasoning step beat rewarding only the final answer on maths problems.' },
  { title: 'Universal and Transferable Adversarial Attacks on Aligned Language Models', authors: 'Zou et al.', year: 2023, url: 'https://arxiv.org/abs/2307.15043', why: 'Automatically found strange suffixes that jailbreak many models at once — a wake-up call for robustness.' },
  { title: 'Mamba: Linear-Time Sequence Modeling with Selective State Spaces', authors: 'Gu & Dao', year: 2023, url: 'https://arxiv.org/abs/2312.00752', why: 'A serious alternative to attention that scales linearly with sequence length.' }
]

export const MORE_AI: Card[] = [
  { title: 'Loss function', body: 'The number training tries to make smaller. For language models it measures how surprised the model was by the real next token.' },
  { title: 'Gradient descent', body: 'Nudge every weight a little in the direction that reduces the loss, billions of times. Backpropagation is how those directions are computed.' },
  { title: 'Parameters', body: 'The learned numbers inside a model. “70B” means about 70 billion of them. More parameters can store more, but cost more to run.' },
  { title: 'Inference', body: 'Running a trained model to get an answer. Training happens once; inference happens every time someone uses it.' },
  { title: 'Temperature', body: 'How adventurous sampling is. Low temperature picks the likeliest tokens (precise, repetitive); high temperature is more varied (creative, riskier).' },
  { title: 'System prompt', body: 'Instructions given to a model before the conversation that shape its role, tone and rules.' },
  { title: 'Tool use', body: 'A model calling functions — search, a calculator, code — and reading the results, instead of answering from memory alone.' },
  { title: 'Vector database', body: 'Stores embeddings so you can find the most similar items fast. The “retrieval” part of most RAG systems.' },
  { title: 'Multimodal', body: 'Models that take in or produce more than text: images, audio, video.' },
  { title: 'Benchmark contamination', body: 'When test questions leak into training data, scores go up without real ability improving.' },
  { title: 'Synthetic data', body: 'Training data generated by models. Useful and cheap — but it can amplify mistakes if not filtered.' },
  { title: 'Jailbreak', body: 'A prompt that tricks a model into ignoring its safety rules. Defences are an ongoing arms race.' },
  { title: 'Prompt injection', body: 'Instructions hidden in content a model reads (a web page, an email) that try to hijack what it does. A key risk for agents.' },
  { title: 'Reward hacking', body: 'When a system finds a way to score well on its objective without doing what you actually wanted.' },
  { title: 'Compute', body: 'The processing power used to train and run models, usually counted in GPU-hours or FLOPs. A main constraint on AI progress.' },
  { title: 'GPU / TPU', body: 'Chips built for doing huge numbers of multiplications in parallel — the hardware behind modern AI.' },
  { title: 'Latency vs throughput', body: 'How fast one answer arrives versus how many answers you can serve per second. Optimising one often costs the other.' },
  { title: 'KV cache', body: 'Saved attention keys and values from earlier tokens, so generating each new token doesn’t recompute everything.' },
  { title: 'Chain of thought', body: 'Letting a model write out intermediate steps before its answer. Often improves reasoning on maths and logic.' },
  { title: 'Model collapse', body: 'Training repeatedly on model-generated data can slowly lose the rare and diverse parts of the original distribution.' },
  { title: 'Red teaming', body: 'Deliberately attacking a system to find failures before real users or bad actors do.' },
  { title: 'Guardrails', body: 'Checks around a model — input filters, output classifiers, rules — that catch unsafe or off-policy behaviour.' }
]

export const MORE_GEO: Card[] = [
  { title: 'Geography as destiny', body: 'Mountains, rivers, coastlines and neighbours shape a country’s options for centuries: who can invade it, what it trades, what it fears.', ask: 'How does Singapore’s geography shape its foreign policy?' },
  { title: 'Small-state strategy', body: 'Small states survive by being useful to many, staying neutral where possible, building strong institutions and a credible defence.', ask: 'Which small states punch above their weight, and how?' },
  { title: 'Economic statecraft', body: 'Using trade, investment, export controls and aid as tools of power rather than just economics.', ask: 'Where is technology (chips, AI) being used as statecraft today?' },
  { title: 'Interdependence', body: 'Countries that trade a lot have reasons not to fight — but dependence can also be weaponised.', ask: 'Which dependencies are strengths, and which are vulnerabilities?' },
  { title: 'Rules-based order', body: 'The post-1945 system of treaties, institutions and norms. Supporters see stability; critics see rules written by the powerful.', ask: 'Who benefits most from the current rules — and who wants them rewritten?' },
  { title: 'Spheres of influence', body: 'The idea that great powers get a say over their neighbourhood. Often resented by the neighbours.', ask: 'Where are spheres of influence contested right now?' },
  { title: 'Escalation ladder', body: 'Conflicts move step by step — rhetoric, sanctions, proxies, direct force. Each side tries to signal resolve without triggering the next rung.', ask: 'What signals tell you a crisis is escalating or calming?' },
  { title: 'Credibility', body: 'Threats and promises only work if others believe you’ll follow through. Backing down can be costly for years.', ask: 'When has a red line been crossed without consequence?' },
  { title: 'Domestic politics drive foreign policy', body: 'Leaders act for audiences at home: elections, nationalism, economic pain. Foreign policy is rarely just about foreigners.', ask: 'What domestic pressure explains a recent foreign-policy move?' },
  { title: 'Demographics', body: 'Ageing, shrinking or fast-growing populations shape economies, armies and ambitions for decades ahead.', ask: 'Which major power’s demographics worry its leaders most?' },
  { title: 'Energy security', body: 'Who produces, ships and controls energy — oil, gas, and now the minerals for batteries — matters as much as armies.', ask: 'How has the energy transition changed which places matter?' },
  { title: 'Hard vs soft power', body: 'Hard power coerces (force, money); soft power attracts (culture, values, example). Smart strategy mixes both.', ask: 'Which country’s soft power has grown most in your lifetime?' },
  { title: 'Non-state actors', body: 'Militias, terrorist groups, multinational firms and NGOs can shape events as much as some states.', ask: 'Which non-state actor has had the most influence on a recent crisis?' },
  { title: 'Information warfare', body: 'Shaping what populations believe — through propaganda, disinformation and selective truth — as a weapon in itself.', ask: 'How would you spot a coordinated influence campaign?' }
]

export const MORE_INSTITUTIONS: Card[] = [
  { title: 'International Court of Justice', body: 'The UN’s court for disputes between states. Its rulings are binding on parties, but it has no police to enforce them.' },
  { title: 'International Criminal Court', body: 'Prosecutes individuals for genocide, war crimes and crimes against humanity. Several major powers are not members.' },
  { title: 'World Health Organization', body: 'The UN agency that coordinates global public health — setting standards and responding to outbreaks.' },
  { title: 'Shanghai Cooperation Organisation', body: 'A Eurasian security and economic grouping including China, Russia, India and Central Asian states.' },
  { title: 'The Quad', body: 'An informal grouping of the US, Japan, India and Australia focused on the Indo-Pacific.' },
  { title: 'APEC', body: 'Asia-Pacific Economic Cooperation: a forum of Pacific Rim economies promoting trade and investment. Singapore hosts its secretariat.' }
]

export const MORE_PHILOSOPHY: Card[] = [
  { title: 'The unexamined life', who: 'Socrates', body: 'A life without reflection on how to live is not fully a human life.', ask: 'When did you last change how you live after thinking about it?' },
  { title: 'The Ring of Gyges', who: 'Plato', body: 'If you could be invisible and never caught, would you still be just? Plato thinks justice is good for the soul, not just a fear of punishment.', ask: 'What would you do differently if no one could ever know?' },
  { title: 'Wu wei', who: 'Laozi', body: 'Effortless action: acting in harmony with the way things flow rather than forcing them.', ask: 'Where are you pushing against the grain unnecessarily?' },
  { title: 'Ren and the rectification of names', who: 'Confucius', body: 'Humaneness grows through relationships and roles; society works when words match reality — a ruler acts like a ruler, a friend like a friend.', ask: 'Which of your roles are you living up to least?' },
  { title: 'The view from above', who: 'Marcus Aurelius', body: 'Imagine your problems from high above, across centuries. Most shrink to their true size.', ask: 'What will this matter in five years?' },
  { title: 'Amor fati', who: 'Nietzsche (after the Stoics)', body: 'Love your fate — not just accept what happens but embrace it as part of your story.', ask: 'Which hard event shaped you in a way you’re now glad of?' },
  { title: 'Bad faith', who: 'Sartre', body: 'Pretending you have no choice to escape the weight of freedom: “I had to, it’s my job.”', ask: 'Where do you tell yourself you have no choice?' },
  { title: 'The banality of evil', who: 'Hannah Arendt', body: 'Great harm is often done not by monsters but by ordinary people who stop thinking and just follow along.', ask: 'Where might going along with the crowd cause harm?' },
  { title: 'The social contract', who: 'Hobbes, Locke, Rousseau', body: 'Political authority is justified by an agreement — imagined or real — to give up some freedom for security and rights.', ask: 'What do you owe your country, and what does it owe you?' },
  { title: 'The harm principle', who: 'J. S. Mill', body: 'The only good reason to restrict someone’s freedom is to prevent harm to others.', ask: 'Which laws would fail Mill’s test?' },
  { title: 'Reason and the passions', who: 'David Hume', body: '“Reason is the slave of the passions”: reason tells you how to get what you want, not what to want.', ask: 'Which of your “rational” decisions were really driven by feeling?' },
  { title: 'Falsifiability', who: 'Karl Popper', body: 'A claim is scientific only if some observation could prove it wrong.', ask: 'Which of your beliefs could no evidence ever change?' },
  { title: 'Paradigm shifts', who: 'Thomas Kuhn', body: 'Science doesn’t just accumulate; it periodically overturns its whole framework when anomalies pile up.', ask: 'What field looks ripe for a paradigm shift?' },
  { title: 'Language games', who: 'Wittgenstein', body: 'Words get meaning from how they’re used in particular activities, not from fixed definitions.', ask: 'Which word do you and a friend use differently?' },
  { title: 'Effective altruism', who: 'Peter Singer and others', body: 'Use evidence and reason to do the most good you can with your time and money.', ask: 'What’s the most good you could do with one hour a week?' },
  { title: 'The paradox of tolerance', who: 'Karl Popper', body: 'A society that tolerates everything, including intolerance, may end up destroyed by the intolerant.', ask: 'Where should tolerance draw a line?' },
  { title: 'Ubuntu', who: 'Southern African philosophy', body: '“I am because we are”: a person becomes a person through other people.', ask: 'Who has made you who you are?' },
  { title: 'Ikigai', who: 'Japanese idea', body: 'A reason for being — often drawn as what you love, are good at, the world needs, and can be paid for.', ask: 'Which part of that overlap is missing for you?' }
]

export const MORE_MODELS: Card[] = [
  { title: 'Compounding', body: 'Small, steady gains multiply. Applies to money, skills, relationships and reputation — and to bad habits too.' },
  { title: 'Leverage', body: 'Tools, code, capital and media let one person’s effort reach far more people than labour alone.' },
  { title: 'Bottlenecks', body: 'A system goes only as fast as its slowest step. Improve anything else and nothing changes.' },
  { title: 'Activation energy', body: 'Starting is the hardest part. Make the first step tiny and obvious.' },
  { title: 'Reversible vs irreversible decisions', body: 'Move fast on two-way doors; slow down on one-way doors.' },
  { title: 'Expected value', body: 'Weigh outcomes by their probability. A small chance of a huge payoff can beat a sure small gain — and vice versa for disasters.' },
  { title: 'Sunk cost fallacy', body: 'Past costs are gone either way. Decide on what happens next, not on what you’ve already spent.' },
  { title: 'Confirmation bias', body: 'We seek and remember evidence that agrees with us. Actively look for what would prove you wrong.' },
  { title: 'Availability heuristic', body: 'Vivid, recent examples feel more common than they are. Check the numbers.' },
  { title: 'Hindsight bias', body: 'After the fact, outcomes look obvious. Judge decisions by the information available at the time.' },
  { title: 'Dunning–Kruger', body: 'Beginners often overrate their skill; experts see how much they don’t know.' },
  { title: 'Parkinson’s law', body: 'Work expands to fill the time available. Set tighter, realistic deadlines.' },
  { title: 'Hofstadter’s law', body: 'It always takes longer than you expect, even when you take Hofstadter’s law into account.' },
  { title: 'The 5 whys', body: 'Ask “why?” five times to get from a symptom to a root cause.' },
  { title: 'Premortem', body: 'Imagine the project has failed, then explain why. Surfaces risks people were afraid to mention.' },
  { title: 'Signal vs noise', body: 'Most daily changes are noise. Look for sustained trends before reacting.' },
  { title: 'Network effects', body: 'Some products get more valuable as more people use them — which is why winners often take most.' },
  { title: 'Tragedy of the commons', body: 'Shared resources get overused when everyone acts in their own interest. Fixes need rules, prices or ownership.' },
  { title: 'Antifragility', body: 'Some things get stronger from stress and variation — muscles, immune systems, good organisations.' },
  { title: 'Theory of constraints', body: 'Find the one constraint limiting the whole system, exploit it, then find the next.' }
]

export const MORE_BUILDER: Card[] = [
  { title: 'Make the core verb feel great (games)', body: 'Whatever the player does most — jump, shoot, place, talk — tune it until it feels good on its own.' },
  { title: 'Teach through level design (games)', body: 'Introduce one idea safely, test it, then twist it. Players learn by doing, not by reading tutorials.' },
  { title: 'Difficulty is a curve (games)', body: 'Alternate tension and release. Constant difficulty — high or low — gets boring.' },
  { title: 'Readability beats realism (games)', body: 'Players must instantly see what is dangerous, interactive or important. Colour and silhouette first, detail later.' },
  { title: 'Save often, crash never (games)', body: 'Players forgive a lot, but not lost progress. Autosave and test saves early.' },
  { title: 'Look at the data (AI)', body: 'Read dozens of real examples before and after training. Most bugs and wins are visible by eye.' },
  { title: 'Split your data properly (AI)', body: 'Keep train, validation and test sets separate, and make sure near-duplicates don’t leak across them.' },
  { title: 'Fix the seed, then vary it (AI)', body: 'Fix random seeds to reproduce a result, then run a few seeds to see whether it holds.' },
  { title: 'Prompt before you train (AI)', body: 'Try a strong model with a good prompt and examples first. Fine-tune only when prompting can’t get there.' },
  { title: 'Log costs (AI)', body: 'Track tokens, GPU hours and money per experiment. Cheap wins are still wins.' },
  { title: 'Write the README first', body: 'Describe what the project does and how to use it before building. If it’s hard to explain, it’s not clear yet.' },
  { title: 'Version everything', body: 'Code, data, prompts, configs and model checkpoints. Future you will need to know exactly what produced a result.' },
  { title: 'Small, frequent commits', body: 'Each commit one idea. Easier to review, easier to undo.' },
  { title: 'Automate the boring checks', body: 'Tests, formatting and type checks on every change catch silly mistakes before they cost a day.' }
]

export const ECONOMICS: Card[] = [
  { title: 'Supply and demand', body: 'Prices rise when demand outpaces supply and fall when supply outpaces demand. Most market news is one of these two shifting.', ask: 'What recent price change can you explain with supply or demand?' },
  { title: 'Inflation', body: 'A general rise in prices, so money buys less. Mild, steady inflation is normal; high or unpredictable inflation is damaging.', ask: 'What has risen fastest in your own spending?' },
  { title: 'Interest rates', body: 'The price of borrowing money. Central banks raise rates to cool inflation and cut them to support growth.', ask: 'How do higher rates affect housing and start-ups?' },
  { title: 'GDP', body: 'The total value of goods and services an economy produces. Useful, but it ignores inequality, unpaid work and wellbeing.', ask: 'What would you add to GDP to measure progress?' },
  { title: 'Comparative advantage', body: 'Countries gain from trade by specialising in what they give up least to produce — even if another country is better at everything.', ask: 'What is Singapore’s comparative advantage?' },
  { title: 'Opportunity cost', body: 'The real cost of anything is the best alternative you gave up.', ask: 'What did your last big purchase really cost you?' },
  { title: 'Incentives', body: 'People respond to rewards and penalties — often in ways the designers didn’t intend.', ask: 'Where has a well-meant incentive backfired?' },
  { title: 'Externalities', body: 'Costs or benefits that fall on people outside a deal, like pollution or vaccination. Markets under- or over-produce them.', ask: 'What’s an externality in your daily life?' },
  { title: 'Public goods', body: 'Things everyone benefits from and no one can be excluded from — like street lighting or national defence — so markets underprovide them.', ask: 'Who should pay for public goods?' },
  { title: 'Monopoly and competition', body: 'Without competition, firms can charge more and innovate less. Regulators try to keep markets contestable.', ask: 'Which markets you use have too little competition?' },
  { title: 'Fiscal vs monetary policy', body: 'Fiscal policy is government taxing and spending; monetary policy is central banks managing money and interest rates.', ask: 'Which one responded faster in the last downturn?' },
  { title: 'Exchange-rate policy', body: 'Singapore’s central bank (MAS) manages the exchange rate rather than an interest rate as its main tool, because trade is so large relative to the economy.', ask: 'Why might a small, open economy prefer this?' },
  { title: 'Productivity', body: 'Output per hour worked. In the long run, it is the main driver of higher living standards.', ask: 'What tool most raised your own productivity?' },
  { title: 'Moral hazard', body: 'When people are protected from the consequences of risk, they may take more of it.', ask: 'Where do bailouts or insurance create moral hazard?' },
  { title: 'Behavioural economics', body: 'Real people are predictably irrational: loss aversion, present bias, defaults. Policy can work with these instead of against them.', ask: 'What default could you change to help your future self?' },
  { title: 'Creative destruction', body: 'New firms and technologies replace old ones. Painful for those displaced, but a source of long-run growth.', ask: 'Which industry is being creatively destroyed right now?' },
  { title: 'Scarcity', body: 'Wants are unlimited, resources aren’t — so every choice is a trade-off.', ask: 'What scarce resource do you manage worst: time, money or attention?' },
  { title: 'Gini coefficient', body: 'A single number for inequality, from 0 (everyone equal) to 1 (one person has everything).', ask: 'Is inequality of income or of opportunity the bigger problem?' }
]

export const POLITICS: Card[] = [
  { title: 'Separation of powers', body: 'Splitting power between legislature, executive and judiciary so no single branch can rule unchecked.', ask: 'Which branch is strongest where you live?' },
  { title: 'Rule of law', body: 'Everyone, including leaders, is bound by known laws applied equally by independent courts.', ask: 'What is the clearest sign a country is losing the rule of law?' },
  { title: 'Parliamentary vs presidential systems', body: 'In parliamentary systems, the government comes from and answers to parliament; in presidential systems, the leader is elected separately.', ask: 'What are the trade-offs of each?' },
  { title: 'Westminster system', body: 'The British-derived parliamentary model used by Singapore, the UK, Australia and others: a prime minister and cabinet drawn from parliament.', ask: 'How does Singapore’s system differ from the UK’s?' },
  { title: 'Electoral systems', body: 'First-past-the-post tends to produce two big parties; proportional systems give smaller parties seats and lead to coalitions.', ask: 'Which system would you choose, and why?' },
  { title: 'Group Representation Constituencies', body: 'In Singapore, some constituencies elect a team of MPs, at least one from a minority community, to ensure multiracial representation.', ask: 'What are the arguments for and against GRCs?' },
  { title: 'Median voter theorem', body: 'In a two-party race on a single issue, parties tend to move towards the voter in the middle.', ask: 'When does polarisation break this pattern?' },
  { title: 'Populism', body: 'Politics framed as “the pure people versus a corrupt elite”. Can be left or right, and often distrusts institutions.', ask: 'What conditions make populism grow?' },
  { title: 'Liberalism', body: 'Individual rights, free markets, limited government and the rule of law — though “liberal” means different things in different countries.', ask: 'Which liberal value do you hold most strongly?' },
  { title: 'Conservatism', body: 'Valuing tradition, gradual change and existing institutions, sceptical of grand schemes to remake society.', ask: 'What tradition do you think is worth conserving?' },
  { title: 'Socialism and social democracy', body: 'Socialism seeks collective ownership; social democracy keeps markets but adds strong welfare states and worker protections.', ask: 'Where is the line between them?' },
  { title: 'Technocracy', body: 'Rule by experts and competence rather than ideology. Efficient, but can drift from public consent.', ask: 'When should experts decide, and when should voters?' },
  { title: 'Legitimacy', body: 'The belief that those in power have the right to rule. It can come from elections, tradition, performance or ideology.', ask: 'Where does a government’s legitimacy come from where you live?' },
  { title: 'Overton window', body: 'The range of ideas considered acceptable to discuss in mainstream politics. It shifts over time.', ask: 'What idea has entered the window in the last decade?' },
  { title: 'Public choice theory', body: 'Politicians and officials respond to incentives too — re-election, budgets, careers — not only the public good.', ask: 'Which policy is better explained by incentives than ideals?' },
  { title: 'Federalism', body: 'Power shared between a national government and states or provinces, each with their own responsibilities.', ask: 'What should be decided locally rather than nationally?' },
  { title: 'Civil society', body: 'Groups between the individual and the state — charities, clubs, unions, religious bodies — that give people a voice and do public good.', ask: 'Which civil-society group do you belong to?' },
  { title: 'Polarisation', body: 'When a society splits into opposing camps that distrust each other. Social media and sorting by geography can deepen it.', ask: 'How can people disagree without hating each other?' }
]
