import { ProductGrid } from "../../components/ProductGrid";
import { demoProducts } from "../../components/demo-products";

export default function ProductsPage() {
  return (
    <main>
      <ProductGrid fallbackProducts={demoProducts} />
    </main>
  );
}
