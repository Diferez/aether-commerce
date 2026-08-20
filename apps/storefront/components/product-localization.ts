import type { Product } from "@aether/schemas";
import type { Locale } from "@aether/storefront-default";

const spanishProductCopy: Record<string, { category?: string; description?: string }> = {
  "aether-arc-laptop": {
    category: "Portátiles",
    description: "Un ultrabook de magnesio pensado para fundadores, diseñadores y equipos que trabajan con IA."
  },
  "aether-dock-studio": {
    category: "Accesorios",
    description: "Un hub compacto de escritorio con energía, pantalla, red y conexiones rápidas de almacenamiento."
  },
  "aether-pulse-headset": {
    category: "Audio",
    description: "Audífonos de baja latencia para llamadas claras, viajes y sesiones de trabajo profundo."
  },
  "nordic-lounge-chair": {
    category: "Muebles",
    description: "Silla lounge tapizada con líneas suaves, ideal para salas, estudios y rincones de lectura."
  },
  "canvas-weekender-bag": {
    category: "Accesorios",
    description: "Bolso de lona resistente con compartimentos amplios para escapadas cortas y uso diario."
  },
  "everyday-runner-sneakers": {
    category: "Calzado",
    description: "Tenis livianos para caminar, combinar con outfits casuales y moverse con comodidad todo el día."
  },
  "minimal-desk-lamp": {
    category: "Muebles",
    description: "Lámpara LED compacta con luz enfocada para escritorios, mesas de noche y espacios de trabajo."
  },
  "ceramic-coffee-set": {
    category: "Hogar",
    description: "Set de café en cerámica con acabado sobrio para rutinas tranquilas, cocinas pequeñas o regalos."
  },
  "wireless-travel-speaker": {
    category: "Audio",
    description: "Parlante portátil con sonido claro, formato compacto y batería pensada para viajes y reuniones."
  },
  "leather-card-wallet": {
    category: "Accesorios",
    description: "Billetera delgada en cuero con costuras limpias y acceso rápido a las tarjetas esenciales."
  },
  "classic-denim-jacket": {
    category: "Ropa",
    description: "Chaqueta denim versátil con estructura clásica para combinar por capas en looks diarios."
  },
  "modern-side-table": {
    category: "Muebles",
    description: "Mesa auxiliar compacta de líneas modernas para sala, dormitorio o apartamentos pequeños."
  }
};

const spanishCategoryNames: Record<string, string> = {
  laptops: "Portátiles",
  accessories: "Accesorios",
  electronics: "Electrónica",
  furniture: "Muebles",
  shoes: "Calzado",
  miscellaneous: "Misceláneos",
  audio: "Audio",
  clothes: "Ropa",
  clothing: "Ropa",
  technology: "Productos",
  home: "Hogar"
};

export function getLocalizedProduct(product: Product, locale: Locale) {
  const copy = locale === "es" ? spanishProductCopy[product.slug] : undefined;
  const category = spanishCategoryNames[product.category.slug] ?? product.category.name;
  const spanishDescription = copy?.description ?? product.description;

  return {
    category: locale === "es" ? copy?.category ?? category : product.category.name,
    description: locale === "es" ? spanishDescription : product.description
  };
}
