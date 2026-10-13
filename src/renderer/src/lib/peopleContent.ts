// Built-in content for People and Partner: Singapore date & hangout ideas, conversation
// questions, gift ideas, love languages, check-ins and occasions. Written for this app.
// Places are long-standing Singapore spots; check opening times and bookings before going.

export type IdeaCategory = 'nature' | 'food' | 'culture' | 'active' | 'creative' | 'evening' | 'island' | 'home' | 'special' | 'seasonal' | 'group'
export type Cost = '$' | '$$' | '$$$' | 'free'

export interface Idea {
  id: string
  title: string
  category: IdeaCategory
  area: string
  cost: Cost
  when: 'morning' | 'day' | 'evening' | 'any'
  indoor: boolean
  for: 'date' | 'friends' | 'both'
  blurb: string
}

export const IDEA_CATEGORIES: Record<IdeaCategory, { label: string; icon: string }> = {
  nature: { label: 'Parks & nature', icon: '🌿' },
  food: { label: 'Food & hawkers', icon: '🍜' },
  culture: { label: 'Museums & culture', icon: '🏛️' },
  active: { label: 'Active & adventure', icon: '🚴' },
  creative: { label: 'Cosy & creative', icon: '🎨' },
  evening: { label: 'Evenings & views', icon: '🌃' },
  island: { label: 'Islands & beaches', icon: '🏝️' },
  home: { label: 'At home', icon: '🏠' },
  special: { label: 'Special occasions', icon: '🥂' },
  seasonal: { label: 'Festivals & seasons', icon: '🏮' },
  group: { label: 'With a group', icon: '🎲' }
}

const I = (id: string, title: string, category: IdeaCategory, area: string, cost: Cost, when: Idea['when'], indoor: boolean, who: Idea['for'], blurb: string): Idea => ({
  id,
  title,
  category,
  area,
  cost,
  when,
  indoor,
  for: who,
  blurb
})

