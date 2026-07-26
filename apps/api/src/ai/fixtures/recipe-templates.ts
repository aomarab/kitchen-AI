import type { MealSlot, Unit } from '@kitchen/contracts';

/**
 * Recorded bilingual recipe templates the mock provider assembles plans from.
 * Ingredient names are real catalog canonical names and quantities use each
 * ingredient's catalog default unit, so resolution and Stage-C coverage behave
 * exactly as they would against a live model. Every template exists in English
 * and Arabic, both written natively (spec §7).
 */

export interface TemplateIngredient {
  name: string;
  quantity: number;
  unit: Unit;
  optional: boolean;
}

export interface RecipeTemplate {
  id: string;
  slots: MealSlot[];
  cuisine: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  ingredients: TemplateIngredient[];
  nutritionPerServing: { calories: number; proteinG: number; carbsG: number; fatG: number } | null;
  en: { title: string; description: string; steps: string[] };
  ar: { title: string; description: string; steps: string[] };
}

export const RECIPE_TEMPLATES: RecipeTemplate[] = [
  {
    id: 'shakshuka',
    slots: ['breakfast', 'lunch'],
    cuisine: 'levantine',
    difficulty: 'easy',
    prepMinutes: 10,
    cookMinutes: 20,
    servings: 2,
    ingredients: [
      { name: 'Chicken eggs', quantity: 4, unit: 'piece', optional: false },
      { name: 'Roma tomato', quantity: 300, unit: 'g', optional: false },
      { name: 'Onion', quantity: 1, unit: 'piece', optional: false },
      { name: 'Garlic', quantity: 2, unit: 'clove', optional: false },
      { name: 'Extra virgin olive oil', quantity: 20, unit: 'ml', optional: false },
      { name: 'Ground cumin', quantity: 3, unit: 'g', optional: false },
      { name: 'Salt', quantity: 3, unit: 'g', optional: false },
    ],
    nutritionPerServing: { calories: 320, proteinG: 18, carbsG: 14, fatG: 22 },
    en: {
      title: 'Tomato Shakshuka',
      description: 'Eggs gently poached in a spiced tomato and onion sauce.',
      steps: [
        'Soften the chopped onion and garlic in olive oil over medium heat.',
        'Add the chopped tomatoes, cumin and salt; simmer until thick.',
        'Make wells in the sauce and crack in the eggs.',
        'Cover and cook until the whites set but the yolks stay soft.',
      ],
    },
    ar: {
      title: 'شكشوكة بالطماطم',
      description: 'بيض مسلوق برفق في صلصة طماطم وبصل متبّلة.',
      steps: [
        'يُقلّب البصل والثوم المفروم في زيت الزيتون على نار متوسطة حتى يذبل.',
        'تُضاف الطماطم المقطعة والكمون والملح ويُترك حتى يثخن.',
        'اعملي حفراً في الصلصة واكسري فيها البيض.',
        'غطّي واطهي حتى يتماسك البياض ويبقى الصفار طرياً.',
      ],
    },
  },
  {
    id: 'labneh-plate',
    slots: ['breakfast', 'snack'],
    cuisine: 'levantine',
    difficulty: 'easy',
    prepMinutes: 5,
    cookMinutes: 0,
    servings: 2,
    ingredients: [
      { name: 'Labneh', quantity: 200, unit: 'g', optional: false },
      { name: 'Extra virgin olive oil', quantity: 15, unit: 'ml', optional: false },
      { name: 'Arabic pita bread', quantity: 2, unit: 'piece', optional: false },
      { name: 'Cucumber', quantity: 1, unit: 'piece', optional: true },
    ],
    nutritionPerServing: { calories: 280, proteinG: 12, carbsG: 30, fatG: 12 },
    en: {
      title: 'Labneh Breakfast Plate',
      description: 'Creamy labneh drizzled with olive oil, served with warm pita.',
      steps: [
        'Spread the labneh across a shallow plate.',
        'Drizzle generously with olive oil.',
        'Serve with warm pita and sliced cucumber.',
      ],
    },
    ar: {
      title: 'صحن لبنة للفطور',
      description: 'لبنة كريمية مع رشة زيت زيتون تُقدَّم مع خبز دافئ.',
      steps: [
        'افردي اللبنة في صحن غير عميق.',
        'رشّي فوقها زيت الزيتون بسخاء.',
        'قدّميها مع خبز عربي دافئ وشرائح الخيار.',
      ],
    },
  },
  {
    id: 'oats-banana',
    slots: ['breakfast'],
    cuisine: null,
    difficulty: 'easy',
    prepMinutes: 5,
    cookMinutes: 8,
    servings: 2,
    ingredients: [
      { name: 'Rolled oats', quantity: 100, unit: 'g', optional: false },
      { name: 'Whole milk', quantity: 400, unit: 'ml', optional: false },
      { name: 'Banana', quantity: 1, unit: 'piece', optional: false },
      { name: 'Honey', quantity: 1, unit: 'jar', optional: true },
    ],
    nutritionPerServing: { calories: 290, proteinG: 11, carbsG: 48, fatG: 6 },
    en: {
      title: 'Banana Milk Oats',
      description: 'Warm oats cooked in milk and topped with sliced banana.',
      steps: [
        'Simmer the oats in milk, stirring, until creamy.',
        'Slice the banana over the top.',
        'Finish with a little honey if you like.',
      ],
    },
    ar: {
      title: 'شوفان بالحليب والموز',
      description: 'شوفان دافئ مطبوخ بالحليب ومزيّن بشرائح الموز.',
      steps: [
        'اطهي الشوفان في الحليب مع التحريك حتى يصبح كريمياً.',
        'قطّعي الموز فوقه.',
        'أضيفي قليلاً من العسل حسب الرغبة.',
      ],
    },
  },
  {
    id: 'chicken-rice',
    slots: ['lunch', 'dinner'],
    cuisine: 'gulf',
    difficulty: 'medium',
    prepMinutes: 15,
    cookMinutes: 35,
    servings: 4,
    ingredients: [
      { name: 'Chicken breast', quantity: 600, unit: 'g', optional: false },
      { name: 'Basmati rice', quantity: 400, unit: 'g', optional: false },
      { name: 'Onion', quantity: 1, unit: 'piece', optional: false },
      { name: 'Garlic', quantity: 3, unit: 'clove', optional: false },
      { name: 'Turmeric', quantity: 3, unit: 'g', optional: false },
      { name: 'Ground cumin', quantity: 4, unit: 'g', optional: false },
      { name: 'Extra virgin olive oil', quantity: 30, unit: 'ml', optional: false },
      { name: 'Salt', quantity: 6, unit: 'g', optional: false },
    ],
    nutritionPerServing: { calories: 540, proteinG: 42, carbsG: 62, fatG: 12 },
    en: {
      title: 'Spiced Chicken and Rice',
      description: 'Tender chicken simmered with onion and spices over basmati rice.',
      steps: [
        'Brown the chicken pieces in olive oil, then set aside.',
        'Soften the onion and garlic; stir in the turmeric and cumin.',
        'Add the rinsed rice, the chicken and water; season with salt.',
        'Cover and cook on low until the rice is fluffy and the chicken is done.',
      ],
    },
    ar: {
      title: 'دجاج بالأرز والبهارات',
      description: 'دجاج طري يُطهى مع البصل والبهارات فوق أرز بسمتي.',
      steps: [
        'حمّري قطع الدجاج في زيت الزيتون ثم ارفعيها جانباً.',
        'قلّبي البصل والثوم ثم أضيفي الكركم والكمون.',
        'أضيفي الأرز المغسول والدجاج والماء وتبّلي بالملح.',
        'غطّي واطهي على نار هادئة حتى ينضج الأرز والدجاج.',
      ],
    },
  },
  {
    id: 'red-lentil-soup',
    slots: ['lunch', 'dinner'],
    cuisine: 'levantine',
    difficulty: 'easy',
    prepMinutes: 10,
    cookMinutes: 30,
    servings: 4,
    ingredients: [
      { name: 'Red lentils', quantity: 300, unit: 'g', optional: false },
      { name: 'Onion', quantity: 1, unit: 'piece', optional: false },
      { name: 'Garlic', quantity: 2, unit: 'clove', optional: false },
      { name: 'Ground cumin', quantity: 4, unit: 'g', optional: false },
      { name: 'Turmeric', quantity: 2, unit: 'g', optional: false },
      { name: 'Extra virgin olive oil', quantity: 20, unit: 'ml', optional: false },
      { name: 'Salt', quantity: 5, unit: 'g', optional: false },
    ],
    nutritionPerServing: { calories: 260, proteinG: 16, carbsG: 40, fatG: 5 },
    en: {
      title: 'Red Lentil Soup',
      description: 'A comforting, silky lentil soup with cumin and lemon.',
      steps: [
        'Sweat the onion and garlic in olive oil.',
        'Add the rinsed lentils, cumin, turmeric and water.',
        'Simmer until the lentils collapse, then blend smooth.',
        'Season with salt and serve hot.',
      ],
    },
    ar: {
      title: 'شوربة عدس أحمر',
      description: 'شوربة عدس ناعمة ومريحة بالكمون والليمون.',
      steps: [
        'شوّحي البصل والثوم في زيت الزيتون.',
        'أضيفي العدس المغسول والكمون والكركم والماء.',
        'اطهي حتى يتفكك العدس ثم اخفقيه حتى النعومة.',
        'تبّلي بالملح وقدّميها ساخنة.',
      ],
    },
  },
  {
    id: 'beef-potato-stew',
    slots: ['lunch', 'dinner'],
    cuisine: 'egyptian',
    difficulty: 'medium',
    prepMinutes: 15,
    cookMinutes: 45,
    servings: 4,
    ingredients: [
      { name: 'Ground beef', quantity: 500, unit: 'g', optional: false },
      { name: 'Potato', quantity: 500, unit: 'g', optional: false },
      { name: 'Tomato paste', quantity: 1, unit: 'can', optional: false },
      { name: 'Onion', quantity: 1, unit: 'piece', optional: false },
      { name: 'Garlic', quantity: 3, unit: 'clove', optional: false },
      { name: 'Extra virgin olive oil', quantity: 25, unit: 'ml', optional: false },
      { name: 'Salt', quantity: 6, unit: 'g', optional: false },
    ],
    nutritionPerServing: { calories: 480, proteinG: 28, carbsG: 34, fatG: 26 },
    en: {
      title: 'Beef and Potato Stew',
      description: 'Slow-cooked minced beef with potatoes in a tomato base.',
      steps: [
        'Brown the beef with onion and garlic in olive oil.',
        'Stir in the tomato paste and cook it out for a minute.',
        'Add the cubed potatoes and water; season with salt.',
        'Simmer until the potatoes are tender and the sauce thickens.',
      ],
    },
    ar: {
      title: 'يخنة اللحم بالبطاطس',
      description: 'لحم مفروم يُطهى ببطء مع البطاطس في صلصة طماطم.',
      steps: [
        'حمّري اللحم مع البصل والثوم في زيت الزيتون.',
        'أضيفي معجون الطماطم واطهيه دقيقة.',
        'أضيفي مكعبات البطاطس والماء وتبّلي بالملح.',
        'اطهي حتى تنضج البطاطس وتثخن الصلصة.',
      ],
    },
  },
  {
    id: 'hummus-bowl',
    slots: ['lunch', 'snack'],
    cuisine: 'levantine',
    difficulty: 'easy',
    prepMinutes: 10,
    cookMinutes: 0,
    servings: 2,
    ingredients: [
      { name: 'Canned chickpeas', quantity: 1, unit: 'can', optional: false },
      { name: 'Tahini', quantity: 1, unit: 'jar', optional: false },
      { name: 'Garlic', quantity: 1, unit: 'clove', optional: false },
      { name: 'Extra virgin olive oil', quantity: 20, unit: 'ml', optional: false },
      { name: 'Arabic pita bread', quantity: 2, unit: 'piece', optional: false },
    ],
    nutritionPerServing: { calories: 360, proteinG: 14, carbsG: 40, fatG: 16 },
    en: {
      title: 'Quick Hummus Bowl',
      description: 'Blended chickpeas and tahini with olive oil and warm bread.',
      steps: [
        'Blend the chickpeas, tahini and garlic until smooth.',
        'Loosen with a little water and olive oil.',
        'Serve with warm pita.',
      ],
    },
    ar: {
      title: 'صحن حمص سريع',
      description: 'حمص وطحينة مخفوقان مع زيت الزيتون وخبز دافئ.',
      steps: [
        'اخفقي الحمص والطحينة والثوم حتى النعومة.',
        'خفّفي القوام بقليل من الماء وزيت الزيتون.',
        'قدّميه مع خبز عربي دافئ.',
      ],
    },
  },
  {
    id: 'halloumi-salad',
    slots: ['dinner', 'lunch', 'snack'],
    cuisine: 'mediterranean',
    difficulty: 'easy',
    prepMinutes: 10,
    cookMinutes: 8,
    servings: 2,
    ingredients: [
      { name: 'Halloumi', quantity: 200, unit: 'g', optional: false },
      { name: 'Cucumber', quantity: 1, unit: 'piece', optional: false },
      { name: 'Roma tomato', quantity: 200, unit: 'g', optional: false },
      { name: 'Parsley', quantity: 1, unit: 'bunch', optional: true },
      { name: 'Extra virgin olive oil', quantity: 20, unit: 'ml', optional: false },
    ],
    nutritionPerServing: { calories: 340, proteinG: 20, carbsG: 10, fatG: 26 },
    en: {
      title: 'Grilled Halloumi Salad',
      description: 'Seared halloumi over a fresh cucumber and tomato salad.',
      steps: [
        'Sear the sliced halloumi until golden on both sides.',
        'Toss the chopped cucumber, tomato and parsley with olive oil.',
        'Top the salad with the warm halloumi.',
      ],
    },
    ar: {
      title: 'سلطة الحلوم المشوي',
      description: 'حلوم مشوي فوق سلطة خيار وطماطم طازجة.',
      steps: [
        'اشوي شرائح الحلوم حتى تذهب من الجهتين.',
        'قلّبي الخيار والطماطم والبقدونس مع زيت الزيتون.',
        'ضعي الحلوم الدافئ فوق السلطة.',
      ],
    },
  },
  {
    id: 'scrambled-eggs-tomato',
    slots: ['breakfast'],
    cuisine: 'levantine',
    difficulty: 'easy',
    prepMinutes: 5,
    cookMinutes: 10,
    servings: 2,
    ingredients: [
      { name: 'Chicken eggs', quantity: 4, unit: 'piece', optional: false },
      { name: 'Roma tomato', quantity: 200, unit: 'g', optional: false },
      { name: 'Onion', quantity: 1, unit: 'piece', optional: false },
      { name: 'Extra virgin olive oil', quantity: 15, unit: 'ml', optional: false },
      { name: 'Salt', quantity: 3, unit: 'g', optional: false },
    ],
    nutritionPerServing: { calories: 250, proteinG: 16, carbsG: 8, fatG: 17 },
    en: {
      title: 'Eggs with Tomato',
      description: 'Soft scrambled eggs folded through sautéed tomato and onion.',
      steps: [
        'Cook the onion and tomato in olive oil until soft.',
        'Pour in the beaten eggs and season with salt.',
        'Fold gently until just set.',
      ],
    },
    ar: {
      title: 'بيض بالطماطم',
      description: 'بيض مخفوق طري مع طماطم وبصل مقلّيين.',
      steps: [
        'اطهي البصل والطماطم في زيت الزيتون حتى يذبلا.',
        'اسكبي البيض المخفوق وتبّلي بالملح.',
        'قلّبي برفق حتى يتماسك.',
      ],
    },
  },
  {
    id: 'egg-cheese-pita',
    slots: ['breakfast', 'snack'],
    cuisine: 'levantine',
    difficulty: 'easy',
    prepMinutes: 5,
    cookMinutes: 6,
    servings: 2,
    ingredients: [
      { name: 'Chicken eggs', quantity: 2, unit: 'piece', optional: false },
      { name: 'White cheese', quantity: 120, unit: 'g', optional: false },
      { name: 'Arabic pita bread', quantity: 2, unit: 'piece', optional: false },
      { name: 'Extra virgin olive oil', quantity: 10, unit: 'ml', optional: false },
    ],
    nutritionPerServing: { calories: 300, proteinG: 17, carbsG: 26, fatG: 14 },
    en: {
      title: 'Egg and Cheese Pita',
      description: 'A warm pita filled with fried egg and white cheese.',
      steps: [
        'Fry the eggs gently in olive oil.',
        'Warm the pita and fill with egg and sliced white cheese.',
        'Fold and serve immediately.',
      ],
    },
    ar: {
      title: 'خبز بالبيض والجبنة',
      description: 'خبز عربي دافئ محشو بالبيض المقلي والجبنة البيضاء.',
      steps: [
        'اقلي البيض برفق في زيت الزيتون.',
        'سخّني الخبز واحشيه بالبيض وشرائح الجبنة البيضاء.',
        'اطويه وقدّميه فوراً.',
      ],
    },
  },
  {
    id: 'chicken-shawarma-wrap',
    slots: ['lunch', 'dinner'],
    cuisine: 'levantine',
    difficulty: 'medium',
    prepMinutes: 20,
    cookMinutes: 15,
    servings: 4,
    ingredients: [
      { name: 'Chicken shawarma strips', quantity: 600, unit: 'g', optional: false },
      { name: 'Arabic pita bread', quantity: 4, unit: 'piece', optional: false },
      { name: 'Onion', quantity: 1, unit: 'piece', optional: false },
      { name: 'Garlic', quantity: 2, unit: 'clove', optional: false },
      { name: 'Tahini', quantity: 1, unit: 'jar', optional: false },
      { name: 'Extra virgin olive oil', quantity: 25, unit: 'ml', optional: false },
    ],
    nutritionPerServing: { calories: 520, proteinG: 38, carbsG: 40, fatG: 22 },
    en: {
      title: 'Chicken Shawarma Wraps',
      description: 'Spiced chicken strips wrapped in pita with garlic tahini.',
      steps: [
        'Sear the marinated chicken strips until browned and cooked through.',
        'Whisk the tahini with garlic and a little water into a sauce.',
        'Fill the pita with chicken, onion and the tahini sauce, then roll.',
      ],
    },
    ar: {
      title: 'لفائف شاورما الدجاج',
      description: 'شرائح دجاج متبّلة ملفوفة بالخبز مع طحينة بالثوم.',
      steps: [
        'حمّري شرائح الدجاج المتبّلة حتى تنضج وتذهب.',
        'اخفقي الطحينة مع الثوم وقليل من الماء لعمل الصلصة.',
        'احشي الخبز بالدجاج والبصل وصلصة الطحينة ثم لفيه.',
      ],
    },
  },
  {
    id: 'tuna-salad',
    slots: ['lunch', 'dinner', 'snack'],
    cuisine: 'mediterranean',
    difficulty: 'easy',
    prepMinutes: 10,
    cookMinutes: 0,
    servings: 2,
    ingredients: [
      { name: 'Canned tuna', quantity: 1, unit: 'can', optional: false },
      { name: 'Cucumber', quantity: 1, unit: 'piece', optional: false },
      { name: 'Roma tomato', quantity: 150, unit: 'g', optional: false },
      { name: 'Onion', quantity: 1, unit: 'piece', optional: false },
      { name: 'Lemon', quantity: 1, unit: 'piece', optional: false },
      { name: 'Extra virgin olive oil', quantity: 15, unit: 'ml', optional: false },
    ],
    nutritionPerServing: { calories: 240, proteinG: 22, carbsG: 10, fatG: 12 },
    en: {
      title: 'Tuna Salad',
      description: 'Flaked tuna with crisp cucumber, tomato and a lemon dressing.',
      steps: [
        'Drain and flake the tuna into a bowl.',
        'Add the chopped cucumber, tomato and onion.',
        'Dress with lemon juice and olive oil, then toss.',
      ],
    },
    ar: {
      title: 'سلطة تونة',
      description: 'تونة مفتّتة مع خيار مقرمش وطماطم وتتبيلة ليمون.',
      steps: [
        'صفّي التونة وفتّتيها في وعاء.',
        'أضيفي الخيار والطماطم والبصل المفروم.',
        'تبّليها بعصير الليمون وزيت الزيتون ثم قلّبي.',
      ],
    },
  },
  {
    id: 'vegetable-stew',
    slots: ['lunch', 'dinner'],
    cuisine: 'egyptian',
    difficulty: 'easy',
    prepMinutes: 15,
    cookMinutes: 30,
    servings: 4,
    ingredients: [
      { name: 'Potato', quantity: 400, unit: 'g', optional: false },
      { name: 'Carrot', quantity: 200, unit: 'g', optional: false },
      { name: 'Peas', quantity: 200, unit: 'g', optional: false },
      { name: 'Onion', quantity: 1, unit: 'piece', optional: false },
      { name: 'Tomato paste', quantity: 1, unit: 'can', optional: false },
      { name: 'Extra virgin olive oil', quantity: 25, unit: 'ml', optional: false },
      { name: 'Salt', quantity: 5, unit: 'g', optional: false },
    ],
    nutritionPerServing: { calories: 230, proteinG: 7, carbsG: 38, fatG: 7 },
    en: {
      title: 'Mixed Vegetable Stew',
      description: 'A hearty tomato stew of potato, carrot and peas.',
      steps: [
        'Sauté the onion in olive oil until soft.',
        'Stir in the tomato paste, then add the vegetables and water.',
        'Simmer until everything is tender; season with salt.',
      ],
    },
    ar: {
      title: 'يخنة خضار مشكّلة',
      description: 'يخنة طماطم دسمة بالبطاطس والجزر والبازلاء.',
      steps: [
        'شوّحي البصل في زيت الزيتون حتى يذبل.',
        'أضيفي معجون الطماطم ثم الخضار والماء.',
        'اطهي حتى تنضج ثم تبّلي بالملح.',
      ],
    },
  },
  {
    id: 'spaghetti-tomato',
    slots: ['lunch', 'dinner'],
    cuisine: 'italian',
    difficulty: 'easy',
    prepMinutes: 5,
    cookMinutes: 20,
    servings: 4,
    ingredients: [
      { name: 'Spaghetti', quantity: 400, unit: 'g', optional: false },
      { name: 'Roma tomato', quantity: 400, unit: 'g', optional: false },
      { name: 'Garlic', quantity: 3, unit: 'clove', optional: false },
      { name: 'Onion', quantity: 1, unit: 'piece', optional: false },
      { name: 'Extra virgin olive oil', quantity: 30, unit: 'ml', optional: false },
      { name: 'Salt', quantity: 6, unit: 'g', optional: false },
    ],
    nutritionPerServing: { calories: 430, proteinG: 13, carbsG: 78, fatG: 9 },
    en: {
      title: 'Spaghetti with Tomato',
      description: 'Spaghetti tossed in a simple garlic and tomato sauce.',
      steps: [
        'Boil the spaghetti in salted water until al dente.',
        'Cook the garlic, onion and chopped tomato into a sauce.',
        'Toss the drained pasta through the sauce.',
      ],
    },
    ar: {
      title: 'سباغيتي بالطماطم',
      description: 'سباغيتي مع صلصة طماطم وثوم بسيطة.',
      steps: [
        'اسلقي السباغيتي في ماء مملّح حتى تنضج.',
        'اطهي الثوم والبصل والطماطم المقطعة لعمل صلصة.',
        'قلّبي المعكرونة المصفّاة مع الصلصة.',
      ],
    },
  },
  {
    id: 'okra-stew',
    slots: ['lunch', 'dinner'],
    cuisine: 'egyptian',
    difficulty: 'medium',
    prepMinutes: 15,
    cookMinutes: 40,
    servings: 4,
    ingredients: [
      { name: 'Okra', quantity: 500, unit: 'g', optional: false },
      { name: 'Ground beef', quantity: 300, unit: 'g', optional: false },
      { name: 'Tomato paste', quantity: 1, unit: 'can', optional: false },
      { name: 'Onion', quantity: 1, unit: 'piece', optional: false },
      { name: 'Garlic', quantity: 3, unit: 'clove', optional: false },
      { name: 'Extra virgin olive oil', quantity: 25, unit: 'ml', optional: false },
      { name: 'Salt', quantity: 5, unit: 'g', optional: false },
    ],
    nutritionPerServing: { calories: 360, proteinG: 22, carbsG: 22, fatG: 20 },
    en: {
      title: 'Okra and Beef Stew',
      description: 'Okra braised with minced beef in a garlicky tomato sauce.',
      steps: [
        'Brown the beef with onion and garlic.',
        'Add the tomato paste and okra with a little water.',
        'Simmer gently until the okra is tender; season with salt.',
      ],
    },
    ar: {
      title: 'بامية باللحم',
      description: 'بامية مطهوة مع اللحم المفروم في صلصة طماطم بالثوم.',
      steps: [
        'حمّري اللحم مع البصل والثوم.',
        'أضيفي معجون الطماطم والبامية مع قليل من الماء.',
        'اطهي على نار هادئة حتى تنضج البامية ثم تبّلي بالملح.',
      ],
    },
  },
];

