import type { Cuisine, Difficulty, IngredientCategory, Unit } from '@kitchen/contracts';

/**
 * Seed data for the mock server. Bilingual by construction: every ingredient
 * and recipe carries English and Arabic so a locale switch shows native content
 * (spec §7) rather than machine translation.
 */

export interface IngredientSeed {
  key: string;
  en: string;
  ar: string;
  category: IngredientCategory;
  defaultUnit: Unit;
  aliases: string[];
  isStaple: boolean;
}

export const INGREDIENTS: IngredientSeed[] = [
  { key: 'onion', en: 'Onion', ar: 'بصل', category: 'vegetable', defaultUnit: 'piece', aliases: ['بصلة', 'onions'], isStaple: false },
  { key: 'garlic', en: 'Garlic', ar: 'ثوم', category: 'vegetable', defaultUnit: 'clove', aliases: ['فص ثوم'], isStaple: false },
  { key: 'tomato', en: 'Tomato', ar: 'طماطم', category: 'vegetable', defaultUnit: 'piece', aliases: ['بندورة', 'tomatoes'], isStaple: false },
  { key: 'chicken', en: 'Chicken', ar: 'دجاج', category: 'poultry', defaultUnit: 'g', aliases: ['دجاجة', 'chicken breast'], isStaple: false },
  { key: 'beef', en: 'Beef', ar: 'لحم بقري', category: 'meat', defaultUnit: 'g', aliases: ['لحمة'], isStaple: false },
  { key: 'rice', en: 'Rice', ar: 'أرز', category: 'grain', defaultUnit: 'g', aliases: ['رز', 'basmati'], isStaple: false },
  { key: 'eggs', en: 'Eggs', ar: 'بيض', category: 'egg', defaultUnit: 'piece', aliases: ['بيضة'], isStaple: false },
  { key: 'yogurt', en: 'Yogurt', ar: 'زبادي', category: 'dairy', defaultUnit: 'g', aliases: ['لبن', 'laban'], isStaple: false },
  { key: 'lemon', en: 'Lemon', ar: 'ليمون', category: 'fruit', defaultUnit: 'piece', aliases: ['ليمونة'], isStaple: false },
  { key: 'parsley', en: 'Parsley', ar: 'بقدونس', category: 'herb', defaultUnit: 'bunch', aliases: ['بقدونس أخضر'], isStaple: false },
  { key: 'potato', en: 'Potato', ar: 'بطاطس', category: 'vegetable', defaultUnit: 'piece', aliases: ['بطاطا', 'potatoes'], isStaple: false },
  { key: 'eggplant', en: 'Eggplant', ar: 'باذنجان', category: 'vegetable', defaultUnit: 'piece', aliases: ['بيتنجان'], isStaple: false },
  { key: 'chickpeas', en: 'Chickpeas', ar: 'حمص', category: 'legume', defaultUnit: 'g', aliases: ['حمّص'], isStaple: false },
  { key: 'lentils', en: 'Red lentils', ar: 'عدس أحمر', category: 'legume', defaultUnit: 'g', aliases: ['عدس'], isStaple: false },
  { key: 'cucumber', en: 'Cucumber', ar: 'خيار', category: 'vegetable', defaultUnit: 'piece', aliases: ['خيارة'], isStaple: false },
  { key: 'bellPepper', en: 'Bell pepper', ar: 'فلفل رومي', category: 'vegetable', defaultUnit: 'piece', aliases: ['فليفلة'], isStaple: false },
  { key: 'tahini', en: 'Tahini', ar: 'طحينة', category: 'condiment', defaultUnit: 'g', aliases: ['طحينية'], isStaple: false },
  { key: 'oliveOil', en: 'Olive oil', ar: 'زيت زيتون', category: 'oil', defaultUnit: 'ml', aliases: ['زيت'], isStaple: true },
  { key: 'salt', en: 'Salt', ar: 'ملح', category: 'spice', defaultUnit: 'g', aliases: ['ملح طعام'], isStaple: true },
  { key: 'pepper', en: 'Black pepper', ar: 'فلفل أسود', category: 'spice', defaultUnit: 'g', aliases: ['بهار أسود'], isStaple: true },
  { key: 'cumin', en: 'Cumin', ar: 'كمون', category: 'spice', defaultUnit: 'g', aliases: ['كمّون'], isStaple: true },
  { key: 'flour', en: 'Flour', ar: 'دقيق', category: 'baking', defaultUnit: 'g', aliases: ['طحين'], isStaple: true },
];

