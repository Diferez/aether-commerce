import { ProductGrid } from "../../components/ProductGrid";
import { demoProducts } from "../../components/demo-products";

export default function NewArrivalsPage() {
  return (
    <ProductGrid
      initialFlag="new"
      heading="New arrivals"
      eyebrow="Fresh catalog"
      description="Recently normalized products and locally promoted arrivals."
      fallbackProducts={demoProducts}
    />
  );
}
