// ─── WimaKit Category & Product Attribute System ─────────────────────────────
// Every category has specific attributes sellers must fill in

export interface AttributeOption { value: string; label: string; }
export interface ProductAttribute {
  key: string; label: string;
  type: 'select' | 'multiselect' | 'text' | 'number' | 'color_picker' | 'dimensions';
  required?: boolean;
  options?: AttributeOption[];
  placeholder?: string;
  unit?: string;
}

export interface CategoryConfig {
  id: string; name: string; slug: string;
  icon: string; color: string; emoji: string;
  subcategories: string[];
  attributes: ProductAttribute[];
  requiresCondition: boolean;
  shippingClass: 'light' | 'standard' | 'heavy' | 'fragile' | 'oversized';
}

const SHOE_SIZES_EU: AttributeOption[] = [
  '35','36','37','38','39','40','41','42','43','44','45','46','47','48'
].map(v => ({ value: v, label: `EU ${v}` }));

const SHOE_SIZES_US: AttributeOption[] = [
  '5','5.5','6','6.5','7','7.5','8','8.5','9','9.5','10','10.5','11','11.5','12','13','14'
].map(v => ({ value: v, label: `US ${v}` }));

const CLOTHING_SIZES: AttributeOption[] = [
  {value:'XS',label:'XS – Extra Small'},{value:'S',label:'S – Small'},{value:'M',label:'M – Medium'},
  {value:'L',label:'L – Large'},{value:'XL',label:'XL – Extra Large'},
  {value:'2XL',label:'2XL – Double Extra Large'},{value:'3XL',label:'3XL – Triple Extra Large'},
  {value:'4XL',label:'4XL'},{value:'5XL',label:'5XL'},
  {value:'28',label:'28 (Waist)'},{value:'30',label:'30 (Waist)'},{value:'32',label:'32 (Waist)'},
  {value:'34',label:'34 (Waist)'},{value:'36',label:'36 (Waist)'},{value:'38',label:'38 (Waist)'},
  {value:'40',label:'40 (Waist)'},{value:'42',label:'42 (Waist)'},
];

const KIDS_SIZES: AttributeOption[] = [
  {value:'0-3m',label:'0-3 Months'},{value:'3-6m',label:'3-6 Months'},{value:'6-12m',label:'6-12 Months'},
  {value:'1Y',label:'1 Year'},{value:'2Y',label:'2 Years'},{value:'3Y',label:'3 Years'},
  {value:'4Y',label:'4 Years'},{value:'5Y',label:'5 Years'},{value:'6Y',label:'6 Years'},
  {value:'8Y',label:'8 Years'},{value:'10Y',label:'10 Years'},{value:'12Y',label:'12 Years'},
  {value:'14Y',label:'14 Years'},
];

const COLORS: AttributeOption[] = [
  {value:'black',label:'⚫ Black'},{value:'white',label:'⚪ White'},{value:'red',label:'🔴 Red'},
  {value:'blue',label:'🔵 Blue'},{value:'green',label:'🟢 Green'},{value:'yellow',label:'🟡 Yellow'},
  {value:'orange',label:'🟠 Orange'},{value:'purple',label:'🟣 Purple'},{value:'pink',label:'🩷 Pink'},
  {value:'brown',label:'🟤 Brown'},{value:'grey',label:'🩶 Grey'},{value:'navy',label:'🔷 Navy'},
  {value:'maroon',label:'🟥 Maroon'},{value:'gold',label:'🥇 Gold'},{value:'silver',label:'🥈 Silver'},
  {value:'cream',label:'🤍 Cream/Off-White'},{value:'beige',label:'🪶 Beige'},
  {value:'multicolor',label:'🌈 Multi-Color'},
];

const STORAGE_OPTIONS: AttributeOption[] = [
  '8GB','16GB','32GB','64GB','128GB','256GB','512GB','1TB','2TB'
].map(v => ({ value: v, label: v }));

const RAM_OPTIONS: AttributeOption[] = [
  '1GB','2GB','3GB','4GB','6GB','8GB','12GB','16GB','32GB','64GB'
].map(v => ({ value: v, label: v }));