export interface RecipeIngredientSeed {
  ref: string;
  quantity: number;
  unit: Unit;
  optional?: boolean;
  note?: { en: string; ar: string };
}

export interface VideoSeed {
  youtubeId: string;
  en: string;
  ar: string;
  channel: string;
  durationSeconds: number;
}

export interface RecipeSeed {
  key: string;
  title: { en: string; ar: string };
  description: { en: string; ar: string };
  cuisine: Cuisine;
  difficulty: Difficulty;
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  nutrition: { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG?: number };
  steps: { en: string[]; ar: string[] };
  ingredients: RecipeIngredientSeed[];
  videos: VideoSeed[];
}

export const RECIPES: RecipeSeed[] = [
  {
    key: 'kabsa',
    title: { en: 'Chicken Kabsa', ar: 'كبسة الدجاج' },
    description: {
      en: 'Fragrant spiced rice cooked with chicken, tomatoes and onion — a Gulf classic.',
      ar: 'أرز متبّل عطري يُطهى مع الدجاج والطماطم والبصل — طبق خليجي كلاسيكي.',
    },
    cuisine: 'gulf',
    difficulty: 'medium',
    prepMinutes: 20,
    cookMinutes: 45,
    servings: 4,
    nutrition: { calories: 620, proteinG: 38, carbsG: 74, fatG: 18, fiberG: 4 },
    steps: {
      en: [
        'Brown the chicken pieces in olive oil, then set aside.',
        'Soften the chopped onion and garlic in the same pot.',
        'Add grated tomato, cumin, salt and pepper and cook down.',
        'Return the chicken, add rice and water, and simmer covered until tender.',
        'Rest for five minutes, then fluff the rice and serve.',
      ],
      ar: [
        'حمّر قطع الدجاج في زيت الزيتون ثم ارفعها جانبًا.',
        'اطهُ البصل والثوم المفروم في القدر نفسه حتى يذبل.',
        'أضف الطماطم المبشورة والكمون والملح والفلفل واتركها تتشرّب.',
        'أعد الدجاج وأضف الأرز والماء واتركه على نار هادئة مغطّى حتى ينضج.',
        'اتركه خمس دقائق، ثم قلّب الأرز وقدّمه.',
      ],
    },
    ingredients: [
      { ref: 'chicken', quantity: 800, unit: 'g' },
      { ref: 'rice', quantity: 500, unit: 'g' },
      { ref: 'onion', quantity: 2, unit: 'piece' },
      { ref: 'tomato', quantity: 3, unit: 'piece' },
      { ref: 'garlic', quantity: 4, unit: 'clove' },
      { ref: 'cumin', quantity: 10, unit: 'g' },
      { ref: 'oliveOil', quantity: 45, unit: 'ml' },
      { ref: 'salt', quantity: 8, unit: 'g' },
    ],
    videos: [
      { youtubeId: 'Xtspw022mb4', en: 'The Best Chicken Kabsa', ar: 'أفضل كبسة دجاج', channel: 'The White Plate', durationSeconds: 742 },
    ],
  },
  {
    key: 'shakshuka',
    title: { en: 'Shakshuka', ar: 'شكشوكة' },
    description: {
      en: 'Eggs poached in a spiced tomato and pepper sauce. Fast, cheap and satisfying.',
      ar: 'بيض مسلوق في صلصة الطماطم والفلفل المتبّلة. سريعة واقتصادية ومشبعة.',
    },
    cuisine: 'levantine',
    difficulty: 'easy',
    prepMinutes: 10,
    cookMinutes: 20,
    servings: 2,
    nutrition: { calories: 310, proteinG: 18, carbsG: 16, fatG: 20, fiberG: 5 },
    steps: {
      en: [
        'Sauté onion and bell pepper in olive oil until soft.',
        'Add chopped tomato, cumin, salt and pepper; simmer to a thick sauce.',
        'Make wells in the sauce and crack in the eggs.',
        'Cover and cook until the whites set but the yolks stay runny.',
        'Scatter parsley over the top and serve with bread.',
      ],
      ar: [
        'شوّح البصل والفلفل الرومي في زيت الزيتون حتى يذبل.',
        'أضف الطماطم المفرومة والكمون والملح والفلفل واطهها حتى تثخن الصلصة.',
        'اعمل حفرًا في الصلصة واكسر فيها البيض.',
        'غطِّ واطبخ حتى يتماسك البياض ويبقى الصفار سائلًا.',
        'انثر البقدونس في الأعلى وقدّمها مع الخبز.',
      ],
    },
    ingredients: [
      { ref: 'eggs', quantity: 4, unit: 'piece' },
      { ref: 'tomato', quantity: 4, unit: 'piece' },
      { ref: 'bellPepper', quantity: 1, unit: 'piece' },
      { ref: 'onion', quantity: 1, unit: 'piece' },
      { ref: 'cumin', quantity: 5, unit: 'g' },
      { ref: 'oliveOil', quantity: 30, unit: 'ml' },
      { ref: 'parsley', quantity: 1, unit: 'bunch', optional: true },
      { ref: 'salt', quantity: 4, unit: 'g' },
    ],
    videos: [
      { youtubeId: 'FUXpoUG_cXk', en: 'Easy Shakshuka in 20 Minutes', ar: 'شكشوكة سهلة في 20 دقيقة', channel: 'The Cooking Foodie', durationSeconds: 388 },
    ],
  },
  {
    key: 'lentilSoup',
    title: { en: 'Red Lentil Soup', ar: 'شوربة العدس الأحمر' },
    description: {
      en: 'A smooth, warming lentil soup finished with lemon. Naturally vegan.',
      ar: 'شوربة عدس ناعمة ودافئة تُتوّج بعصير الليمون. نباتية بطبيعتها.',
    },
    cuisine: 'levantine',
    difficulty: 'easy',
    prepMinutes: 10,
    cookMinutes: 30,
    servings: 4,
    nutrition: { calories: 240, proteinG: 14, carbsG: 38, fatG: 4, fiberG: 9 },
    steps: {
      en: [
        'Sweat the onion and garlic in olive oil.',
        'Add rinsed red lentils, cumin and water.',
        'Simmer until the lentils collapse, about 25 minutes.',
        'Blend smooth, season with salt, and finish with lemon juice.',
      ],
      ar: [
        'شوّح البصل والثوم في زيت الزيتون.',
        'أضف العدس الأحمر المغسول والكمون والماء.',
        'اتركها على نار هادئة حتى يتفكّك العدس، نحو 25 دقيقة.',
        'اخلطها حتى تنعم، تبّلها بالملح، وأضف عصير الليمون في النهاية.',
      ],
    },
    ingredients: [
      { ref: 'lentils', quantity: 300, unit: 'g' },
      { ref: 'onion', quantity: 1, unit: 'piece' },
      { ref: 'garlic', quantity: 2, unit: 'clove' },
      { ref: 'cumin', quantity: 6, unit: 'g' },
      { ref: 'lemon', quantity: 1, unit: 'piece' },
      { ref: 'oliveOil', quantity: 20, unit: 'ml' },
      { ref: 'salt', quantity: 5, unit: 'g' },
    ],
    videos: [
      { youtubeId: 'xGEr3FPUJ84', en: 'Classic Red Lentil Soup', ar: 'شوربة عدس أحمر كلاسيكية', channel: 'Nico\'s Recipes', durationSeconds: 275 },
    ],
  },
  {
    key: 'hummus',
    title: { en: 'Creamy Hummus', ar: 'حمص بالطحينة' },
    description: {
      en: 'Silky chickpea dip with tahini, lemon and garlic. Great for a light lunch.',
      ar: 'غموس الحمص الحريري مع الطحينة والليمون والثوم. مثالي لغداء خفيف.',
    },
    cuisine: 'levantine',
    difficulty: 'easy',
    prepMinutes: 15,
    cookMinutes: 0,
    servings: 4,
    nutrition: { calories: 280, proteinG: 10, carbsG: 26, fatG: 16, fiberG: 7 },
    steps: {
      en: [
        'Blend the chickpeas with tahini until thick.',
        'Add garlic, lemon juice and salt; blend again.',
        'Loosen with cold water until smooth and airy.',
        'Spread on a plate, drizzle with olive oil, and serve.',
      ],
      ar: [
        'اخلط الحمص مع الطحينة حتى يصبح كثيفًا.',
        'أضف الثوم وعصير الليمون والملح، واخلط مجددًا.',
        'خفّفه بالماء البارد حتى يصبح ناعمًا وهشًا.',
        'افرده في طبق، وزيّنه بزيت الزيتون، وقدّمه.',
      ],
    },
    ingredients: [
      { ref: 'chickpeas', quantity: 400, unit: 'g' },
      { ref: 'tahini', quantity: 120, unit: 'g' },
      { ref: 'lemon', quantity: 1, unit: 'piece' },
      { ref: 'garlic', quantity: 1, unit: 'clove' },
      { ref: 'oliveOil', quantity: 20, unit: 'ml' },
      { ref: 'salt', quantity: 4, unit: 'g' },
    ],
    videos: [
      { youtubeId: 'GbxnB53IExY', en: 'Smoothest Hummus at Home', ar: 'أنعم حمص في البيت', channel: 'Downshiftology', durationSeconds: 402 },
    ],
  },
  {
    key: 'moussaka',
    title: { en: 'Eggplant Moussaka', ar: 'مسقعة الباذنجان' },
    description: {
      en: 'Roasted eggplant baked with spiced beef and tomato. Comfort food.',
      ar: 'باذنجان محمّص يُخبز مع اللحم المفروم المتبّل والطماطم. طعام يبعث الدفء.',
    },
    cuisine: 'egyptian',
    difficulty: 'medium',
    prepMinutes: 25,
    cookMinutes: 40,
    servings: 4,
    nutrition: { calories: 430, proteinG: 26, carbsG: 22, fatG: 26, fiberG: 8 },
    steps: {
      en: [
        'Roast the sliced eggplant with olive oil until golden.',
        'Brown the beef with onion, garlic, cumin, salt and pepper.',
        'Stir in chopped tomato and simmer briefly.',
        'Layer eggplant and meat sauce in a dish.',
        'Bake until bubbling, then rest before serving.',
      ],
      ar: [
        'حمّص شرائح الباذنجان بزيت الزيتون حتى تذهّب.',
        'حمّر اللحم المفروم مع البصل والثوم والكمون والملح والفلفل.',
        'أضف الطماطم المفرومة واتركها تغلي قليلًا.',
        'رصّ الباذنجان وصلصة اللحم في صينية طبقات.',
        'اخبزها حتى تتفوّر، ثم اتركها قليلًا قبل التقديم.',
      ],
    },
    ingredients: [
      { ref: 'eggplant', quantity: 3, unit: 'piece' },
      { ref: 'beef', quantity: 500, unit: 'g' },
      { ref: 'tomato', quantity: 3, unit: 'piece' },
      { ref: 'onion', quantity: 1, unit: 'piece' },
      { ref: 'garlic', quantity: 3, unit: 'clove' },
      { ref: 'cumin', quantity: 8, unit: 'g' },
      { ref: 'oliveOil', quantity: 40, unit: 'ml' },
      { ref: 'salt', quantity: 6, unit: 'g' },
    ],
    videos: [
      { youtubeId: 'XXxJbivD3k0', en: 'Baked Eggplant Moussaka', ar: 'مسقعة باذنجان بالفرن', channel: 'The Mediterranean Dish', durationSeconds: 515 },
    ],
  },
  {
    key: 'potatoFrittata',
    title: { en: 'Potato & Herb Frittata', ar: 'عجة البطاطس والأعشاب' },
    description: {
      en: 'A hearty baked egg dish with potato and parsley. Perfect for breakfast.',
      ar: 'طبق بيض مخبوز غني بالبطاطس والبقدونس. مثالي للفطور.',
    },
    cuisine: 'mediterranean',
    difficulty: 'easy',
    prepMinutes: 10,
    cookMinutes: 25,
    servings: 3,
    nutrition: { calories: 330, proteinG: 17, carbsG: 24, fatG: 19, fiberG: 3 },
    steps: {
      en: [
        'Fry the sliced potato in olive oil until tender.',
        'Beat the eggs with salt, pepper and chopped parsley.',
        'Pour over the potato and cook gently.',
        'Finish under a grill until set and golden.',
      ],
      ar: [
        'اقلِ شرائح البطاطس في زيت الزيتون حتى تنضج.',
        'اخفق البيض مع الملح والفلفل والبقدونس المفروم.',
        'اسكبه فوق البطاطس واطبخه على نار هادئة.',
        'أكمل تحت الشوّاية حتى يتماسك ويذهّب.',
      ],
    },
    ingredients: [
      { ref: 'potato', quantity: 3, unit: 'piece' },
      { ref: 'eggs', quantity: 6, unit: 'piece' },
      { ref: 'parsley', quantity: 1, unit: 'bunch' },
      { ref: 'oliveOil', quantity: 30, unit: 'ml' },
      { ref: 'salt', quantity: 4, unit: 'g' },
      { ref: 'pepper', quantity: 2, unit: 'g' },
    ],
    videos: [
      { youtubeId: 'UaRsVKsc7qA', en: 'Fluffy Potato Frittata', ar: 'عجة بطاطس هشة', channel: 'SoDelicious', durationSeconds: 331 },
    ],
  },
];