export const IDEAS: Idea[] = [
  // Parks & nature
  I('sbg-picnic', 'Picnic at the Botanic Gardens', 'nature', 'Botanic Gardens', 'free', 'day', false, 'both', 'Pack sandwiches and fruit, find a lawn near Swan Lake or Symphony Lake, and stay for the free weekend concerts when they’re on.'),
  I('sbg-orchids', 'National Orchid Garden stroll', 'nature', 'Botanic Gardens', '$', 'morning', false, 'date', 'Go early before it gets hot. Look for the orchid hybrids named after visiting celebrities and heads of state.'),
  I('macritchie', 'TreeTop Walk at MacRitchie', 'nature', 'MacRitchie Reservoir', 'free', 'morning', false, 'both', 'A proper forest hike to the suspension bridge above the canopy. Bring water, watch out for the monkeys, finish with prata nearby.'),
  I('southern-ridges', 'Southern Ridges to Henderson Waves', 'nature', 'Mount Faber · Telok Blangah', 'free', 'evening', false, 'both', 'Walk the ridges in the late afternoon and reach Henderson Waves as the bridge lights come on.'),
  I('mount-faber', 'Sunset at Mount Faber', 'nature', 'Mount Faber', 'free', 'evening', false, 'date', 'Views over the harbour and Sentosa. Take the cable car one way if you want to make it feel special.'),
  I('bukit-timah', 'Climb Bukit Timah Hill', 'nature', 'Bukit Timah', 'free', 'morning', false, 'friends', 'Singapore’s highest point. Early start, steep but short, and a well-earned breakfast after.'),
  I('sungei-buloh', 'Spot wildlife at Sungei Buloh', 'nature', 'Kranji', 'free', 'morning', false, 'both', 'Mangrove boardwalks with monitor lizards, mudskippers and sometimes crocodiles. Bring binoculars.'),
  I('kranji-farms', 'Kranji countryside farm day', 'nature', 'Kranji · Lim Chu Kang', '$', 'day', false, 'both', 'Visit the farms, a frog farm or a goat farm, and have lunch in the countryside. Feels nothing like the city.'),
  I('jurong-lake', 'Jurong Lake Gardens', 'nature', 'Jurong', 'free', 'day', false, 'both', 'Wide lawns, a water playground, the rebuilt Chinese and Japanese gardens nearby, and calm lake views.'),
  I('punggol', 'Cycle Punggol Waterway', 'nature', 'Punggol', '$', 'evening', false, 'both', 'Rent bikes and ride the waterway and Coney Island connectors. Flat, breezy and pretty at dusk.'),
  I('coney-island', 'Explore Coney Island Park', 'nature', 'Punggol', 'free', 'morning', false, 'both', 'A rustic island park with casuarina trees and quiet beaches. Go in the morning; there is little shade.'),
  I('rail-corridor', 'Walk the Rail Corridor', 'nature', 'Bukit Timah → Tanjong Pagar', 'free', 'morning', false, 'both', 'The old railway line turned into a green path. Start near the old Bukit Timah station and see how far you get.'),
  I('hortpark', 'HortPark themed gardens', 'nature', 'Alexandra', 'free', 'day', false, 'date', 'Themed gardens, a butterfly garden and a quiet start to the Southern Ridges.'),
  I('chinese-garden', 'Chinese & Japanese Gardens', 'nature', 'Jurong', 'free', 'day', false, 'date', 'Pagodas, bridges and koi. Good for photos and a slower afternoon.'),
  I('changi-boardwalk', 'Changi Point Coastal Walk', 'nature', 'Changi Village', 'free', 'evening', false, 'both', 'A boardwalk along the coast at sunset, then nasi lemak at Changi Village hawker centre.'),
  I('labrador', 'Labrador Nature Reserve', 'nature', 'Pasir Panjang', 'free', 'evening', false, 'date', 'Old wartime relics, a seaside promenade and sea breeze. Quiet even on weekends.'),
  I('fort-canning', 'Fort Canning Park evening walk', 'nature', 'Dhoby Ghaut', 'free', 'evening', false, 'date', 'History, old trees and the famous tree tunnel staircase. Close to dinner in the city.'),
  I('pasir-ris-mangrove', 'Pasir Ris mangrove boardwalk', 'nature', 'Pasir Ris', 'free', 'day', false, 'both', 'Shaded mangrove walk, then a lazy afternoon at the beach park.'),

  // Food & hawkers
  I('maxwell', 'Maxwell hawker crawl', 'food', 'Chinatown', '$', 'day', false, 'both', 'Each pick one stall, share everything, and vote on the winner. Chicken rice is mandatory.'),
  I('lau-pa-sat', 'Satay Street at Lau Pa Sat', 'food', 'Raffles Place', '$', 'evening', false, 'both', 'In the evening the road closes and the satay grills come out. Order a mix and a jug of sugarcane juice.'),
  I('newton', 'Late-night Newton Food Centre', 'food', 'Newton', '$$', 'evening', false, 'friends', 'Seafood, satay and carrot cake under the lights. Agree on prices before you order.'),
  I('old-airport', 'Old Airport Road food centre', 'food', 'Dakota', '$', 'day', false, 'both', 'One of the most loved hawker centres. Go hungry, arrive before the lunch rush.'),
  I('tiong-bahru', 'Tiong Bahru morning', 'food', 'Tiong Bahru', '$', 'morning', false, 'date', 'Market breakfast, a walk through the art-deco blocks, a bookshop browse and a good coffee.'),
  I('kaya-toast', 'Old-school kopi & kaya toast', 'food', 'Anywhere', '$', 'morning', true, 'both', 'Soft-boiled eggs, kaya toast and kopi at a traditional kopitiam. Learn to order kopi-o kosong properly.'),
  I('katong', 'Katong & Joo Chiat food walk', 'food', 'Katong · Joo Chiat', '$$', 'day', false, 'date', 'Laksa, Peranakan kueh, the colourful shophouses on Koon Seng Road, and dessert to finish.'),
  I('kampong-glam', 'Kampong Glam supper', 'food', 'Kampong Glam', '$$', 'evening', false, 'both', 'Murtabak and teh tarik near Sultan Mosque, then a wander down Haji Lane and Arab Street.'),
  I('tekka', 'Little India & Tekka Centre', 'food', 'Little India', '$', 'day', false, 'both', 'Biryani or prata at Tekka, then flower garlands, spice shops and the colourful Tan Teng Niah house.'),
  I('chinatown-complex', 'Chinatown Complex food hunt', 'food', 'Chinatown', '$', 'day', false, 'friends', 'A huge hawker centre with something for everyone. Try a dish neither of you has had before.'),
  I('dim-sum', 'Weekend dim sum brunch', 'food', 'Anywhere', '$$', 'morning', true, 'both', 'Order too many baskets, argue about har gow versus siew mai, and take your time.'),
  I('steamboat', 'Steamboat or hotpot dinner', 'food', 'Anywhere', '$$', 'evening', true, 'friends', 'Slow, social and perfect for a rainy night. Everyone brings a sauce opinion.'),
  I('chilli-crab', 'Chilli crab night', 'food', 'East Coast · Clarke Quay', '$$$', 'evening', true, 'both', 'Messy, celebratory and very Singapore. Don’t forget the mantou to mop up the sauce.'),
  I('east-coast-lagoon', 'East Coast Lagoon food village', 'food', 'East Coast Park', '$', 'evening', false, 'both', 'Satay and BBQ seafood by the sea after a cycle along the park.'),
  I('dessert-crawl', 'Dessert crawl', 'food', 'Anywhere', '$', 'evening', true, 'both', 'Chendol, ice kacang, durian pengat if you dare, and a bowl of tau suan. Rate each one.'),
  I('cafe-hop', 'Café hop in Jalan Besar', 'food', 'Jalan Besar', '$$', 'day', true, 'date', 'Three cafés, one rule: share one thing at each. Bring a book in case it rains.'),
  I('cook-class', 'Take a cooking class', 'food', 'Various studios', '$$', 'any', true, 'date', 'Learn to make laksa paste, dumplings or pasta together, then eat what you made.'),
  I('omakase', 'Splurge on an omakase dinner', 'food', 'Various', '$$$', 'evening', true, 'date', 'Sit at the counter and let the chef choose. Save it for an anniversary.'),
  I('pasar-malam', 'Wander a pasar malam', 'food', 'Neighbourhood night markets', '$', 'evening', false, 'both', 'Ramly burgers, Taiwanese sausage, carnival games. Check which neighbourhood is hosting this week.'),
  I('durian', 'Durian tasting', 'food', 'Geylang · Balestier', '$$', 'evening', false, 'friends', 'Share a few varieties and compare. Strictly a love-it-or-hate-it outing.'),
  I('high-tea', 'Afternoon high tea', 'food', 'Hotels around Orchard & Marina', '$$$', 'day', true, 'date', 'Scones, finger sandwiches, tiered stands. Dress up a little.'),

  // Museums & culture
  I('nat-gallery', 'National Gallery Singapore', 'culture', 'City Hall', '$', 'day', true, 'both', 'Southeast Asian art in the old Supreme Court and City Hall, then drinks on the rooftop with skyline views.'),
  I('artscience', 'ArtScience Museum exhibition', 'culture', 'Marina Bay', '$$', 'day', true, 'date', 'Check what’s on. The digital art rooms are popular, so book a time slot.'),
  I('acm', 'Asian Civilisations Museum', 'culture', 'Empress Place', '$', 'day', true, 'date', 'Beautiful galleries by the river. Pick one region each and give the other a tour.'),
  I('peranakan', 'Peranakan Museum', 'culture', 'Armenian Street', '$', 'day', true, 'date', 'Beadwork, wedding traditions and porcelain. Follow it with a Peranakan meal.'),
  I('nat-museum', 'National Museum of Singapore', 'culture', 'Bras Basah', '$', 'day', true, 'both', 'The history gallery is a good primer for anyone new to Singapore; the building itself is lovely.'),
  I('haw-par', 'Haw Par Villa', 'culture', 'Pasir Panjang', 'free', 'day', false, 'friends', 'Strange, colourful statues and the Ten Courts of Hell. Unforgettable in the best and weirdest way.'),
  I('esplanade', 'Free performance at the Esplanade', 'culture', 'Marina Bay', 'free', 'evening', false, 'both', 'The outdoor theatre often has free shows by the water. Check the programme and bring snacks.'),
  I('theatre', 'See a play or musical', 'culture', 'Esplanade · Victoria Theatre', '$$$', 'evening', true, 'date', 'Pick a local production for something different, and dinner nearby before.'),
  I('indie-cinema', 'Indie film night', 'culture', 'Indie cinemas (e.g. The Projector)', '$$', 'evening', true, 'date', 'Arthouse films in a retro cinema. Talk about it over drinks after.'),
  I('library-orchard', 'Library date at library@orchard', 'culture', 'Orchard', 'free', 'any', true, 'date', 'Pick books for each other, read side by side, then explain why you chose them.'),
  I('gillman', 'Gillman Barracks galleries', 'culture', 'Alexandra', 'free', 'day', true, 'date', 'Contemporary art galleries in old colonial barracks. Quiet and leafy.'),
  I('heritage-trail', 'Do a heritage trail', 'culture', 'Neighbourhood trails', 'free', 'morning', false, 'both', 'Follow a heritage trail through Balestier, Jalan Besar or Queenstown and read every plaque.'),
  I('temple-walk', 'Temples & mosques walk', 'culture', 'Chinatown · Telok Ayer', 'free', 'morning', false, 'both', 'Thian Hock Keng, Sri Mariamman and the Buddha Tooth Relic Temple are a short walk apart. Dress respectfully.'),
  I('philatelic', 'A small museum you’ve never been to', 'culture', 'Various', '$', 'day', true, 'date', 'Singapore has many small museums. Pick one neither of you knows and go in curious.'),

  // Active & adventure
  I('ubin-cycle', 'Cycle around Pulau Ubin', 'island', 'Pulau Ubin', '$', 'morning', false, 'both', 'Bumboat from Changi Point, rent bikes, see the old kampong houses and the Chek Jawa boardwalk.'),
  I('east-coast-cycle', 'East Coast Park cycle', 'active', 'East Coast Park', '$', 'evening', false, 'both', 'Rent bikes or a tandem, ride at sunset, and stop for food along the way.'),
  I('kayak', 'Kayaking', 'active', 'Kallang · Pasir Ris', '$$', 'day', false, 'both', 'Rent kayaks or join a guided paddle. Mangrove routes are calm and beautiful.'),
  I('bouldering', 'Try bouldering', 'active', 'Various gyms', '$$', 'any', true, 'both', 'Beginner-friendly, social and fun to cheer each other on. Most gyms rent shoes.'),
  I('ice-skate', 'Go skating', 'active', 'Ice and roller rinks', '$$', 'any', true, 'date', 'Hold hands for balance (purely practical). Hot chocolate after.'),
  I('trampoline', 'Trampoline park', 'active', 'Various', '$$', 'any', true, 'friends', 'Ninety minutes of feeling ten years old.'),
  I('wakeboard', 'Cable ski or wakeboard', 'active', 'East Coast', '$$', 'day', false, 'friends', 'Beginner sessions are hilarious. Bring a change of clothes.'),
  I('sup', 'Stand-up paddleboarding', 'active', 'East Coast · Sentosa', '$$', 'morning', false, 'both', 'Calm morning water, a lesson for beginners and a lot of falling in.'),
  I('run-club', 'Join a park run together', 'active', 'Various parks', 'free', 'morning', false, 'both', 'Run or jog together at an easy pace, then breakfast. Good for building a habit.'),
  I('escape-room', 'Escape room', 'group', 'Various', '$$', 'any', true, 'friends', 'An hour of puzzles that shows who keeps calm under pressure.'),
  I('bowling', 'Bowling night', 'group', 'Various', '$', 'evening', true, 'friends', 'Bumpers optional. Loser buys supper.'),
  I('laser-tag', 'Laser tag or archery tag', 'group', 'Various', '$$', 'any', true, 'friends', 'Pick teams, pick a ridiculous team name, and play to win.'),
  I('go-kart', 'Go-karting', 'active', 'Various', '$$', 'any', false, 'friends', 'Proper racing rivalry. Agree on a trophy in advance.'),
  I('swim', 'Neighbourhood pool & supper', 'active', 'Any ActiveSG pool', '$', 'evening', false, 'both', 'Cheap, cooling and underrated. Supper at the nearest kopitiam after.'),

  // Cosy & creative
  I('pottery', 'Pottery wheel class', 'creative', 'Various studios', '$$', 'any', true, 'date', 'Make something lopsided together. You collect it a few weeks later, which means a second date.'),
  I('terrarium', 'Build a terrarium', 'creative', 'Various workshops', '$$', 'any', true, 'both', 'Small, calming and you each take home a tiny garden.'),
  I('candle', 'Candle or perfume workshop', 'creative', 'Various workshops', '$$', 'any', true, 'date', 'Blend a scent for each other without telling what’s in it.'),
  I('painting', 'Paint each other', 'creative', 'At home or a studio', '$', 'any', true, 'date', 'Ten minutes per portrait, no talent required. Frame the worst one.'),
  I('board-game-cafe', 'Board game café', 'group', 'Various', '$', 'any', true, 'both', 'Try a game neither of you knows. Staff will recommend one.'),
  I('karaoke', 'Karaoke (KTV) night', 'group', 'Various', '$$', 'evening', true, 'friends', 'Everyone picks one song for someone else.'),
  I('mahjong', 'Mahjong night', 'group', 'At someone’s home', 'free', 'evening', true, 'friends', 'Teach the beginners, keep the stakes symbolic, order supper.'),
  I('bookshop', 'Bookshop browse & trade', 'creative', 'Independent bookshops', '$', 'day', true, 'date', 'Each pick a book for the other under a budget, then swap at a café.'),
  I('photo-walk', 'Film-camera photo walk', 'creative', 'Chinatown · Joo Chiat', '$', 'day', false, 'both', 'One disposable camera each, 27 shots, no reviewing. Develop them together.'),
  I('thrift', 'Thrift-shop challenge', 'creative', 'Various', '$', 'day', true, 'both', 'Set a small budget and pick an outfit for each other.'),
  I('workshop-leather', 'Leather or bookbinding workshop', 'creative', 'Various workshops', '$$', 'any', true, 'date', 'Make a wallet, keychain or notebook you’ll actually use.'),
  I('vinyl', 'Record-store afternoon', 'creative', 'Various', '$', 'day', true, 'date', 'Dig through crates and pick an album that describes the other person.'),

  // Evenings & views
  I('spectra', 'Spectra light & water show', 'evening', 'Marina Bay Sands Event Plaza', 'free', 'evening', false, 'both', 'A free evening show over the bay. Get there early for a spot near the water.'),
  I('garden-rhapsody', 'Garden Rhapsody at the Supertrees', 'evening', 'Gardens by the Bay', 'free', 'evening', false, 'date', 'Lie on the ground under the Supertree Grove for the free light and music show.'),
  I('cloud-forest', 'Flower Dome & Cloud Forest', 'evening', 'Gardens by the Bay', '$$', 'any', true, 'date', 'Cool air, a misty indoor mountain, and seasonal flower displays.'),
  I('river-cruise', 'Singapore River cruise', 'evening', 'Clarke Quay', '$$', 'evening', false, 'date', 'A bumboat ride past the old godowns and the skyline at night.'),
  I('marina-barrage', 'Marina Barrage at dusk', 'evening', 'Marina Barrage', 'free', 'evening', false, 'both', 'Grass rooftop, kites, and a skyline view. Bring a mat and drinks.'),
  I('flyer', 'Singapore Flyer at night', 'evening', 'Marina Centre', '$$$', 'evening', true, 'date', 'Book a sunset rotation and have the whole capsule moment.'),
  I('rooftop', 'Rooftop drinks', 'evening', 'CBD · Marina Bay', '$$$', 'evening', false, 'date', 'Dress up a little and watch the city lights come on.'),
  I('jewel', 'Jewel Changi at night', 'evening', 'Changi Airport', 'free', 'evening', true, 'both', 'The Rain Vortex light show, the canopy and late-night food. Feels like a mini holiday.'),
  I('night-safari', 'Night Safari', 'evening', 'Mandai', '$$$', 'evening', false, 'both', 'Animals after dark from the tram and walking trails. Go on a weekday to skip crowds.'),
  I('stargaze', 'Stargazing', 'evening', 'Science Centre Observatory · beaches', 'free', 'evening', false, 'date', 'Check whether the Science Centre observatory is running public nights; otherwise find a dark beach and use a star app.'),
  I('clarke-quay', 'Live music bar', 'evening', 'Various', '$$', 'evening', true, 'both', 'Find a bar with a live band and stay for one more song.'),
  I('drive-in', 'Outdoor movie screening', 'evening', 'Various parks & lawns', '$', 'evening', false, 'both', 'Check for outdoor screenings, bring a picnic blanket and snacks.'),

  // Islands & beaches
  I('sentosa-beach', 'Sentosa beach day', 'island', 'Sentosa', '$', 'day', false, 'both', 'Palawan or Siloso beach, a swim, a book, and sunset drinks.'),
  I('lazarus', 'Lazarus Island day trip', 'island', 'Southern Islands', '$$', 'day', false, 'date', 'Ferry to St John’s and walk across to one of Singapore’s nicest quiet beaches. Bring everything you need.'),
  I('kusu', 'Kusu Island', 'island', 'Southern Islands', '$', 'day', false, 'both', 'A tiny island with a temple and a turtle legend. Check the ferry schedule.'),
  I('chek-jawa', 'Chek Jawa at low tide', 'island', 'Pulau Ubin', 'free', 'morning', false, 'both', 'Check the tide tables and walk the intertidal flats. Remarkable sea life.'),
  I('sentosa-cable', 'Cable car to Sentosa', 'island', 'Mount Faber → Sentosa', '$$', 'evening', false, 'date', 'Ride across at sunset and have dinner on the island.'),
  I('east-coast-bbq', 'BBQ at East Coast Park', 'island', 'East Coast Park', '$', 'evening', false, 'friends', 'Book a BBQ pit, everyone brings something, stay until the stars come out.'),
  I('aquarium', 'The aquarium on Sentosa', 'island', 'Sentosa', '$$$', 'day', true, 'date', 'Sit in front of the huge ocean window and say nothing for a while.'),
  I('zoo', 'Singapore Zoo morning', 'island', 'Mandai', '$$$', 'morning', false, 'both', 'Open-concept enclosures and breakfast-time feedings. Combine with the bird park or river park.'),

  // At home
  I('cook-off', 'Home cook-off', 'home', 'Home', '$', 'evening', true, 'both', 'Same ingredients, two dishes, one judge (whoever is hungrier).'),
  I('movie-marathon', 'Movie marathon with a theme', 'home', 'Home', 'free', 'evening', true, 'both', 'Pick a theme — one director, one decade, childhood favourites — and build a fort.'),
  I('puzzle', '1000-piece puzzle night', 'home', 'Home', '$', 'evening', true, 'date', 'Slow, cosy, and surprisingly good for conversation.'),
  I('letters', 'Write each other letters', 'home', 'Home', 'free', 'any', true, 'date', 'Write a real letter, seal it, and open them together — or save them for an anniversary.'),
  I('recreate-first', 'Recreate your first date', 'special', 'Wherever it was', '$$', 'any', false, 'date', 'Same place, same order, and compare how you each remember it.'),
  I('spa-night', 'At-home spa night', 'home', 'Home', '$', 'evening', true, 'date', 'Face masks, candles, a playlist and no phones.'),
  I('game-night', 'Video-game co-op night', 'home', 'Home', 'free', 'evening', true, 'both', 'Pick a co-op game and play until one of you gives up.'),
  I('bake', 'Bake something ambitious', 'home', 'Home', '$', 'any', true, 'both', 'Choose a recipe slightly beyond your skill. Photograph the result no matter what.'),
  I('picnic-indoor', 'Living-room picnic', 'home', 'Home', '$', 'evening', true, 'date', 'Blanket on the floor, takeaway from your favourite place, fairy lights.'),
  I('plan-trip', 'Plan a dream trip', 'home', 'Home', 'free', 'evening', true, 'date', 'Plan a trip you can’t afford yet: itinerary, food list, budget. Then plan one you can.'),
  I('quiz-night', 'How-well-do-you-know-me quiz', 'home', 'Home', 'free', 'evening', true, 'date', 'Write ten questions about yourself for the other to answer. Prizes optional.'),
  I('memory-box', 'Make a memory box', 'home', 'Home', '$', 'any', true, 'date', 'Collect tickets, notes and photos into one box. Add to it every month.'),
  I('potluck', 'Potluck dinner', 'group', 'Someone’s home', '$', 'evening', true, 'friends', 'Everyone brings one dish from their family. Share the story behind it.'),

  // Special occasions
  I('staycation', 'Staycation', 'special', 'Any hotel', '$$$', 'any', true, 'date', 'Check in, use the pool, order room service. Feels like a holiday without the flight.'),
  I('surprise-picnic', 'Surprise sunset picnic', 'special', 'Marina Barrage · Botanic Gardens', '$', 'evening', false, 'date', 'Set it up before they arrive: blanket, their favourite snacks, a small note.'),
  I('fine-dining', 'Anniversary fine dining', 'special', 'Various', '$$$', 'evening', true, 'date', 'Book well ahead and mention it’s a celebration.'),
  I('photoshoot', 'Couple photo session', 'special', 'Anywhere scenic', '$$', 'day', false, 'date', 'Hire a photographer for an hour or use a timer and a tripod.'),
  I('weekend-away', 'Weekend away (JB, Batam or Bintan)', 'special', 'Johor Bahru · Batam · Bintan', '$$', 'any', false, 'both', 'A short trip across the causeway or by ferry. Remember your passports.'),
  I('scavenger', 'Scavenger hunt to a surprise', 'special', 'Your neighbourhood', 'free', 'any', false, 'date', 'Clues that lead through places that matter to you both, ending with dinner or a gift.'),

  // Festivals & seasons
  I('cny-chinatown', 'Chinatown at Chinese New Year', 'seasonal', 'Chinatown', 'free', 'evening', false, 'both', 'Street light-ups, festive bazaars and bak kwa queues in the weeks before CNY.'),
  I('chingay', 'Chingay Parade', 'seasonal', 'City', '$', 'evening', false, 'both', 'A big street parade around Chinese New Year. Check the dates and ticket details.'),
  I('mid-autumn', 'Mid-Autumn lanterns', 'seasonal', 'Gardens by the Bay · Chinatown', 'free', 'evening', false, 'date', 'Lantern displays, mooncakes and a walk under the lights in September or October.'),
  I('deepavali', 'Deepavali light-up in Little India', 'seasonal', 'Little India', 'free', 'evening', false, 'both', 'The street light-up and festive bazaars in the weeks before Deepavali.'),
  I('hari-raya', 'Hari Raya bazaar in Geylang Serai', 'seasonal', 'Geylang Serai', '$', 'evening', false, 'friends', 'Food stalls and festive lights during Ramadan, ahead of Hari Raya Puasa.'),
  I('christmas-orchard', 'Christmas on Orchard Road', 'seasonal', 'Orchard', 'free', 'evening', false, 'date', 'The Christmas light-up in December, a café stop, and gift shopping together.'),
  I('ndp', 'National Day fireworks', 'seasonal', 'Marina Bay', 'free', 'evening', false, 'friends', 'Watch the fireworks (or a rehearsal) from around the bay in August.'),
  I('night-festival', 'Singapore Night Festival', 'seasonal', 'Bras Basah · Bugis', 'free', 'evening', false, 'both', 'Light installations and performances around the museums, usually in August.'),
  I('i-light', 'i Light Marina Bay', 'seasonal', 'Marina Bay', 'free', 'evening', false, 'date', 'A light-art festival around the bay. Walk the whole loop.'),
  I('food-festival', 'A food festival', 'seasonal', 'Various', '$$', 'any', false, 'friends', 'Look out for the year’s food festivals and pop-ups and go with an empty stomach.')
]

