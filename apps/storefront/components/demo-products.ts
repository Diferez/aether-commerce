import type { Product } from "@aether-commerce/schemas";

export const demoProducts: Product[] = [
  {
    id: "demo-arc-laptop",
    externalId: null,
    sourceId: "demo-1",
    slug: "aether-arc-laptop",
    name: "Aether Arc Laptop",
    shortDescription: "A magnesium ultrabook tuned for modern teams.",
    description: "A magnesium ultrabook tuned for founders, designers, and AI-assisted teams.",
    price: 189900,
    originalPrice: 209900,
    finalPrice: 189900,
    discountPercentage: 10,
    currency: "USD",
    category: { id: "laptops", externalId: null, slug: "laptops", name: "Laptops", image: null },
    sku: "AET-ARC-STD",
    brand: "Aether",
    tags: ["laptops", "featured", "deal"],
    initialStock: 16,
    reservedStock: 2,
    soldStock: 8,
    returnedStock: 0,
    adjustedStock: 0,
    availableStock: 12,
    availabilityStatus: "in_stock",
    thumbnail: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=1200&q=80",
    images: [
      {
        url: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=1200&q=80",
        alt: "Aether Arc Laptop on a desk",
        source: "fallback"
      }
    ],
    gallery: ["https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=1200&q=80"],
    specifications: [
      { key: "Display", value: "14-inch color calibrated panel" },
      { key: "Chassis", value: "Magnesium alloy" }
    ],
    flags: ["featured", "deal"],
    seo: {
      title: "Aether Arc Laptop | Aether",
      description: "Premium ultrabook for modern teams.",
      canonicalPath: "/products/aether-arc-laptop"
    },
    variants: [
      {
        id: "arc-standard",
        name: "Finish",
        value: "Graphite",
        priceAdjustment: 0,
        stockAdjustment: 0,
        label: "Standard",
        sku: "AET-ARC-STD",
        priceDelta: 0,
        inventory: 12,
        attributes: { finish: "Graphite" }
      }
    ],
    rating: { average: 4.8, count: 216 },
    reviewCount: 216,
    reviews: [
      { rating: 5, comment: "Display is gorgeous and the battery easily lasts a full day.", date: "2026-06-02T00:00:00.000Z", reviewerName: "Priya S." },
      { rating: 4, comment: "Great build quality, wish it had one more USB-C port.", date: "2026-05-18T00:00:00.000Z", reviewerName: "Marco L." }
    ],
    inventory: {
      sku: "AET-ARC-STD",
      available: 12,
      reserved: 2,
      lowStockThreshold: 4,
      status: "in_stock"
    },
    visibility: "visible",
    featured: true,
    newArrival: false,
    deal: true,
    visible: true,
    seoTitle: "Aether Arc Laptop | Aether",
    seoDescription: "Premium ultrabook for modern teams.",
    catalogSource: "dummyjson",
    externalStock: null,
    lastSyncedAt: "2026-07-01T00:00:00.000Z",
    shippingInformation: "Ships in 2-4 business days",
    warrantyInformation: "1 year Aether demo warranty",
    returnPolicy: "30-day return policy",
    minimumOrderQuantity: 1,
    weight: 1.3,
    dimensions: { width: 31.4, height: 1.5, depth: 22 },
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z"
  },
  {
    id: "demo-dock-studio",
    externalId: null,
    sourceId: "demo-2",
    slug: "aether-dock-studio",
    name: "Aether Dock Studio",
    shortDescription: "A compact desk hub with premium connectivity.",
    description: "A compact desk hub with power, display, network, and fast storage lanes.",
    price: 32900,
    originalPrice: 37900,
    finalPrice: 32900,
    discountPercentage: 13,
    currency: "USD",
    category: { id: "accessories", externalId: null, slug: "accessories", name: "Accessories", image: null },
    sku: "AET-DOCK-STD",
    brand: "Aether",
    tags: ["accessories", "new", "featured"],
    initialStock: 12,
    reservedStock: 1,
    soldStock: 3,
    returnedStock: 0,
    adjustedStock: 0,
    availableStock: 8,
    availabilityStatus: "in_stock",
    thumbnail: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80",
    images: [
      {
        url: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80",
        alt: "Aether Dock Studio connected to laptop",
        source: "fallback"
      }
    ],
    gallery: ["https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80"],
    specifications: [
      { key: "Ports", value: "Thunderbolt, HDMI, Ethernet, USB-C" },
      { key: "Power", value: "100W pass-through" }
    ],
    flags: ["new", "featured"],
    seo: {
      title: "Aether Dock Studio | Aether",
      description: "Desk hub for focused work.",
      canonicalPath: "/products/aether-dock-studio"
    },
    variants: [
      {
        id: "dock-standard",
        name: "Finish",
        value: "Silver",
        priceAdjustment: 0,
        stockAdjustment: 0,
        label: "Standard",
        sku: "AET-DOCK-STD",
        priceDelta: 0,
        inventory: 8,
        attributes: { finish: "Silver" }
      }
    ],
    rating: { average: 4.6, count: 88 },
    reviewCount: 88,
    reviews: [
      { rating: 5, comment: "Turned my desk into a single-cable setup. Excellent.", date: "2026-06-10T00:00:00.000Z", reviewerName: "Jonas K." }
    ],
    inventory: {
      sku: "AET-DOCK-STD",
      available: 8,
      reserved: 1,
      lowStockThreshold: 4,
      status: "in_stock"
    },
    visibility: "visible",
    featured: true,
    newArrival: true,
    deal: false,
    visible: true,
    seoTitle: "Aether Dock Studio | Aether",
    seoDescription: "Desk hub for focused work.",
    catalogSource: "dummyjson",
    externalStock: null,
    lastSyncedAt: "2026-07-01T00:00:00.000Z",
    shippingInformation: "Ships in 1-3 business days",
    warrantyInformation: "1 year Aether demo warranty",
    returnPolicy: "30-day return policy",
    minimumOrderQuantity: 1,
    weight: 0.4,
    dimensions: { width: 12, height: 3, depth: 8 },
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z"
  },
  {
    id: "demo-pulse-headset",
    externalId: null,
    sourceId: "demo-3",
    slug: "aether-pulse-headset",
    name: "Aether Pulse Headset",
    shortDescription: "A low-latency headset for hybrid work.",
    description: "A low-latency headset for crisp calls, travel days, and deep work.",
    price: 24900,
    originalPrice: 24900,
    finalPrice: 22900,
    discountPercentage: 8,
    currency: "USD",
    category: { id: "audio", externalId: null, slug: "audio", name: "Audio", image: null },
    sku: "AET-PULSE-STD",
    brand: "Aether",
    tags: ["audio", "deal", "limited"],
    initialStock: 8,
    reservedStock: 1,
    soldStock: 4,
    returnedStock: 0,
    adjustedStock: 0,
    availableStock: 3,
    availabilityStatus: "low_stock",
    thumbnail: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=80",
    images: [
      {
        url: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=80",
        alt: "Aether Pulse Headset",
        source: "fallback"
      }
    ],
    gallery: ["https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=80"],
    specifications: [
      { key: "Audio", value: "Low-latency wireless" },
      { key: "Use", value: "Calls, travel, deep work" }
    ],
    flags: ["deal", "limited"],
    seo: {
      title: "Aether Pulse Headset | Aether",
      description: "Premium headset for hybrid work.",
      canonicalPath: "/products/aether-pulse-headset"
    },
    variants: [
      {
        id: "pulse-standard",
        name: "Finish",
        value: "Carbon",
        priceAdjustment: 0,
        stockAdjustment: 0,
        label: "Standard",
        sku: "AET-PULSE-STD",
        priceDelta: 0,
        inventory: 3,
        attributes: { finish: "Carbon" }
      }
    ],
    rating: { average: 4.7, count: 143 },
    reviewCount: 143,
    reviews: [
      { rating: 5, comment: "No noticeable lag on calls, very comfortable for long sessions.", date: "2026-06-21T00:00:00.000Z", reviewerName: "Ana R." },
      { rating: 4, comment: "Great sound, case could be smaller.", date: "2026-05-30T00:00:00.000Z", reviewerName: "Diego F." }
    ],
    inventory: {
      sku: "AET-PULSE-STD",
      available: 3,
      reserved: 1,
      lowStockThreshold: 4,
      status: "low_stock"
    },
    visibility: "visible",
    featured: false,
    newArrival: false,
    deal: true,
    visible: true,
    seoTitle: "Aether Pulse Headset | Aether",
    seoDescription: "Premium headset for hybrid work.",
    catalogSource: "dummyjson",
    externalStock: null,
    lastSyncedAt: "2026-07-01T00:00:00.000Z",
    shippingInformation: "Ships in 2-4 business days",
    warrantyInformation: "1 year Aether demo warranty",
    returnPolicy: "30-day return policy",
    minimumOrderQuantity: 1,
    weight: 0.28,
    dimensions: { width: 18, height: 20, depth: 8 },
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z"
  }
];
