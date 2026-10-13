/**
 * DEMONSTRATION CATALOG. Every product, brand and specification here is fictional sample
 * data for development and portfolio purposes. Replace with real products before launch.
 * `kind` selects the illustration drawn by scripts/generate-images.ts.
 */

export type ColorDef = { name: string; hex: string };
export type ProductDef = {
  slug: string;
  sku: string;
  name: string;
  nameMn: string;
  kind: string;
  category: string;
  brand: string;
  price: number;
  salePrice?: number;
  featured?: boolean;
  short: string;
  description: string;
  specs: [string, string][];
  colors?: ColorDef[];
  sizes?: string[];
  /** size -> price override (e.g. larger candle costs more) */
  sizePrices?: Record<string, number>;
  /** stock per variant key "Color|Size" ("|" for simple). Falls back to defaultStock. */
  stock?: Record<string, number>;
  defaultStock?: number;
  daysAgo: number;
};

export const CATEGORIES = [
  { slug: 'home-living', name: 'Home & Living', nameMn: 'Гэр ахуй', description: 'Decor, lighting and objects for calm, considered rooms.', parent: null, sort: 1 },
  { slug: 'decor', name: 'Decor', nameMn: 'Чимэглэл', description: 'Vases, textiles, candles and desk objects.', parent: 'home-living', sort: 1 },
  { slug: 'lighting', name: 'Lighting', nameMn: 'Гэрэлтүүлэг', description: 'Table lamps and pendants with warm, even light.', parent: 'home-living', sort: 2 },
  { slug: 'kitchen-dining', name: 'Kitchen & Dining', nameMn: 'Гал тогоо', description: 'Tableware and tools for everyday cooking and coffee.', parent: null, sort: 2 },
  { slug: 'audio-tech', name: 'Audio & Tech', nameMn: 'Аудио ба техник', description: 'Headphones, speakers and desk accessories.', parent: null, sort: 3 },
  { slug: 'bags-accessories', name: 'Bags & Accessories', nameMn: 'Цүнх ба дагалдах', description: 'Bags, small leather goods, watches and eyewear.', parent: null, sort: 4 },
  { slug: 'bags', name: 'Bags', nameMn: 'Цүнх', description: 'Totes, backpacks and crossbody bags.', parent: 'bags-accessories', sort: 1 },
  { slug: 'accessories', name: 'Accessories', nameMn: 'Дагалдах хэрэгсэл', description: 'Watches, wallets, scarves and sunglasses.', parent: 'bags-accessories', sort: 2 },
  { slug: 'apparel', name: 'Apparel', nameMn: 'Хувцас', description: 'Knitwear, shirts and outerwear.', parent: null, sort: 5 },
  { slug: 'tops', name: 'Tops', nameMn: 'Цамц', description: 'Tees, shirts and sweaters.', parent: 'apparel', sort: 1 },
  { slug: 'outerwear', name: 'Outerwear', nameMn: 'Гадуур хувцас', description: 'Jackets and coats for colder days.', parent: 'apparel', sort: 2 },
  { slug: 'footwear', name: 'Footwear', nameMn: 'Гутал', description: 'Sneakers and boots.', parent: null, sort: 6 },
];

export const BRANDS = ['Aurelle', 'Halden', 'Kestrel & Co.', 'Mono Atelier', 'Orrin Audio', 'Veyra'];

const C = {
  navy: { name: 'Navy', hex: '#1B2A4A' },
  black: { name: 'Black', hex: '#1C1C1E' },
  white: { name: 'White', hex: '#F4F2EE' },
  ivory: { name: 'Ivory', hex: '#EDE6D6' },
  sand: { name: 'Sand', hex: '#D8C3A0' },
  slate: { name: 'Slate', hex: '#5D6B78' },
  oat: { name: 'Oat', hex: '#D9CDB4' },
  terracotta: { name: 'Terracotta', hex: '#B8623F' },
  brass: { name: 'Brass', hex: '#C9A15A' },
  cream: { name: 'Cream', hex: '#EFE6D2' },
  charcoal: { name: 'Charcoal', hex: '#3A3D42' },
  steel: { name: 'Steel', hex: '#A7ADB3' },
  sage: { name: 'Sage', hex: '#8FA38A' },
  midnight: { name: 'Midnight', hex: '#151E33' },
  stone: { name: 'Stone', hex: '#B9B2A6' },
  tan: { name: 'Tan', hex: '#B07B4F' },
  cognac: { name: 'Cognac', hex: '#8E4E2B' },
  graphite: { name: 'Graphite', hex: '#4A4E55' },
  tortoise: { name: 'Tortoise', hex: '#6B4A2E' },
  camel: { name: 'Camel', hex: '#B98B5B' },
  grey: { name: 'Grey', hex: '#8E9196' },
  sky: { name: 'Sky', hex: '#BFD3E6' },
  brown: { name: 'Brown', hex: '#6A4630' },
  goldNavy: { name: 'Gold / Navy', hex: '#C9A15A' },
  silverBlack: { name: 'Silver / Black', hex: '#B8BCC2' },
};
const APPAREL = ['S', 'M', 'L', 'XL'];
const SHOES = ['39', '40', '41', '42', '43', '44'];