// ---------- Conversation questions ----------

export type QuestionDeck = 'light' | 'deep' | 'us' | 'future' | 'memories' | 'rather' | 'friends' | CoupleDeck
export type CoupleDeck = 'deeper' | 'ourstory' | 'growing' | 'closeness' | 'checkin' | 'playful'

export const DECKS: Record<QuestionDeck, string> = {
  light: 'Light & fun',
  deep: 'Deep',
  us: 'About us',
  future: 'Dreams & future',
  memories: 'Memories',
  rather: 'Would you rather',
  friends: 'Friends',
  deeper: 'Deeper',
  ourstory: 'Our story',
  growing: 'Building a life',
  closeness: 'Closeness',
  checkin: 'Honest check-in',
  playful: 'Playful'
}

/** For couples who already know each other well — past the getting-to-know-you stage. */
export const COUPLE_DECKS: CoupleDeck[] = ['deeper', 'ourstory', 'growing', 'closeness', 'checkin', 'playful']

const COUPLE_QUESTIONS: Record<CoupleDeck, string[]> = {
  deeper: [
    'What’s something about your childhood you’ve never fully explained to me?',
    'When did you last feel lonely in our relationship, even a little?',
    'What part of yourself do you still keep from me — and why?',
    'What do you believe now that you didn’t believe when we met?',
    'Which of my habits have you quietly adapted to without saying anything?',
    'When you’re at your lowest, what do you need from me that I sometimes get wrong?',
    'What’s a fear about us you’ve never said out loud?',
    'When do you feel most respected by me?',
    'What did I do in our first year that still means a lot to you?',
    'What do you think I still misunderstand about you?',
    'Is there a dream you’ve quietly let go of? Should we bring it back?',
    'How have I changed you — for better and for worse?',
    'What do you wish I asked you about more often?',
    'When have you been proudest of me?',
    'What part of our relationship feels most “ours” — something no one else has?',
    'Is there anything you’ve forgiven me for that we’ve never really talked about?',
    'What do you think we avoid talking about?',
    'Which patterns from your family do you see showing up in us?',
    'What would make you feel more chosen by me?',
    'What’s something you’re working through right now that I might not see?'
  ],
  ourstory: [
    'What do you remember most clearly about the day we met?',
    'When did you know this was more than a crush?',
    'What was going through your head on our first date?',
    'Which argument taught us the most?',
    'What’s a small moment from this past year you keep thinking about?',
    'When did you first feel completely yourself around me?',
    'What’s our best inside joke — and do you remember how it started?',
    'What’s the hardest thing we’ve been through together, and what got us through it?',
    'Which date would you relive exactly as it was?',
    'What did you think of my friends and family when you first met them?',
    'What have you learned about me only in the last six months?',
    'When did you feel most taken care of by me?',
    'Which place in Singapore feels most like “ours”?',
    'How would you tell the story of us to a stranger?',
    'What surprised you most about being with me?',
    'If you could visit one version of us for a day — first month, first year, now — which would it be?',
    'What’s a photo of us that says the most about our relationship?',
    'What’s something we used to do that we’ve stopped — and should we bring it back?'
  ],
  growing: [
    'Where do you picture us in five years — and what does an ordinary Tuesday look like there?',
    'How do you honestly feel about the way we handle money?',
    'What big decisions are coming up for us in the next two years?',
    'When we live together, how should we split chores and life admin?',
    'What do you want our home to feel like when people walk in?',
    'What does marriage mean to you — not just whether, but what?',
    'How do you feel about having children, and when would it feel right?',
    'What would we do if one of us got a great job overseas?',
    'How involved do you want our families to be in our life?',
    'Which traditions from your family do you want us to keep?',
    'What would a really good year for us look like?',
    'How much time apart do we each need to feel like ourselves?',
    'What should we be saving up for together?',
    'How do we keep growing as individuals and not just as a couple?',
    'If we had a really hard year, what would you want us to do differently from last time?',
    'How do you want to mark our milestones?',
    'Which couple do you look up to, and what do they do well?',
    'What does commitment mean to you now, compared with when we started?',
    'BTO, resale, renting, or somewhere else entirely — what are you hoping for?',
    'What’s a trip we have to take together before life gets busier?'
  ],
  closeness: [
    'How do you most like to be shown affection on a busy day?',
    'What’s something small I do that makes you feel wanted?',
    'When do you feel closest to me — talking, touch, or just being in the same room?',
    'What’s a compliment from me you still remember?',
    'Is there a kind of affection you’d like more of?',
    'When do you feel most attractive?',
    'What’s your favourite way to spend a slow evening with me?',
    'How do you like to reconnect after we’ve been apart for a few days?',
    'What’s something romantic you’ve always wanted to do but never asked for?',
    'What makes you feel safe enough to be completely yourself with me?',
    'How can you tell when I’m really listening?',
    'What gesture would mean a lot to you but cost nothing?',
    'When did you last get butterflies around me?',
    'What’s your favourite part of our everyday routines?',
    'What does a perfect lazy morning together look like?'
  ],
  checkin: [
    'Out of 10, how connected do you feel to me this month — and what would make it one point higher?',
    'Did I do something recently that hurt and you brushed it off?',
    'Are we spending our time together on the right things?',
    'What’s one thing I could stop doing?',
    'What’s one thing I could start doing?',
    'Do you feel heard when we disagree?',
    'Is there a conversation you’ve been putting off?',
    'Are you getting enough time for yourself?',
    'How are you really doing — work or school, family, health?',
    'Is stress from outside our relationship leaking into it?',
    'Have we been having enough fun lately?',
    'Is there something you need more reassurance about?',
    'How could we argue more fairly next time?',
    'What’s something you appreciated about how I handled something recently?',
    'What are we looking forward to together?'
  ],
  playful: [
    'What’s my most predictable habit? Do an impression.',
    'If we swapped lives for a day, what would you do first as me?',
    'What would our couple name be on a reality show — and what would we be famous for?',
    'What’s the most “us” thing that has ever happened?',
    'Rank our dates: top three, and the most chaotic one.',
    'What would I order at a hawker centre if you weren’t there to stop me?',
    'If we started a podcast, what would it be called?',
    'What’s a hill I would die on that you think is ridiculous?',
    'What do I say so often you could finish the sentence?',
    'What would your toast at our 50th anniversary sound like?',
    'If our relationship were a film, what genre is it — and who plays us?',
    'What would you steal from my wardrobe?',
    'Which animal am I when I’m hungry?',
    'What’s the most romantic thing about our most boring routine?',
    'What’s one thing I do that you’ve secretly started doing too?'
  ]
}