const SCREEN_SIZES: AttributeOption[] = [
  '4"','4.5"','5"','5.5"','6"','6.1"','6.4"','6.5"','6.7"','6.9"',
  '7"','8"','10"','11"','13"','14"','15.6"','17"','24"','27"','32"','43"','55"','65"',
].map(v => ({ value: v, label: v }));

const CONDITION_OPTIONS: AttributeOption[] = [
  {value:'new',label:'Brand New – Sealed/Unused'},
  {value:'like_new',label:'Like New – Used once or twice'},
  {value:'good',label:'Good – Minor wear, fully functional'},
  {value:'fair',label:'Fair – Visible wear, fully functional'},
  {value:'refurbished',label:'Refurbished – Professionally restored'},
];

const MATERIAL_OPTIONS: AttributeOption[] = [
  {value:'cotton',label:'Cotton'},{value:'polyester',label:'Polyester'},
  {value:'leather',label:'Leather'},{value:'suede',label:'Suede'},
  {value:'canvas',label:'Canvas'},{value:'denim',label:'Denim'},
  {value:'silk',label:'Silk'},{value:'linen',label:'Linen'},
  {value:'wool',label:'Wool'},{value:'nylon',label:'Nylon'},
  {value:'spandex',label:'Spandex/Lycra'},{value:'synthetic',label:'Synthetic'},
  {value:'mesh',label:'Mesh'},{value:'velvet',label:'Velvet'},
  {value:'rubber',label:'Rubber'},{value:'plastic',label:'Plastic'},
  {value:'metal',label:'Metal/Alloy'},{value:'wood',label:'Wood'},
  {value:'glass',label:'Glass'},{value:'bamboo',label:'Bamboo'},
];

