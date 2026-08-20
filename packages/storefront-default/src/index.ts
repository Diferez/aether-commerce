export { AetherStorefrontProvider, useStorefrontConfig, useStorefrontPath, type StorefrontRuntimeConfig } from "./AetherStorefrontProvider";
export { LanguageProvider, useLanguage } from "./LanguageProvider";
export { dictionaries, locales, type Locale } from "./dictionaries";
export { StorefrontLink } from "./StorefrontLink";
export { Hero } from "./Hero";
export { SiteFooter } from "./SiteFooter";

export { createCartClient, type CartClient, type CheckoutSessionResult } from "./cart-client";
export { CartProvider, useCart, type CartContextValue } from "./CartProvider";

export {
  readFavoriteProducts,
  isFavoriteProduct,
  toggleFavoriteProduct,
  removeFavoriteProduct,
  migrateGuestFavoritesToCustomer
} from "./favorites-client";
export { FavoritesProvider, useFavorites, type FavoritesContextValue } from "./FavoritesProvider";

export {
  readCompareProducts,
  isCompareProduct,
  toggleCompareProduct,
  removeCompareProduct,
  clearCompareProducts,
  type ToggleCompareResult
} from "./compare-client";
export { CompareProvider, useCompare, type CompareContextValue } from "./CompareProvider";

export { getLocalizedProduct } from "./product-localization";
export { LOW_STOCK_THRESHOLD, EXPOSE_EXACT_STOCK_COUNT, getImageBadge, isLowStock, getLowStockLabel, type ImageBadge } from "./product-badge-logic";
export { ProductBadge } from "./ProductBadge";
export { ProductCard, ProductCardSkeleton } from "./ProductCard";
export { CategoryGrid } from "./CategoryGrid";
export { ProductGrid } from "./ProductGrid";
export { FloatingCart } from "./FloatingCart";

export { AetherAuthProvider, useAetherAuth, type AuthCustomer } from "./AetherAuthProvider";
export { useCustomerSession, useSignOutCustomer, type CustomerSession } from "./customer-client";
export { clerkAppearance, resolveAuthNextPath } from "./clerk-appearance";
export { LoginPage } from "./LoginPage";
export { RegisterPage } from "./RegisterPage";
export { AccountPage } from "./AccountPage";
export { OrdersPage } from "./OrdersPage";
export { FavoritesPage } from "./FavoritesPage";

export { ThemeToggle } from "./ThemeToggle";
export { SiteHeader } from "./SiteHeader";

export { useCheckoutOptions, useShippingSettings, type CheckoutOptions, type ShippingSettings } from "./checkout-options";
export { buildWhatsappUrl, buildCartWhatsappMessage, buildInquiryWhatsappMessage, buildProductWhatsappMessage } from "./whatsapp-checkout";
export { WhatsappBubble } from "./WhatsappBubble";
export { CartPage } from "./CartPage";
export { CheckoutPage } from "./CheckoutPage";
export { CheckoutSuccessClient } from "./CheckoutSuccessClient";
export { CheckoutCancelPage } from "./CheckoutCancelPage";