export const QUESTIONS: Record<QuestionDeck, string[]> = {
  ...COUPLE_QUESTIONS,
  light: [
    'What’s a food you could eat every day for a month?',
    'Which hawker dish would you take to a desert island?',
    'What’s the most useless talent you have?',
    'If you had a theme song that played when you entered a room, what would it be?',
    'What’s a small thing that instantly improves your day?',
    'Which fictional world would you most like to live in?',
    'What’s the best thing you’ve bought for under $20?',
    'What’s your most controversial food opinion?',
    'If you opened a café, what would it be called?',
    'What did you want to be when you were seven?',
    'Which app would you delete forever if you had to pick one?',
    'What’s the weirdest thing you believed as a child?',
    'If you could master one skill overnight, what would it be?',
    'What’s your go-to karaoke song?',
    'Which season of the year are you, and why?',
    'What’s a movie you can quote from start to finish?',
    'What’s the best compliment a stranger has ever given you?',
    'Kaya toast or prata for breakfast?',
    'What would your perfect lazy Sunday look like?',
    'Which celebrity would be the most fun to have dinner with?',
    'What’s a trend you secretly liked?',
    'What’s the most spontaneous thing you’ve ever done?'
  ],
  deep: [
    'What’s something you’ve changed your mind about in the last few years?',
    'When do you feel most like yourself?',
    'What’s a fear you’ve quietly worked through?',
    'What does a good life look like to you?',
    'Who shaped the person you are the most?',
    'What’s something you wish people asked you about more?',
    'What’s a lesson you had to learn more than once?',
    'When was the last time you felt really proud of yourself?',
    'What do you need more of in your life right now?',
    'What’s something you’re still trying to forgive?',
    'What makes you feel safe?',
    'How do you like to be comforted when you’re upset?',
    'What’s a belief you got from your family that you’ve kept?',
    'What’s a belief from your family you’ve let go of?',
    'What does home mean to you?',
    'What would you do differently if nobody was watching or judging?',
    'What’s a small moment from your life you think about often?',
    'What are you most grateful for this year?',
    'What’s something you want to be braver about?',
    'What do you think people misunderstand about you?'
  ],
  us: [
    'What did you first notice about me?',
    'What’s a moment with me you replay in your head?',
    'When do you feel closest to me?',
    'What’s something I do that makes you feel loved?',
    'Is there something small I could do more often?',
    'What’s a tradition you’d like us to start?',
    'What’s our funniest memory together?',
    'What’s a place you’d like us to go back to?',
    'Which song reminds you of us?',
    'What’s something you’ve learned from me?',
    'How do you like to spend time together when you’re tired?',
    'What’s a date we should do again?',
    'What do you think we’re really good at as a team?',
    'Where do we disagree in a way you actually enjoy?',
    'What’s one thing about our relationship you’re proud of?',
    'How can I support you better when you’re stressed?',
    'What’s a small habit of mine you secretly like?',
    'What would you want us to remember about this year?',
    'How do you prefer to make up after a disagreement?',
    'What’s something new you’d like to try together?'
  ],
  future: [
    'Where would you like to live in ten years?',
    'What’s a skill you want to have by the time you’re 40?',
    'What does your ideal weekday look like five years from now?',
    'What’s a trip you have to take at least once?',
    'What would you do with a year off and enough money?',
    'What kind of old person do you want to be?',
    'What’s something you want to create in your lifetime?',
    'How do you want your friends to describe you in twenty years?',
    'What’s a goal you haven’t told many people about?',
    'What would you want your work to change in the world?',
    'If you could design your dream home, what’s the one room it must have?',
    'What’s a small dream you could make happen this month?',
    'What tradition do you want to pass on?',
    'What does “enough” look like for you?'
  ],
  memories: [
    'What’s your favourite childhood memory?',
    'What’s the best birthday you’ve ever had?',
    'Which teacher do you still think about?',
    'What’s a family meal you remember clearly?',
    'What’s the best trip you’ve ever been on?',
    'What’s a moment when a stranger was unexpectedly kind to you?',
    'What did your childhood bedroom look like?',
    'What’s a smell that takes you straight back in time?',
    'What was the first concert or show you went to?',
    'What’s the best advice someone gave you when you were young?',
    'What’s a time you laughed until you cried?',
    'What did you do every school holiday?',
    'Which friendship from school do you miss?',
    'What’s a moment you were secretly proud of but never mentioned?'
  ],
  rather: [
    'Would you rather have a long weekend every week or a month off every year?',
    'Would you rather only eat hawker food or only eat restaurant food forever?',
    'Would you rather live by the sea or in the mountains?',
    'Would you rather know every language or play every instrument?',
    'Would you rather time-travel to the past or the future?',
    'Would you rather have a personal chef or a personal driver?',
    'Would you rather be able to fly or be invisible?',
    'Would you rather give up your phone for a month or coffee for a year?',
    'Would you rather always be ten minutes early or always ten minutes late?',
    'Would you rather go on a road trip or a cruise?',
    'Would you rather read minds for a day or be invisible for a day?',
    'Would you rather have a huge garden or a huge library?'
  ],
  friends: [
    'What’s something you’re looking forward to this month?',
    'What’s been taking up most of your headspace lately?',
    'What’s the best thing that happened to you this week?',
    'What’s something you’ve been meaning to try?',
    'Who’s someone you’ve lost touch with that you miss?',
    'What’s a hobby you dropped that you want to pick back up?',
    'What’s the best show you’ve watched recently?',
    'If we went on a trip together, where should we go?',
    'What’s something you’re proud of that you haven’t told anyone?',
    'How can I be a better friend to you?',
    'What’s a goal you want me to hold you to?',
    'What’s your current comfort food?'
  ]
}

