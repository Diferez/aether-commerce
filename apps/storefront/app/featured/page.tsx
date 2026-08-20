import { ProductGrid } from "../../components/ProductGrid";
import { demoProducts } from "../../components/demo-products";

export default function FeaturedPage() {
  return (
    <ProductGrid
      initialFlag="featured"
      heading="Featured products"
      eyebrow="Featured"
      description="Products promoted through Aether overrides and catalog rules."
      fallbackProducts={demoProducts}
    />
  );
}
