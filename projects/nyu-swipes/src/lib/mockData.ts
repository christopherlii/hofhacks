import type { DiningHall, MenuItem, User, Order } from '../types';

export const diningHalls: DiningHall[] = [
  {
    id: 'lipton',
    name: 'Lipton Dining Hall',
    location: '18 University Place',
    hours: '7:30 AM - 9:00 PM',
    image: 'https://images.unsplash.com/photo-1567521464027-f127ff144326?w=400',
  },
  {
    id: 'weinstein',
    name: 'Weinstein Food Court',
    location: '5 University Place',
    hours: '7:00 AM - 11:00 PM',
    image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400',
  },
  {
    id: 'palladium',
    name: 'Palladium Dining Hall',
    location: '140 East 14th Street',
    hours: '7:30 AM - 9:00 PM',
    image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400',
  },
  {
    id: 'kimmel',
    name: 'Kimmel Marketplace',
    location: '60 Washington Square South',
    hours: '8:00 AM - 10:00 PM',
    image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400',
  },
];

export const menuItems: MenuItem[] = [
  // Lipton
  {
    id: 'lipton-1',
    name: 'Grilled Chicken Sandwich',
    description: 'Marinated chicken breast with lettuce, tomato, and herb mayo',
    price: 1,
    category: 'Sandwiches',
    diningHall: 'lipton',
    available: true,
  },
  {
    id: 'lipton-2',
    name: 'Caesar Salad',
    description: 'Romaine lettuce, parmesan, croutons, caesar dressing',
    price: 1,
    category: 'Salads',
    diningHall: 'lipton',
    available: true,
  },
  {
    id: 'lipton-3',
    name: 'Pasta Primavera',
    description: 'Penne with seasonal vegetables in marinara sauce',
    price: 1,
    category: 'Entrees',
    diningHall: 'lipton',
    available: true,
  },
  {
    id: 'lipton-4',
    name: 'BBQ Bacon Burger',
    description: 'Angus beef patty with bacon, cheddar, BBQ sauce',
    price: 1,
    category: 'Burgers',
    diningHall: 'lipton',
    available: true,
  },
  
  // Weinstein
  {
    id: 'weinstein-1',
    name: 'Poke Bowl',
    description: 'Fresh ahi tuna, rice, avocado, edamame, seaweed',
    price: 1,
    category: 'Bowls',
    diningHall: 'weinstein',
    available: true,
  },
  {
    id: 'weinstein-2',
    name: 'Chicken Tikka Masala',
    description: 'Creamy tomato curry with basmati rice and naan',
    price: 1,
    category: 'Entrees',
    diningHall: 'weinstein',
    available: true,
  },
  {
    id: 'weinstein-3',
    name: 'Veggie Burrito',
    description: 'Black beans, rice, peppers, guacamole, sour cream',
    price: 1,
    category: 'Mexican',
    diningHall: 'weinstein',
    available: true,
  },
  {
    id: 'weinstein-4',
    name: 'Margherita Pizza',
    description: 'Fresh mozzarella, tomato, basil on thin crust',
    price: 1,
    category: 'Pizza',
    diningHall: 'weinstein',
    available: true,
  },
  
  // Palladium
  {
    id: 'palladium-1',
    name: 'Stir Fry Station',
    description: 'Choose your protein and veggies, wok-fired to order',
    price: 1,
    category: 'Asian',
    diningHall: 'palladium',
    available: true,
  },
  {
    id: 'palladium-2',
    name: 'Breakfast All Day',
    description: 'Eggs any style, bacon, toast, hash browns',
    price: 1,
    category: 'Breakfast',
    diningHall: 'palladium',
    available: true,
  },
  {
    id: 'palladium-3',
    name: 'Mediterranean Wrap',
    description: 'Falafel, hummus, tabbouleh, tahini in lavash',
    price: 1,
    category: 'Wraps',
    diningHall: 'palladium',
    available: true,
  },
  
  // Kimmel
  {
    id: 'kimmel-1',
    name: 'Sushi Combo',
    description: 'Chef\'s selection of 8 pieces with miso soup',
    price: 1,
    category: 'Japanese',
    diningHall: 'kimmel',
    available: true,
  },
  {
    id: 'kimmel-2',
    name: 'Smoothie Bowl',
    description: 'Acai blend with granola, fresh fruit, honey',
    price: 1,
    category: 'Healthy',
    diningHall: 'kimmel',
    available: true,
  },
  {
    id: 'kimmel-3',
    name: 'Chicken Quesadilla',
    description: 'Grilled chicken, cheese, peppers, onions, salsa',
    price: 1,
    category: 'Mexican',
    diningHall: 'kimmel',
    available: true,
  },
];

// Mock current user for development
export const mockUser: User = {
  id: 'user-123',
  email: 'chris@nyu.edu',
  name: 'Chris',
  phone: '+1234567890',
  role: 'both',
  referralCode: 'CHRIS2026',
  createdAt: new Date(),
  isVerified: true,
  strikes: 0,
  isBanned: false,
};

// Mock orders for development
export const mockOrders: Order[] = [
  {
    id: 'order-001',
    buyerId: 'user-456',
    sellerId: 'user-123',
    items: [
      { menuItemId: 'lipton-1', menuItemName: 'Grilled Chicken Sandwich', quantity: 1 },
      { menuItemId: 'lipton-2', menuItemName: 'Caesar Salad', quantity: 1 },
    ],
    status: 'pending',
    diningHall: 'Lipton Dining Hall',
    pickupLocation: 'Front entrance',
    totalAmount: 599,
    sellerPayout: 500,
    platformFee: 99,
    createdAt: new Date(),
  },
];

export const getMenuByDiningHall = (diningHallId: string): MenuItem[] => {
  return menuItems.filter(item => item.diningHall === diningHallId);
};

export const getDiningHallById = (id: string): DiningHall | undefined => {
  return diningHalls.find(hall => hall.id === id);
};