// ---------- Love languages, gifts, check-ins ----------

export const LOVE_LANGUAGES: { id: string; label: string; about: string; ideas: string[] }[] = [
  {
    id: 'words',
    label: 'Words of affirmation',
    about: 'Feels loved through what you say: encouragement, appreciation, being told they matter.',
    ideas: ['Leave a note in their bag', 'Tell them specifically what you admired today', 'Send a voice message for no reason', 'Praise them in front of friends', 'Write a letter on your anniversary']
  },
  {
    id: 'time',
    label: 'Quality time',
    about: 'Feels loved through your full attention: phones away, doing things together, real conversation.',
    ideas: ['A no-phones dinner', 'A weekly walk with no agenda', 'Learn something new together', 'Take turns planning a date', 'Ask one deep question a day']
  },
  {
    id: 'acts',
    label: 'Acts of service',
    about: 'Feels loved when you make their life easier: helping, handling things, thoughtful practical care.',
    ideas: ['Take a chore off their list', 'Bring food when they’re studying late', 'Book the appointment they keep putting off', 'Fix the thing that’s been broken for weeks', 'Plan the whole date so they don’t have to']
  },
  {
    id: 'gifts',
    label: 'Receiving gifts',
    about: 'Feels loved through thoughtful tokens: it’s the thought and the remembering, not the price.',
    ideas: ['A snack you know they like', 'Something that refers to an inside joke', 'A book with a note on the first page', 'A souvenir from wherever you went', 'Flowers on an ordinary day']
  },
  {
    id: 'touch',
    label: 'Physical touch',
    about: 'Feels loved through closeness: holding hands, hugs, sitting close.',
    ideas: ['Hold hands on walks', 'A long hug when they get home', 'A back or shoulder rub after a long day', 'Sit close on the sofa', 'A dance in the kitchen']
  }
]