export const CATEGORY_CONFIGS: CategoryConfig[] = [
  // ─── Fashion & Clothing ───────────────────────────────────────────────────
  {
    id:'fashion', name:'Fashion & Clothes', slug:'fashion', icon:'hanger', color:'#EC4899', emoji:'👗',
    subcategories:['T-Shirts & Polo','Jeans & Trousers','Dresses','Skirts','Jackets & Coats','Hoodies & Sweatshirts','Suits & Formal','Traditional/Ankara','Shorts','Underwear & Socks','Swimwear','Sportswear','Uniforms','Kids Clothing','Baby Clothing'],
    requiresCondition: false, shippingClass:'light',
    attributes: [
      { key:'sizes', label:'Available Sizes', type:'multiselect', required:true, options:CLOTHING_SIZES },
      { key:'colors', label:'Available Colors', type:'multiselect', required:true, options:COLORS },
      { key:'material', label:'Material / Fabric', type:'multiselect', required:false, options:MATERIAL_OPTIONS },
      { key:'gender', label:'Gender / Target', type:'select', required:true, options:[
        {value:'mens',label:'Men\'s'},{value:'womens',label:'Women\'s'},
        {value:'unisex',label:'Unisex'},{value:'boys',label:'Boys'},{value:'girls',label:'Girls'},
        {value:'baby',label:'Baby (Unisex)'},
      ]},
      { key:'style', label:'Style / Fit', type:'select', required:false, options:[
        {value:'slim',label:'Slim Fit'},{value:'regular',label:'Regular Fit'},
        {value:'loose',label:'Loose/Oversized'},{value:'fitted',label:'Fitted'},
        {value:'skinny',label:'Skinny'},{value:'bootcut',label:'Boot Cut'},
      ]},
      { key:'care', label:'Care Instructions', type:'text', placeholder:'e.g. Machine wash cold, tumble dry low' },
    ],
  },

  // ─── Shoes & Footwear ─────────────────────────────────────────────────────
  {
    id:'shoes', name:'Shoes & Footwear', slug:'shoes', icon:'shoe-formal', color:'#8B5CF6', emoji:'👟',
    subcategories:['Sneakers','Sandals','Dress Shoes','Boots','Heels','Flats','Sports Shoes','Loafers','Slippers','Kids Shoes','School Shoes'],
    requiresCondition: true, shippingClass:'standard',
    attributes: [
      { key:'shoe_sizes_eu', label:'Available Sizes (EU)', type:'multiselect', required:true, options:SHOE_SIZES_EU },
      { key:'shoe_sizes_us', label:'Available Sizes (US)', type:'multiselect', required:false, options:SHOE_SIZES_US },
      { key:'colors', label:'Available Colors', type:'multiselect', required:true, options:COLORS },
      { key:'gender', label:'For Who', type:'select', required:true, options:[
        {value:'mens',label:'Men\'s'},{value:'womens',label:'Women\'s'},
        {value:'unisex',label:'Unisex'},{value:'kids',label:'Kids'},
      ]},
      { key:'material', label:'Upper Material', type:'select', required:false, options:MATERIAL_OPTIONS },
      { key:'sole_material', label:'Sole Material', type:'select', required:false, options:[
        {value:'rubber',label:'Rubber'},{value:'eva',label:'EVA Foam'},
        {value:'leather',label:'Leather'},{value:'synthetic',label:'Synthetic'},
      ]},
      { key:'closure', label:'Closure Type', type:'select', required:false, options:[
        {value:'lace',label:'Lace-up'},{value:'velcro',label:'Velcro'},
        {value:'slip_on',label:'Slip-on'},{value:'buckle',label:'Buckle'},
        {value:'zipper',label:'Zipper'},{value:'none',label:'No Closure'},
      ]},
    ],
  },

  // ─── Electronics ─────────────────────────────────────────────────────────
  {
    id:'electronics', name:'Electronics', slug:'electronics', icon:'laptop', color:'#4F46E5', emoji:'📱',
    subcategories:['Smartphones','Laptops','Tablets','TVs','Headphones & Earbuds','Cameras','Smart Watches','Gaming Consoles','Speakers','Power Banks','Cables & Chargers','Smart Home','Printers','Projectors','Drones'],
    requiresCondition: true, shippingClass:'fragile',
    attributes: [
      { key:'brand', label:'Brand', type:'text', required:true, placeholder:'e.g. Samsung, Apple, Tecno' },
      { key:'model', label:'Model / Series', type:'text', required:true, placeholder:'e.g. Galaxy A35, MacBook Pro 14"' },
      { key:'storage', label:'Storage Capacity', type:'multiselect', required:false, options:STORAGE_OPTIONS },
      { key:'ram', label:'RAM', type:'multiselect', required:false, options:RAM_OPTIONS },
      { key:'screen_size', label:'Screen Size', type:'select', required:false, options:SCREEN_SIZES },
      { key:'colors', label:'Available Colors', type:'multiselect', required:false, options:COLORS },
      { key:'os', label:'Operating System', type:'select', required:false, options:[
        {value:'android',label:'Android'},{value:'ios',label:'iOS / iPadOS'},
        {value:'windows',label:'Windows'},{value:'macos',label:'macOS'},
        {value:'linux',label:'Linux'},{value:'other',label:'Other/None'},
      ]},
      { key:'connectivity', label:'Connectivity', type:'multiselect', required:false, options:[
        {value:'wifi',label:'Wi-Fi'},{value:'bluetooth',label:'Bluetooth'},
        {value:'5g',label:'5G'},{value:'4g',label:'4G/LTE'},{value:'nfc',label:'NFC'},
        {value:'usb_c',label:'USB-C'},{value:'hdmi',label:'HDMI'},
      ]},
      { key:'battery', label:'Battery Capacity (mAh)', type:'number', placeholder:'e.g. 5000' },
      { key:'warranty', label:'Warranty Period', type:'select', required:false, options:[
        {value:'no_warranty',label:'No Warranty'},{value:'1m',label:'1 Month'},
        {value:'3m',label:'3 Months'},{value:'6m',label:'6 Months'},
        {value:'1y',label:'1 Year'},{value:'2y',label:'2 Years'},
      ]},
    ],
  },

  // ─── Sports & Fitness ─────────────────────────────────────────────────────
  {
    id:'sports', name:'Sports & Fitness', slug:'sports', icon:'soccer', color:'#10B981', emoji:'⚽',
    subcategories:['Football Equipment','Basketball','Cricket','Tennis','Boxing & MMA','Gym Equipment','Yoga & Pilates','Cycling','Swimming','Running Gear','Sportswear','Outdoor Sports','Table Tennis','Volleyball'],
    requiresCondition: true, shippingClass:'standard',
    attributes: [
      { key:'sport_type', label:'Sport / Activity', type:'select', required:true, options:[
        {value:'football',label:'Football/Soccer'},{value:'basketball',label:'Basketball'},
        {value:'tennis',label:'Tennis'},{value:'cricket',label:'Cricket'},
        {value:'boxing',label:'Boxing/MMA'},{value:'gym',label:'Gym/Fitness'},
        {value:'yoga',label:'Yoga/Pilates'},{value:'cycling',label:'Cycling'},
        {value:'swimming',label:'Swimming'},{value:'running',label:'Running/Athletics'},
        {value:'volleyball',label:'Volleyball'},{value:'badminton',label:'Badminton'},
        {value:'table_tennis',label:'Table Tennis'},{value:'general',label:'General Fitness'},
      ]},
      { key:'sizes', label:'Available Sizes', type:'multiselect', required:false, options:[
        {value:'XS',label:'XS'},{value:'S',label:'S'},{value:'M',label:'M'},
        {value:'L',label:'L'},{value:'XL',label:'XL'},{value:'XXL',label:'XXL'},
        {value:'one_size',label:'One Size'},{value:'small',label:'Small'},
        {value:'medium',label:'Medium'},{value:'large',label:'Large'},
      ]},
      { key:'colors', label:'Available Colors', type:'multiselect', required:false, options:COLORS },
      { key:'material', label:'Material', type:'multiselect', required:false, options:MATERIAL_OPTIONS },
      { key:'weight_kg', label:'Weight (kg)', type:'number', placeholder:'e.g. 2.5 (for weights/equipment)', unit:'kg' },
      { key:'age_group', label:'Age Group', type:'select', required:false, options:[
        {value:'adult',label:'Adult'},{value:'youth',label:'Youth (12-17)'},
        {value:'junior',label:'Junior (6-12)'},{value:'mini',label:'Mini (Under 6)'},
        {value:'all_ages',label:'All Ages'},
      ]},
    ],
  },

  // ─── Food & Groceries ─────────────────────────────────────────────────────
  {
    id:'food', name:'Food & Groceries', slug:'food', icon:'food-apple-outline', color:'#22C55E', emoji:'🥦',
    subcategories:['Fresh Produce','Grains & Rice','Cooking Oil','Spices & Herbs','Meat & Fish','Dairy & Eggs','Beverages','Snacks','Canned Goods','Baked Goods','Organic','Baby Food','Condiments'],
    requiresCondition: false, shippingClass:'standard',
    attributes: [
      { key:'weight_quantity', label:'Weight / Quantity', type:'text', required:true, placeholder:'e.g. 5kg, 1 dozen, 500ml' },
      { key:'organic', label:'Is this organic/natural?', type:'select', required:false, options:[
        {value:'yes',label:'Yes – Certified Organic'},{value:'no',label:'No'},
        {value:'natural',label:'Natural (not certified)'},
      ]},
      { key:'expiry_days', label:'Shelf Life (days)', type:'number', placeholder:'e.g. 3 (for fresh), 365 (for dry goods)', unit:'days' },
      { key:'allergens', label:'Allergens (if any)', type:'text', placeholder:'e.g. Contains nuts, gluten-free' },
      { key:'origin', label:'Origin / Source', type:'text', placeholder:'e.g. Bo District, Imported' },
      { key:'storage_instructions', label:'Storage Instructions', type:'text', placeholder:'e.g. Keep refrigerated, store in cool dry place' },
    ],
  },

  // ─── Home & Living ────────────────────────────────────────────────────────
  {
    id:'home', name:'Home & Living', slug:'home', icon:'sofa-outline', color:'#F59E0B', emoji:'🏠',
    subcategories:['Furniture','Bedding & Pillows','Kitchen & Dining','Bathroom','Lighting','Rugs & Curtains','Storage & Organization','Home Decor','Garden & Outdoor','Cleaning Supplies','Tools & Hardware'],
    requiresCondition: true, shippingClass:'heavy',
    attributes: [
      { key:'dimensions', label:'Dimensions (L × W × H)', type:'dimensions', required:false, placeholder:'Length × Width × Height (cm)' },
      { key:'colors', label:'Available Colors', type:'multiselect', required:false, options:COLORS },
      { key:'material', label:'Material', type:'multiselect', required:false, options:MATERIAL_OPTIONS },
      { key:'assembly_required', label:'Assembly Required?', type:'select', required:false, options:[
        {value:'no',label:'No – Ready to use'},{value:'yes',label:'Yes – Assembly required'},
        {value:'partial',label:'Partial – Minimal assembly'},
      ]},
      { key:'room_type', label:'Room Type', type:'multiselect', required:false, options:[
        {value:'living',label:'Living Room'},{value:'bedroom',label:'Bedroom'},
        {value:'kitchen',label:'Kitchen'},{value:'bathroom',label:'Bathroom'},
        {value:'office',label:'Office'},{value:'outdoor',label:'Outdoor/Garden'},
        {value:'kids_room',label:'Kids Room'},{value:'dining',label:'Dining Room'},
      ]},
    ],
  },

  // ─── Health & Beauty ──────────────────────────────────────────────────────
  {
    id:'health', name:'Health & Beauty', slug:'health', icon:'heart-outline', color:'#F43F5E', emoji:'💄',
    subcategories:['Skincare','Haircare','Makeup','Fragrances','Vitamins & Supplements','Personal Care','Medical Supplies','Baby Care','Men\'s Grooming','Nail Care','Eye Care','Dental Care'],
    requiresCondition: false, shippingClass:'light',
    attributes: [
      { key:'skin_type', label:'Suitable Skin Type', type:'multiselect', required:false, options:[
        {value:'all',label:'All Skin Types'},{value:'oily',label:'Oily'},
        {value:'dry',label:'Dry'},{value:'combination',label:'Combination'},
        {value:'sensitive',label:'Sensitive'},{value:'normal',label:'Normal'},
        {value:'acne_prone',label:'Acne-Prone'},
      ]},
      { key:'volume_weight', label:'Volume / Weight', type:'text', required:true, placeholder:'e.g. 250ml, 100g' },
      { key:'gender', label:'For Who', type:'select', required:false, options:[
        {value:'all',label:'All'},{value:'women',label:'Women'},{value:'men',label:'Men'},
        {value:'kids',label:'Kids'},{value:'baby',label:'Baby'},
      ]},
      { key:'ingredients', label:'Key Ingredients', type:'text', placeholder:'e.g. Vitamin C, Shea Butter, Aloe Vera' },
      { key:'fragrance', label:'Fragrance', type:'select', required:false, options:[
        {value:'fragrance_free',label:'Fragrance Free'},{value:'light',label:'Light Fragrance'},
        {value:'moderate',label:'Moderate'},{value:'strong',label:'Strong'},
        {value:'floral',label:'Floral'},{value:'fruity',label:'Fruity'},
        {value:'woody',label:'Woody/Earthy'},{value:'fresh',label:'Fresh/Clean'},
      ]},
      { key:'halal_certified', label:'Halal Certified?', type:'select', required:false, options:[{value:'yes',label:'Yes'},{value:'no',label:'No'},{value:'unknown',label:'Unknown'}] },
    ],
  },

  // ─── Phones & Accessories ─────────────────────────────────────────────────
  {
    id:'phones', name:'Phones & Accessories', slug:'phones', icon:'cellphone', color:'#6366F1', emoji:'📱',
    subcategories:['Smartphones','Phone Cases','Screen Protectors','Chargers & Cables','Power Banks','Earphones','Phone Holders','Smart Watches','Feature Phones','Spare Parts'],
    requiresCondition: true, shippingClass:'light',
    attributes: [
      { key:'brand', label:'Brand', type:'text', required:true, placeholder:'e.g. Samsung, Tecno, iPhone' },
      { key:'compatible_models', label:'Compatible Models', type:'text', placeholder:'e.g. Samsung Galaxy A series, iPhone 13/14/15' },
      { key:'colors', label:'Available Colors', type:'multiselect', required:false, options:COLORS },
      { key:'storage', label:'Storage', type:'multiselect', required:false, options:STORAGE_OPTIONS },
      { key:'network', label:'Network Bands', type:'multiselect', required:false, options:[
        {value:'2g',label:'2G'},{value:'3g',label:'3G'},{value:'4g',label:'4G/LTE'},{value:'5g',label:'5G'},
      ]},
      { key:'sim_slots', label:'SIM Slots', type:'select', required:false, options:[
        {value:'single',label:'Single SIM'},{value:'dual',label:'Dual SIM'},
        {value:'triple',label:'Triple SIM'},{value:'esim',label:'eSIM'},
      ]},
    ],
  },

  // ─── Agriculture & Farming ────────────────────────────────────────────────
  {
    id:'agric', name:'Agriculture', slug:'agric', icon:'sprout-outline', color:'#16A34A', emoji:'🌾',
    subcategories:['Seeds & Seedlings','Fertilizers','Pesticides','Farm Tools','Irrigation','Livestock','Poultry','Fish Farming','Crop Produce','Farm Machinery','Greenhouses'],
    requiresCondition: false, shippingClass:'heavy',
    attributes: [
      { key:'crop_type', label:'Crop / Product Type', type:'text', required:true, placeholder:'e.g. Tomatoes, Rice, Palm Oil' },
      { key:'quantity_unit', label:'Quantity / Unit', type:'text', required:true, placeholder:'e.g. 50kg bag, 1 dozen, per tray' },
      { key:'farming_method', label:'Farming Method', type:'select', required:false, options:[
        {value:'organic',label:'Organic Farming'},{value:'conventional',label:'Conventional'},
        {value:'hydroponic',label:'Hydroponic'},{value:'greenhouse',label:'Greenhouse'},
      ]},
      { key:'origin_district', label:'Origin District / Region', type:'text', placeholder:'e.g. Bo District, Kenema' },
      { key:'harvest_date', label:'Harvest / Production Date', type:'text', placeholder:'e.g. November 2024' },
    ],
  },

  // ─── Vehicles & Auto Parts ────────────────────────────────────────────────
  {
    id:'vehicles', name:'Vehicles & Auto Parts', slug:'vehicles', icon:'car-outline', color:'#64748B', emoji:'🚗',
    subcategories:['Cars','Motorcycles','Tricycles','Trucks','Spare Parts','Car Accessories','Tyres & Rims','Car Audio','Oil & Lubricants','Batteries','Boats','Bicycles'],
    requiresCondition: true, shippingClass:'oversized',
    attributes: [
      { key:'brand', label:'Make / Brand', type:'text', required:true, placeholder:'e.g. Toyota, Honda, Bajaj' },
      { key:'model', label:'Model', type:'text', required:true, placeholder:'e.g. Hilux, CBR, Boxer' },
      { key:'year', label:'Year of Manufacture', type:'number', required:true, placeholder:'e.g. 2020' },
      { key:'mileage', label:'Mileage (km)', type:'number', placeholder:'e.g. 45000', unit:'km' },
      { key:'fuel_type', label:'Fuel Type', type:'select', required:false, options:[
        {value:'petrol',label:'Petrol/Gasoline'},{value:'diesel',label:'Diesel'},
        {value:'electric',label:'Electric'},{value:'hybrid',label:'Hybrid'},
        {value:'none',label:'N/A (Parts/Accessories)'},
      ]},
      { key:'colors', label:'Color', type:'multiselect', required:false, options:COLORS },
      { key:'transmission', label:'Transmission', type:'select', required:false, options:[
        {value:'manual',label:'Manual'},{value:'automatic',label:'Automatic'},{value:'na',label:'N/A'},
      ]},
    ],
  },

  // ─── Building & Construction ──────────────────────────────────────────────
  {
    id:'building', name:'Building & Construction', slug:'building', icon:'hammer-wrench', color:'#78716C', emoji:'🏗️',
    subcategories:['Cement & Concrete','Steel & Iron','Timber & Wood','Roofing','Tiles & Flooring','Paint & Varnish','Plumbing','Electrical','Doors & Windows','Sanitary Ware','Safety Equipment','Tools & Equipment'],
    requiresCondition: false, shippingClass:'heavy',
    attributes: [
      { key:'quantity_unit', label:'Quantity & Unit', type:'text', required:true, placeholder:'e.g. Per bag, Per m², Per piece, Per roll' },
      { key:'brand', label:'Brand / Manufacturer', type:'text', placeholder:'e.g. Dangote, Diamond Cement, Dulux' },
      { key:'dimensions', label:'Dimensions', type:'dimensions', placeholder:'Length × Width × Height (mm or cm)' },
      { key:'colors', label:'Available Colors', type:'multiselect', required:false, options:COLORS },
      { key:'grade_standard', label:'Grade / Standard', type:'text', placeholder:'e.g. Grade 40, ISO 9001, BS 4449' },
    ],
  },

  // ─── Education & Books ────────────────────────────────────────────────────
  {
    id:'education', name:'Education & Books', slug:'education', icon:'book-open-outline', color:'#0EA5E9', emoji:'📚',
    subcategories:['Textbooks','Stationery','School Bags','Art Supplies','Musical Instruments','Educational Toys','Uniforms','Calculators','Whiteboards','Online Courses'],
    requiresCondition: true, shippingClass:'light',
    attributes: [
      { key:'subject', label:'Subject / Category', type:'text', required:false, placeholder:'e.g. Mathematics, Science, History' },
      { key:'grade_level', label:'Grade / Level', type:'select', required:false, options:[
        {value:'primary',label:'Primary School (1-6)'},{value:'jss',label:'Junior Secondary (JSS 1-3)'},
        {value:'sss',label:'Senior Secondary (SSS 1-3)'},{value:'university',label:'University / College'},
        {value:'professional',label:'Professional / Adult Learning'},{value:'all',label:'All Levels'},
      ]},
      { key:'author', label:'Author / Publisher', type:'text', placeholder:'e.g. Oxford University Press' },
      { key:'edition', label:'Edition / Year', type:'text', placeholder:'e.g. 3rd Edition, 2023' },
      { key:'language', label:'Language', type:'select', required:false, options:[
        {value:'english',label:'English'},{value:'krio',label:'Krio'},
        {value:'french',label:'French'},{value:'temne',label:'Temne'},
        {value:'mende',label:'Mende'},{value:'other',label:'Other'},
      ]},
    ],
  },

  // ─── Baby & Kids ──────────────────────────────────────────────────────────
  {
    id:'baby', name:'Baby & Kids', slug:'baby', icon:'baby-carriage', color:'#F472B6', emoji:'👶',
    subcategories:['Baby Clothing','Toys','Diapers','Baby Food','Strollers','Car Seats','Baby Monitors','Cribs & Beds','Baby Skincare','Kids Accessories','School Bags','Educational Toys'],
    requiresCondition: false, shippingClass:'standard',
    attributes: [
      { key:'age_range', label:'Age Range', type:'select', required:true, options:[
        {value:'0-3m',label:'0-3 Months'},{value:'3-6m',label:'3-6 Months'},
        {value:'6-12m',label:'6-12 Months'},{value:'1-2y',label:'1-2 Years'},
        {value:'2-4y',label:'2-4 Years'},{value:'4-7y',label:'4-7 Years'},
        {value:'7-12y',label:'7-12 Years'},{value:'12+',label:'12+ Years'},
      ]},
      { key:'sizes', label:'Clothing Sizes (if apparel)', type:'multiselect', required:false, options:KIDS_SIZES },
      { key:'colors', label:'Available Colors', type:'multiselect', required:false, options:COLORS },
      { key:'material', label:'Material', type:'multiselect', required:false, options:MATERIAL_OPTIONS },
      { key:'safety_certified', label:'Safety Certified?', type:'select', required:false, options:[
        {value:'yes',label:'Yes – CE/ASTM/EN71 Certified'},{value:'no',label:'No'},{value:'unknown',label:'Unknown'},
      ]},
    ],
  },

  // ─── Services ─────────────────────────────────────────────────────────────
  {
    id:'services', name:'Services', slug:'services', icon:'briefcase-outline', color:'#EF4444', emoji:'🛠️',
    subcategories:['Repairs & Maintenance','Cleaning Services','Tailoring','Photography','Events & Catering','Tutoring','Legal & Consulting','Transportation','Beauty & Grooming','IT Services','Construction Services'],
    requiresCondition: false, shippingClass:'light',
    attributes: [
      { key:'service_area', label:'Service Area / Coverage', type:'text', required:true, placeholder:'e.g. Freetown, Bo, All of Sierra Leone' },
      { key:'availability', label:'Availability', type:'select', required:false, options:[
        {value:'weekdays',label:'Weekdays Only'},{value:'weekends',label:'Weekends Only'},
        {value:'all_days',label:'All Days'},{value:'on_request',label:'On Request/Flexible'},
      ]},
      { key:'duration', label:'Service Duration', type:'text', placeholder:'e.g. 2 hours, Half day, Full day' },
      { key:'includes', label:'What\'s Included', type:'text', placeholder:'List what\'s included in this service' },
      { key:'experience_years', label:'Years of Experience', type:'number', placeholder:'e.g. 5', unit:'years' },
    ],
  },

  // ─── Computers & IT ───────────────────────────────────────────────────────
  {
    id:'computers', name:'Computers & IT', slug:'computers', icon:'desktop-classic', color:'#3B82F6', emoji:'💻',
    subcategories:['Laptops','Desktop PCs','Monitors','Keyboards & Mice','Printers','Networking','USB & Storage','Webcams','Graphics Cards','Processors','RAM','Hard Drives','Software'],
    requiresCondition: true, shippingClass:'fragile',
    attributes: [
      { key:'brand', label:'Brand', type:'text', required:true, placeholder:'e.g. HP, Dell, Lenovo, Apple' },
      { key:'processor', label:'Processor', type:'text', placeholder:'e.g. Intel Core i5 12th Gen, AMD Ryzen 5' },
      { key:'ram', label:'RAM', type:'multiselect', required:false, options:RAM_OPTIONS },
      { key:'storage', label:'Storage', type:'multiselect', required:false, options:STORAGE_OPTIONS },
      { key:'screen_size', label:'Screen Size', type:'select', required:false, options:SCREEN_SIZES },
      { key:'os', label:'Operating System', type:'select', required:false, options:[
        {value:'windows_11',label:'Windows 11'},{value:'windows_10',label:'Windows 10'},
        {value:'macos',label:'macOS'},{value:'linux',label:'Linux'},
        {value:'chrome_os',label:'Chrome OS'},{value:'none',label:'No OS'},
      ]},
      { key:'colors', label:'Color', type:'multiselect', required:false, options:COLORS },
      { key:'warranty', label:'Warranty', type:'select', required:false, options:[
        {value:'no_warranty',label:'No Warranty'},{value:'3m',label:'3 Months'},
        {value:'6m',label:'6 Months'},{value:'1y',label:'1 Year'},{value:'2y',label:'2 Years'},
      ]},
    ],
  },
];

export const getCategoryConfig = (slug: string): CategoryConfig | undefined =>
  CATEGORY_CONFIGS.find(c => c.slug === slug);

export const getAllCategories = () => CATEGORY_CONFIGS.map(c => ({
  id: c.id, name: c.name, slug: c.slug, icon: c.icon,
  color: c.color, emoji: c.emoji,
}));