export const PRODUCTS: ProductDef[] = [
  {
    slug: 'arc-ceramic-vase', sku: 'SV-DEC-001', name: 'Arc Ceramic Vase', nameMn: 'Арк керамик ваар', kind: 'vase', category: 'decor', brand: 'Mono Atelier',
    price: 89000, featured: true, colors: [C.sand, C.slate, C.ivory], defaultStock: 14, daysAgo: 3,
    short: 'A softly curved stoneware vase with a matte glaze, sized for single stems or small bunches.',
    description: 'The Arc vase pairs a wide shoulder with a narrow neck, so even a single branch stands upright. The matte reactive glaze varies slightly from piece to piece. Wipe clean with a damp cloth; the interior is glazed and holds water.',
    specs: [['Material', 'Glazed stoneware'], ['Height', '24 cm'], ['Opening', '3.5 cm'], ['Care', 'Hand wash']],
  },
  {
    slug: 'ribbed-glass-vase-set', sku: 'SV-DEC-002', name: 'Ribbed Glass Vase Set', nameMn: 'Хээтэй шилэн ваар (иж бүрдэл)', kind: 'vase2', category: 'decor', brand: 'Mono Atelier',
    price: 65000, salePrice: 52000, defaultStock: 9, daysAgo: 40,
    short: 'Two ribbed glass bud vases in complementary heights.',
    description: 'A pair of clear ribbed glass vases, 12 cm and 16 cm tall. The vertical ribbing catches light from a window and softens the look of stems. Supplied together.',
    specs: [['Material', 'Glass'], ['Heights', '12 cm and 16 cm'], ['Pieces', '2'], ['Care', 'Hand wash']],
  },
  {
    slug: 'linen-throw-pillow', sku: 'SV-DEC-003', name: 'Linen Throw Pillow', nameMn: 'Маалинган дэр', kind: 'pillow', category: 'decor', brand: 'Veyra',
    price: 59000, colors: [C.oat, C.navy, C.terracotta], stock: { 'Terracotta|': 3 }, defaultStock: 20, daysAgo: 12,
    short: 'Washed linen cover with a feather-blend insert and hidden zip.',
    description: 'A 50 × 50 cm pillow with a stone-washed linen cover that softens with every wash. The cover has a concealed zip and is removable; the insert is a feather and fibre blend.',
    specs: [['Size', '50 × 50 cm'], ['Cover', '100% linen'], ['Insert', 'Feather/fibre blend'], ['Care', 'Cover machine washable at 30°C']],
  },
  {
    slug: 'soy-wax-candle', sku: 'SV-DEC-004', name: 'Cedar & Amber Candle', nameMn: 'Хуш, хувын анхилуун лаа', kind: 'candle', category: 'decor', brand: 'Veyra',
    price: 39000, sizes: ['200 g', '400 g'], sizePrices: { '200 g': 39000, '400 g': 59000 }, defaultStock: 25, daysAgo: 6,
    short: 'Wood-wick candle with notes of cedar, amber and black tea.',
    description: 'A soy-blend candle poured into a reusable smoked-glass vessel. The 200 g size burns for roughly 40 hours and the 400 g for roughly 75 hours, depending on conditions. Trim the wick before each use.',
    specs: [['Wax', 'Soy blend'], ['Wick', 'Wood'], ['Burn time', '≈40 h / ≈75 h'], ['Vessel', 'Smoked glass']],
  },
  {
    slug: 'notebook-set-a5', sku: 'SV-DEC-005', name: 'Linen Notebook Set (A5)', nameMn: 'Тэмдэглэлийн дэвтэр (A5, иж бүрдэл)', kind: 'notebook', category: 'decor', brand: 'Mono Atelier',
    price: 35000, defaultStock: 40, daysAgo: 60,
    short: 'Three lay-flat A5 notebooks: lined, dotted and blank.',
    description: 'Three thread-sewn notebooks with linen-wrapped covers that open flat on the desk. 96 pages of 100 gsm paper each, suitable for fountain pens.',
    specs: [['Format', 'A5'], ['Pages', '96 per notebook'], ['Paper', '100 gsm'], ['Rulings', 'Lined, dotted, blank']],
  },
  {
    slug: 'reed-diffuser', sku: 'SV-DEC-006', name: 'Reed Diffuser — Fig Leaf', nameMn: 'Анхилуун зэгс — Инжир', kind: 'diffuser', category: 'decor', brand: 'Veyra',
    price: 79000, defaultStock: 4, daysAgo: 18,
    short: 'A 200 ml reed diffuser with a green fig and cedar scent.',
    description: 'Natural rattan reeds in a weighted glass bottle. Flip the reeds weekly to refresh the scent. Lasts around 10–12 weeks in a medium room.',
    specs: [['Volume', '200 ml'], ['Reeds', '8 rattan'], ['Duration', '≈10–12 weeks'], ['Scent', 'Fig leaf, cedar']],
  },
  {
    slug: 'halo-table-lamp', sku: 'SV-LGT-001', name: 'Halo Table Lamp', nameMn: 'Хало ширээний гэрэл', kind: 'lamp', category: 'lighting', brand: 'Halden',
    price: 249000, featured: true, colors: [C.brass, C.black], stock: { 'Black|': 2 }, defaultStock: 8, daysAgo: 8,
    short: 'A dimmable table lamp with an opal glass globe and metal base.',
    description: 'Halo diffuses light evenly through a hand-blown opal glass globe. The touch dimmer has three levels. Uses one E27 bulb (included, 2700K LED).',
    specs: [['Height', '38 cm'], ['Shade', 'Opal glass, Ø20 cm'], ['Bulb', 'E27 LED 2700K, included'], ['Cable', '1.8 m fabric cord']],
  },
  {
    slug: 'dome-pendant-light', sku: 'SV-LGT-002', name: 'Dome Pendant Light', nameMn: 'Бөмбөгөр унжлагатай гэрэл', kind: 'pendant', category: 'lighting', brand: 'Halden',
    price: 319000, defaultStock: 0, daysAgo: 30,
    short: 'A spun-aluminium dome pendant for dining tables and kitchen islands.',
    description: 'A 40 cm spun-aluminium dome with a matte exterior and white interior for a bright, glare-free downlight. Professional installation recommended.',
    specs: [['Diameter', '40 cm'], ['Material', 'Spun aluminium'], ['Bulb', 'E27, max 60 W (not included)'], ['Drop', 'Adjustable to 150 cm']],
  },
  {
    slug: 'stoneware-mug-pair', sku: 'SV-KIT-001', name: 'Stoneware Mug Pair', nameMn: 'Керамик аяга (хос)', kind: 'mug', category: 'kitchen-dining', brand: 'Mono Atelier',
    price: 45000, colors: [C.cream, C.charcoal], defaultStock: 30, daysAgo: 2,
    short: 'Two 350 ml mugs with a comfortable rounded handle.',
    description: 'A set of two stoneware mugs with a speckled glaze and an unglazed foot. Dishwasher and microwave safe.',
    specs: [['Capacity', '350 ml each'], ['Material', 'Stoneware'], ['Pieces', '2'], ['Care', 'Dishwasher & microwave safe']],
  },
  {
    slug: 'pour-over-kettle', sku: 'SV-KIT-002', name: 'Gooseneck Pour-Over Kettle', nameMn: 'Кофены данх', kind: 'kettle', category: 'kitchen-dining', brand: 'Halden',
    price: 159000, salePrice: 135000, featured: true, colors: [C.steel, C.black], defaultStock: 11, daysAgo: 22,
    short: 'A 1 L stovetop kettle with a precise gooseneck spout and built-in thermometer.',
    description: 'Designed for pour-over coffee, with a slow, controllable flow. Works on gas, electric and induction hobs. The lid thermometer reads 0–100°C.',
    specs: [['Capacity', '1 L'], ['Material', 'Stainless steel'], ['Hob', 'Gas, electric, induction'], ['Thermometer', 'Lid-mounted']],
  },
  {
    slug: 'walnut-serving-board', sku: 'SV-KIT-003', name: 'Walnut Serving Board', nameMn: 'Хушин зүсэх банз', kind: 'board', category: 'kitchen-dining', brand: 'Kestrel & Co.',
    price: 79000, sizes: ['Medium', 'Large'], sizePrices: { Medium: 79000, Large: 99000 }, stock: { '|Large': 5 }, defaultStock: 12, daysAgo: 35,
    short: 'Solid walnut board with a handle, oiled with food-safe oil.',
    description: 'Cut from solid walnut and finished with food-safe mineral oil. Medium is 40 × 20 cm; Large is 50 × 25 cm. Hand wash and re-oil occasionally.',
    specs: [['Wood', 'Solid walnut'], ['Medium', '40 × 20 × 2 cm'], ['Large', '50 × 25 × 2 cm'], ['Finish', 'Food-safe oil']],
  },
  {
    slug: 'insulated-bottle', sku: 'SV-KIT-004', name: 'Insulated Bottle 750 ml', nameMn: 'Дулаан хадгалах сав 750 мл', kind: 'bottle', category: 'kitchen-dining', brand: 'Kestrel & Co.',
    price: 55000, colors: [C.navy, C.sage, C.white], defaultStock: 35, daysAgo: 15,
    short: 'Double-wall vacuum bottle that keeps drinks cold or hot.',
    description: 'Vacuum-insulated stainless steel with a powder-coated finish and a leak-proof lid. Keeps drinks cold for up to 24 hours or hot for up to 12 hours in typical conditions.',
    specs: [['Capacity', '750 ml'], ['Material', 'Stainless steel'], ['Cold / hot', 'Up to 24 h / 12 h'], ['Care', 'Hand wash']],
  },
  {
    slug: 'studio-wireless-headphones', sku: 'SV-AUD-001', name: 'Studio Wireless Headphones', nameMn: 'Студи утасгүй чихэвч', kind: 'headphones', category: 'audio-tech', brand: 'Orrin Audio',
    price: 459000, salePrice: 399000, featured: true, colors: [C.midnight, C.sand], defaultStock: 7, daysAgo: 5,
    short: 'Over-ear Bluetooth headphones with active noise cancelling.',
    description: 'Memory-foam ear cushions, active noise cancelling and up to 30 hours of playback per charge (ANC on, manufacturer figure). USB-C charging and a 3.5 mm cable for wired listening.',
    specs: [['Connectivity', 'Bluetooth 5.3, 3.5 mm'], ['Battery', 'Up to 30 h (ANC on)'], ['Charging', 'USB-C'], ['Weight', '265 g']],
  },
  {
    slug: 'compact-bluetooth-speaker', sku: 'SV-AUD-002', name: 'Compact Bluetooth Speaker', nameMn: 'Авсаархан Bluetooth чанга яригч', kind: 'speaker', category: 'audio-tech', brand: 'Orrin Audio',
    price: 189000, colors: [C.charcoal, C.stone], defaultStock: 16, daysAgo: 27,
    short: 'A fabric-wrapped speaker with full sound for its size.',
    description: 'A 20 W speaker with a passive radiator for fuller bass. Splash resistant (IPX4), with up to 15 hours of battery life.',
    specs: [['Output', '20 W'], ['Battery', 'Up to 15 h'], ['Rating', 'IPX4'], ['Size', '18 × 8 × 8 cm']],
  },
  {
    slug: 'wireless-charging-pad', sku: 'SV-AUD-003', name: 'Wireless Charging Pad', nameMn: 'Утасгүй цэнэглэгч', kind: 'pad', category: 'audio-tech', brand: 'Orrin Audio',
    price: 69000, defaultStock: 3, daysAgo: 50,
    short: 'A 15 W Qi charging pad with a walnut top.',
    description: 'Charges Qi-compatible phones and earbuds through cases up to 5 mm thick. Includes a USB-C cable; a 20 W adapter is recommended for full speed.',
    specs: [['Output', 'Up to 15 W'], ['Standard', 'Qi'], ['Top', 'Walnut veneer'], ['Cable', 'USB-C, 1 m']],
  },
  {
    slug: 'minimal-analog-watch', sku: 'SV-ACC-001', name: 'Minimal Analog Watch', nameMn: 'Минимал гар цаг', kind: 'watch', category: 'accessories', brand: 'Aurelle',
    price: 329000, featured: true, colors: [C.goldNavy, C.silverBlack], defaultStock: 6, daysAgo: 9,
    short: 'A 38 mm watch with a sapphire-coated crystal and leather strap.',
    description: 'Quartz movement, a slim 7 mm case and a sunray dial. Water resistant to 5 ATM (splashes and hand washing, not swimming). Strap width 20 mm.',
    specs: [['Case', '38 mm stainless steel'], ['Movement', 'Quartz'], ['Water resistance', '5 ATM'], ['Strap', '20 mm leather']],
  },
  {
    slug: 'leather-card-wallet', sku: 'SV-ACC-002', name: 'Leather Card Wallet', nameMn: 'Арьсан картын хавтас', kind: 'wallet', category: 'accessories', brand: 'Kestrel & Co.',
    price: 79000, colors: [C.tan, C.black, C.navy], defaultStock: 22, daysAgo: 20,
    short: 'A slim wallet with four card slots and a centre pocket.',
    description: 'Made from full-grain leather with painted edges. Holds 4–8 cards plus folded notes in the centre pocket.',
    specs: [['Material', 'Full-grain leather'], ['Size', '10.5 × 7.5 cm'], ['Capacity', '4–8 cards'], ['Lining', 'Unlined']],
  },
  {
    slug: 'polarized-sunglasses', sku: 'SV-ACC-003', name: 'Polarized Sunglasses', nameMn: 'Поляризацтай нарны шил', kind: 'sunglasses', category: 'accessories', brand: 'Aurelle',
    price: 149000, salePrice: 119000, colors: [C.tortoise, C.black], defaultStock: 10, daysAgo: 45,
    short: 'Acetate frames with polarized, UV400 lenses.',
    description: 'A classic rounded-square frame in acetate with polarized lenses rated UV400. Comes with a hard case and cleaning cloth.',
    specs: [['Frame', 'Acetate'], ['Lens', 'Polarized, UV400'], ['Lens width', '50 mm'], ['Includes', 'Case & cloth']],
  },
  {
    slug: 'cashmere-scarf', sku: 'SV-ACC-004', name: 'Cashmere Blend Scarf', nameMn: 'Ноолууран ороолт', kind: 'scarf', category: 'accessories', brand: 'Aurelle',
    price: 169000, colors: [C.camel, C.grey, C.navy], defaultStock: 15, daysAgo: 4,
    short: 'A soft, generous scarf in a cashmere and wool blend.',
    description: 'A 30% cashmere, 70% wool blend woven into a 190 × 35 cm scarf with fringed ends. Dry clean or hand wash cold.',
    specs: [['Composition', '30% cashmere, 70% wool'], ['Size', '190 × 35 cm'], ['Finish', 'Fringed ends'], ['Care', 'Hand wash cold or dry clean']],
  },
  {
    slug: 'everyday-leather-tote', sku: 'SV-BAG-001', name: 'Everyday Leather Tote', nameMn: 'Өдөр тутмын арьсан цүнх', kind: 'tote', category: 'bags', brand: 'Kestrel & Co.',
    price: 389000, featured: true, colors: [C.cognac, C.black], defaultStock: 5, daysAgo: 14,
    short: 'A structured tote that fits a 14-inch laptop.',
    description: 'Full-grain leather with a cotton-lined interior, a zip pocket and a padded laptop sleeve. Shoulder-length handles with a 24 cm drop.',
    specs: [['Size', '38 × 30 × 14 cm'], ['Laptop', 'Up to 14"'], ['Material', 'Full-grain leather'], ['Closure', 'Magnetic snap']],
  },
  {
    slug: 'commuter-backpack', sku: 'SV-BAG-002', name: 'Commuter Backpack', nameMn: 'Өдөр тутмын үүргэвч', kind: 'backpack', category: 'bags', brand: 'Kestrel & Co.',
    price: 259000, colors: [C.navy, C.graphite], defaultStock: 12, daysAgo: 33,
    short: 'A 20 L water-resistant backpack with a 16-inch laptop compartment.',
    description: 'A water-resistant polyester shell, a clamshell main compartment, a quick-access front pocket and a luggage pass-through.',
    specs: [['Volume', '20 L'], ['Laptop', 'Up to 16"'], ['Shell', 'Water-resistant polyester'], ['Weight', '0.9 kg']],
  },
  {
    slug: 'crossbody-mini-bag', sku: 'SV-BAG-003', name: 'Crossbody Mini Bag', nameMn: 'Мөрөвчтэй жижиг цүнх', kind: 'crossbody', category: 'bags', brand: 'Aurelle',
    price: 199000, colors: [C.ivory, C.black], defaultStock: 9, daysAgo: 1,
    short: 'A compact leather crossbody with an adjustable strap.',
    description: 'Fits a phone, cards and keys. Smooth leather with a zip top, an interior slip pocket and an adjustable strap (max drop 60 cm).',
    specs: [['Size', '20 × 14 × 6 cm'], ['Material', 'Smooth leather'], ['Strap', 'Adjustable, 60 cm max'], ['Closure', 'Zip']],
  },
  {
    slug: 'merino-crew-sweater', sku: 'SV-TOP-001', name: 'Merino Crew Sweater', nameMn: 'Мериносын ноосон цамц', kind: 'sweater', category: 'tops', brand: 'Mono Atelier',
    price: 219000, featured: true, colors: [C.navy, C.oat], sizes: APPAREL, stock: { 'Navy|XL': 0, 'Oat|S': 2 }, defaultStock: 8, daysAgo: 7,
    short: 'A fine-gauge merino wool crew neck for layering.',
    description: 'Knitted from extra-fine merino wool in a regular fit with ribbed cuffs and hem. Breathable and soft against skin. Model is 183 cm and wears size M.',
    specs: [['Composition', '100% merino wool'], ['Gauge', '14 gauge'], ['Fit', 'Regular'], ['Care', 'Hand wash cold, dry flat']],
  },
  {
    slug: 'essential-cotton-tee', sku: 'SV-TOP-002', name: 'Essential Cotton Tee', nameMn: 'Хөвөн подволк', kind: 'tee', category: 'tops', brand: 'Mono Atelier',
    price: 49000, colors: [C.white, C.black, C.navy], sizes: APPAREL, defaultStock: 18, daysAgo: 25,
    short: 'A midweight crew-neck tee in combed cotton.',
    description: '200 gsm combed cotton jersey with a reinforced neckline that keeps its shape. Pre-shrunk. Regular fit.',
    specs: [['Composition', '100% cotton'], ['Weight', '200 gsm'], ['Fit', 'Regular'], ['Care', 'Machine wash 30°C']],
  },
  {
    slug: 'oxford-shirt', sku: 'SV-TOP-003', name: 'Oxford Button-Down Shirt', nameMn: 'Оксфорд цамц', kind: 'shirt', category: 'tops', brand: 'Halden',
    price: 119000, colors: [C.white, C.sky], sizes: APPAREL, defaultStock: 10, daysAgo: 38,
    short: 'A classic oxford cloth shirt with a soft-roll collar.',
    description: 'Cotton oxford cloth with mother-of-pearl-effect buttons, a back box pleat and a curved hem that works tucked or untucked.',
    specs: [['Composition', '100% cotton oxford'], ['Collar', 'Button-down'], ['Fit', 'Tailored'], ['Care', 'Machine wash 40°C']],
  },
  {
    slug: 'quilted-down-jacket', sku: 'SV-OUT-001', name: 'Quilted Down Jacket', nameMn: 'Хөвөнтэй куртик', kind: 'jacket', category: 'outerwear', brand: 'Halden',
    price: 589000, salePrice: 499000, featured: true, colors: [C.black, C.navy], sizes: APPAREL, stock: { 'Navy|S': 1 }, defaultStock: 6, daysAgo: 11,
    short: 'A warm, packable down jacket with a water-repellent shell.',
    description: 'Filled with 90/10 duck down (fill power 700) in a box-quilted, water-repellent shell. Two zip hand pockets and an internal pocket. Packs into its own pocket.',
    specs: [['Fill', '90/10 duck down, 700 FP'], ['Shell', 'Nylon, water-repellent'], ['Fit', 'Regular'], ['Care', 'Machine wash cold, tumble dry low']],
  },
  {
    slug: 'wool-overcoat', sku: 'SV-OUT-002', name: 'Wool Overcoat', nameMn: 'Ноосон пальто', kind: 'coat', category: 'outerwear', brand: 'Aurelle',
    price: 799000, colors: [C.camel, C.charcoal], sizes: APPAREL, defaultStock: 4, daysAgo: 19,
    short: 'A single-breasted, knee-length coat in a dense wool blend.',
    description: 'An 80% wool, 20% polyamide blend for warmth and durability. Fully lined with notch lapels, flap pockets and a centre back vent.',
    specs: [['Composition', '80% wool, 20% polyamide'], ['Length', 'Knee'], ['Lining', 'Full'], ['Care', 'Dry clean']],
  },
  {
    slug: 'court-leather-sneaker', sku: 'SV-FTW-001', name: 'Court Leather Sneaker', nameMn: 'Арьсан пүүз', kind: 'sneaker', category: 'footwear', brand: 'Mono Atelier',
    price: 289000, featured: true, colors: [C.white, C.black], sizes: SHOES, stock: { 'White|44': 0, 'Black|39': 2 }, defaultStock: 5, daysAgo: 10,
    short: 'A clean, low-profile leather sneaker with a stitched rubber cupsole.',
    description: 'Full-grain leather upper, leather lining and a cushioned footbed on a stitched rubber cupsole. Fits true to EU size.',
    specs: [['Upper', 'Full-grain leather'], ['Sole', 'Stitched rubber cupsole'], ['Sizing', 'EU, true to size'], ['Lining', 'Leather']],
  },
  {
    slug: 'suede-chelsea-boot', sku: 'SV-FTW-002', name: 'Suede Chelsea Boot', nameMn: 'Илгэн Челси гутал', kind: 'boot', category: 'footwear', brand: 'Halden',
    price: 369000, colors: [C.sand, C.brown], sizes: SHOES, defaultStock: 4, daysAgo: 28,
    short: 'A suede Chelsea boot with elastic sides and a pull tab.',
    description: 'Water-repellent treated suede, elastic side panels and a lightweight rubber sole. Treat with a suede protector before wear.',
    specs: [['Upper', 'Suede, water-repellent treated'], ['Sole', 'Rubber'], ['Shaft height', '13 cm'], ['Sizing', 'EU, true to size']],
  },
  {
    slug: 'knit-runner', sku: 'SV-FTW-003', name: 'Knit Runner', nameMn: 'Нэхмэл спорт пүүз', kind: 'runner', category: 'footwear', brand: 'Kestrel & Co.',
    price: 239000, salePrice: 199000, colors: [C.navy, C.grey], sizes: SHOES, defaultStock: 7, daysAgo: 16,
    short: 'A lightweight knit sneaker for walking and everyday wear.',
    description: 'Breathable knit upper with a cushioned foam midsole and a removable insole. Not designed for performance running.',
    specs: [['Upper', 'Knit textile'], ['Midsole', 'EVA foam'], ['Weight', '260 g (EU 42)'], ['Insole', 'Removable']],
  },
];