export const GIFT_IDEAS: { title: string; budget: Cost; tags: string[] }[] = [
  { title: 'A handwritten letter about your favourite memories together', budget: 'free', tags: ['words'] },

  { title: 'A “reasons I appreciate you” jar with 30 notes', budget: '$', tags: ['words'] },
  { title: 'A framed photo from a day you both loved', budget: '$', tags: ['gifts', 'words'] },
  { title: 'A playlist with a note for each song', budget: 'free', tags: ['words', 'time'] },
  { title: 'Tickets to a show they mentioned once', budget: '$$', tags: ['time', 'gifts'] },
  { title: 'A workshop for two (pottery, candles, cooking)', budget: '$$', tags: ['time'] },
  { title: 'A coupon book (breakfast in bed, a chore done, a planned date)', budget: 'free', tags: ['acts', 'time'] },
  { title: 'Their favourite snack, delivered on a stressful day', budget: '$', tags: ['acts', 'gifts'] },
  { title: 'A good-quality version of something they use every day', budget: '$$', tags: ['gifts', 'acts'] },
  { title: 'A book you think they’d love, with notes in the margins', budget: '$', tags: ['gifts', 'words'] },
  { title: 'A cosy blanket or hoodie', budget: '$$', tags: ['touch', 'gifts'] },
  { title: 'A massage or spa voucher', budget: '$$', tags: ['touch'] },
  { title: 'A plant with a name and a care card', budget: '$', tags: ['gifts'] },
  { title: 'A custom illustration of the two of you', budget: '$$', tags: ['gifts', 'words'] },
  { title: 'A scrapbook of the year (photos, tickets, notes)', budget: '$', tags: ['words', 'time'] },
  { title: 'A weekend staycation', budget: '$$$', tags: ['time', 'touch'] },
  { title: 'Flowers on a random Tuesday', budget: '$', tags: ['gifts'] },
  { title: 'A star map of the night you met', budget: '$$', tags: ['gifts', 'words'] },
  { title: 'A class in something they’ve always wanted to learn', budget: '$$', tags: ['acts', 'time'] },
  { title: 'Cooking their favourite childhood dish for them', budget: '$', tags: ['acts'] },
  { title: 'A film camera and a roll of film', budget: '$$', tags: ['gifts', 'time'] },
  { title: 'A personalised stationery set', budget: '$', tags: ['gifts'] },
  { title: 'A day where you plan absolutely everything', budget: '$$', tags: ['acts', 'time'] },
  { title: 'A watch or piece of jewellery for a milestone', budget: '$$$', tags: ['gifts'] },
  { title: 'Matching keychains or bracelets', budget: '$', tags: ['gifts', 'touch'] },
  { title: 'Their favourite dessert, homemade', budget: '$', tags: ['acts', 'gifts'] },
  { title: 'A subscription to something they’d never buy themselves', budget: '$$', tags: ['gifts'] },
  { title: 'A surprise picnic with their favourite foods', budget: '$', tags: ['time', 'acts'] },
  { title: 'A voice note or video from friends and family for their birthday', budget: 'free', tags: ['words'] },
  { title: 'A “next adventure” envelope with a planned day trip', budget: '$$', tags: ['time'] }
]

