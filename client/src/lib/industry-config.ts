/**
 * Industry configuration for ChainSync data import.
 * Each industry has predefined product categories to help users organize their inventory.
 */

export interface IndustryCategory {
    value: string;
    label: string;
}

export interface Industry {
    id: string;
    name: string;
    description: string;
    categories: IndustryCategory[];
}

export interface IndustryGroup {
    name: string;
    industries: Industry[];
}

export const INDUSTRY_GROUPS: IndustryGroup[] = [
    {
        name: "Retail",
        industries: [
            {
                id: "minimart",
                name: "Mini-marts / Convenience Stores",
                description: "Small retail stores with everyday items",
                categories: [
                    { value: "beverages", label: "Beverages" },
                    { value: "snacks", label: "Snacks & Confectionery" },
                    { value: "canned_goods", label: "Canned Goods" },
                    { value: "dairy", label: "Dairy & Eggs" },
                    { value: "bread_bakery", label: "Bread & Bakery" },
                    { value: "frozen", label: "Frozen Foods" },
                    { value: "personal_care", label: "Personal Care" },
                    { value: "household", label: "Household Items" },
                    { value: "tobacco", label: "Tobacco & Accessories" },
                    { value: "other", label: "Other" },
                ],
            },
            {
                id: "provision",
                name: "Provision Stores",
                description: "General provisions and foodstuffs",
                categories: [
                    { value: "grains_cereals", label: "Grains & Cereals" },
                    { value: "cooking_oil", label: "Cooking Oil & Fats" },
                    { value: "seasonings", label: "Seasonings & Spices" },
                    { value: "canned_goods", label: "Canned Goods" },
                    { value: "beverages", label: "Beverages" },
                    { value: "dairy", label: "Dairy Products" },
                    { value: "pasta_noodles", label: "Pasta & Noodles" },
                    { value: "baking", label: "Baking Supplies" },
                    { value: "household", label: "Household Items" },
                    { value: "other", label: "Other" },
                ],
            },
            {
                id: "department",
                name: "Department Stores",
                description: "Large retail with multiple departments",
                categories: [
                    { value: "clothing", label: "Clothing & Apparel" },
                    { value: "footwear", label: "Footwear" },
                    { value: "home_decor", label: "Home Décor" },
                    { value: "kitchenware", label: "Kitchenware" },
                    { value: "electronics", label: "Electronics" },
                    { value: "toys", label: "Toys & Games" },
                    { value: "beauty", label: "Beauty & Cosmetics" },
                    { value: "jewelry", label: "Jewelry & Accessories" },
                    { value: "luggage", label: "Luggage & Bags" },
                    { value: "other", label: "Other" },
                ],
            },
        ],
    },
    {
        name: "Health & Wellness",
        industries: [
            {
                id: "pharmacy",
                name: "Pharmacies",
                description: "Prescription and OTC medications",
                categories: [
                    { value: "prescription", label: "Prescription Drugs" },
                    { value: "otc", label: "OTC Medications" },
                    { value: "vitamins", label: "Vitamins & Supplements" },
                    { value: "first_aid", label: "First Aid" },
                    { value: "personal_care", label: "Personal Care" },
                    { value: "baby_care", label: "Baby Care" },
                    { value: "medical_devices", label: "Medical Devices" },
                    { value: "diabetic", label: "Diabetic Supplies" },
                    { value: "other", label: "Other" },
                ],
            },
            {
                id: "drugstore",
                name: "Drug Stores",
                description: "General drugstore products",
                categories: [
                    { value: "otc", label: "OTC Medications" },
                    { value: "personal_care", label: "Personal Care" },
                    { value: "vitamins", label: "Vitamins & Supplements" },
                    { value: "first_aid", label: "First Aid" },
                    { value: "beauty", label: "Beauty Products" },
                    { value: "household", label: "Household Items" },
                    { value: "other", label: "Other" },
                ],
            },
            {
                id: "medical_supply",
                name: "Medical Supply Stores",
                description: "Medical equipment and supplies",
                categories: [
                    { value: "mobility", label: "Mobility Aids" },
                    { value: "monitoring", label: "Health Monitors" },
                    { value: "respiratory", label: "Respiratory Equipment" },
                    { value: "wound_care", label: "Wound Care" },
                    { value: "diagnostic", label: "Diagnostic Equipment" },
                    { value: "ppe", label: "PPE & Safety" },
                    { value: "other", label: "Other" },
                ],
            },
            {
                id: "optical",
                name: "Optical Stores",
                description: "Eyewear and optical products",
                categories: [
                    { value: "frames", label: "Frames" },
                    { value: "lenses", label: "Lenses" },
                    { value: "sunglasses", label: "Sunglasses" },
                    { value: "contact_lenses", label: "Contact Lenses" },
                    { value: "solutions", label: "Lens Solutions" },
                    { value: "accessories", label: "Accessories" },
                    { value: "other", label: "Other" },
                ],
            },
            {
                id: "wellness",
                name: "Wellness & Supplement Shops",
                description: "Health supplements and wellness products",
                categories: [
                    { value: "vitamins", label: "Vitamins" },
                    { value: "minerals", label: "Minerals" },
                    { value: "protein", label: "Protein & Sports Nutrition" },
                    { value: "herbal", label: "Herbal Supplements" },
                    { value: "weight_mgmt", label: "Weight Management" },
                    { value: "organic", label: "Organic Products" },
                    { value: "other", label: "Other" },
                ],
            },
        ],
    },
    {
        name: "Fashion & Lifestyle",
        industries: [
            {
                id: "clothing",
                name: "Clothing Boutiques",
                description: "Fashion and apparel",
                categories: [
                    { value: "tops", label: "Tops & Blouses" },
                    { value: "bottoms", label: "Pants & Skirts" },
                    { value: "dresses", label: "Dresses" },
                    { value: "outerwear", label: "Jackets & Outerwear" },
                    { value: "activewear", label: "Activewear" },
                    { value: "underwear", label: "Underwear & Loungewear" },
                    { value: "traditional", label: "Traditional Wear" },
                    { value: "accessories", label: "Accessories" },
                    { value: "other", label: "Other" },
                ],
            },
            {
                id: "shoes",
                name: "Shoe Stores",
                description: "Footwear retail",
                categories: [
                    { value: "sneakers", label: "Sneakers" },
                    { value: "formal", label: "Formal Shoes" },
                    { value: "sandals", label: "Sandals & Slippers" },
                    { value: "boots", label: "Boots" },
                    { value: "sports", label: "Sports Shoes" },
                    { value: "kids", label: "Kids Footwear" },
                    { value: "accessories", label: "Shoe Accessories" },
                    { value: "other", label: "Other" },
                ],
            },
            {
                id: "jewelry",
                name: "Accessories & Jewelry Stores",
                description: "Jewelry and fashion accessories",
                categories: [
                    { value: "necklaces", label: "Necklaces & Chains" },
                    { value: "rings", label: "Rings" },
                    { value: "earrings", label: "Earrings" },
                    { value: "bracelets", label: "Bracelets & Bangles" },
                    { value: "watches", label: "Watches" },
                    { value: "bags", label: "Bags & Purses" },
                    { value: "hair_acc", label: "Hair Accessories" },
                    { value: "other", label: "Other" },
                ],
            },
            {
                id: "beauty_supply",
                name: "Beauty Supply Stores",
                description: "Beauty and hair products",
                categories: [
                    { value: "hair_care", label: "Hair Care" },
                    { value: "hair_extensions", label: "Wigs & Extensions" },
                    { value: "styling", label: "Styling Products" },
                    { value: "tools", label: "Styling Tools" },
                    { value: "nails", label: "Nail Products" },
                    { value: "skincare", label: "Skincare" },
                    { value: "other", label: "Other" },
                ],
            },
            {
                id: "cosmetics",
                name: "Cosmetics Stores",
                description: "Makeup and cosmetics",
                categories: [
                    { value: "face", label: "Face Makeup" },
                    { value: "lips", label: "Lip Products" },
                    { value: "eyes", label: "Eye Makeup" },
                    { value: "skincare", label: "Skincare" },
                    { value: "fragrance", label: "Fragrances" },
                    { value: "tools", label: "Brushes & Tools" },
                    { value: "other", label: "Other" },
                ],
            },
        ],
    },
    {
        name: "Hardware & Building Materials",
        industries: [
            {
                id: "hardware",
                name: "Hardware Stores",
                description: "Tools and hardware supplies",
                categories: [
                    { value: "hand_tools", label: "Hand Tools" },
                    { value: "power_tools", label: "Power Tools" },
                    { value: "fasteners", label: "Fasteners & Fixings" },
                    { value: "paint", label: "Paint & Supplies" },
                    { value: "safety", label: "Safety Equipment" },
                    { value: "garden", label: "Garden Tools" },
                    { value: "locks", label: "Locks & Security" },
                    { value: "other", label: "Other" },
                ],
            },
            {
                id: "electrical",
                name: "Electrical Supplies Stores",
                description: "Electrical components and supplies",
                categories: [
                    { value: "wiring", label: "Wiring & Cables" },
                    { value: "switches", label: "Switches & Sockets" },
                    { value: "lighting", label: "Lighting" },
                    { value: "breakers", label: "Circuit Breakers & Panels" },
                    { value: "tools", label: "Electrical Tools" },
                    { value: "accessories", label: "Electrical Accessories" },
                    { value: "other", label: "Other" },
                ],
            },
            {
                id: "plumbing",
                name: "Plumbing & Sanitary Stores",
                description: "Plumbing fixtures and supplies",
                categories: [
                    { value: "pipes", label: "Pipes & Fittings" },
                    { value: "taps", label: "Taps & Faucets" },
                    { value: "toilets", label: "Toilets & Bidets" },
                    { value: "sinks", label: "Sinks & Basins" },
                    { value: "showers", label: "Showers & Bathtubs" },
                    { value: "water_heaters", label: "Water Heaters" },
                    { value: "accessories", label: "Plumbing Accessories" },
                    { value: "other", label: "Other" },
                ],
            },
            {
                id: "building",
                name: "Building Materials Stores",
                description: "Construction materials",
                categories: [
                    { value: "cement", label: "Cement & Concrete" },
                    { value: "roofing", label: "Roofing Materials" },
                    { value: "timber", label: "Timber & Wood" },
                    { value: "tiles", label: "Tiles & Flooring" },
                    { value: "steel", label: "Steel & Iron" },
                    { value: "doors_windows", label: "Doors & Windows" },
                    { value: "insulation", label: "Insulation" },
                    { value: "other", label: "Other" },
                ],
            },
        ],
    },
    {
        name: "Electronics & Tech",
        industries: [
            {
                id: "phones",
                name: "Phone & Gadget Stores",
                description: "Mobile phones and gadgets",
                categories: [
                    { value: "smartphones", label: "Smartphones" },
                    { value: "tablets", label: "Tablets" },
                    { value: "smartwatches", label: "Smartwatches" },
                    { value: "cases", label: "Cases & Covers" },
                    { value: "chargers", label: "Chargers & Cables" },
                    { value: "audio", label: "Earphones & Headphones" },
                    { value: "power_banks", label: "Power Banks" },
                    { value: "other", label: "Other" },
                ],
            },
            {
                id: "computers",
                name: "Computer Stores",
                description: "Computers and peripherals",
                categories: [
                    { value: "laptops", label: "Laptops" },
                    { value: "desktops", label: "Desktop PCs" },
                    { value: "monitors", label: "Monitors" },
                    { value: "keyboards", label: "Keyboards & Mice" },
                    { value: "storage", label: "Storage Devices" },
                    { value: "networking", label: "Networking" },
                    { value: "printers", label: "Printers & Scanners" },
                    { value: "components", label: "PC Components" },
                    { value: "other", label: "Other" },
                ],
            },
            {
                id: "electronics",
                name: "Electronics Retailers",
                description: "General electronics",
                categories: [
                    { value: "tvs", label: "TVs & Displays" },
                    { value: "audio", label: "Audio Systems" },
                    { value: "cameras", label: "Cameras" },
                    { value: "gaming", label: "Gaming" },
                    { value: "appliances", label: "Small Appliances" },
                    { value: "large_appliances", label: "Large Appliances" },
                    { value: "other", label: "Other" },
                ],
            },
            {
                id: "tech_accessories",
                name: "Tech Accessory Shops",
                description: "Tech accessories and add-ons",
                categories: [
                    { value: "chargers", label: "Chargers & Adapters" },
                    { value: "cables", label: "Cables & Connectors" },
                    { value: "audio", label: "Audio Accessories" },
                    { value: "mounts", label: "Mounts & Stands" },
                    { value: "protection", label: "Screen Protectors" },
                    { value: "storage", label: "Memory Cards & Drives" },
                    { value: "other", label: "Other" },
                ],
            },
        ],
    },
    {
        name: "Automotive & Transport",
        industries: [
            {
                id: "auto_parts",
                name: "Auto Spare Parts Stores",
                description: "Car parts and spares",
                categories: [
                    { value: "engine", label: "Engine Parts" },
                    { value: "brakes", label: "Brakes & Suspension" },
                    { value: "electrical", label: "Auto Electrical" },
                    { value: "filters", label: "Filters" },
                    { value: "lubricants", label: "Oils & Lubricants" },
                    { value: "body_parts", label: "Body Parts" },
                    { value: "lighting", label: "Lighting" },
                    { value: "other", label: "Other" },
                ],
            },
            {
                id: "tyres",
                name: "Tyre Shops",
                description: "Tyres and wheel services",
                categories: [
                    { value: "car_tyres", label: "Car Tyres" },
                    { value: "suv_tyres", label: "SUV Tyres" },
                    { value: "truck_tyres", label: "Truck Tyres" },
                    { value: "motorcycle_tyres", label: "Motorcycle Tyres" },
                    { value: "tubes", label: "Tubes" },
                    { value: "rims", label: "Rims & Wheels" },
                    { value: "accessories", label: "Tyre Accessories" },
                    { value: "other", label: "Other" },
                ],
            },
            {
                id: "motorcycle_parts",
                name: "Motorcycle Parts Stores",
                description: "Motorcycle spares and accessories",
                categories: [
                    { value: "engine", label: "Engine Parts" },
                    { value: "body", label: "Body Parts" },
                    { value: "electrical", label: "Electrical" },
                    { value: "brakes", label: "Brakes" },
                    { value: "helmets", label: "Helmets" },
                    { value: "gear", label: "Riding Gear" },
                    { value: "other", label: "Other" },
                ],
            },
            {
                id: "car_accessories",
                name: "Car Accessories Stores",
                description: "Car accessories and add-ons",
                categories: [
                    { value: "seat_covers", label: "Seat Covers" },
                    { value: "mats", label: "Floor Mats" },
                    { value: "audio", label: "Car Audio" },
                    { value: "lighting", label: "Interior Lighting" },
                    { value: "organizers", label: "Car Organizers" },
                    { value: "electronics", label: "Car Electronics" },
                    { value: "cleaning", label: "Cleaning Products" },
                    { value: "other", label: "Other" },
                ],
            },
        ],
    },
    {
        name: "Specialty & Niche",
        industries: [
            {
                id: "perfume",
                name: "Cosmetics & Perfume Stores",
                description: "Fragrances and cosmetics",
                categories: [
                    { value: "perfume_men", label: "Men's Fragrances" },
                    { value: "perfume_women", label: "Women's Fragrances" },
                    { value: "unisex", label: "Unisex Fragrances" },
                    { value: "body_mist", label: "Body Mist & Sprays" },
                    { value: "gift_sets", label: "Gift Sets" },
                    { value: "other", label: "Other" },
                ],
            },
            {
                id: "baby",
                name: "Baby & Maternity Stores",
                description: "Baby products and maternity wear",
                categories: [
                    { value: "clothing", label: "Baby Clothing" },
                    { value: "feeding", label: "Feeding Supplies" },
                    { value: "diapers", label: "Diapers & Wipes" },
                    { value: "toys", label: "Baby Toys" },
                    { value: "furniture", label: "Baby Furniture" },
                    { value: "maternity", label: "Maternity Wear" },
                    { value: "safety", label: "Baby Safety" },
                    { value: "other", label: "Other" },
                ],
            },
            {
                id: "pet",
                name: "Pet Shops",
                description: "Pet supplies and accessories",
                categories: [
                    { value: "dog_food", label: "Dog Food" },
                    { value: "cat_food", label: "Cat Food" },
                    { value: "treats", label: "Treats & Snacks" },
                    { value: "toys", label: "Pet Toys" },
                    { value: "grooming", label: "Grooming Supplies" },
                    { value: "health", label: "Pet Health" },
                    { value: "accessories", label: "Collars & Leashes" },
                    { value: "other", label: "Other" },
                ],
            },
            {
                id: "stationery",
                name: "Stationery & Bookshops",
                description: "Books and stationery",
                categories: [
                    { value: "books", label: "Books" },
                    { value: "notebooks", label: "Notebooks & Journals" },
                    { value: "writing", label: "Pens & Pencils" },
                    { value: "office", label: "Office Supplies" },
                    { value: "art", label: "Art Supplies" },
                    { value: "school", label: "School Supplies" },
                    { value: "other", label: "Other" },
                ],
            },
            {
                id: "gift",
                name: "Gift Shops",
                description: "Gifts and novelties",
                categories: [
                    { value: "greeting_cards", label: "Greeting Cards" },
                    { value: "gift_wrap", label: "Gift Wrap & Bags" },
                    { value: "decorative", label: "Decorative Items" },
                    { value: "souvenirs", label: "Souvenirs" },
                    { value: "novelty", label: "Novelty Items" },
                    { value: "candles", label: "Candles & Fragrance" },
                    { value: "other", label: "Other" },
                ],
            },
            {
                id: "florist",
                name: "Florists",
                description: "Flowers and floral arrangements",
                categories: [
                    { value: "fresh_flowers", label: "Fresh Flowers" },
                    { value: "bouquets", label: "Bouquets" },
                    { value: "arrangements", label: "Floral Arrangements" },
                    { value: "plants", label: "Indoor Plants" },
                    { value: "artificial", label: "Artificial Flowers" },
                    { value: "accessories", label: "Floral Accessories" },
                    { value: "other", label: "Other" },
                ],
            },
        ],
    },
];

// Flatten all industries for easy lookup
export const ALL_INDUSTRIES: Industry[] = INDUSTRY_GROUPS.flatMap(group => group.industries);

/**
 * Get industry by ID
 */
export function getIndustryById(id: string): Industry | undefined {
    return ALL_INDUSTRIES.find(ind => ind.id === id);
}

/**
 * Get categories for a specific industry
 */
export function getCategoriesForIndustry(industryId: string): IndustryCategory[] {
    const industry = getIndustryById(industryId);
    return industry?.categories ?? [{ value: "other", label: "Other" }];
}

/**
 * Local storage key for industry selection
 */
export const INDUSTRY_STORAGE_KEY = "chainsync_industry";

/**
 * Get saved industry from localStorage
 */
export function getSavedIndustry(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(INDUSTRY_STORAGE_KEY);
}

/**
 * Save industry selection to localStorage
 */
export function saveIndustry(industryId: string): void {
    if (typeof window !== "undefined") {
        localStorage.setItem(INDUSTRY_STORAGE_KEY, industryId);
    }
}
