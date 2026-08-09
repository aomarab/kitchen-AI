import { RecipeView } from '../../../../components/recipe/RecipeView';

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecipeView id={id} />;
}
