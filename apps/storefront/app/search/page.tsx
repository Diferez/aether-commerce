import { ProductGrid } from "../../components/ProductGrid";
import { demoProducts } from "../../components/demo-products";

export default function SearchPage() {
  return (
    <ProductGrid
      heading="Search Aether"
      description="Search, filter, and sort the full Aether catalog through the DummyJSON-backed Catalog Adapter."
      fallbackProducts={demoProducts}
    />
  );
}
