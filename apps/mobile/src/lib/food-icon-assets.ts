import type { ImageSourcePropType } from 'react-native';
import type { FoodIconKey } from './food-icon';
import apple from '../../assets/emoji/apple.png';
import banana from '../../assets/emoji/banana.png';
import basket from '../../assets/emoji/basket.png';
import beans from '../../assets/emoji/beans.png';
import bread from '../../assets/emoji/bread.png';
import butter from '../../assets/emoji/butter.png';
import cake from '../../assets/emoji/cake.png';
import candy from '../../assets/emoji/candy.png';
import canned from '../../assets/emoji/canned.png';
import carrot from '../../assets/emoji/carrot.png';
import cereal from '../../assets/emoji/cereal.png';
import cheese from '../../assets/emoji/cheese.png';
import chicken from '../../assets/emoji/chicken.png';
import chocolate from '../../assets/emoji/chocolate.png';
import coffee from '../../assets/emoji/coffee.png';
import cookie from '../../assets/emoji/cookie.png';
import croissant from '../../assets/emoji/croissant.png';
import cucumber from '../../assets/emoji/cucumber.png';
import egg from '../../assets/emoji/egg.png';
import fish from '../../assets/emoji/fish.png';
import flour from '../../assets/emoji/flour.png';
import frozen from '../../assets/emoji/frozen.png';
import garlic from '../../assets/emoji/garlic.png';
import grapes from '../../assets/emoji/grapes.png';
import herbs from '../../assets/emoji/herbs.png';
import honey from '../../assets/emoji/honey.png';
import icecream from '../../assets/emoji/icecream.png';
import juice from '../../assets/emoji/juice.png';
import lemon from '../../assets/emoji/lemon.png';
import mango from '../../assets/emoji/mango.png';
import meat from '../../assets/emoji/meat.png';
import milk from '../../assets/emoji/milk.png';
import nuts from '../../assets/emoji/nuts.png';
import oliveoil from '../../assets/emoji/oliveoil.png';
import onion from '../../assets/emoji/onion.png';
import orange from '../../assets/emoji/orange.png';
import pasta from '../../assets/emoji/pasta.png';
import peach from '../../assets/emoji/peach.png';
import pepper from '../../assets/emoji/pepper.png';
import pizza from '../../assets/emoji/pizza.png';
import potato from '../../assets/emoji/potato.png';
import pudding from '../../assets/emoji/pudding.png';
import rice from '../../assets/emoji/rice.png';
import salad from '../../assets/emoji/salad.png';
import salt from '../../assets/emoji/salt.png';
import sandwich from '../../assets/emoji/sandwich.png';
import shrimp from '../../assets/emoji/shrimp.png';
import strawberry from '../../assets/emoji/strawberry.png';
import tea from '../../assets/emoji/tea.png';
import tomato from '../../assets/emoji/tomato.png';
import water from '../../assets/emoji/water.png';
import watermelon from '../../assets/emoji/watermelon.png';

/**
 * Artwork bundled with the app rather than fetched.
 *
 * The kitchen list is the screen most likely to be read with no signal — in a
 * shop, or in a kitchen with thick walls — so every icon ships in the binary.
 * That also rules out the hosted icon services, whose terms forbid caching.
 *
 * Metro resolves these at build time, so each path must be a literal; a key
 * added to a rule with no file here is caught by food-icon-assets.spec.
 *
 * Twemoji, licensed CC-BY 4.0 — credited on the More screen.
 */
export const FOOD_ICON_ASSETS: Record<FoodIconKey, ImageSourcePropType> = {
  apple,
  banana,
  basket,
  beans,
  bread,
  butter,
  cake,
  candy,
  canned,
  carrot,
  cereal,
  cheese,
  chicken,
  chocolate,
  coffee,
  cookie,
  croissant,
  cucumber,
  egg,
  fish,
  flour,
  frozen,
  garlic,
  grapes,
  herbs,
  honey,
  icecream,
  juice,
  lemon,
  mango,
  meat,
  milk,
  nuts,
  oliveoil,
  onion,
  orange,
  pasta,
  peach,
  pepper,
  pizza,
  potato,
  pudding,
  rice,
  salad,
  salt,
  sandwich,
  shrimp,
  strawberry,
  tea,
  tomato,
  water,
  watermelon,
};
