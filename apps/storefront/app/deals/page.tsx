import { ProductGrid } from "../../components/ProductGrid";
import { demoProducts } from "../../components/demo-products";

export default function DealsPage() {
  return (
    <ProductGrid
      initialFlag="deal"
      heading="Aether deals"
      eyebrow="Discounts"
      description="Discounted products with backend-calculated final prices."
      fallbackProducts={demoProducts}
    />
  );
}