export const BLOG_CATEGORIES = [
  { slug: 'guides', name: 'Guides' },
  { slug: 'care', name: 'Care' },
  { slug: 'store-news', name: 'Store news' },
];

export const BLOG_POSTS = [
  {
    slug: 'how-to-choose-a-table-lamp', title: 'How to choose a table lamp for a calmer evening', category: 'guides', author: 'SOLVIA Editorial', image: 'blog-lamp', daysAgo: 4,
    excerpt: 'Colour temperature, shade material and height matter more than wattage. A short guide to warmer, glare-free light.',
    body: `Most rooms feel harsher than they need to in the evening because the main light source sits overhead. A table lamp at eye level changes that quickly.

## Colour temperature
Look for bulbs around 2700K for living spaces. Higher numbers (4000K and up) read as cooler and suit task areas such as a desk.

## Shade material
Opal glass and fabric diffuse light evenly. Clear glass with a bare bulb is decorative, but it creates glare when you are seated.

## Height and placement
When sitting, the bottom of the shade should sit roughly at eye level, so you see the glow rather than the bulb. Place lamps at different heights around the room to avoid a single bright point.

## Dimming
A simple dimmer or a lamp with stepped brightness lets one lamp work for reading and for winding down.

This is sample content written for the demo store.`,
  },
  {
    slug: 'caring-for-leather-goods', title: 'Caring for leather bags and wallets', category: 'care', author: 'SOLVIA Editorial', image: 'blog-leather', daysAgo: 11,
    excerpt: 'Simple habits that keep full-grain leather supple and help it age well.',
    body: `Full-grain leather is durable, but a little routine care goes a long way.

## Keep it dry
If a bag gets wet, blot it with a soft cloth and let it dry at room temperature, away from radiators.

## Condition occasionally
A small amount of leather conditioner two or three times a year keeps the surface from drying out. Test on a hidden area first.

## Store it with shape
Stuff bags with paper when not in use and keep them in a dust bag, out of direct sunlight.

This is sample content written for the demo store.`,
  },
  {
    slug: 'a-better-pour-over-at-home', title: 'A better pour-over at home', category: 'guides', author: 'SOLVIA Editorial', image: 'blog-coffee', daysAgo: 19,
    excerpt: 'Ratio, grind and a steady pour: the three variables worth getting right first.',
    body: `Pour-over coffee rewards small adjustments. Start with these three.

## Ratio
Begin with 1:16 — for example 15 g of coffee to 240 g of water — and adjust to taste.

## Grind
Aim for a texture similar to coarse sand. If the brew runs fast and tastes sour, grind finer; if it is slow and bitter, grind coarser.

## Pour
A gooseneck kettle makes it easier to pour slowly in circles. Bloom the grounds with about twice their weight in water for 30 seconds first.

This is sample content written for the demo store.`,
  },
  {
    slug: 'welcome-to-the-store', title: 'Welcome to the store', category: 'store-news', author: 'SOLVIA Team', image: 'blog-welcome', daysAgo: 30,
    excerpt: 'What to expect from us: clear prices, honest stock levels and straightforward delivery.',
    body: `Thanks for visiting. A few things we hold ourselves to:

- The price you see on a product is the price you pay before delivery. Any discount is shown line by line.
- Stock levels are live. If an item sells out, we tell you before you pay.
- Delivery fees and timings are listed on the Shipping page and at checkout.

This is a demonstration store. Products, brands and articles are sample content.`,
  },
];

