import { Component, lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { Footer, Newsletter } from './components/Footer.tsx';
import { Header } from './components/Header.tsx';
import { ErrorState, LoadingState } from './components/ui.tsx';
import { I18nProvider } from './i18n/index.tsx';
import { matchPath, RouterProvider, useLocation } from './router.tsx';
import { AuthProvider } from './state/auth.tsx';
import { CartProvider } from './state/cart.tsx';
import { SettingsProvider } from './state/settings.tsx';
import { ToastProvider } from './state/toast.tsx';
import { WishlistProvider } from './state/wishlist.tsx';

// Route-level code splitting: each page is its own chunk; the admin is a separate bundle.
const Home = lazy(() => import('./pages/Home.tsx'));
const Shop = lazy(() => import('./pages/Shop.tsx'));
const ProductPage = lazy(() => import('./pages/Product.tsx'));
const CartPage = lazy(() => import('./pages/Cart.tsx'));
const Checkout = lazy(() => import('./pages/Checkout.tsx'));
const DemoPayment = lazy(() => import('./pages/DemoPayment.tsx'));
const OrderPage = lazy(() => import('./pages/OrderConfirmation.tsx'));
const Auth = lazy(() => import('./pages/Auth.tsx'));
const Account = lazy(() => import('./pages/account/Account.tsx'));
const Wishlist = lazy(() => import('./pages/Wishlist.tsx'));
const Blog = lazy(() => import('./pages/Blog.tsx'));
const BlogPost = lazy(() => import('./pages/BlogPost.tsx'));
const Contact = lazy(() => import('./pages/Contact.tsx'));
const Faq = lazy(() => import('./pages/Faq.tsx'));
const Content = lazy(() => import('./pages/Content.tsx'));
const NotFound = lazy(() => import('./pages/NotFound.tsx'));
const Admin = lazy(() => import('./pages/admin/Admin.tsx'));

type RouteDef = { path: string; C: ComponentType<any>; props?: Record<string, unknown> };
/** Central route configuration. */
export const ROUTES: RouteDef[] = [
  { path: '/', C: Home },
  { path: '/shop', C: Shop },
  { path: '/category/:slug', C: Shop, props: { mode: 'category' } },
  { path: '/search', C: Shop, props: { mode: 'search' } },
  { path: '/new-arrivals', C: Shop, props: { mode: 'new' } },
  { path: '/best-sellers', C: Shop, props: { mode: 'best' } },
  { path: '/offers', C: Shop, props: { mode: 'offers' } },
  { path: '/product/:slug', C: ProductPage },
  { path: '/cart', C: CartPage },
  { path: '/checkout', C: Checkout },
  { path: '/checkout/demo-payment/:number', C: DemoPayment },
  { path: '/order/:number', C: OrderPage },
  { path: '/login', C: Auth, props: { mode: 'login' } },
  { path: '/register', C: Auth, props: { mode: 'register' } },
  { path: '/forgot-password', C: Auth, props: { mode: 'forgot' } },
  { path: '/reset-password', C: Auth, props: { mode: 'reset' } },
  { path: '/account', C: Account, props: { tab: 'overview' } },
  { path: '/account/orders', C: Account, props: { tab: 'orders' } },
  { path: '/account/orders/:number', C: Account, props: { tab: 'order' } },
  { path: '/account/addresses', C: Account, props: { tab: 'addresses' } },
  { path: '/account/settings', C: Account, props: { tab: 'settings' } },
  { path: '/wishlist', C: Wishlist },
  { path: '/blog', C: Blog },
  { path: '/blog/:slug', C: BlogPost },
  { path: '/contact', C: Contact },
  { path: '/faq', C: Faq },
  { path: '/about', C: Content, props: { page: 'about' } },
  { path: '/shipping', C: Content, props: { page: 'shipping' } },
  { path: '/returns', C: Content, props: { page: 'returns' } },
  { path: '/privacy', C: Content, props: { page: 'privacy' } },
  { path: '/terms', C: Content, props: { page: 'terms' } },
];

class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  componentDidCatch(error: Error) {
    console.error('[ui]', error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="container section">
          <ErrorState onRetry={() => window.location.reload()} />
        </div>
      );
    }
    return this.props.children;
  }
}

function Routes() {
  const { pathname } = useLocation();
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return (
      <ErrorBoundary resetKey={pathname}>
        <Suspense fallback={<LoadingState />}>
          <Admin />
        </Suspense>
      </ErrorBoundary>
    );
  }
  let page: ReactNode = <NotFound />;
  for (const r of ROUTES) {
    const params = matchPath(r.path, pathname);
    if (params) {
      page = <r.C key={r.path + JSON.stringify(params)} params={params} {...r.props} />;
      break;
    }
  }
  const bare = pathname.startsWith('/checkout');
  return (
    <>
      <Header />
      <main id="main" tabIndex={-1}>
        <ErrorBoundary resetKey={pathname}>
          <Suspense fallback={<LoadingState />}>{page}</Suspense>
        </ErrorBoundary>
      </main>
      {!bare && <Newsletter />}
      <Footer />
    </>
  );
}

export function App() {
  return (
    <RouterProvider>
      <I18nProvider>
        <SettingsProvider>
          <ToastProvider>
            <AuthProvider>
              <CartProvider>
                <WishlistProvider>
                  <Routes />
                </WishlistProvider>
              </CartProvider>
            </AuthProvider>
          </ToastProvider>
        </SettingsProvider>
      </I18nProvider>
    </RouterProvider>
  );
}
