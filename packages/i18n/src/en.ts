/**
 * English catalog. This file is the source of truth for the key set: the Arabic
 * catalog is typed against it, so a missing Arabic translation is a build
 * error rather than a runtime `undefined`. See spec §7.
 *
 * Interpolation uses `{name}` placeholders. A message whose wording depends on
 * a number is declared with `plural()` — see `plural.ts` for why `{count} items`
 * is not good enough.
 *
 * **Coordinator-owned.** Shared domain strings for all three apps live here.
 * Parallel workstreams must NOT edit this file — web adds to `web.en.ts`,
 * mobile adds to `mobile.en.ts`. Backend workstreams emit `errors.*` keys only.
 */
import { plural } from './plural.js';

export const en = {
  /** Measurement unit abbreviations, shared by web and mobile. */
  units: {
    g: 'g',
    kg: 'kg',
    ml: 'ml',
    l: 'L',
    piece: 'pc',
    bunch: 'bunch',
    clove: 'clove',
    slice: 'slice',
    can: 'can',
    jar: 'jar',
    packet: 'pack',
    bottle: 'bottle',
    cup: 'cup',
    tbsp: 'tbsp',
    tsp: 'tsp',
    pinch: 'pinch',
  },

  common: {
    appName: 'Kitchen AI',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    done: 'Done',
    next: 'Next',
    back: 'Back',
    retry: 'Retry',
    search: 'Search',
    loading: 'Loading…',
    empty: 'Nothing here yet',
    confirm: 'Confirm',
    close: 'Close',
    all: 'All',
    today: 'Today',
    language: 'Language',
    english: 'English',
    arabic: 'العربية',
  },

  errors: {
    VALIDATION_FAILED: 'Some details are not quite right. Please check and try again.',
    UNAUTHENTICATED: 'Please sign in to continue.',
    FORBIDDEN: "You don't have access to this.",
    NOT_FOUND: "We couldn't find that.",
    CONFLICT: 'That already exists.',
    HOUSEHOLD_REQUIRED: 'Create or join a household first.',
    RATE_LIMITED: 'Too many requests. Please wait a moment.',
    QUOTA_EXCEEDED: "You've used today's AI allowance. It resets tomorrow.",
    AI_UNAVAILABLE: 'The AI service is unavailable right now. Please try again shortly.',
    AI_INVALID_OUTPUT: "The AI response couldn't be read. Please try again.",
    AI_NO_RESULT: 'Nothing was recognised. Try another photo or add items manually.',
    PLAN_INFEASIBLE: "There isn't enough in your kitchen to build this plan.",
    EXTERNAL_SERVICE_ERROR: 'An external service failed. Please try again.',
    JOB_FAILED: 'That task failed. You can retry it.',
    INTERNAL_ERROR: 'Something went wrong on our side.',
    offline: "You're offline. Changes will sync when you reconnect.",
    feedbackRateLimited: "You've sent us plenty of feedback today. Please try again tomorrow.",
  },

  auth: {
    signIn: 'Sign in',
    signUp: 'Create account',
    signOut: 'Sign out',
    email: 'Email',
    password: 'Password',
    displayName: 'Your name',
    continueWithApple: 'Continue with Apple',
    continueWithGoogle: 'Continue with Google',
    invalidCredentials: 'Incorrect email or password.',
    passwordRequired: 'Enter your password to continue.',
    emailTaken: 'That email is already registered.',
    passwordRules: {
      tooShort: 'Use at least 10 characters.',
      needsLowercase: 'Include a lowercase letter.',
      needsUppercase: 'Include an uppercase letter.',
      needsDigit: 'Include a number.',
    },
  },

  household: {
    title: 'Household',
    create: 'Create a household',
    join: 'Join a household',
    name: 'Household name',
    inviteCode: 'Invite code',
    shareInvite: 'Share this code so others can join',
    members: 'Members',
    owner: 'Owner',
    member: 'Member',
    leave: 'Leave household',
    invalidCode: 'That invite code is not valid.',
  },

  profile: {
    title: 'Preferences',
    dietary: 'Dietary preferences',
    allergies: 'Allergies',
    allergiesHint: 'We will never suggest a meal containing these.',
    halal: 'Halal only',
    cuisines: 'Favourite cuisines',
    householdSize: 'People to cook for',
    healthGoals: 'Health goals',
  },

  inventory: {
    title: 'My Kitchen',
    itemCount: plural('count', {
      one: '{count} item',
      other: '{count} items',
    }),
    expiringSoon: plural('count', {
      other: '{count} expiring soon',
    }),
    expiresIn: plural('days', {
      one: 'Expires in {days} day',
      other: 'Expires in {days} days',
    }),
    expiresToday: 'Expires today',
    expired: 'Expired',
    quantity: 'Quantity',
    unit: 'Unit',
    brand: 'Brand',
    location: 'Location',
    expiryDate: 'Expiry date',
    addItem: 'Add item',
    editItem: 'Edit item',
    deleteItem: 'Remove from kitchen',
    emptyLocation: 'Nothing stored here yet',
    locations: {
      fridge: 'Fridge',
      freezer: 'Freezer',
      pantry: 'Pantry',
      spice_rack: 'Spice rack',
      other: 'Other',
    },
  },

  capture: {
    title: 'Add to kitchen',
    photo: 'Photo',
    barcode: 'Barcode',
    receipt: 'Receipt',
    manual: 'Manual',
    takePhoto: 'Take a photo',
    photoHint: 'Point at your fridge, pantry or spice rack. You can take several photos.',
    scanning: 'Reading your photos…',
    parsingReceipt: 'Reading your receipt…',
    reviewTitle: 'Review before adding',
    reviewHint: 'Check the quantities — we estimate them from the photo.',
    foundCount: plural('count', {
      one: 'Found {count} item',
      other: 'Found {count} items',
    }),
    nothingFound: "We couldn't identify anything. Try a clearer photo or add items manually.",
    addAll: 'Add all to kitchen',
    lowConfidence: 'Low confidence — please confirm',
    barcodeNotFound: "That barcode isn't in the product database. Add the item manually.",
  },

  plans: {
    title: 'Meal plans',
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    generate: 'Generate plan',
    generating: 'Building your plan…',
    generatingHint: 'This takes up to a minute. You can keep using the app.',
    tonight: 'Tonight',
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snack',
    planned: 'Planned',
    cooked: 'Cooked',
    skipped: 'Skipped',
    swap: 'Swap meal',
    regenerate: 'Suggest another',
    coverage: 'Pantry coverage',
    fullyCovered: 'Everything in stock',
    missingItems: plural('count', {
      one: '{count} item missing',
      other: '{count} items missing',
    }),
    daysCovered: '{covered} of {total} days covered by your pantry',
    empty: 'No plan yet. Generate one from what you have.',
  },

  recipe: {
    ingredients: 'Ingredients',
    steps: 'Steps',
    videos: 'Watch how',
    noVideos: 'No video available for this recipe.',
    prepTime: plural('minutes', {
      other: 'Prep {minutes} min',
    }),
    cookTime: plural('minutes', {
      other: 'Cook {minutes} min',
    }),
    servings: plural('count', {
      other: 'Serves {count}',
    }),
    inStock: 'In stock',
    notInStock: 'Not in stock',
    optional: 'Optional',
    cookMode: 'Cook mode',
    markCooked: 'I cooked this',
    cookedConfirm: 'Deduct these ingredients from your kitchen?',
    cookedDone: 'Kitchen updated',
    difficulty: {
      easy: 'Easy',
      medium: 'Medium',
      hard: 'Hard',
    },
  },

  /** Keyed by `dietaryPreferenceSchema.options` — shared by web and mobile. */
  diet: {
    vegetarian: 'Vegetarian',
    vegan: 'Vegan',
    pescatarian: 'Pescatarian',
    keto: 'Keto',
    low_carb: 'Low carb',
    gluten_free: 'Gluten-free',
    dairy_free: 'Dairy-free',
    low_sodium: 'Low sodium',
    high_protein: 'High protein',
  },

  /** Keyed by `cuisineSchema.options` — shared by web and mobile. */
  cuisine: {    levantine: 'Levantine',
    gulf: 'Gulf',
    egyptian: 'Egyptian',
    moroccan: 'Moroccan',
    turkish: 'Turkish',
    persian: 'Persian',
    indian: 'Indian',
    italian: 'Italian',
    mediterranean: 'Mediterranean',
    chinese: 'Chinese',
    japanese: 'Japanese',
    thai: 'Thai',
    mexican: 'Mexican',
    american: 'American',
    french: 'French',
  },

  /** Keyed by `healthGoalSchema.options` — shared by web and mobile. */
  healthGoal: {
    weight_loss: 'Weight loss',
    muscle_gain: 'Muscle gain',
    maintenance: 'Maintenance',
    diabetic_friendly: 'Diabetic-friendly',
    heart_healthy: 'Heart-healthy',
  },

  shopping: {
    title: 'Shopping list',
    empty: 'Your shopping list is empty.',
    addAllMissing: 'Add all missing to shopping list',
    purchased: 'Purchased',
    moveToKitchen: 'Move purchased to kitchen',
    movedCount: plural('count', {
      one: '{count} item added to your kitchen',
      other: '{count} items added to your kitchen',
    }),
  },
};

/**
 * Widened so the Arabic catalog can be typed against the key structure without
 * having to reproduce the English string literals.
 */
export type Messages = typeof en;