export const CHECKIN_PROMPTS = [
  'What made you feel loved this month?',
  'What’s one thing I could do a little differently?',
  'Is there anything on your mind you haven’t said yet?',
  'What was our best moment this month?',
  'How are you, really — not just busy?',
  'Is there anything stressful coming up where I can help?',
  'What’s one thing you’d like us to do next month?',
  'Are we spending enough time together? Too little, too much, about right?',
  'How are we doing with money, plans and the boring stuff?',
  'What’s something you appreciated about me lately?',
  'Is there something we keep arguing about that we should talk through calmly?',
  'What are you looking forward to — for you, and for us?'
]

export const FRIEND_CHECKIN = [
  'When did you last hear what’s new with them?',
  'Is there something big happening in their life you should ask about?',
  'Do they have a birthday or milestone coming up?',
  'Is there a plan you keep saying you’ll make?',
  'Could you send them something that made you think of them?'
]

export const APPRECIATION_PROMPTS = [
  'Something they did today that you noticed',
  'A quality of theirs you admire',
  'A moment this week you felt lucky',
  'Something they’re working hard at',
  'Something they made easier for you',
  'A thing they said that stayed with you'
]

export const TIPS = [
  'Remember the small things: names of their friends, the exam they’re worried about, how they take their coffee. Write them down here.',
  'Ask a follow-up question. It shows you were listening more than any answer you could give.',
  'Make plans specific: “Let’s get laksa in Katong on Saturday” happens; “we should hang out” doesn’t.',
  'Repair quickly. A short, honest “I’m sorry, I was short with you” fixes more than you think.',
  'Celebrate their wins as loudly as you’d want yours celebrated.',
  'Keep traditions, even tiny ones: a monthly dinner, a yearly trip, a song for the car.',
  'Notice when someone goes quiet. A simple “thinking of you” message is enough.',
  'Say thank you for the ordinary things too.',
  'Put the phone face down when they’re talking.',
  'Don’t keep score. Generosity tends to come back around.'
]

