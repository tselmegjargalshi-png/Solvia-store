export type Img = { url: string; alt: string; color?: string };

export type ProductCard = {
  id: number;
  slug: string;
  name: string;
  nameMn: string;
  shortDescription: string;
  brand: { name: string; slug: string } | null;
  category: { name: string; nameMn: string; slug: string } | null;
  priceFrom: number;
  compareAt: number | null;
  onSale: boolean;
  priceVaries: boolean;
  inStock: boolean;
  featured: boolean;
  images: Img[];
  colors: { name: string; hex: string }[];
  createdAt: string;
};

export type Variant = {
  id: number;
  sku: string;
  color: string;
  colorHex: string;
  size: string;
  price: number;
  compareAt: number | null;
  stock: number;
  available: boolean;
  active: boolean;
  ownPrice?: number | null;
  ownSalePrice?: number | null;
};

export type Product = {
  id: number;
  slug: string;
  sku: string;
  name: string;
  nameMn: string;
  shortDescription: string;
  description: string;
  specs: { label: string; value: string }[];
  optionNames: string[];
  brand: { name: string; slug: string } | null;
  category: { name: string; nameMn: string; slug: string } | null;
  breadcrumbs: { name: string; nameMn: string; slug: string }[];
  price: number;
  salePrice: number | null;
  status: string;
  featured: boolean;
  images: Img[];
  variants: Variant[];
  createdAt: string;
  updatedAt: string;
};

export type Category = { id: number; parentId: number | null; slug: string; name: string; nameMn: string; description: string; image: string; sortOrder: number; productCount: number };

export type QuoteLine = {
  variantId: number;
  productId: number;
  slug: string;
  name: string;
  nameMn: string;
  variantLabel: string;
  sku: string;
  image: string;
  imageAlt: string;
  unitPrice: number;
  compareAt: number | null;
  quantity: number;
  requestedQuantity: number;
  stock: number;
  lineTotal: number;
  color: string;
  size: string;
};
export type QuoteIssue = { variantId: number; type: 'unavailable' | 'out_of_stock' | 'quantity_adjusted' | 'invalid_quantity'; name?: string; available?: number };
export type Quote = {
  lines: QuoteLine[];
  issues: QuoteIssue[];
  itemCount: number;
  subtotal: number;
  discount: number;
  coupon: { code: string; description: string } | null;
  couponError: string | null;
  shippingMethod: string | null;
  shippingFee: number;
  freeShippingThreshold: number;
  tax: number;
  taxRate: number;
  taxInclusive: boolean;
  taxLabel: string;
  total: number;
  currency: string;
};

export type Order = {
  id: number;
  number: string;
  email: string;
  fullName: string;
  phone: string;
  shippingAddress: { country: string; city: string; address: string; postalCode: string };
  deliveryNotes: string;
  shippingMethod: string;
  paymentMethod: 'card' | 'bank_transfer' | 'cod';
  currency: string;
  subtotal: number;
  discount: number;
  couponCode: string | null;
  shippingFee: number;
  tax: number;
  taxInclusive: boolean;
  total: number;
  status: string;
  paymentStatus: string;
  isDemoPayment: boolean;
  reservedUntil: string | null;
  cancelRequested: boolean;
  cancelReason: string;
  createdAt: string;
  updatedAt: string;
  items: { productId: number | null; variantId: number | null; name: string; variantLabel: string; sku: string; image: string; unitPrice: number; quantity: number; lineTotal: number }[];
  events: { type: string; message: string; actor?: string; createdAt: string }[];
  payments: { provider: string; amount: number; status: string; isDemo: boolean; createdAt: string; note?: string }[];
  userId?: number | null;
  allowedStatuses?: string[];
  allowedPaymentStatuses?: string[];
};

export type Post = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  image: string;
  imageAlt: string;
  author: string;
  category: { slug: string; name: string } | null;
  status: string;
  isSample: boolean;
  seoTitle: string;
  metaDescription: string;
  publishedAt: string | null;
  body?: string;
  categoryId?: number | null;
};

export type User = { id: number; email: string; fullName: string; role: 'customer' | 'admin'; locale: string; phone: string };