export const FAQS = [
  ['How long does delivery take?', 'Standard delivery usually takes 2–4 business days and express delivery 1 business day within the delivery area. Exact timings are shown at checkout.', 'Хүргэлт хэр удаан үргэлжлэх вэ?', 'Энгийн хүргэлт ихэвчлэн ажлын 2–4 өдөр, шуурхай хүргэлт ажлын 1 өдөр болно. Тодорхой хугацааг төлбөр тооцооны үед харуулна.'],
  ['Which payment methods do you accept?', 'Cash on delivery, bank transfer and card payment. In this demo build, card payment runs in a clearly labelled demo mode and no money is charged.', 'Ямар төлбөрийн хэлбэр хүлээн авдаг вэ?', 'Хүргэлтээр бэлнээр, дансаар шилжүүлэх, картаар төлөх боломжтой. Энэ демо хувилбарт картын төлбөр демо горимд ажилладаг бөгөөд мөнгө татагдахгүй.'],
  ['Can I change or cancel my order?', 'Signed-in customers can request cancellation from the order page while the order is pending or confirmed. Once it has been processed for shipping, please contact us.', 'Захиалгаа өөрчлөх эсвэл цуцлах боломжтой юу?', 'Нэвтэрсэн хэрэглэгч захиалга хүлээгдэж буй эсвэл баталгаажсан үед захиалгын хуудаснаас цуцлах хүсэлт гаргах боломжтой.'],
  ['What is your return policy?', 'Unused items in original packaging can be returned within 14 days of delivery. See the Returns page for details and exclusions.', 'Буцаалтын нөхцөл ямар вэ?', 'Хэрэглээгүй, анхны савлагаатай барааг хүргэгдсэнээс хойш 14 хоногийн дотор буцаах боломжтой.'],
  ['Do I need an account to order?', 'No. You can check out as a guest. An account lets you track orders, save addresses and keep a wishlist across devices.', 'Захиалга өгөхөд бүртгэл заавал шаардлагатай юу?', 'Үгүй. Зочноор захиалга өгөх боломжтой. Бүртгэлтэй бол захиалгаа хянах, хаяг хадгалах боломжтой.'],
  ['Are prices inclusive of VAT?', 'Yes. Listed prices include VAT; the VAT amount is shown separately in your cart and on your order.', 'Үнэд НӨАТ орсон уу?', 'Тийм. Үнэд НӨАТ багтсан бөгөөд сагс болон захиалга дээр тусад нь харуулна.'],
];