export const PERSON_KINDS = [
  { id: 'friend', label: 'Friend' },
  { id: 'family', label: 'Family' },
  { id: 'partner', label: 'Partner' },
  { id: 'other', label: 'Other' }
] as const

export const PARTNER_LABELS = ['Partner', 'Girlfriend', 'Boyfriend', 'Wife', 'Husband', 'Fiancée', 'Fiancé']

/** What to remember about someone, by category. */
export const FACT_CATEGORIES: { id: string; label: string; icon: string; placeholder: string }[] = [
  { id: 'likes', label: 'Loves & likes', icon: '💛', placeholder: 'Matcha, rainy days, old Cantopop…' },
  { id: 'dislikes', label: 'Dislikes', icon: '🙅', placeholder: 'Coriander, loud restaurants…' },
  { id: 'food', label: 'Food & drinks', icon: '🍜', placeholder: 'Kopi-o siew dai, no peanuts, favourite chicken rice stall…' },
  { id: 'gifts', label: 'Gift ideas', icon: '🎁', placeholder: 'That book they mentioned, a new film camera…' },
  { id: 'life', label: 'What’s going on', icon: '💬', placeholder: 'Job interview next week, training for a run…' },
  { id: 'important', label: 'Important to know', icon: '📌', placeholder: 'Allergies, pet’s name, siblings’ names…' },
  { id: 'sizes', label: 'Sizes', icon: '📏', placeholder: 'Ring, shoe, shirt…' },
  { id: 'dates', label: 'Dates to remember', icon: '📅', placeholder: 'Graduation 12 Jun, mum’s birthday 3 Mar…' }
]

/** A different question each day (stable for the day). */
export function questionOfTheDay(decks: QuestionDeck[], salt = ''): string {
  const all = decks.flatMap((d) => QUESTIONS[d])
  let h = 0
  for (const c of new Date().toDateString() + salt) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return all[h % all.length]
}