/**
 * Canonical names (English and Arabic, normalized) of catalog ingredients marked
 * `isStaple` in `seed-data/*.json`. Stage-C assumes these are always on hand
 * unless a household explicitly marks them out of stock, so the mock's coverage
 * check must treat them as available too — otherwise a template that Stage C
 * would accept looks uncovered here and the mock needlessly avoids it. Kept in
 * sync with the seed catalog (spec §4.2 / §5.4). Not coverage *math* — the
 * quantity/dimension logic is reused from `planner/units.ts`.
 */
export const STAPLE_INGREDIENT_NAMES: ReadonlySet<string> = new Set(
  [
    'Onion',
    'Garlic',
    'Whole milk',
    'Plain yoghurt',
    'Chicken eggs',
    'Basmati rice',
    'Egyptian short-grain rice',
    'Arabic pita bread',
    'White sandwich bread',
    'Extra virgin olive oil',
    'Sunflower oil',
    'Vegetable oil',
    'White sugar',
    'All-purpose flour',
    'Baking powder',
    'Canned chopped tomatoes',
    'Tomato paste',
    'Salt',
    'Black pepper',
    'Ground cumin',
    'Turmeric',
    'Paprika',
    'Ground cinnamon',
    'Bay leaf',
    'White vinegar',
    'Chicken stock cube',
    'Water',
    // Arabic canonical names, so coverage works regardless of locale.
    'بصل',
    'ثوم',
    'حليب كامل الدسم',
    'زبادي',
    'بيض دجاج',
    'أرز بسمتي',
    'أرز مصري',
    'خبز عربي',
    'خبز الساندويش الأبيض',
    'زيت زيتون بكر ممتاز',
    'زيت عباد الشمس',
    'زيت نباتي',
    'سكر أبيض',
    'دقيق متعدد الأغراض',
    'خميرة كيميائية',
    'طماطم مقطعة معلبة',
    'معجون الطماطم',
    'ملح',
    'فلفل أسود مطحون',
    'كمون مطحون',
    'كركم',
    'بابريكا',
    'قرفة مطحونة',
    'ورق الغار',
    'خل أبيض',
    'مرقة الدجاج',
    'ماء',
  ].map((name) => name.trim().toLowerCase().replace(/\s+/g, ' ')),
);
